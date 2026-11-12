import { playSound, tryRunGame } from './extras.js';
import { generateSalt, deriveKeyBytes, encryptNoteFromKey, decryptNoteFromKey, isEncrypted } from './crypto.js';

const RECURRENCE_RE = /^!(\d+[dwmy]|m\d{1,2}|w(?:mo|tu|we|th|fr|sa|su)|y\d{2}-\d{2})\s+([\s\S]+)$/i;
const FUTURE_BUFFER = 3;
const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}\s+/;
const TIME_TOKEN_RE = /(?:^|\s)@(\d{2})(\d{2})([ap])?(?=\s|$)/;
const SEARCH_PREFIX_RE = /^%s(?:\s|$)/;
const SEARCH_ACTIVE_RE = /^%s\s/;
const MAX_CONFETTI_FAILURES = 5;

export function parseReminderTime(text)
{
  const m = (text || '').match(TIME_TOKEN_RE);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  const suffix = m[3];
  if (mi > 59) return null;
  if (suffix)
  {
    if (h < 1 || h > 12) return null;
    if (suffix === 'p' && h !== 12) h += 12;
    if (suffix === 'a' && h === 12) h = 0;
  }
  else
  {
    if (h > 23) return null;
  }
  return String(h).padStart(2, '0') + ':' + m[2];
}

