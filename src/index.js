import { createApp, reactive, nextTick } from './petite-vue.es.js'
import { setupDragAndDrop } from './dragdrop.js'
import { initFontSystem, processFontUpload, deleteFontFromDB } from './fonts.js'
import { generateMarkdownString, exportData, importJsonFile, exportMarkdown, exportCleanMarkdown, importMarkdownFile, setupNativeHooks } from './datasync.js'
import { playSound, createRipple } from './extras.js'
import { initCalendar, createCalendarModule } from './calendar.js'
import { createNotesModule } from './notes.js'
import { createSettingsModule, applyTheme, applyFont, applyUiScale } from './settings.js'
import { createQrModule } from './qr.js'
import { createPomodoroModule } from './pomodoro.js'

// Lazy-load confetti so first paint doesn't wait on it.
let _confettiPromise = null
function _loadConfetti()
{
  if (_confettiPromise) return _confettiPromise
  _confettiPromise = new Promise((resolve, reject) =>
  {
    const s = document.createElement('script')
    s.src = 'confetti.browser.min.js'
    s.async = true
    s.onload = () => resolve(window.confetti)
    s.onerror = () => { _confettiPromise = null; reject(new Error('confetti failed to load')) }
    document.head.appendChild(s)
  })
  return _confettiPromise
}

if (typeof window.confetti !== 'function')
{
  const stub = function(...args)
  {
    _loadConfetti().then(fn => { if (fn) fn(...args) }).catch(() => {})
  }
  stub.reset = function()
  {
    _loadConfetti().then(fn => { if (fn && fn.reset) fn.reset() }).catch(() => {})
  }
  stub.create = function(...args)
  {
    return function(...callArgs)
    {
      _loadConfetti().then(fn =>
      {
        if (fn && fn.create) fn.create(...args)(...callArgs)
      }).catch(() => {})
    }
  }
  window.confetti = stub
}

// Auto-grow a textarea up to 45vh.
export function autoExpandTextarea(el)
{
  if (!el) return
  el.style.height = 'auto'
  let calculatedHeight = el.scrollHeight
  let maxHeight = window.innerHeight * 0.45
  let minHeight = 80
  let targetHeight = Math.max(minHeight, Math.min(calculatedHeight, maxHeight))
  el.style.height = targetHeight + 'px'
}

function mergeModules(...mods)
{
  const result = {}
  for (const mod of mods)
  {
    Object.defineProperties(result, Object.getOwnPropertyDescriptors(mod))
  }
  return result
}

// Hydrate persisted state from localStorage before mount.
function hydrateStore(store)
{
  const ls = (k) =>
  {
    try { return JSON.parse(localStorage.getItem(k)) } catch (e) { return null }
  }
  const str = (k, def) =>
  {
    const v = localStorage.getItem(k)
    return v === null ? def : v
  }
  const bool = (k) => localStorage.getItem(k) === 'true'

  store.noteCategories = [...new Set(ls('noteCategories') || ['Inbox'])]
  store.notes = ls('notes') || []
  store.recycleBin = ls('recycleBin') || []
  store.categoryMeta = ls('categoryMeta') || {}
  store.customThemes = ls('customThemes') || []

  const seedTime = Date.now()
  store.notes.forEach((n, idx) =>
  {
    if (!n.id) n.id = seedTime + idx
    if (!n.updatedAt) n.updatedAt = seedTime
  })

  store.currentTheme = str('theme', 'gruvbox')
  store.currentFont = str('font', 'system-ui')
  store.uiScale = parseFloat(localStorage.getItem('uiScale')) || 1

  store.doubleTapDelete = bool('doubleTapDelete')
  store.celebrationMode = bool('celebrationMode')
  store.keepKeyboard = bool('keepKeyboard')
  store.uiSounds = bool('uiSounds')
  store.buttonRipples = bool('buttonRipples')
  store.showFab = bool('showFab')
  store.sortAlphabetical = bool('sortAlphabetical')
  store.addNoteBottom = bool('addNoteBottom')
  store.moveCompletedBottom = bool('moveCompletedBottom')
  store.disableSwipe = bool('disableSwipe')
  store.disableScreenshots = bool('disableScreenshots')
  store.notificationEnabled = bool('notificationEnabled')
  store.inboxTabName = str('inboxTabName', 'Inbox')
  store.syncFilePath = str('syncFilePath', '')
  store.enterNewLine = bool('enterNewLine')
  store.weekStartsMonday = bool('weekStartsMonday')
  store.removeTransitions = bool('removeTransitions')

  store.calendarEnabled = localStorage.getItem('calendarEnabled') !== 'false'
  store.calendarTabName = str('calendarTabName', 'Calkarui')
  store.calendarNotificationsEnabled = bool('calendarNotificationsEnabled')

  store.activeCategory = store.noteCategories[0] || 'Inbox'

  // Session-only state.
  store._unlockedTabs = {}
  store.searchTerm = ''
  store.modalIsPassword = false
}

