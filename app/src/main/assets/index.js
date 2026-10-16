import { createApp, reactive, nextTick } from './petite-vue.es.js'
import { setupDragAndDrop } from './dragdrop.js'
import { initFontSystem, processFontUpload, deleteFontFromDB } from './fonts.js'
import { generateMarkdownString, exportData, importJsonFile, exportMarkdown, importMarkdownFile, setupNativeHooks } from './datasync.js'
import { playSound, createRipple } from './extras.js'
import { initCalendar } from './calendar.js'
import { createNotesModule } from './notes.js'
import { createSettingsModule, applyTheme, applyFont, applyUiScale } from './settings.js'
import { buildTabPayload, chunkPayload, renderQrToDataUrl, frameToScanString } from './qr.js'

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

const appStore = reactive(mergeModules(
  createSettingsModule(),
  createNotesModule(),
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

    // --- calendar notifications ---
    calendarNotificationsEnabled: false,
    _lastSyncedCalendarJson: '',   // dedupe key so we don't spam the bridge

    // --- QR share ---
    qrModalVisible: false,
    qrTabName: '',
    qrFrames: [],
    qrFrameIdx: 0,
    qrCurrentImage: '',
    qrBusy: false,

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
      this.noteCategories = JSON.parse(localStorage.getItem('noteCategories')) || ['Main']
      this.notes = JSON.parse(localStorage.getItem('notes')) || []
      this.recycleBin = JSON.parse(localStorage.getItem('recycleBin')) || []
      this.categoryMeta = JSON.parse(localStorage.getItem('categoryMeta')) || {}
      this.currentTheme = localStorage.getItem('theme') || 'gruvbox'
      this.currentFont = localStorage.getItem('font') || 'system-ui'
      this.uiScale = parseFloat(localStorage.getItem('uiScale')) || 1
      this.doubleTapDelete = localStorage.getItem('doubleTapDelete') === 'true'
      this.celebrationMode = localStorage.getItem('celebrationMode') === 'true'
      this.keepKeyboard = localStorage.getItem('keepKeyboard') === 'true'
      this.uiSounds = localStorage.getItem('uiSounds') === 'true'
      this.buttonRipples = localStorage.getItem('buttonRipples') === 'true'
      this.showFab = localStorage.getItem('showFab') === 'true'
      this.sortAlphabetical = localStorage.getItem('sortAlphabetical') === 'true'
      this.addNoteBottom = localStorage.getItem('addNoteBottom') === 'true'
      this.moveCompletedBottom = localStorage.getItem('moveCompletedBottom') === 'true'
      this.disableSwipe = localStorage.getItem('disableSwipe') === 'true'
      this.disableScreenshots = localStorage.getItem('disableScreenshots') === 'true'
      this.notificationEnabled = localStorage.getItem('notificationEnabled') === 'true'
      this.inboxTabName = localStorage.getItem('inboxTabName') || 'Inbox'
      this.syncFilePath = localStorage.getItem('syncFilePath') || ''
      this.enterNewLine = localStorage.getItem('enterNewLine') === 'true'

      this.calendarEnabled = localStorage.getItem('calendarEnabled') !== 'false'
      this.calendarTabName = localStorage.getItem('calendarTabName') || 'Calkarui'
      this.calendarNotificationsEnabled = localStorage.getItem('calendarNotificationsEnabled') === 'true'


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

      this.customFonts = await initFontSystem()

      applyTheme(this.currentTheme)
      applyFont(this.currentFont)
      applyUiScale(this.uiScale)

      if (!this.noteCategories.includes(this.activeCategory))
      {
        this.activeCategory = this.noteCategories[0] || 'Main'
      }

      if (typeof getRandomQuote === 'function')
      {
        const q = getRandomQuote()
        this.quoteText = q.text
        this.quoteAuthor = q.author
      }

      window.addEventListener('click', e => this.handleGlobalClick(e), true)
      setupNativeHooks(this)
      setupDragAndDrop(this)

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

      // Deduped internally — safe to call on every saveData().
      this.syncCalendarEventsToAndroid()
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

    // --- QR share (per tab) ---
    async showTabQr()
    {
      const tab = this.contextTab
      this.closeAllMenus()
      if (!tab)
      {
        return
      }

      this.qrTabName = tab
      this.qrFrames = []
      this.qrFrameIdx = 0
      this.qrCurrentImage = ''
      this.qrBusy = true
      this.qrModalVisible = true

      try
      {
        const payload = buildTabPayload(tab, this.notes, this.categoryMeta)
        this.qrFrames = chunkPayload(payload)
        await this.renderQrFrame(0)
      }
      catch (e)
      {
        this.qrModalVisible = false
        this.showToast('QR generation failed')
      }
      finally
      {
        this.qrBusy = false
      }
    },

    async renderQrFrame(idx)
    {
      const frame = this.qrFrames[idx]
      if (!frame)
      {
        return
      }
      this.qrCurrentImage = await renderQrToDataUrl(frameToScanString(frame))
    },

    async qrPrevFrame()
    {
      if (this.qrBusy || this.qrFrameIdx <= 0)
      {
        return
      }
      this.qrBusy = true
      this.qrFrameIdx--
      try
      {
        await this.renderQrFrame(this.qrFrameIdx)
      }
      finally
      {
        this.qrBusy = false
      }
    },

    async qrNextFrame()
    {
      if (this.qrBusy || this.qrFrameIdx >= this.qrFrames.length - 1)
      {
        return
      }
      this.qrBusy = true
      this.qrFrameIdx++
      try
      {
        await this.renderQrFrame(this.qrFrameIdx)
      }
      finally
      {
        this.qrBusy = false
      }
    },

    qrClose()
    {
      this.qrModalVisible = false
      this.qrFrames = []
      this.qrFrameIdx = 0
      this.qrCurrentImage = ''
      this.qrBusy = false
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
        this.showToast('Please set a sync file first')
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
    },

    //  Calendar Notifications

    /**
     * Collects every event from the calendar tab and pushes it to Android.
     *
     * Handles both:
     *   - Classic events: text starts with "YYYY-MM-DD "
     *   - Recurring notes: carry their own scheduledDate property
     *
     * Dedupes against the last successfully-synced JSON so we don't hit
     * the bridge (and therefore don't trigger a REFRESH broadcast) on
     * every unrelated saveData() call.
     */
    syncCalendarEventsToAndroid()
    {
      if (!window.Android || typeof window.Android.updateCalendarEvents !== 'function') return

      // Calendar off → clear the cache once and bail.
      if (!this.calendarEnabled)
      {
        if (this._lastSyncedCalendarJson !== '[]')
        {
          this._lastSyncedCalendarJson = '[]'
          try { window.Android.updateCalendarEvents('[]') } catch (e) {}
        }
        return
      }

      const cat = this.calendarTabName || 'Calkarui'
      const dateRe = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/
      const events = []

      this.notes.forEach(n =>
        {
          if (!n || n.category !== cat || !n.text) return

          // Classic calendar event: "YYYY-MM-DD <text>"
          const m = n.text.match(dateRe)
          if (m)
          {
            events.push({
              date: m[1],
              text: m[2].trim(),
              id: n.id,
              completed: !!n.completed
            })
            return
          }

          // Recurring note with scheduledDate — the visible text already
          // carries the date prefix; strip it for the notification body.
          if (n.scheduledDate && /^\d{4}-\d{2}-\d{2}$/.test(n.scheduledDate))
          {
            events.push({
              date: n.scheduledDate,
              text: n.text.replace(/^\d{4}-\d{2}-\d{2}\s+/, '').trim(),
              id: n.id,
              completed: !!n.completed
            })
          }
        })

      const json = JSON.stringify(events)

      // Nothing changed → skip the bridge entirely. This is what stops
      // the notification from re-firing on every unrelated edit.
      if (json === this._lastSyncedCalendarJson) return
      this._lastSyncedCalendarJson = json

      try { window.Android.updateCalendarEvents(json) } catch (e) {}
    },

    toggleCalendarNotifications()
    {
      localStorage.setItem('calendarNotificationsEnabled', this.calendarNotificationsEnabled)

      // Daily reminders ride on the same notification service as quick-note,
      // so mirror the toggle to keep them in sync.
      if (this.calendarNotificationsEnabled && !this.notificationEnabled)
      {
        this.notificationEnabled = true
        if (window.Android && typeof window.Android.toggleNotification === 'function')
        {
          window.Android.toggleNotification(true)
        }
      }

      // Make sure Android has the freshest event list before we arm.
      this.syncCalendarEventsToAndroid()

      if (window.Android && typeof window.Android.setCalendarNotificationsEnabled === 'function')
      {
        window.Android.setCalendarNotificationsEnabled(this.calendarNotificationsEnabled)
        this.showToast(this.calendarNotificationsEnabled
                       ? 'Daily calendar reminder enabled'
                       : 'Daily calendar reminder disabled')
      }
      else if (this.calendarNotificationsEnabled)
      {
        this.showToast('Calendar notifications only work in the Android app')
      }
    }
  }
))

createApp(appStore).mount()