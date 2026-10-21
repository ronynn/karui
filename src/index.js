import { createApp, reactive, nextTick } from './petite-vue.es.js'
import { setupDragAndDrop } from './dragdrop.js'
import { initFontSystem, processFontUpload, deleteFontFromDB } from './fonts.js'
import { generateMarkdownString, exportData, importJsonFile, exportMarkdown, exportCleanMarkdown, importMarkdownFile, setupNativeHooks } from './datasync.js'
import { playSound, createRipple } from './extras.js'
import { initCalendar, createCalendarModule } from './calendar.js'
import { createNotesModule } from './notes.js'
import { createSettingsModule, applyTheme, applyFont, applyUiScale } from './settings.js'
import { createQrModule } from './qr.js'

// --- LAZY CONFETTI ---
// We removed the eager <script defer> tag from index.html. Instead of blocking
// startup parsing a library most users (celebrationMode=false) never touch, we
// install a tiny stub at module-eval time and swap in the real library on the
// first call. The public API (`confetti(opts)`, `.reset()`, `.create()`) stays
// identical so the celebration code in notes.js needs no changes.
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

// --- VANILLA DOM HELPER ---
export function autoExpandTextarea(el)
{
  if (!el)
  {
    return
  }
  el.style.height = 'auto'
  let calculatedHeight = el.scrollHeight
  let maxHeight = window.innerHeight * 0.45
  let minHeight = 80
  let targetHeight = Math.max(minHeight, Math.min(calculatedHeight, maxHeight))
  el.style.height = targetHeight + 'px'
}

// Preserve getters when merging module objects into one reactive store.
function mergeModules(...mods)
{
  const result = {}
  for (const mod of mods)
  {
    Object.defineProperties(result, Object.getOwnPropertyDescriptors(mod))
  }
  return result
}

// --- HYDRATE PERSISTED STATE BEFORE MOUNT ---
// Reading localStorage inside init() (which runs on @vue:mounted) means the
// first paint renders empty/default tabs and an empty note list, then re-renders
// once the real data arrives -- a visible flash. Pre-populating the reactive
// store here makes the very first paint correct.
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

  store.calendarEnabled = localStorage.getItem('calendarEnabled') !== 'false'
  store.calendarTabName = str('calendarTabName', 'Calendar')
  store.calendarNotificationsEnabled = bool('calendarNotificationsEnabled')

  // Resolve initial active tab to the first persisted category so the first
  // render already highlights the right tab and shows its notes.
  store.activeCategory = store.noteCategories[0] || 'Inbox'
}