const appStore = reactive(mergeModules(
  createSettingsModule(),
  createNotesModule(),
  createQrModule(),
  createCalendarModule(),
  createPomodoroModule(),
  {
    currentScreen: 'home',
    isScrolled: false,
    noteInput: '',
    quoteText: '',
    quoteAuthor: '',

    weekStartsMonday: false,
    removeTransitions: false,

    // Full-screen note editor (autosave) state.
    editVisible: false,
    editNoteId: null,
    editDraftText: '',
    editTabMode: false,
    editTabName: null,
    _autosaveTimer: null,
    _vvListener: null,
    _editPushedState: false,
    _lastKbPad: null,

    _sideEffectTimer: null,

    modalVisible: false,
    modalTitle: '',
    modalInput: '',
    modalCb: null,

    toastVisible: false,
    toastMessage: '',
    toastTimer: null,

    tabTouchTimer: null,
    touchStartX: 0,
    touchStartY: 0,
    touchEndX: 0,
    touchEndY: 0,
    scrollTicking: false,

    get screenOrder()
    {
      return this.calendarEnabled ? ['home', 'calendar', 'settings'] : ['home', 'settings']
    },

    get currentScreenIdx()
    {
      if (this.currentScreen === 'home') return 0
      if (this.currentScreen === 'calendar') return 1
      if (this.currentScreen === 'settings') return this.calendarEnabled ? 2 : 1
      return 0
    },

    async init()
    {
      this.noteCategories = [...new Set(this.noteCategories)]

      if (this.calendarEnabled && !this.noteCategories.includes(this.calendarTabName))
      {
        this.noteCategories.push(this.calendarTabName)
      }

      let now = Date.now()
      this.noteCategories.forEach((cat, idx) =>
      {
        if (!this.categoryMeta[cat])
        {
          this.categoryMeta[cat] = { id: now + idx, updatedAt: now }
        }
      })

      this.notes.forEach((n, idx) =>
      {
        if (!n.id) n.id = now + idx
        if (!n.updatedAt) n.updatedAt = now
      })

      if (!this.noteCategories.includes(this.activeCategory))
      {
        this.activeCategory = this.noteCategories[0] || 'Inbox'
      }

      applyTheme(this.currentTheme, this.customThemes)
      applyFont(this.currentFont)
      applyUiScale(this.uiScale)

      this.initNoteOverflowObserver()

      const fontReady = (document.fonts && document.fonts.ready)
        ? document.fonts.ready
        : Promise.resolve()
      fontReady.then(() => requestAnimationFrame(() =>
      {
        if (typeof this._measureNoteOverflow === 'function') this._measureNoteOverflow()
      }))

      this.customFonts = await initFontSystem()

      if (typeof getRandomQuote === 'function')
      {
        const q = getRandomQuote()
        this.quoteText = q.text
        this.quoteAuthor = q.author
      }

      window.addEventListener('click', e => this.handleGlobalClick(e), true)

      // Un-hide header + flag keyboard-open whenever a text field is focused.
      window.addEventListener('focusin', (e) =>
      {
        const t = e.target
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))
        {
          if (this.isScrolled) this.isScrolled = false
          document.body.classList.add('kb-open')
        }
      })

      window.addEventListener('focusout', (e) =>
      {
        const t = e.target
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))
        {
          setTimeout(() =>
          {
            const ae = document.activeElement
            if (!ae || (ae.tagName !== 'INPUT' && ae.tagName !== 'TEXTAREA'))
            {
              document.body.classList.remove('kb-open')
            }
          }, 80)
        }
      })

      // ESC closes the editor (desktop / external keyboards).
      window.addEventListener('keydown', (e) =>
      {
        if (e.key === 'Escape' && this.editVisible)
        {
          e.preventDefault()
          this.finishEdit()
        }
      })

      // Hardware / gesture back closes the editor.
      window.addEventListener('popstate', () =>
      {
        if (this.editVisible) this.finishEdit()
      })

      // Flush deferred side effects before backgrounding.
      document.addEventListener('visibilitychange', () =>
      {
        if (document.hidden && this._sideEffectTimer)
        {
          clearTimeout(this._sideEffectTimer)
          this._sideEffectTimer = null
          this._runSideEffects()
        }
      })

      setupNativeHooks(this)
      setupDragAndDrop(this)

      window.addEventListener('resize', () =>
      {
        clearTimeout(this._resizeDebounce)
        this._resizeDebounce = setTimeout(() =>
        {
          if (typeof this._measureNoteOverflow === 'function') this._measureNoteOverflow()
        }, 150)
      })

      this.syncCalendarEventsToAndroid()
      if (this.calendarNotificationsEnabled &&
          window.Android &&
          typeof window.Android.setCalendarNotificationsEnabled === 'function')
      {
        window.Android.setCalendarNotificationsEnabled(true)
      }

      if (this.calendarEnabled)
      {
        setTimeout(() =>
        {
          this.calendarRef = initCalendar(this)
        }, 50)
      }

      // Resume an in-flight pomodoro + recover an unsaved tab edit.
      this.resumePomodoroIfNeeded()
      this._recoverTabEditDraft()

      // Defensive blur for old WebViews that auto-focus a clickable on load.
      requestAnimationFrame(() => requestAnimationFrame(() =>
      {
        const ae = document.activeElement
        const ni = document.getElementById('note-in')
        if (ae && ae !== ni && ae !== document.body && typeof ae.blur === 'function')
        {
          ae.blur()
        }
      }))
    },

    saveData()
    {
      this._dirtyNotes = true
      localStorage.setItem('noteCategories', JSON.stringify(this.noteCategories))
      localStorage.setItem('notes', JSON.stringify(this.notes))
      localStorage.setItem('recycleBin', JSON.stringify(this.recycleBin))
      localStorage.setItem('categoryMeta', JSON.stringify(this.categoryMeta))
      localStorage.setItem('customThemes', JSON.stringify(this.customThemes))
      localStorage.setItem('theme', this.currentTheme)
      localStorage.setItem('font', this.currentFont)
      localStorage.setItem('uiScale', this.uiScale)
      localStorage.setItem('doubleTapDelete', this.doubleTapDelete)
      localStorage.setItem('celebrationMode', this.celebrationMode)
      localStorage.setItem('keepKeyboard', this.keepKeyboard)
      localStorage.setItem('uiSounds', this.uiSounds)
      localStorage.setItem('buttonRipples', this.buttonRipples)
      localStorage.setItem('showFab', this.showFab)
      localStorage.setItem('sortAlphabetical', this.sortAlphabetical)
      localStorage.setItem('addNoteBottom', this.addNoteBottom)
      localStorage.setItem('moveCompletedBottom', this.moveCompletedBottom)
      localStorage.setItem('disableSwipe', this.disableSwipe)
      localStorage.setItem('disableScreenshots', this.disableScreenshots)
      localStorage.setItem('notificationEnabled', this.notificationEnabled)
      localStorage.setItem('inboxTabName', this.inboxTabName)
      localStorage.setItem('syncFilePath', this.syncFilePath)
      localStorage.setItem('enterNewLine', this.enterNewLine)
      localStorage.setItem('weekStartsMonday', this.weekStartsMonday)
      localStorage.setItem('removeTransitions', this.removeTransitions)

      localStorage.setItem('calendarEnabled', this.calendarEnabled)
      localStorage.setItem('calendarTabName', this.calendarTabName)
      localStorage.setItem('calendarNotificationsEnabled', this.calendarNotificationsEnabled)

      if (this.currentScreen === 'calendar' && this.calendarRef && typeof this.calendarRef.renderCalendar === 'function')
      {
        this.calendarRef.renderCalendar()
      }

      this._scheduleSideEffects()

      // Re-evaluate scroll state after any state change. The removeTransitions
      // toggle changes padding without firing a scroll event, leaving
      // isScrolled stale — this catches it.
      requestAnimationFrame(() =>
      {
        const vv = window.visualViewport
        const kbOpen = vv ? (window.innerHeight - vv.height) > 100 : false
        if (kbOpen) return
        const screens = document.querySelectorAll('.screen')
        const idx = this.currentScreenIdx
        if (screens[idx])
        {
          const scrolled = screens[idx].scrollTop > 10
          if (this.isScrolled !== scrolled) this.isScrolled = scrolled
        }
      })
    },

    _scheduleSideEffects()
    {
      clearTimeout(this._sideEffectTimer)
      this._sideEffectTimer = setTimeout(() =>
      {
        this._sideEffectTimer = null
        this._runSideEffects()
      }, 1000)
    },

    _runSideEffects()
    {
      if (this.syncFilePath)
      {
        this.exportMarkdownSilent()
      }
      this.syncCalendarEventsToAndroid()
      if (typeof this._measureNoteOverflow === 'function' && !this.editVisible)
      {
        requestAnimationFrame(() => this._measureNoteOverflow())
      }
    },

    autoExpandTextarea(el)
    {
      autoExpandTextarea(el)
    },

    onInputKeydown(e)
    {
      if (e.key === 'Enter' && !e.shiftKey)
      {
        if (this.enterNewLine && !e.ctrlKey && !e.metaKey)
        {
          return
        }
        e.preventDefault()
        this.submitNote()
      }
    },

    handleTouchStart(e)
    {
      if (this.disableSwipe) return
      this.touchStartX = e.touches[0].clientX
      this.touchStartY = e.touches[0].clientY
      this.touchEndX = this.touchStartX
      this.touchEndY = this.touchStartY
    },

    handleTouchMove(e)
    {
      if (this.disableSwipe) return
      this.touchEndX = e.touches[0].clientX
      this.touchEndY = e.touches[0].clientY
    },

    handleTouchEnd()
    {
      if (this.disableSwipe) return
      let deltaX = this.touchEndX - this.touchStartX
      let deltaY = this.touchEndY - this.touchStartY

      if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 50)
      {
        let screens = this.screenOrder
        let idx = screens.indexOf(this.currentScreen)
        if (deltaX < 0 && idx < screens.length - 1) this.switchScreen(screens[idx + 1])
        else if (deltaX > 0 && idx > 0) this.switchScreen(screens[idx - 1])
      }
      this.touchStartX = 0
      this.touchStartY = 0
      this.touchEndX = 0
      this.touchEndY = 0
    },

    switchScreen(name)
    {
      this.currentScreen = name
      if (this.contextMenuVisible || this.noteMenuVisible) this.closeAllMenus()
      const screens = document.querySelectorAll('.screen')
      const idx = this.currentScreenIdx
      if (screens[idx]) this.isScrolled = screens[idx].scrollTop > 10
      if (name === 'calendar' && this.calendarRef && typeof this.calendarRef.renderCalendar === 'function')
      {
        this.calendarRef.renderCalendar()
      }
    },

    handleScroll(e)
    {
      if (!this.scrollTicking)
      {
        const scrollTop = e.target.scrollTop
        window.requestAnimationFrame(() =>
        {
          // Only suppress header-hide when the keyboard is actually up
          // (detected via visualViewport), NOT when an input merely retains
          // focus. The old activeElement check left isScrolled stuck at
          // false after toggling remove-transitions, because padding changes
          // never fire a scroll event.
          const vv = window.visualViewport
          const kbOpen = vv
            ? (window.innerHeight - vv.height) > 100
            : document.body.classList.contains('kb-open')
          if (kbOpen)
          {
            if (this.isScrolled) this.isScrolled = false
          }
          else
          {
            const scrolled = scrollTop > 10
            if (this.isScrolled !== scrolled) this.isScrolled = scrolled
          }
          if (this.contextMenuVisible || this.noteMenuVisible) this.closeAllMenus()
          this.scrollTicking = false
        })
        this.scrollTicking = true
      }
    },

    handleTabTouchStart(e, tab)
    {
      clearTimeout(this.tabTouchTimer)
      this.tabTouchTimer = setTimeout(() =>
      {
        this.openContextMenu(e, tab)
      }, 500)
    },

    handleTabTouchEnd() { clearTimeout(this.tabTouchTimer) },
    handleTabTouchCancel() { clearTimeout(this.tabTouchTimer) },

    handleFabClick(e)
    {
      if (e && typeof e.preventDefault === 'function') e.preventDefault()
      this.focusNoteInput()
    },

    // FAB doubles as Done button while the editor is open.
    onFabClick(e)
    {
      if (this.editVisible) this.finishEdit()
      else this.handleFabClick(e)
    },

    focusNoteInput()
    {
      if (this.currentScreen !== 'home') this.switchScreen('home')
      let inp = document.getElementById('note-in')
      if (inp) inp.focus()
    },

    // Open the full-screen single-note editor. Keyboard only pops when
    // keepKeyboard is on.
    startEdit(note)
    {
      if (!note) return
      this.editNoteId = note.id
      this.editDraftText = note.text
      this.editTabMode = false
      this.editTabName = null
      this.editVisible = true
      this._editPushedState = false
      this._updateKeyboardPadding()
      this._bindViewportListener()
      if (!history.state || !history.state.karuiEdit)
      {
        history.pushState({ karuiEdit: true }, '')
        this._editPushedState = true
      }
      if (this.keepKeyboard)
      {
        nextTick(() =>
        {
          const el = document.getElementById('edit-textarea')
          if (!el) return
          el.focus()
          const len = el.value.length
          try { el.selectionStart = el.selectionEnd = len } catch (_) {}
        })
      }
    },

    // Open the full-screen editor with the whole tab as markdown.
    editTabAsMarkdown()
    {
      const tab = this.contextTab
      if (!tab) return
      if (this.isTabLocked(tab))
      {
        this.showToast('Unlock tab first')
        this.closeAllMenus()
        return
      }
      this.closeAllMenus()
      this.editTabName = tab
      this.editTabMode = true
      this.editNoteId = null
      this.editDraftText = this._generateTabMarkdown(tab)
      this.editVisible = true
      this._editPushedState = false
      this._updateKeyboardPadding()
      this._bindViewportListener()
      if (!history.state || !history.state.karuiEdit)
      {
        history.pushState({ karuiEdit: true }, '')
        this._editPushedState = true
      }
      if (this.keepKeyboard)
      {
        nextTick(() =>
        {
          const el = document.getElementById('edit-textarea')
          if (el) el.focus()
        })
      }
    },

    // Recover a tab-edit that was open when the app was killed. Persists
    // to localStorage on every keystroke (autosave), so nothing is lost.
    _recoverTabEditDraft()
    {
      let draft = null
      try { draft = JSON.parse(localStorage.getItem('tabEditDraft') || 'null') } catch (e) {}
      if (!draft || !draft.tab || typeof draft.text !== 'string') return
      if (!this.noteCategories.includes(draft.tab))
      {
        localStorage.removeItem('tabEditDraft')
        return
      }
      this.applyTabMarkdown(draft.tab, draft.text)
      localStorage.removeItem('tabEditDraft')
      this.showToast('Recovered unsaved tab edits')
    },

    // Debounced autosave. Store updates immediately; localStorage follows in 400ms.
    autosaveEdit()
    {
      // Tab-mode: persist draft to localStorage (crash recovery only).
      // Actual merge happens in finishEdit.
      if (this.editTabMode)
      {
        try
        {
          localStorage.setItem('tabEditDraft', JSON.stringify({
            tab: this.editTabName,
            text: this.editDraftText,
          }))
        }
        catch (e) {}
        return
      }
      if (this.editNoteId == null) return
      const n = this.notes.find(x => x.id === this.editNoteId)
      if (!n) return
      n.text = this.editDraftText
      n.updatedAt = Date.now()
      clearTimeout(this._autosaveTimer)
      this._autosaveTimer = setTimeout(() => this.saveData(), 400)
    },

    // Compute keyboard height from visualViewport and publish it as --kb-pad.
    // Skips the write if the value hasn't changed to avoid style recalcs.
    _updateKeyboardPadding()
    {
      if (!this.editVisible) return
      const vv = window.visualViewport
      const kbHeight = vv ? Math.max(0, window.innerHeight - vv.height) : 0
      const pad = kbHeight > 60 ? (kbHeight + 60) : 0
      const padStr = pad + 'px'
      if (this._lastKbPad !== padStr)
      {
        this._lastKbPad = padStr
        document.documentElement.style.setProperty('--kb-pad', padStr)
      }
    },

    _bindViewportListener()
    {
      if (this._vvListener) return
      if (!window.visualViewport) return
      this._vvListener = () => this._updateKeyboardPadding()
      window.visualViewport.addEventListener('resize', this._vvListener)
      window.visualViewport.addEventListener('scroll', this._vvListener)
    },

    _unbindViewportListener()
    {
      if (this._vvListener && window.visualViewport)
      {
        window.visualViewport.removeEventListener('resize', this._vvListener)
        window.visualViewport.removeEventListener('scroll', this._vvListener)
      }
      this._vvListener = null
      this._lastKbPad = null
      document.documentElement.style.removeProperty('--kb-pad')
    },

    // Flush pending save and close the editor.
    finishEdit()
    {
      if (!this.editVisible) return
      const wasTabMode = this.editTabMode
      const tabName = this.editTabName
      const draft = this.editDraftText
      const id = this.editNoteId
      const shouldPopHistory = this._editPushedState
        && history.state
        && history.state.karuiEdit
      this._editPushedState = false
      this.editTabMode = false
      this.editTabName = null
      this.editVisible = false
      this.editNoteId = null
      clearTimeout(this._autosaveTimer)
      this._unbindViewportListener()
      try { localStorage.removeItem('tabEditDraft') } catch (e) {}

      if (wasTabMode && tabName)
      {
        this.applyTabMarkdown(tabName, draft)
      }
      else if (id != null)
      {
        const n = this.notes.find(x => x.id === id)
        if (n)
        {
          n.text = draft
          n.updatedAt = Date.now()
        }
        this.saveData()
      }
      this.editDraftText = ''
      const ae = document.activeElement
      if (ae && ae !== document.body && typeof ae.blur === 'function') ae.blur()
      requestAnimationFrame(() => this._measureNoteOverflow())
      if (shouldPopHistory) history.back()
    },

    closeAllMenus()
    {
      this.contextMenuVisible = false
      this.noteMenuVisible = false
    },

    openPrompt(title, defaultVal, cb, isPassword)
    {
      this.closeAllMenus()
      this.modalTitle = title
      this.modalInput = defaultVal
      this.modalCb = cb
      this.modalIsPassword = !!isPassword
      this.modalVisible = true
      nextTick(() =>
      {
        if (this.modalIsPassword)
        {
          const el = document.getElementById('modal-pin-input')
          if (el) el.focus()
          return
        }
        const el = document.getElementById('modal-input')
        if (el)
        {
          el.style.height = 'auto'
          autoExpandTextarea(el)
          if (this.keepKeyboard) el.focus()
        }
      })
    },

    closeModal(saveAction)
    {
      this.modalVisible = false
      const cb = this.modalCb
      this.modalCb = null
      this.modalIsPassword = false
      if (cb) cb(saveAction ? this.modalInput.trim() : null)
      nextTick(() =>
      {
        const el = document.getElementById('modal-input')
        if (el) el.style.height = ''
      })
    },

    showToast(msg)
    {
      this.toastMessage = msg
      this.toastVisible = true
      clearTimeout(this.toastTimer)
      this.toastTimer = setTimeout(() =>
      {
        this.toastVisible = false
      }, 2000)
    },

    handleGlobalClick(e)
    {
      playSound('click', this.uiSounds)
      if (this.buttonRipples)
      {
        let targetBtn = e.target.closest('button, .tab, .theme-btn, #fab-btn')
        if (targetBtn) createRipple(e, targetBtn)
      }
      if (!e.target.closest('.menu')) this.closeAllMenus()
    },

    exportDataCall()
    {
      const safeNotes = this.notes.filter(n => !this.isTabLocked(n.category))
      exportData(safeNotes)
    },

    triggerImport()
    {
      if (window.Android && window.Android.importJsonFile) window.Android.importJsonFile()
      else
      {
        let el = document.getElementById('import-json-input')
        if (el) el.click()
      }
    },

    importData(e)
    {
      importJsonFile(e.target.files[0], this)
      e.target.value = ''
    },

    exportMarkdownCall()
    {
      const safeNotes = this.notes.filter(n => !this.isTabLocked(n.category))
      const safeCats = this.noteCategories.filter(t => !this.isTabLocked(t))
      exportMarkdown(safeCats, safeNotes, this.categoryMeta)
    },

    exportCleanMarkdownCall()
    {
      const safeNotes = this.notes.filter(n => !this.isTabLocked(n.category))
      const safeCats = this.noteCategories.filter(t => !this.isTabLocked(t))
      exportCleanMarkdown(safeCats, safeNotes, this.categoryMeta)
    },

    triggerImportMD()
    {
      if (window.Android && window.Android.importMarkdownFile) window.Android.importMarkdownFile()
      else
      {
        let el = document.getElementById('import-md-input')
        if (el) el.click()
      }
    },

    importMarkdown(e)
    {
      importMarkdownFile(e.target.files[0], this)
      e.target.value = ''
    },

    setSyncFile()
    {
      if (window.Android && window.Android.setupSyncFile)
      {
        const safeNotes = this.notes.filter(n => !this.isTabLocked(n.category))
        const safeCats = this.noteCategories.filter(t => !this.isTabLocked(t))
        window.Android.setupSyncFile('file.md', generateMarkdownString(safeCats, safeNotes, this.categoryMeta))
      }
      else
      {
        this.openPrompt('Sync File Path', this.syncFilePath, val =>
        {
          if (val !== null)
          {
            this.syncFilePath = val
            this.saveData()
            this.showToast('Sync target saved')
          }
        })
      }
    },

    manualSync()
    {
      if (!this.syncFilePath)
      {
        this.showToast('Set sync file first')
        return
      }
      this.exportMarkdownSilent()
      if (window.Android && window.Android.triggerManualReadSync)
      {
        window.Android.triggerManualReadSync()
      }
      this.showToast('Synced!')
    },

    exportMarkdownSilent()
    {
      if (!this.syncFilePath) return
      let now = Date.now()
      const safeNotes = this.notes.filter(n => !this.isTabLocked(n.category))
      const safeCats = this.noteCategories.filter(t => !this.isTabLocked(t))
      safeNotes.forEach(n => { if (!n.updatedAt) n.updatedAt = now })
      let mdStr = generateMarkdownString(safeCats, safeNotes, this.categoryMeta)
      if (window.Android && window.Android.saveFileSync)
      {
        window.Android.saveFileSync(this.syncFilePath, mdStr)
      }
    }
  }
))

hydrateStore(appStore)

createApp(appStore).mount()