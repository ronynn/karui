import { playSound, tryRunGame } from './extras.js'

// Recurrence token only; the trailing body captures everything else — including
// any `@HHMM` the user typed, which we deliberately keep in the note text.
const RECURRENCE_RE = /^!(\d+[dwmy]|m\d{1,2}|w(?:mo|tu|we|th|fr|sa|su)|y\d{2}-\d{2})\s+([\s\S]+)$/i
const FUTURE_BUFFER = 3
const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}\s+/

// Single supported reminder-time syntax: `@HHMM` (exactly 4 digits).
// Not `@HMM`, not `@HH:MM`, not `@HHMM` glued to a word.
const TIME_TOKEN_RE = /(?:^|\s)@(\d{2})(\d{2})(?=\s|$)/

// Extract "HH:MM" from text, or null if absent / invalid. Exported so
// calendar.js can reuse the exact same rule when building Android payloads.
export function parseReminderTime(text)
{
  const m = (text || '').match(TIME_TOKEN_RE)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  if (h > 23 || mi > 59) return null
  return m[1] + ':' + m[2]
}

// Remove a `@HHMM` token. Used only when producing notification-facing text.
export function stripReminderTime(text)
{
  return (text || '')
    .replace(TIME_TOKEN_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function createNotesModule()
{
  return {
    // --- state ---
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

    _displayedCache: [],
    _cacheKey: '',
    _dirtyNotes: true,

    // --- expand/collapse state (in-memory only, resets on hard restart) ---
    _expandedNotes: {},
    _noteNeedsExpand: {},
    _noteOverflowObserver: null,
    _noteOverflowMeasurePending: false,
    _resizeDebounce: null,

    // --- getters ---
    get displayedNotes()
    {
      let key = `${this.activeCategory}_${this.sortAlphabetical}_${this.moveCompletedBottom}_${this.notes.length}`
      if (this._cacheKey === key && !this._dirtyNotes) return this._displayedCache

      let result = []
      let len = this.notes.length
      for (let i = 0; i < len; i++)
      {
        if (this.notes[i].category === this.activeCategory) result.push(this.notes[i])
      }

      result.sort((a, b) =>
      {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (this.moveCompletedBottom && a.completed !== b.completed) return a.completed ? 1 : -1
        if (this.sortAlphabetical) return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })
        return 0
      })

      this._cacheKey = key
      this._dirtyNotes = false
      this._displayedCache = result
      return result
    },

    get statsText()
    {
      let rem = 0, comp = 0
      for (let i = 0; i < this.notes.length; i++)
      {
        let n = this.notes[i]
        if (n.category !== this.activeCategory) continue
        if (n.completed) comp++
        else rem++
      }
      return `Remaining: ${rem} \u00A0\u00A0 Completed: ${comp}`
    },

    get puffableCount()
    {
      let cat = this.contextTab
      if (!cat) return 0
      let c = 0
      for (let i = 0; i < this.notes.length; i++)
      {
        if (this.notes[i].category === cat && this.notes[i].completed && !this.notes[i].groupId) c++
      }
      return c
    },

    get mergeableCount()
    {
      let cat = this.contextTab
      if (!cat) return 0
      let c = 0
      for (let i = 0; i < this.notes.length; i++)
      {
        if (this.notes[i].category === cat) c++
      }
      return c
    },

    get activeNotePinned()
    {
      let n = this.notes.find(x => x.id === this.activeNoteMenuId)
      return n ? n.pinned : false
    },

    get canMoveTabLeft() { return this.noteCategories.indexOf(this.contextTab) > 0 },
    get canMoveTabRight()
    {
      let idx = this.noteCategories.indexOf(this.contextTab)
      return idx >= 0 && idx < this.noteCategories.length - 1
    },

    get contextMenuStyle()
    {
      return { display: this.contextMenuVisible ? 'block' : 'none', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    },

    get noteMenuStyle()
    {
      return { display: this.noteMenuVisible ? 'block' : 'none', left: `${this.noteMenuPos.x}px`, top: `${this.noteMenuPos.y}px` }
    },

    // --- EXPAND/COLLAPSE ---
    toggleNoteExpand(id)
    {
      const next = { ...this._expandedNotes }
      if (next[id]) delete next[id]
      else next[id] = true
      this._expandedNotes = next
    },

    _measureNoteOverflow()
    {
      const list = document.getElementById('notes-list')
      if (!list) return
      const wraps = list.querySelectorAll('.note-content-wrap')
      if (!wraps.length) return

      const wasExpanded = []
      wraps.forEach(el =>
      {
        if (el.classList.contains('expanded'))
        {
          el.classList.remove('expanded')
          wasExpanded.push(el)
        }
      })

      const newNeedsExpand = {}
      wraps.forEach(el =>
      {
        const item = el.closest('.note-item')
        if (!item) return
        const id = item.dataset.id
        if (!id) return
        if (el.clientHeight < 2) return
        if (el.scrollHeight > el.clientHeight + 2) newNeedsExpand[id] = true
      })

      wasExpanded.forEach(el => el.classList.add('expanded'))

      const oldKey = Object.keys(this._noteNeedsExpand).sort().join(',')
      const newKey = Object.keys(newNeedsExpand).sort().join(',')
      if (oldKey !== newKey) this._noteNeedsExpand = newNeedsExpand
    },

    initNoteOverflowObserver()
    {
      if (this._noteOverflowObserver) return
      const list = document.getElementById('notes-list')
      if (!list) return

      const obs = new MutationObserver(() =>
      {
        if (this._noteOverflowMeasurePending) return
        this._noteOverflowMeasurePending = true
        requestAnimationFrame(() => requestAnimationFrame(() =>
        {
          this._noteOverflowMeasurePending = false
          this._measureNoteOverflow()
        }))
      })
      obs.observe(list, { childList: true, subtree: true, characterData: true })
      this._noteOverflowObserver = obs

      requestAnimationFrame(() => requestAnimationFrame(() => this._measureNoteOverflow()))
    },

    // --- RECURRENCE HELPERS ---
    // Returns { token, body }. `body` keeps any `@HHMM` the user typed so it
    // shows up in the calendar — only the `!token` prefix is consumed.
    parseRecurrence(text)
    {
      if (!text) return null
      const m = text.match(RECURRENCE_RE)
      if (!m) return null
      return { token: m[1].toLowerCase(), body: m[2] }
    },

    stripDatePrefix(text)
    {
      return (text || '').replace(DATE_PREFIX_RE, '')
    },

    computeNextDate(fromDate, token)
    {
      const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())

      let mm = token.match(/^(\d+)([dwmy])$/)
      if (mm)
      {
        const n = parseInt(mm[1], 10)
        const unit = mm[2]
        if (n <= 0) return null
        if (unit === 'd') d.setDate(d.getDate() + n)
        else if (unit === 'w') d.setDate(d.getDate() + 7 * n)
        else if (unit === 'm') d.setMonth(d.getMonth() + n)
        else if (unit === 'y') d.setFullYear(d.getFullYear() + n)
        return d
      }

      let md = token.match(/^m(\d{1,2})$/)
      if (md)
      {
        const day = parseInt(md[1], 10)
        if (day < 1 || day > 31) return null
        d.setDate(1)
        d.setMonth(d.getMonth() + 1)
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        d.setDate(Math.min(day, lastDay))
        return d
      }

      let wd = token.match(/^w(mo|tu|we|th|fr|sa|su)$/)
      if (wd)
      {
        const map = { mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 0 }
        const target = map[wd[1]]
        do { d.setDate(d.getDate() + 1) } while (d.getDay() !== target)
        return d
      }

      let ym = token.match(/^y(\d{2})-(\d{2})$/)
      if (ym)
      {
        const month = parseInt(ym[1], 10) - 1
        const day = parseInt(ym[2], 10)
        if (month < 0 || month > 11 || day < 1 || day > 31) return null
        d.setDate(1)
        d.setFullYear(d.getFullYear() + 1)
        d.setMonth(month)
        const lastDay = new Date(d.getFullYear(), month + 1, 0).getDate()
        d.setDate(Math.min(day, lastDay))
        return d
      }

      return null
    },

    toDateStr(d)
    {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    },

    // `text` is the body of the recurrence (with `!token` already stripped)
    // and may include an `@HHMM` token — that token is intentionally preserved
    // in the note text so it is visible in the calendar list.
    buildRecurrenceGroup(text, token, category, anchorDateStr)
    {
      const now = Date.now()
      const groupId = now
      const cat = category || this.activeCategory
      const created = []

      const cleanText = this.stripDatePrefix(text)

      let cursor
      if (anchorDateStr)
      {
        const parts = anchorDateStr.split('-').map(Number)
        cursor = new Date(parts[0], parts[1] - 1, parts[2])
      }
      else
      {
        const t = new Date()
        cursor = new Date(t.getFullYear(), t.getMonth(), t.getDate())
      }

      const firstDateStr = this.toDateStr(cursor)
      const firstNote = {
        id: now,
        text: `${firstDateStr} ${cleanText}`,
        completed: false,
        category: cat,
        pinned: false,
        updatedAt: now,
        groupId,
        scheduledDate: firstDateStr,
        recurrence: token
      }
      created.push(firstNote)

      for (let i = 0; i < FUTURE_BUFFER; i++)
      {
        const next = this.computeNextDate(cursor, token)
        if (!next) break
        cursor = next
        const nextStr = this.toDateStr(cursor)
        const occ = {
          id: now + i + 1,
          text: `${nextStr} ${cleanText}`,
          completed: false,
          category: cat,
          pinned: false,
          updatedAt: now,
          groupId,
          scheduledDate: nextStr,
          recurrence: token
        }
        created.push(occ)
      }
      return created
    },

    extendRecurrenceGroup(note)
    {
      if (!note.groupId || !note.recurrence) return
      const todayStr = this.toDateStr(new Date())
      const groupNotes = this.notes.filter(n => n.groupId === note.groupId)
      const futureOpen = groupNotes.filter(n => !n.completed && n.scheduledDate && n.scheduledDate >= todayStr)
      if (futureOpen.length > FUTURE_BUFFER) return

      let maxStr = null
      groupNotes.forEach(n => { if (n.scheduledDate && (!maxStr || n.scheduledDate > maxStr)) maxStr = n.scheduledDate })
      if (!maxStr) return

      const last = new Date(maxStr + 'T00:00:00')
      const next = this.computeNextDate(last, note.recurrence)
      if (!next) return
      const nextStr = this.toDateStr(next)
      if (groupNotes.some(n => n.scheduledDate === nextStr)) return

      const cleanText = this.stripDatePrefix(note.text)

      const now = Date.now()
      const newNote = {
        id: now,
        text: `${nextStr} ${cleanText}`,
        completed: false,
        category: note.category,
        pinned: false,
        updatedAt: now,
        groupId: note.groupId,
        scheduledDate: nextStr,
        recurrence: note.recurrence
      }
      if (this.addNoteBottom) this.notes.push(newNote)
      else this.notes.unshift(newNote)
    },

    // --- UNIVERSAL NOTE ADDER ---
    addNote(rawText, category, anchorDateStr)
    {
      const v = (rawText || '').trim()
      if (!v) return false
      if (tryRunGame(v)) return false

      const cat = category || this.activeCategory

      if (v.startsWith('/'))
      {
        const t = v.slice(1).trim()
        if (t) this.addTab(t)
        return true
      }

      playSound('add', this.uiSounds)

      const rec = this.parseRecurrence(v)
      if (rec)
      {
        const group = this.buildRecurrenceGroup(rec.body, rec.token, cat, anchorDateStr || null)
        if (group.length > 0)
        {
          if (this.addNoteBottom) this.notes.push(...group)
          else this.notes.unshift(...group)
        }
        return true
      }

      let finalText = v
      const isCalendar = cat === this.calendarTabName
      if (isCalendar && !DATE_PREFIX_RE.test(v))
      {
        const prefix = anchorDateStr || this.toDateStr(new Date())
        finalText = prefix + ' ' + v
      }

      const now = Date.now()
      const n = { id: now, text: finalText, completed: false, category: cat, pinned: false, updatedAt: now }
      if (this.addNoteBottom) this.notes.push(n)
      else this.notes.unshift(n)
      return true
    },

    // --- tab/list actions ---
    toggleSortAlphabetical()
    {
      this.sortAlphabetical = !this.sortAlphabetical
      this.saveData()
    },

    getTabLabel(t)
    {
      if (t.includes('%'))
      {
        let catNotes = this.notes.filter(n => n.category === t)
        let tot = catNotes.length
        let comp = catNotes.filter(n => n.completed).length
        let pct = tot > 0 ? Math.round((comp / tot) * 100) : 0
        return t.replace('%', `${pct}%`)
      }
      return t
    },

    selectTab(tab)
    {
      this.closeAllMenus()
      this.activeCategory = tab
      if (!this.keepKeyboard && document.activeElement) document.activeElement.blur()
    },

    // --- note CRUD ---
    submitNote()
    {
      const v = this.noteInput.trim()
      if (!v) return
      this.addNote(v, this.activeCategory, null)
      this.noteInput = ''
      this.saveData()
    },

    toggleNote(n, e)
    {
      const wasCompleted = n.completed
      n.completed = !n.completed
      n.updatedAt = Date.now()

      if (n.completed && !wasCompleted)
      {
        playSound('scratch', this.uiSounds)
        if (this.celebrationMode && typeof confetti === 'function')
        {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } })
        }
        if (n.groupId) this.extendRecurrenceGroup(n)
      }

      if (navigator.vibrate) navigator.vibrate(30)

      let txt = n.text.trim()
      if (/^https?:\/\//i.test(txt) || /^www\./i.test(txt))
      {
        window.location.href = txt.startsWith('http') ? txt : 'https://' + txt
      }
      this.saveData()
    },

    executeTrash(id)
    {
      const idx = this.notes.findIndex(x => x.id === id)
      if (idx < 0) return
      const target = this.notes[idx]

      if (target.groupId)
      {
        const now = Date.now()
        const doomed = this.notes.filter(x => x.groupId === target.groupId)
        this.notes = this.notes.filter(x => x.groupId !== target.groupId)
        doomed.forEach(x => { x.updatedAt = now; this.recycleBin.push(x) })
      }
      else
      {
        this.notes.splice(idx, 1)
        target.updatedAt = Date.now()
        this.recycleBin.push(target)
      }
      this.saveData()
    },

    restoreNote(idx)
    {
      const n = this.recycleBin[idx]
      if (!n) return

      if (n.groupId)
      {
        const now = Date.now()
        const group = this.recycleBin.filter(x => x.groupId === n.groupId)
        this.recycleBin = this.recycleBin.filter(x => x.groupId !== n.groupId)
        group.forEach(x => { x.updatedAt = now; this.notes.push(x) })
      }
      else
      {
        this.recycleBin.splice(idx, 1)
        n.updatedAt = Date.now()
        this.notes.push(n)
      }
      this.saveData()
    },

    clearTrash()
    {
      this.recycleBin = []
      this.saveData()
    },

    // --- note dropdown menu ---
    openNoteMenu(e, id)
    {
      if (this.activeNoteMenuId === id && this.noteMenuVisible) { this.closeAllMenus(); return }
      this.closeAllMenus()
      this.activeNoteMenuId = id

      let clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : window.innerWidth / 2)
      let clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : window.innerHeight / 2)

      this.noteMenuPos = { x: -9999, y: -9999 }
      this.noteMenuVisible = true

      setTimeout(() =>
      {
        const el = document.getElementById('note-dropdown')
        if (!el) return
        const rect = el.getBoundingClientRect()
        const w = rect.width || 160
        const h = rect.height || 260
        const x = Math.max(12, Math.min(clientX, window.innerWidth - w - 12))
        const y = Math.max(12, Math.min(clientY, window.innerHeight - h - 12))
        this.noteMenuPos = { x, y }
      }, 0)
    },

    actionDeleteNote()
    {
      if (!this.activeNoteMenuId) return
      let id = this.activeNoteMenuId
      if (this.doubleTapDelete)
      {
        let now = Date.now()
        if (now - this.lastTrashTap < 300)
        {
          this.executeTrash(id)
          this.showToast('Note deleted')
          this.closeAllMenus()
        }
        else
        {
          if (navigator.vibrate) navigator.vibrate(15)
          this.showToast('Tap delete again to confirm')
        }
        this.lastTrashTap = now
      }
      else
      {
        this.executeTrash(id)
        this.showToast('Note deleted')
        this.closeAllMenus()
      }
    },

    actionTogglePinNote()
    {
      if (!this.activeNoteMenuId) return
      let n = this.notes.find(x => x.id === this.activeNoteMenuId)
      if (n) { n.pinned = !n.pinned; n.updatedAt = Date.now(); this.saveData() }
      this.closeAllMenus()
    },

    actionCopyNote()
    {
      if (!this.activeNoteMenuId) return
      let n = this.notes.find(x => x.id === this.activeNoteMenuId)
      if (n)
      {
        navigator.clipboard.writeText(n.text)
        if (navigator.vibrate) navigator.vibrate(15)
        this.showToast('Note copied')
      }
      this.closeAllMenus()
    },

    actionEditNote()
    {
      if (!this.activeNoteMenuId) return
      let n = this.notes.find(x => x.id === this.activeNoteMenuId)
      if (n)
      {
        this.openPrompt('Edit Note', n.text, val =>
        {
          if (val) { n.text = val; n.updatedAt = Date.now(); this.saveData() }
        })
      }
      this.closeAllMenus()
    },

    // --- tab context menu ---
    openContextMenu(e, tab)
    {
      this.closeAllMenus()
      this.contextTab = tab
      this.contextMenuVisible = true
    },

    moveTab(dir)
    {
      let idx = this.noteCategories.indexOf(this.contextTab)
      if (idx < 0) return
      let nIdx = idx + dir
      if (nIdx >= 0 && nIdx < this.noteCategories.length)
      {
        let t = this.noteCategories[idx]
        this.noteCategories[idx] = this.noteCategories[nIdx]
        this.noteCategories[nIdx] = t
        this.saveData()
      }
      this.closeAllMenus()
    },

    // --- tab lifecycle ---
    addTab(n)
    {
      if (n && !this.noteCategories.includes(n))
      {
        playSound('tab', this.uiSounds)
        this.noteCategories.push(n)
        this.activeCategory = n
        let now = Date.now()
        if (!this.categoryMeta) this.categoryMeta = {}
        this.categoryMeta[n] = { id: now, updatedAt: now }
        this.saveData()
      }
    },

    renameTab(newName)
    {
      let oldName = this.contextTab || this.activeCategory
      if (!newName || oldName === newName) return
      this.renameTabInternal(oldName, newName.trim())
      this.saveData()
    },

    renameCategory(oldCat, newCat)
    {
      if (!oldCat || !newCat || !newCat.trim() || oldCat === newCat) return
      let trimmed = newCat.trim()
      if (this.calendarTabName === oldCat) this.calendarTabName = trimmed
      this.renameTabInternal(oldCat, trimmed)
      this.saveData()
    },

    renameTabInternal(oldName, newName)
    {
      if (!oldName || !newName || oldName === newName) return
      let trimmed = newName.trim()
      if (!trimmed) return

      this.noteCategories = this.noteCategories.filter(x => x !== trimmed)

      let idx = this.noteCategories.indexOf(oldName)
      if (idx !== -1)
      {
        this.noteCategories.splice(idx, 1, trimmed)
      }
      else if (!this.noteCategories.includes(trimmed))
      {
        this.noteCategories.push(trimmed)
      }

      if (this.calendarTabName === oldName) this.calendarTabName = trimmed

      let now = Date.now()
      if (!this.categoryMeta) this.categoryMeta = {}
      let meta = this.categoryMeta[oldName] || { id: now, updatedAt: now }
      meta.updatedAt = now
      this.categoryMeta[trimmed] = meta
      if (oldName !== trimmed) delete this.categoryMeta[oldName]

      this.notes.forEach(n =>
      {
        if (n.category === oldName) { n.category = trimmed; n.updatedAt = now }
      })

      if (this.activeCategory === oldName) this.activeCategory = trimmed
      this._dirtyNotes = true
    },

    deleteTabClick()
    {
      let t = this.contextTab || this.activeCategory
      if (this.noteCategories.length > 1)
      {
        this.noteCategories = this.noteCategories.filter(x => x !== t)
        let now = Date.now()
        this.notes = this.notes.filter(note =>
        {
          if (note.category === t) { note.updatedAt = now; this.recycleBin.push(note); return false }
          return true
        })
        if (this.activeCategory === t) this.activeCategory = this.noteCategories[0]
        this.saveData()
      }
      this.closeAllMenus()
    },

    mergeTabNotes()
    {
      let cat = this.contextTab || this.activeCategory
      let catNotes = this.notes.filter(n => n.category === cat)

      if (!catNotes.length)
      {
        this.showToast('Nothing to merge')
        this.closeAllMenus()
        return
      }

      catNotes.sort((a, b) =>
      {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (this.moveCompletedBottom && a.completed !== b.completed) return a.completed ? 1 : -1
        if (this.sortAlphabetical) return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })
        return 0
      })

      let mergedText = catNotes.map(n => n.text).join('\n')
      let now = Date.now()
      let merged = {
        id: now,
        text: mergedText,
        completed: false,
        category: cat,
        pinned: false,
        updatedAt: now
      }

      if (this.addNoteBottom) this.notes.push(merged)
      else this.notes.unshift(merged)

      if (this.activeCategory !== cat) this.activeCategory = cat

      playSound('add', this.uiSounds)
      this.showToast(`Merged ${catNotes.length} note${catNotes.length === 1 ? '' : 's'}`)
      this.saveData()
      this.closeAllMenus()
    },

    puffCompleted()
    {
      let cat = this.contextTab || this.activeCategory
      let targets = this.notes.filter(n => n.category === cat && n.completed && !n.groupId)
      if (!targets.length) { this.showToast('Nothing to puff'); this.closeAllMenus(); return }
      let now = Date.now()
      targets.forEach(n => { n.updatedAt = now })
      this.notes = this.notes.filter(n => !(n.category === cat && n.completed && !n.groupId))
      this.recycleBin.push(...targets)
      playSound('scratch', this.uiSounds)
      this.showToast(`Puffed ${targets.length} note${targets.length === 1 ? '' : 's'}`)
      this.saveData()
      this.closeAllMenus()
    },

    // --- import merge ---
    mergeNotes(imported)
    {
      if (!Array.isArray(imported)) return { added: 0, updated: 0 }
      let now = Date.now()
      let added = 0
      let updated = 0
      imported.forEach((n, idx) =>
      {
        if (!n || typeof n.text !== 'string') return
        let cat = n.category || 'Main'
        if (!this.noteCategories.includes(cat)) this.noteCategories.push(cat)
        if (!this.categoryMeta) this.categoryMeta = {}
        if (!this.categoryMeta[cat]) this.categoryMeta[cat] = { id: now + idx, updatedAt: now }

        let noteId = (typeof n.id === 'number' && !isNaN(n.id)) ? n.id : null
        let existing = null
        if (noteId) existing = this.notes.find(x => x.id === noteId)
        if (!existing) existing = this.notes.find(x => x.text === n.text && x.category === cat)

        let itemUpdatedAt = (typeof n.updatedAt === 'number' && !isNaN(n.updatedAt)) ? n.updatedAt : now
        let itemPinned = typeof n.pinned === 'boolean' ? n.pinned : false
        let itemCompleted = Boolean(n.completed)

        if (existing)
        {
          if (itemUpdatedAt >= (existing.updatedAt || 0))
          {
            existing.text = n.text
            existing.completed = itemCompleted
            existing.category = cat
            existing.pinned = itemPinned
            existing.updatedAt = itemUpdatedAt
            if (n.groupId) existing.groupId = n.groupId
            if (n.scheduledDate) existing.scheduledDate = n.scheduledDate
            if (n.recurrence) existing.recurrence = n.recurrence
            updated++
          }
        }
        else
        {
          let newNote = {
            id: noteId || (now + Math.floor(Math.random() * 100000) + idx),
            text: n.text, completed: itemCompleted, category: cat,
            pinned: itemPinned, updatedAt: itemUpdatedAt
          }
          if (n.groupId) newNote.groupId = n.groupId
          if (n.scheduledDate) newNote.scheduledDate = n.scheduledDate
          if (n.recurrence) newNote.recurrence = n.recurrence
          this.notes.push(newNote)
          added++
        }
      })
      this.saveData()
      return { added, updated }
    }
  }
}