export function stripReminderTime(text)
{
  return (text || '')
    .replace(TIME_TOKEN_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createNotesModule()
{
  return {
    // ── State ─────────────────────────────────────────────────────
    noteCategories: ['Inbox'],
    activeCategory: 'Main',
    notes: [],
    recycleBin: [],
    categoryMeta: {},
    sortAlphabetical: false,
    addNoteBottom: false,
    moveCompletedBottom: false,
    doubleTapDelete: false,

    contextMenuVisible: false,
    contextTab: '',
    noteMenuVisible: false,
    noteMenuPos: { x: 0, y: 0 },
    activeNoteMenuId: null,
    lastTrashTap: 0,
    modalIsPassword: false,

    selectMode: false,
    selectedNoteIds: [],

    _confettiFailures: 0,
    _displayedCache: [],
    _cacheKey: '',
    _dirtyNotes: true,
    _expandedNotes: {},
    _noteNeedsExpand: {},
    _noteOverflowObserver: null,
    _noteOverflowMeasurePending: false,
    _resizeDebounce: null,

    _unlockedTabs: {},
    _unlockedKeys: {},

    // ── Utilities ─────────────────────────────────────────────────
    _vibrate()
    {
      if (window.Android && typeof window.Android.haptic === 'function')
      {
        try { window.Android.haptic(); return; } catch (e) {}
      }
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')
      {
        try { navigator.vibrate([20, 30, 20]); } catch (e) {}
      }
    },

    // ── Search ────────────────────────────────────────────────────
    get searchActive()
    {
      return SEARCH_ACTIVE_RE.test(this.noteInput || '');
    },

    get searchTerm()
    {
      return this.searchActive ? (this.noteInput || '').slice(2).trim() : '';
    },

    set searchTerm(v)
    {
      if (!v) { this.noteInput = ''; return; }
      this.noteInput = '%s ' + v;
    },

    get displayedNotes()
    {
      if (this.searchTerm)
      {
        const q = this.searchTerm.toLowerCase();
        const filtered = [];
        for (const n of this.notes)
        {
          if (this.isTabLocked(n.category)) continue;
          if (typeof n.text !== 'string') continue;
          if (n.text.toLowerCase().includes(q)) filtered.push(n);
        }
        filtered.sort((a, b) =>
        {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          if (this.moveCompletedBottom && a.completed !== b.completed) return a.completed ? 1 : -1;
          if (this.sortAlphabetical) return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
          return 0;
        });
        return filtered;
      }

      if (this.isTabLocked(this.activeCategory)) return [];

      let key = `${this.activeCategory}_${this.sortAlphabetical}_${this.moveCompletedBottom}_${this.notes.length}`;
      if (this._cacheKey === key && !this._dirtyNotes) return this._displayedCache;

      let result = [];
      let len = this.notes.length;
      for (let i = 0; i < len; i++)
      {
        if (this.notes[i].category === this.activeCategory) result.push(this.notes[i]);
      }

      result.sort((a, b) =>
      {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (this.moveCompletedBottom && a.completed !== b.completed) return a.completed ? 1 : -1;
        if (this.sortAlphabetical) return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
        return 0;
      });

      this._cacheKey = key;
      this._dirtyNotes = false;
      this._displayedCache = result;
      return result;
    },

    get visibleTabs()
    {
      if (!this.searchTerm) return this.noteCategories;
      const q = this.searchTerm.toLowerCase();
      const matched = new Set();
      for (const n of this.notes)
      {
        if (this.isTabLocked(n.category)) continue;
        if (typeof n.text !== 'string') continue;
        if (n.text.toLowerCase().includes(q)) matched.add(n.category);
      }
      return this.noteCategories.filter(t => matched.has(t));
    },

    get statsText()
    {
      let rem = 0, comp = 0;
      for (let i = 0; i < this.notes.length; i++)
      {
        let n = this.notes[i];
        if (n.category !== this.activeCategory) continue;
        if (n.completed) comp++;
        else rem++;
      }
      return `Remaining: ${rem} \u00A0\u00A0 Completed: ${comp}`;
    },

    // ── Tab counts for context menu ───────────────────────────────
    get puffableCount()
    {
      let cat = this.contextTab;
      if (!cat) return 0;
      let c = 0;
      for (let i = 0; i < this.notes.length; i++)
      {
        if (this.notes[i].category === cat && this.notes[i].completed && !this.notes[i].groupId) c++;
      }
      return c;
    },

    get mergeableCount()
    {
      let cat = this.contextTab;
      if (!cat) return 0;
      let c = 0;
      for (let i = 0; i < this.notes.length; i++)
      {
        if (this.notes[i].category === cat) c++;
      }
      return c;
    },

    // ── Note menu data ────────────────────────────────────────────
    get activeNotePinned()
    {
      let n = this.notes.find(x => x.id === this.activeNoteMenuId);
      return n ? n.pinned : false;
    },

    get activeNote()
    {
      if (!this.activeNoteMenuId) return null;
      return this.notes.find(x => x.id === this.activeNoteMenuId) || null;
    },

    get activeNoteWordCount()
    {
      const n = this.activeNote;
      if (!n || !n.text) return 0;
      const trimmed = n.text.trim();
      if (!trimmed) return 0;
      return trimmed.split(/\s+/).filter(Boolean).length;
    },

    get activeNoteCharCount()
    {
      const n = this.activeNote;
      if (!n || typeof n.text !== 'string') return 0;
      return n.text.length;
    },

    // ── Tab move button visibility ────────────────────────────────
    get canMoveTabLeft()
    {
      return this.noteCategories.indexOf(this.contextTab) > 0;
    },

    get canMoveTabRight()
    {
      let idx = this.noteCategories.indexOf(this.contextTab);
      return idx >= 0 && idx < this.noteCategories.length - 1;
    },

    // ── Menu position styles ──────────────────────────────────────
    get contextMenuStyle()
    {
      return { display: this.contextMenuVisible ? 'block' : 'none', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    },

    get noteMenuStyle()
    {
      return { display: this.noteMenuVisible ? 'block' : 'none', left: `${this.noteMenuPos.x}px`, top: `${this.noteMenuPos.y}px` };
    },

    // ── Lock state ────────────────────────────────────────────────
    hasLock(tab)
    {
      return !!(this.categoryMeta[tab] && this.categoryMeta[tab].lock);
    },

    isTabLocked(tab)
    {
      return this.hasLock(tab) && !this._unlockedTabs[tab];
    },

    _promptPin(title)
    {
      return new Promise(resolve =>
      {
        this.openPrompt(title, '', (val) => resolve(val), true);
      });
    },

    async lockTabFlow()
    {
      const tab = this.contextTab;
      if (!tab) return;
      if (tab === this.calendarTabName) { this.showToast('Cannot lock calendar tab'); this.closeAllMenus(); return; }
      if (this.hasLock(tab)) { this.showToast('Tab already has lock'); this.closeAllMenus(); return; }
      this.closeAllMenus();

      const pin1 = await this._promptPin('Set PIN');
      if (!pin1 || pin1.length < 4) { this.showToast('PIN must be 4+ chars'); return; }

      const pin2 = await this._promptPin('Confirm PIN');
      if (pin2 !== pin1) { this.showToast('PINs don\'t match'); return; }

      this.setTabLock(tab, pin1);
      this.showToast('Tab locked');
    },

    // ★ PATCHED: locks the tab immediately after encrypting.
    // Old behaviour kept it "unlocked" until the user tapped Lock Again —
    // confusing and defeated the point. Now: encrypt with a transient key,
    // then drop the key so isTabLocked() returns true right away.
    setTabLock(tab, pin)
    {
      const salt = generateSalt();
      if (!this.categoryMeta[tab]) this.categoryMeta[tab] = { id: Date.now(), updatedAt: Date.now() };
      this.categoryMeta[tab].lock = { salt };
      this.categoryMeta[tab].updatedAt = Date.now();

      // Transient key so we can encrypt the plaintext notes that exist now.
      this._unlockedKeys[tab] = deriveKeyBytes(pin, salt);
      this._encryptTabNotes(tab);

      // Drop the key — tab is locked immediately.
      delete this._unlockedKeys[tab];
      delete this._unlockedTabs[tab];

      if (this.activeCategory === tab)
      {
        const firstOther = this.noteCategories.find(t => t !== tab);
        if (firstOther) this.activeCategory = firstOther;
      }
      this._dirtyNotes = true;
      this.saveData();
    },

    async unlockTabFlow()
    {
      const tab = this.contextTab;
      if (!tab) return;
      if (!this.isTabLocked(tab)) { this.closeAllMenus(); return; }
      this.closeAllMenus();

      const pin = await this._promptPin('Enter PIN');
      if (!pin) return;
      const ok = this.tryUnlockTab(tab, pin);
      if (ok)
      {
        this.activeCategory = tab;
        this._dirtyNotes = true;
        this.saveData();
        this.showToast('Unlocked');
      }
      else
      {
        this.showToast('Wrong PIN');
      }
    },

    tryUnlockTab(tab, pin)
    {
      const lock = this.categoryMeta[tab] && this.categoryMeta[tab].lock;
      if (!lock || !lock.salt) return false;

      const keyBytes = deriveKeyBytes(pin, lock.salt);

      // Find any encrypted note to verify the PIN by attempting a decrypt.
      const encNotes = this.notes.filter(n => n.category === tab &&
        (isEncrypted(n.encryptedText || '') || isEncrypted(n.text || '')));

      if (encNotes.length === 0)
      {
        // No encrypted notes yet — nothing to verify. Accept PIN and mark
        // tab as unlocked so the next encrypt pass generates ciphertext.
        this._unlockedTabs[tab] = true;
        this._unlockedKeys[tab] = keyBytes;
        this._dirtyNotes = true;
        return true;
      }

      const first = encNotes[0];
      const ciphertext = first.encryptedText || first.text;
      const decrypted = decryptNoteFromKey(keyBytes, ciphertext);
      if (decrypted === null) return false;

      this._unlockedTabs[tab] = true;
      this._unlockedKeys[tab] = keyBytes;

      for (const n of this.notes)
      {
        if (n.category !== tab) continue;
        const ct = n.encryptedText || n.text;
        if (!isEncrypted(ct)) continue;
        const pt = decryptNoteFromKey(keyBytes, ct);
        if (pt !== null)
        {
          n.text = pt;
          n.encryptedText = ct;
        }
      }
      this._dirtyNotes = true;
      return true;
    },

    _encryptTabNotes(tab)
    {
      const keyBytes = this._unlockedKeys[tab];
      if (!keyBytes) return;
      for (const n of this.notes)
      {
        if (n.category !== tab) continue;
        if (!n.text || isEncrypted(n.text)) continue;
        try
        {
          n.encryptedText = encryptNoteFromKey(keyBytes, n.text);
        }
        catch (e) {}
      }
    },

    // Called by saveData / exportMarkdownSilent / beforeunload.
    _encryptLockedTabs()
    {
      for (const tab of this.noteCategories)
      {
        if (!this.hasLock(tab)) continue;
        if (!this._unlockedKeys[tab]) continue;
        this._encryptTabNotes(tab);
      }
    },

    lockAgainFlow()
    {
      const tab = this.contextTab || this.activeCategory;
      if (!tab) return;
      this.closeAllMenus();
      if (!this.hasLock(tab)) return;

      this._encryptTabNotes(tab);

      delete this._unlockedTabs[tab];
      delete this._unlockedKeys[tab];

      if (this.activeCategory === tab)
      {
        const firstOther = this.noteCategories.find(t => t !== tab);
        if (firstOther) this.activeCategory = firstOther;
      }
      this._dirtyNotes = true;
      this.showToast('Locked');
      this.saveData();
    },

    // ── Select mode ───────────────────────────────────────────────
    enterSelectMode()
    {
      this.closeAllMenus();
      this.selectMode = true;
      this.selectedNoteIds = [];
    },

    exitSelectMode()
    {
      this.selectMode = false;
      this.selectedNoteIds = [];
    },

    toggleNoteSelect(id)
    {
      if (this.selectedNoteIds.includes(id))
      {
        this.selectedNoteIds = this.selectedNoteIds.filter(x => x !== id);
      }
      else
      {
        this.selectedNoteIds = [...this.selectedNoteIds, id];
      }
    },

    isNoteSelected(id)
    {
      return this.selectedNoteIds.indexOf(id) >= 0;
    },

    get selectedCount()
    {
      return this.selectedNoteIds.length;
    },

    // ★ NEW: tabs eligible as move destinations.
    get selectableTabs()
    {
      return this.noteCategories.filter(t =>
        t !== this.activeCategory && !this.isTabLocked(t)
      );
    },

    // ★ NEW: handler for the <select> change event. Resets the dropdown
    // after moving so it shows "Move to…" again next time.
    onSelectTargetChange(e)
    {
      const val = e.target.value;
      e.target.value = '';
      if (val) this.moveSelectedToTab(val);
    },

    moveSelectedToTab(targetTab)
    {
      if (!targetTab || this.selectedNoteIds.length === 0) return;
      if (targetTab === this.activeCategory) { this.showToast('Already in this tab'); return; }
      if (this.isTabLocked(targetTab)) { this.showToast('Cannot move to locked tab'); return; }

      const now = Date.now();
      const ids = new Set(this.selectedNoteIds);
      let moved = 0;
      for (const n of this.notes)
      {
        if (!ids.has(n.id)) continue;
        n.category = targetTab;
        n.updatedAt = now;
        // Clear ciphertext — target may have different lock state.
        delete n.encryptedText;
        moved++;
      }
      this._dirtyNotes = true;
      this.showToast(`Moved ${moved} note${moved === 1 ? '' : 's'} to "${targetTab}"`);
      this.exitSelectMode();
      this.saveData();
    },

    // ── Search helpers ────────────────────────────────────────────
    clearSearch()
    {
      this.noteInput = '';
      this._resetNoteInputHeight();
    },

    _resetNoteInputHeight()
    {
      const el = document.getElementById('note-in');
      if (el) el.style.height = '';
    },

    // ── Note expand / overflow measurement ────────────────────────
    toggleNoteExpand(id)
    {
      const next = { ...this._expandedNotes };
      if (next[id]) delete next[id];
      else next[id] = true;
      this._expandedNotes = next;
    },

    _measureNoteOverflow()
    {
      if (this.editVisible) return;
      const list = document.getElementById('notes-list');
      if (!list) return;
      const wraps = list.querySelectorAll('.note-content-wrap');
      if (!wraps.length) return;

      const wasExpanded = [];
      wraps.forEach(el =>
      {
        if (el.classList.contains('expanded'))
        {
          el.classList.remove('expanded');
          wasExpanded.push(el);
        }
      });

      const newNeedsExpand = {};
      wraps.forEach(el =>
      {
        const item = el.closest('.note-item');
        if (!item) return;
        const id = item.dataset.id;
        if (!id) return;
        if (el.clientHeight < 5) return;
        if (el.scrollHeight < 5) return;
        if (el.scrollHeight > el.clientHeight + 2) newNeedsExpand[id] = true;
      });

      wasExpanded.forEach(el => el.classList.add('expanded'));

      const oldKey = Object.keys(this._noteNeedsExpand).sort().join(',');
      const newKey = Object.keys(newNeedsExpand).sort().join(',');
      if (oldKey !== newKey) this._noteNeedsExpand = newNeedsExpand;
    },

    initNoteOverflowObserver()
    {
      if (this._noteOverflowObserver) return;
      const list = document.getElementById('notes-list');
      if (!list) return;

      const obs = new MutationObserver(() =>
      {
        if (this._noteOverflowMeasurePending) return;
        this._noteOverflowMeasurePending = true;
        requestAnimationFrame(() => requestAnimationFrame(() =>
        {
          this._noteOverflowMeasurePending = false;
          this._measureNoteOverflow();
        }));
      });
      obs.observe(list, { childList: true, subtree: true, characterData: true });
      this._noteOverflowObserver = obs;
    },

    // ── Recurrence ────────────────────────────────────────────────
    parseRecurrence(text)
    {
      if (!text) return null;
      const m = text.match(RECURRENCE_RE);
      if (!m) return null;
      return { token: m[1].toLowerCase(), body: m[2] };
    },

    stripDatePrefix(text)
    {
      return (text || '').replace(DATE_PREFIX_RE, '');
    },

    computeNextDate(fromDate, token)
    {
      const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());

      let mm = token.match(/^(\d+)([dwmy])$/);
      if (mm)
      {
        const n = parseInt(mm[1], 10);
        const unit = mm[2];
        if (n <= 0) return null;
        if (unit === 'd') d.setDate(d.getDate() + n);
        else if (unit === 'w') d.setDate(d.getDate() + 7 * n);
        else if (unit === 'm') d.setMonth(d.getMonth() + n);
        else if (unit === 'y') d.setFullYear(d.getFullYear() + n);
        return d;
      }

      let md = token.match(/^m(\d{1,2})$/);
      if (md)
      {
        const day = parseInt(md[1], 10);
        if (day < 1 || day > 31) return null;
        d.setDate(1);
        d.setMonth(d.getMonth() + 1);
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(day, lastDay));
        return d;
      }

      let wd = token.match(/^w(mo|tu|we|th|fr|sa|su)$/);
      if (wd)
      {
        const map = { mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 0 };
        const target = map[wd[1]];
        do { d.setDate(d.getDate() + 1); } while (d.getDay() !== target);
        return d;
      }

      let ym = token.match(/^y(\d{2})-(\d{2})$/);
      if (ym)
      {
        const month = parseInt(ym[1], 10) - 1;
        const day = parseInt(ym[2], 10);
        if (month < 0 || month > 11 || day < 1 || day > 31) return null;
        d.setDate(1);
        d.setFullYear(d.getFullYear() + 1);
        d.setMonth(month);
        const lastDay = new Date(d.getFullYear(), month + 1, 0).getDate();
        d.setDate(Math.min(day, lastDay));
        return d;
      }

      return null;
    },

    toDateStr(d)
    {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    },

    buildRecurrenceGroup(text, token, category, anchorDateStr)
    {
      const now = Date.now();
      const groupId = now;
      const cat = category || this.activeCategory;
      const created = [];
      const cleanText = this.stripDatePrefix(text);

      let cursor;
      if (anchorDateStr)
      {
        const parts = anchorDateStr.split('-').map(Number);
        cursor = new Date(parts[0], parts[1] - 1, parts[2]);
      }
      else
      {
        const t = new Date();
        cursor = new Date(t.getFullYear(), t.getMonth(), t.getDate());
      }

      const firstDateStr = this.toDateStr(cursor);
      created.push({
        id: now, text: `${firstDateStr} ${cleanText}`, completed: false,
        category: cat, pinned: false, updatedAt: now,
        groupId, scheduledDate: firstDateStr, recurrence: token
      });

      for (let i = 0; i < FUTURE_BUFFER; i++)
      {
        const next = this.computeNextDate(cursor, token);
        if (!next) break;
        cursor = next;
        const nextStr = this.toDateStr(cursor);
        created.push({
          id: now + i + 1, text: `${nextStr} ${cleanText}`, completed: false,
          category: cat, pinned: false, updatedAt: now,
          groupId, scheduledDate: nextStr, recurrence: token
        });
      }
      return created;
    },

    extendRecurrenceGroup(note)
    {
      if (!note.groupId || !note.recurrence) return;
      const todayStr = this.toDateStr(new Date());
      const groupNotes = this.notes.filter(n => n.groupId === note.groupId);
      const futureOpen = groupNotes.filter(n => !n.completed && n.scheduledDate && n.scheduledDate >= todayStr);
      if (futureOpen.length > FUTURE_BUFFER) return;

      let maxStr = null;
      groupNotes.forEach(n => { if (n.scheduledDate && (!maxStr || n.scheduledDate > maxStr)) maxStr = n.scheduledDate; });
      if (!maxStr) return;

      const last = new Date(maxStr + 'T00:00:00');
      const next = this.computeNextDate(last, note.recurrence);
      if (!next) return;
      const nextStr = this.toDateStr(next);
      if (groupNotes.some(n => n.scheduledDate === nextStr)) return;

      const cleanText = this.stripDatePrefix(note.text);
      const now = Date.now();
      const newNote = {
        id: now, text: `${nextStr} ${cleanText}`, completed: false,
        category: note.category, pinned: false, updatedAt: now,
        groupId: note.groupId, scheduledDate: nextStr, recurrence: note.recurrence
      };
      if (this.addNoteBottom) this.notes.push(newNote);
      else this.notes.unshift(newNote);
    },

    // ── Note CRUD ─────────────────────────────────────────────────
    addNote(rawText, category, anchorDateStr)
    {
      const v = (rawText || '').trim();
      if (!v) return false;
      if (tryRunGame(v)) return false;

      const cat = category || this.activeCategory;

      if (v.startsWith('/'))
      {
        const t = v.slice(1).trim();
        if (t) this.addTab(t);
        return true;
      }

      playSound('add', this.uiSounds);

      const rec = this.parseRecurrence(v);
      if (rec)
      {
        if (this.hasLock(cat))
        {
          this.showToast('Cannot add recurring note to locked tab');
          return false;
        }
        const group = this.buildRecurrenceGroup(rec.body, rec.token, cat, anchorDateStr || null);
        if (group.length > 0)
        {
          if (this.addNoteBottom) this.notes.push(...group);
          else this.notes.unshift(...group);
        }
        return true;
      }

      let finalText = v;
      const isCalendar = cat === this.calendarTabName;
      if (isCalendar && !DATE_PREFIX_RE.test(v))
      {
        const prefix = anchorDateStr || this.toDateStr(new Date());
        finalText = prefix + ' ' + v;
      }

      const now = Date.now();
      const n = { id: now, text: finalText, completed: false, category: cat, pinned: false, updatedAt: now };
      if (this.addNoteBottom) this.notes.push(n);
      else this.notes.unshift(n);
      return true;
    },

    submitNote()
    {
      const v = this.noteInput.trim();
      if (!v) return;
      if (SEARCH_PREFIX_RE.test(v)) return;
      if (this.isTabLocked(this.activeCategory))
      {
        this.showToast('Unlock tab first');
        return;
      }
      this.addNote(v, this.activeCategory, null);
      this.noteInput = '';
      this._resetNoteInputHeight();
      this.saveData();
    },

    toggleSortAlphabetical()
    {
      this.sortAlphabetical = !this.sortAlphabetical;
      this.saveData();
    },

    _celebrateOnce()
    {
      if (!this.celebrationMode) return;
      if (this._confettiFailures >= MAX_CONFETTI_FAILURES) return;
      if (typeof window.confetti !== 'function') return;

      try
      {
        window.confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.7 },
          disableForReducedMotion: true
        });
      }
      catch (e)
      {
        this._confettiFailures++;
        if (this._confettiFailures >= MAX_CONFETTI_FAILURES)
        {
          this.celebrationMode = false;
          try { this.showToast('Celebration disabled (render error)'); } catch (_) {}
        }
      }
    },

    _openExternalUrl(url)
    {
      try
      {
        const a = document.createElement('a');
        a.href = url;
        a.rel = 'noopener noreferrer';
        a.target = '_blank';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      catch (e)
      {
        try { window.open(url, '_blank', 'noopener'); } catch (_) {}
      }
    },

    toggleNote(n, e)
    {
      try
      {
        const wasCompleted = n.completed;
        n.completed = !n.completed;
        n.updatedAt = Date.now();

        if (n.completed && !wasCompleted)
        {
          try { playSound('scratch', this.uiSounds); } catch (_) {}
          this._celebrateOnce();
          if (n.groupId) this.extendRecurrenceGroup(n);
        }

        try { this._vibrate(); } catch (_) {}

        if (typeof n.text === 'string')
        {
          const txt = n.text.trim();
          if (/^https?:\/\//i.test(txt) || /^www\./i.test(txt))
          {
            this._openExternalUrl(txt.startsWith('http') ? txt : 'https://' + txt);
          }
        }

        this.saveData();
      }
      catch (err)
      {
        try { console.error('toggleNote failed:', err); } catch (_) {}
        try { this.showToast('Something went wrong'); } catch (_) {}
      }
    },

    executeTrash(id)
    {
      const idx = this.notes.findIndex(x => x.id === id);
      if (idx < 0) return;
      const target = this.notes[idx];

      if (target.groupId)
      {
        const now = Date.now();
        const doomed = this.notes.filter(x => x.groupId === target.groupId);
        this.notes = this.notes.filter(x => x.groupId !== target.groupId);
        doomed.forEach(x => { x.updatedAt = now; this.recycleBin.push(x); });
      }
      else
      {
        this.notes.splice(idx, 1);
        target.updatedAt = Date.now();
        this.recycleBin.push(target);
      }
      this.saveData();
    },

    restoreNote(idx)
    {
      const n = this.recycleBin[idx];
      if (!n) return;

      if (n.groupId)
      {
        const now = Date.now();
        const group = this.recycleBin.filter(x => x.groupId === n.groupId);
        this.recycleBin = this.recycleBin.filter(x => x.groupId !== n.groupId);
        group.forEach(x => { x.updatedAt = now; this.notes.push(x); });
      }
      else
      {
        this.recycleBin.splice(idx, 1);
        n.updatedAt = Date.now();
        this.notes.push(n);
      }
      this.saveData();
    },

    clearTrash()
    {
      this.recycleBin = [];
      this.saveData();
    },

    // ── Note menu ─────────────────────────────────────────────────
    openNoteMenu(e, id)
    {
      if (this.selectMode) return;
      if (this.activeNoteMenuId === id && this.noteMenuVisible) { this.closeAllMenus(); return; }
      this.closeAllMenus();
      this.activeNoteMenuId = id;

      let clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : window.innerWidth / 2);
      let clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : window.innerHeight / 2);

      this.noteMenuPos = { x: -9999, y: -9999 };
      this.noteMenuVisible = true;

      setTimeout(() =>
      {
        const el = document.getElementById('note-dropdown');
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const w = rect.width || 160;
        const h = rect.height || 260;
        const x = Math.max(12, Math.min(clientX, window.innerWidth - w - 12));
        const y = Math.max(12, Math.min(clientY, window.innerHeight - h - 12));
        this.noteMenuPos = { x, y };
      }, 0);
    },

    actionDeleteNote()
    {
      if (!this.activeNoteMenuId) return;
      let id = this.activeNoteMenuId;
      if (this.doubleTapDelete)
      {
        let now = Date.now();
        if (now - this.lastTrashTap < 300)
        {
          this.executeTrash(id);
          this.showToast('Note deleted');
          this.closeAllMenus();
        }
        else
        {
          this._vibrate();
          this.showToast('Tap delete again to confirm');
        }
        this.lastTrashTap = now;
      }
      else
      {
        this.executeTrash(id);
        this.showToast('Note deleted');
        this.closeAllMenus();
      }
    },

    actionTogglePinNote()
    {
      if (!this.activeNoteMenuId) return;
      let n = this.notes.find(x => x.id === this.activeNoteMenuId);
      if (n) { n.pinned = !n.pinned; n.updatedAt = Date.now(); this.saveData(); }
      this.closeAllMenus();
    },

    actionCopyNote()
    {
      if (!this.activeNoteMenuId) return;
      let n = this.notes.find(x => x.id === this.activeNoteMenuId);
      if (n && n.text)
      {
        navigator.clipboard.writeText(n.text);
        this._vibrate();
        this.showToast('Note copied');
      }
      this.closeAllMenus();
    },

    actionEditNote()
    {
      if (!this.activeNoteMenuId) return;
      const n = this.notes.find(x => x.id === this.activeNoteMenuId);
      this.closeAllMenus();
      if (!n) return;
      if (this.isTabLocked(n.category))
      {
        this.showToast('Unlock tab first');
        return;
      }
      this.startEdit(n);
    },

    // ── Tab markdown parse / apply ────────────────────────────────
    _generateTabMarkdown(tab)
    {
      return this.notes
        .filter(n => n.category === tab)
        .filter(n => typeof n.text === 'string' && n.text.trim().length > 0)
        .map(n =>
        {
          const text = n.text.replace(/\r?\n/g, ' ');
          return `- [${n.completed ? 'x' : ' '}] ${text} <!-- id:${n.id} -->`;
        })
        .join('\n');
    },

    _parseTabMarkdown(md)
    {
      const out = [];
      const lines = (md || '').split(/\r?\n/);
      for (const line of lines)
      {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const m = trimmed.match(/^-\s*\[([ xX])\]\s*(.+?)(?:\s*<!--\s*id:(\d+)\s*-->)?\s*$/);
        if (!m) continue;
        const text = m[2].trim();
        if (!text) continue;
        const id = (m[3] !== undefined && m[3] !== null && m[3] !== '') ? parseInt(m[3], 10) : null;
        out.push({ id, text, completed: m[1].toLowerCase() === 'x' });
      }
      return out;
    },

    applyTabMarkdown(tab, mdText)
    {
      const parsed = this._parseTabMarkdown(mdText);
      const now = Date.now();
      const existing = this.notes.filter(n => n.category === tab);

      const existingById = new Map();
      const existingByText = new Map();
      for (const n of existing)
      {
        existingById.set(String(n.id), n);
        const key = (n.text || '').trim();
        if (!existingByText.has(key)) existingByText.set(key, []);
        existingByText.get(key).push(n);
      }

      const keptNotes = [];
      const usedIds = new Set();
      let idSeed = 0;

      const mintId = () =>
      {
        let id = now + (++idSeed);
        while (usedIds.has(String(id)) || this.notes.some(n => String(n.id) === String(id)))
          id = now + (++idSeed);
        return id;
      };

      for (const p of parsed)
      {
        if (p.id !== null)
        {
          const idKey = String(p.id);
          const match = existingById.get(idKey);
          if (match && !usedIds.has(idKey))
          {
            if (match.text !== p.text) delete match.encryptedText;
            match.text = p.text;
            match.completed = p.completed;
            match.updatedAt = now;
            keptNotes.push(match);
            usedIds.add(idKey);
            continue;
          }
        }

        const bucket = existingByText.get(p.text);
        if (bucket)
        {
          let found = null;
          for (let i = 0; i < bucket.length; i++)
          {
            const candidate = bucket[i];
            if (!usedIds.has(String(candidate.id)))
            {
              found = candidate;
              bucket.splice(i, 1);
              break;
            }
          }
          if (found)
          {
            found.completed = p.completed;
            found.updatedAt = now;
            keptNotes.push(found);
            usedIds.add(String(found.id));
            continue;
          }
        }

        const newId = mintId();
        keptNotes.push({
          id: newId, text: p.text, completed: p.completed,
          category: tab, pinned: false, updatedAt: now
        });
        usedIds.add(String(newId));
      }

      for (const n of existing)
      {
        if (!usedIds.has(String(n.id)))
        {
          n.updatedAt = now;
          this.recycleBin.push(n);
        }
      }

      const otherTabs = this.notes.filter(n => n.category !== tab);
      this.notes = otherTabs.concat(keptNotes);

      this._dirtyNotes = true;
      this.saveData();
    },

    // ── Tab management ────────────────────────────────────────────
    getTabLabel(t)
    {
      let label = t;
      if (t.includes('%'))
      {
        let catNotes = this.notes.filter(n => n.category === t);
        let tot = catNotes.length;
        let comp = catNotes.filter(n => n.completed).length;
        let pct = tot > 0 ? Math.round((comp / tot) * 100) : 0;
        label = t.replace('%', `${pct}%`);
      }
      if (this.isTabLocked(t)) label = '⊷ ' + label;
      return label;
    },

    selectTab(tab)
    {
      if (this.isTabLocked(tab))
      {
        this.contextTab = tab;
        this.unlockTabFlow();
        return;
      }
      this.closeAllMenus();
      this.activeCategory = tab;
      if (!this.keepKeyboard && document.activeElement) document.activeElement.blur();
    },

    // Long-press handler on every tab element.
    openContextMenu(e, tab)
    {
      this.closeAllMenus();
      this.contextTab = tab;
      this.contextMenuVisible = true;
    },

    addTab(n)
    {
      if (n && !this.noteCategories.includes(n))
      {
        playSound('tab', this.uiSounds);
        this.noteCategories.push(n);
        this.activeCategory = n;
        let now = Date.now();
        if (!this.categoryMeta) this.categoryMeta = {};
        this.categoryMeta[n] = { id: now, updatedAt: now };
        this.saveData();
      }
    },

    renameTab(newName)
    {
      let oldName = this.contextTab || this.activeCategory;
      if (!newName || oldName === newName) return;
      this.renameTabInternal(oldName, newName.trim());
      this.saveData();
    },

    renameCategory(oldCat, newCat)
    {
      if (!oldCat || !newCat || !newCat.trim() || oldCat === newCat) return;
      let trimmed = newCat.trim();
      if (this.calendarTabName === oldCat) this.calendarTabName = trimmed;
      this.renameTabInternal(oldCat, trimmed);
      this.saveData();
    },

    renameTabInternal(oldName, newName)
    {
      if (!oldName || !newName || oldName === newName) return;
      let trimmed = newName.trim();
      if (!trimmed) return;

      this.noteCategories = this.noteCategories.filter(x => x !== trimmed);

      let idx = this.noteCategories.indexOf(oldName);
      if (idx !== -1) this.noteCategories.splice(idx, 1, trimmed);
      else if (!this.noteCategories.includes(trimmed)) this.noteCategories.push(trimmed);

      if (this.calendarTabName === oldName) this.calendarTabName = trimmed;

      let now = Date.now();
      if (!this.categoryMeta) this.categoryMeta = {};
      let meta = this.categoryMeta[oldName] || { id: now, updatedAt: now };
      meta.updatedAt = now;
      this.categoryMeta[trimmed] = meta;
      if (oldName !== trimmed) delete this.categoryMeta[oldName];

      if (this._unlockedTabs[oldName])
      {
        this._unlockedTabs[trimmed] = true;
        delete this._unlockedTabs[oldName];
      }
      if (this._unlockedKeys[oldName])
      {
        this._unlockedKeys[trimmed] = this._unlockedKeys[oldName];
        delete this._unlockedKeys[oldName];
      }

      this.notes.forEach(n =>
      {
        if (n.category === oldName) { n.category = trimmed; n.updatedAt = now; }
      });

      if (this.activeCategory === oldName) this.activeCategory = trimmed;
      this._dirtyNotes = true;
    },

    deleteTabClick()
    {
      let t = this.contextTab || this.activeCategory;
      if (this.isTabLocked(t))
      {
        this.showToast('Unlock tab first');
        this.closeAllMenus();
        return;
      }
      if (this.noteCategories.length > 1)
      {
        this.noteCategories = this.noteCategories.filter(x => x !== t);
        let now = Date.now();
        this.notes = this.notes.filter(note =>
        {
          if (note.category === t) { note.updatedAt = now; this.recycleBin.push(note); return false; }
          return true;
        });
        if (this.activeCategory === t) this.activeCategory = this.noteCategories[0];
        delete this._unlockedTabs[t];
        delete this._unlockedKeys[t];
        this.saveData();
      }
      this.closeAllMenus();
    },

    moveTab(dir)
    {
      let idx = this.noteCategories.indexOf(this.contextTab);
      if (idx < 0) return;
      let nIdx = idx + dir;
      if (nIdx >= 0 && nIdx < this.noteCategories.length)
      {
        let t = this.noteCategories[idx];
        this.noteCategories[idx] = this.noteCategories[nIdx];
        this.noteCategories[nIdx] = t;
        this.saveData();
      }
      this.closeAllMenus();
    },

    mergeTabNotes()
    {
      let cat = this.contextTab || this.activeCategory;
      if (this.isTabLocked(cat)) { this.showToast('Unlock tab first'); this.closeAllMenus(); return; }

      let catNotes = this.notes.filter(n => n.category === cat);
      if (!catNotes.length) { this.showToast('Nothing to merge'); this.closeAllMenus(); return; }

      catNotes.sort((a, b) =>
      {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (this.moveCompletedBottom && a.completed !== b.completed) return a.completed ? 1 : -1;
        if (this.sortAlphabetical) return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
        return 0;
      });

      let mergedText = catNotes.map(n => n.text).join('\n');
      let now = Date.now();
      let merged = {
        id: now, text: mergedText, completed: false,
        category: cat, pinned: false, updatedAt: now
      };

      if (this.addNoteBottom) this.notes.push(merged);
      else this.notes.unshift(merged);

      if (this.activeCategory !== cat) this.activeCategory = cat;

      playSound('add', this.uiSounds);
      this.showToast(`Merged ${catNotes.length} note${catNotes.length === 1 ? '' : 's'}`);
      this.saveData();
      this.closeAllMenus();
    },

    puffCompleted()
    {
      let cat = this.contextTab || this.activeCategory;
      if (this.isTabLocked(cat)) { this.showToast('Unlock tab first'); this.closeAllMenus(); return; }
      let targets = this.notes.filter(n => n.category === cat && n.completed && !n.groupId);
      if (!targets.length) { this.showToast('Nothing to puff'); this.closeAllMenus(); return; }
      let now = Date.now();
      targets.forEach(n => { n.updatedAt = now; });
      this.notes = this.notes.filter(n => !(n.category === cat && n.completed && !n.groupId));
      this.recycleBin.push(...targets);
      playSound('scratch', this.uiSounds);
      this.showToast(`Puffed ${targets.length} note${targets.length === 1 ? '' : 's'}`);
      this.saveData();
      this.closeAllMenus();
    },

    // ── Merge from sync / QR / JSON import ────────────────────────
    mergeNotes(imported)
    {
      if (!Array.isArray(imported)) return { added: 0, updated: 0, skipped: 0 };
      let now = Date.now();
      let added = 0;
      let updated = 0;
      let skipped = 0;

      imported.forEach((n, idx) =>
      {
        if (!n) return;
        const hasText = typeof n.text === 'string';
        const hasEnc = typeof n.encryptedText === 'string';
        if (!hasText && !hasEnc) return;

        let cat = n.category || 'Main';
        const isEnc = (hasText && isEncrypted(n.text)) || (hasEnc && isEncrypted(n.encryptedText));

        // Encrypted notes always pass — ciphertext is safe to store.
        if (this.isTabLocked(cat) && !isEnc) { skipped++; return; }

        if (!this.noteCategories.includes(cat)) this.noteCategories.push(cat);
        if (!this.categoryMeta) this.categoryMeta = {};
        if (!this.categoryMeta[cat]) this.categoryMeta[cat] = { id: now + idx, updatedAt: now };

        let noteId = (typeof n.id === 'number' && !isNaN(n.id)) ? n.id : null;
        let existing = null;
        if (noteId) existing = this.notes.find(x => x.id === noteId);
        if (!existing && hasText && !isEnc) existing = this.notes.find(x => x.text === n.text && x.category === cat);

        let itemUpdatedAt = (typeof n.updatedAt === 'number' && !isNaN(n.updatedAt)) ? n.updatedAt : now;
        let itemPinned = typeof n.pinned === 'boolean' ? n.pinned : false;
        let itemCompleted = Boolean(n.completed);

        if (existing)
        {
          const existingUpdatedAt = existing.updatedAt || 0;
          const incomingNewer = itemUpdatedAt > existingUpdatedAt;
          const timestampsTied = itemUpdatedAt === existingUpdatedAt;

          const contentChanged =
            existing.text !== n.text ||
            existing.completed !== itemCompleted ||
            existing.pinned !== itemPinned ||
            existing.category !== cat;

          if (incomingNewer || (timestampsTied && contentChanged))
          {
            if (hasText) existing.text = n.text;
            if (hasEnc) existing.encryptedText = n.encryptedText;
            existing.completed = itemCompleted;
            existing.category = cat;
            existing.pinned = itemPinned;
            existing.updatedAt = itemUpdatedAt;
            if (n.groupId) existing.groupId = n.groupId;
            if (n.scheduledDate) existing.scheduledDate = n.scheduledDate;
            if (n.recurrence) existing.recurrence = n.recurrence;
            if (contentChanged) updated++;
          }
        }
        else
        {
          let newNote = {
            id: noteId || (now + Math.floor(Math.random() * 100000) + idx),
            completed: itemCompleted,
            category: cat,
            pinned: itemPinned,
            updatedAt: itemUpdatedAt
          };
          if (hasText) newNote.text = n.text;
          if (hasEnc) newNote.encryptedText = n.encryptedText;
          if (n.groupId) newNote.groupId = n.groupId;
          if (n.scheduledDate) newNote.scheduledDate = n.scheduledDate;
          if (n.recurrence) newNote.recurrence = n.recurrence;
          this.notes.push(newNote);
          added++;
        }
      });

      this.saveData();
      return { added, updated, skipped };
    }
  };
}