const appStore = reactive(mergeModules(
  createSettingsModule(),
  createNotesModule(),
  createQrModule(),
  createCalendarModule(),
  {
    // --- shell state ---
    currentScreen: 'home',
    isScrolled: false,
    noteInput: '',
    quoteText: '',
    quoteAuthor: '',

    // --- modal ---
    modalVisible: false,
    modalTitle: '',
    modalInput: '',
    modalCb: null,

    // --- toast ---
    toastVisible: false,
    toastMessage: '',
    toastTimer: null,

    // --- gestures ---
    tabTouchTimer: null,
    touchStartX: 0,
    touchStartY: 0,
    touchEndX: 0,
    touchEndY: 0,
    scrollTicking: false,

    // --- computed shell ---
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

    // --- lifecycle ---
    async init()
    {
      // State was already hydrated before mount. We only reconcile anything
      // that depends on cross-field invariants here (no redundant localStorage
      // reads, so no extra re-render on mount).
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
          if (!n.id)
          {
            n.id = now + idx
          }
          if (!n.updatedAt)
          {
            n.updatedAt = now
          }
        })

      if (!this.noteCategories.includes(this.activeCategory))
      {
        this.activeCategory = this.noteCategories[0] || 'Inbox'
      }

      applyTheme(this.currentTheme)
      applyFont(this.currentFont)
      applyUiScale(this.uiScale)

      // Measure note overflow NOW, in the synchronous portion of init(), so
      // _noteNeedsExpand is committed in the same microtask flush as the first
      // render -- i.e. before the browser paints. Previously this ran after
      // `await initFontSystem()`, producing a visible post-paint layout shift
      // when expand bars popped into existence.
      this.initNoteOverflowObserver()
      if (typeof this._measureNoteOverflow === 'function')
      {
        this._measureNoteOverflow()
      }

      // Non-critical / async work follows.
      this.customFonts = await initFontSystem()

      if (typeof getRandomQuote === 'function')
      {
        const q = getRandomQuote()
        this.quoteText = q.text
        this.quoteAuthor = q.author
      }

      window.addEventListener('click', e => this.handleGlobalClick(e), true)
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

      // Push the initial event list (deduped), then let Android re-arm
      // if the toggle was already on. If it was already on, this call is
      // a no-op on the Java side (no re-notify).
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
    },

    saveData()
    {
      this._dirtyNotes = true
      localStorage.setItem('noteCategories', JSON.stringify(this.noteCategories))
      localStorage.setItem('notes', JSON.stringify(this.notes))
      localStorage.setItem('recycleBin', JSON.stringify(this.recycleBin))
      localStorage.setItem('categoryMeta', JSON.stringify(this.categoryMeta))
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

      localStorage.setItem('calendarEnabled', this.calendarEnabled)
      localStorage.setItem('calendarTabName', this.calendarTabName)
      localStorage.setItem('calendarNotificationsEnabled', this.calendarNotificationsEnabled)

      if (this.calendarRef && typeof this.calendarRef.renderCalendar === 'function')
      {
        this.calendarRef.renderCalendar()
      }

      if (this.syncFilePath)
      {
        this.exportMarkdownSilent()
      }

      // Deduped internally -- safe to call on every saveData().
      this.syncCalendarEventsToAndroid()

      // Re-measure note overflow after layout-affecting changes
      // (ui scale, font, edit, add/delete). MutationObserver catches
      // DOM changes; this covers CSS-variable changes it can't see.
      if (typeof this._measureNoteOverflow === 'function')
      {
        requestAnimationFrame(() => this._measureNoteOverflow())
      }
    },

    autoExpandTextarea(el)
    {
      autoExpandTextarea(el)
    },

    // --- key handling ---
    onInputKeydown(e)
    {
      if (e.key === 'Enter' && !e.shiftKey)
      {
        if (this.enterNewLine && !e.ctrlKey && !e.metaKey)
        {
          return // let textarea insert a newline
        }
        e.preventDefault()
        this.submitNote()
      }
    },

    // --- gestures / navigation ---
    handleTouchStart(e)
    {
      if (this.disableSwipe)
      {
        return
      }
      this.touchStartX = e.touches[0].clientX
      this.touchStartY = e.touches[0].clientY
      this.touchEndX = this.touchStartX
      this.touchEndY = this.touchStartY
    },

    handleTouchMove(e)
    {
      if (this.disableSwipe)
      {
        return
      }
      this.touchEndX = e.touches[0].clientX
      this.touchEndY = e.touches[0].clientY
    },

    handleTouchEnd()
    {
      if (this.disableSwipe)
      {
        return
      }
      let deltaX = this.touchEndX - this.touchStartX
      let deltaY = this.touchEndY - this.touchStartY

      if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 50)
      {
        let screens = this.screenOrder
        let idx = screens.indexOf(this.currentScreen)
        if (deltaX < 0 && idx < screens.length - 1)
        {
          this.switchScreen(screens[idx + 1])
        }
        else if (deltaX > 0 && idx > 0)
        {
          this.switchScreen(screens[idx - 1])
        }
      }
      this.touchStartX = 0
      this.touchStartY = 0
      this.touchEndX = 0
      this.touchEndY = 0
    },

    switchScreen(name)
    {
      this.currentScreen = name
      this.closeAllMenus()
      const screens = document.querySelectorAll('.screen')
      const idx = this.currentScreenIdx
      if (screens[idx])
      {
        this.isScrolled = screens[idx].scrollTop > 10
      }
    },

    handleScroll(e)
    {
      if (!this.scrollTicking)
      {
        let scrollTop = e.target.scrollTop
        window.requestAnimationFrame(() =>
          {
            let scrolled = scrollTop > 10
            if (this.isScrolled !== scrolled)
            {
              this.isScrolled = scrolled
            }
            this.closeAllMenus()
            this.scrollTicking = false
          })
        this.scrollTicking = true
      }
    },

    // --- tab long press ---
    handleTabTouchStart(e, tab)
    {
      clearTimeout(this.tabTouchTimer)
      this.tabTouchTimer = setTimeout(() =>
        {
          this.openContextMenu(e, tab)
        }, 500)
    },

    handleTabTouchEnd()
    {
      clearTimeout(this.tabTouchTimer)
    },

    handleTabTouchCancel()
    {
      clearTimeout(this.tabTouchTimer)
    },

    // --- FAB ---
    handleFabClick(e)
    {
      if (e && typeof e.preventDefault === 'function')
      {
        e.preventDefault()
      }
      this.focusNoteInput()
    },

    focusNoteInput()
    {
      if (this.currentScreen !== 'home')
      {
        this.switchScreen('home')
      }
      let inp = document.getElementById('note-in')
      if (inp)
      {
        inp.focus()
      }
    },

    // --- menus / modal / toast ---
    closeAllMenus()
    {
      this.contextMenuVisible = false
      this.noteMenuVisible = false
    },

    openPrompt(title, defaultVal, cb)
    {
      this.closeAllMenus()
      this.modalTitle = title
      this.modalInput = defaultVal
      this.modalCb = cb
      this.modalVisible = true
      nextTick(() =>
        {
          let el = document.getElementById('modal-input')
          if (el)
          {
            autoExpandTextarea(el)
            if (this.keepKeyboard)
            {
              el.focus()
            }
          }
        })
    },

    closeModal(saveAction)
    {
      this.modalVisible = false
      if (saveAction && this.modalCb)
      {
        this.modalCb(this.modalInput.trim())
      }
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
        if (targetBtn)
        {
          createRipple(e, targetBtn)
        }
      }
      if (!e.target.closest('.menu'))
      {
        this.closeAllMenus()
      }
    },

    // --- data export / import / sync ---
    exportDataCall()
    {
      exportData(this.notes)
    },

    triggerImport()
    {
      if (window.Android && window.Android.importJsonFile)
      {
        window.Android.importJsonFile()
      }
      else
      {
        let el = document.getElementById('import-json-input')
        if (el)
        {
          el.click()
        }
      }
    },

    importData(e)
    {
      importJsonFile(e.target.files[0], this)
      e.target.value = ''
    },

    exportMarkdownCall()
    {
      exportMarkdown(this.noteCategories, this.notes, this.categoryMeta)
    },

    exportCleanMarkdownCall()
    {
      exportCleanMarkdown(this.noteCategories, this.notes, this.categoryMeta)
    },

    triggerImportMD()
    {
      if (window.Android && window.Android.importMarkdownFile)
      {
        window.Android.importMarkdownFile()
      }
      else
      {
        let el = document.getElementById('import-md-input')
        if (el)
        {
          el.click()
        }
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
        window.Android.setupSyncFile('file.md', generateMarkdownString(this.noteCategories, this.notes, this.categoryMeta))
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
      if (!this.syncFilePath)
      {
        return
      }
      let now = Date.now()
      this.notes.forEach(n =>
        {
          if (!n.updatedAt)
          {
            n.updatedAt = now
          }
        })
      let mdStr = generateMarkdownString(this.noteCategories, this.notes, this.categoryMeta)
      if (window.Android && window.Android.saveFileSync)
      {
        window.Android.saveFileSync(this.syncFilePath, mdStr)
      }
    }
  }
))

// Hydrate before mount so the first paint already shows the real tabs,
// the correct active tab, and the populated note list. No re-render flash.
hydrateStore(appStore)

createApp(appStore).mount()