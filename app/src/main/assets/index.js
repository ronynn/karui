import { createApp, reactive } from './petite-vue.es.js'
import { setupDragAndDrop } from './dragdrop.js'
import { initFontSystem } from './fonts.js'
import { generateMarkdownString, exportData, importJsonFile, exportMarkdown, importMarkdownFile, setupNativeHooks } from './datasync.js'
import { playSound, tryRunGame } from './extras.js'
import { uiMixin } from './ui.js'

const appStore = reactive(
{
  ...uiMixin,

  noteCategories: ['Main'],
  activeCategory: 'Main',
  notes: [],
  recycleBin: [],
  categoryMeta: {},
  currentTheme: 'gruvbox',
  currentFont: 'system-ui',
  uiScale: 1,
  doubleTapDelete: false,
  celebrationMode: false,
  keepKeyboard: false,
  uiSounds: false,
  buttonRipples: false,
  showFab: false,
  sortAlphabetical: false,
  addNoteBottom: false,
  moveCompletedBottom: false,
  disableSwipe: false,
  disableScreenshots: false,
  notificationEnabled: false,
  inboxTabName: 'Inbox',
  customFonts: [],
  syncFilePath: '',
  currentScreenIdx: 0,
  isScrolled: false,
  noteInput: '',
  quoteText: '',
  quoteAuthor: '',

  modalVisible: false,
  modalTitle: '',
  modalInput: '',
  modalCb: null,

  toastVisible: false,
  toastMessage: '',
  toastTimer: null,

  contextMenuVisible: false,
  contextMenuPos: { x: 0, y: 0 },
  contextTab: '',

  noteMenuVisible: false,
  noteMenuPos: { x: 0, y: 0 },
  activeNoteMenuId: null,

  lastTrashTap: 0,
  tabTouchTimer: null,

  touchStartX: 0,
  touchStartY: 0,
  touchEndX: 0,
  touchEndY: 0,

  scrollTicking: false,
  _displayedCache: [],
  _cacheKey: '',
  _dirtyNotes: true,

  themes: [
    { key: 'gruvbox', label: 'GRUVBOX' },
    { key: 'dracula', label: 'DRACULA' },
    { key: 'monokai', label: 'MONOKAI' },
    { key: 'nord', label: 'NORD' },
    { key: 'purple', label: 'PURPLE' },
    { key: 'amoled', label: 'AMOLED' },
    { key: 'cupcake', label: 'CUPCAKE' },
    { key: 'catppuccin', label: 'CATPPUCCIN' },
    { key: 'catppuccin-frappe', label: 'FRAPPE' },
    { key: 'everforest', label: 'EVERFOREST' },
    { key: 'everforest-light', label: 'EV-LIGHT' },
    { key: 'tokyo-night', label: 'TOKYO' }
  ],

  defaultFonts: [
    { name: 'SYSTEM', val: 'system-ui' },
    { name: 'MONO', val: 'monospace' },
    { name: 'SERIF', val: 'serif' }
  ],

  uiSizes: [
    { label: 'S', scale: 0.85 },
    { label: 'M', scale: 1 },
    { label: 'L', scale: 1.15 },
    { label: 'XL', scale: 1.3 }
  ],

  // --- SECTION: INITIALISATION & LIFECYCLE ---
  async init()
  {
    this.noteCategories = JSON.parse(localStorage.getItem("noteCategories")) || ["Main"]
    this.notes = JSON.parse(localStorage.getItem("notes")) || []
    this.recycleBin = JSON.parse(localStorage.getItem("recycleBin")) || []
    this.categoryMeta = JSON.parse(localStorage.getItem("categoryMeta")) || {}
    this.currentTheme = localStorage.getItem("theme") || "gruvbox"
    this.currentFont = localStorage.getItem("font") || "system-ui"
    this.uiScale = parseFloat(localStorage.getItem("uiScale")) || 1
    this.doubleTapDelete = localStorage.getItem("doubleTapDelete") === "true"
    this.celebrationMode = localStorage.getItem("celebrationMode") === "true"
    this.keepKeyboard = localStorage.getItem("keepKeyboard") === "true"
    this.uiSounds = localStorage.getItem("uiSounds") === "true"
    this.buttonRipples = localStorage.getItem("buttonRipples") === "true"
    this.showFab = localStorage.getItem("showFab") === "true"
    this.sortAlphabetical = localStorage.getItem("sortAlphabetical") === "true"
    this.addNoteBottom = localStorage.getItem("addNoteBottom") === "true"
    this.moveCompletedBottom = localStorage.getItem("moveCompletedBottom") === "true"
    this.disableSwipe = localStorage.getItem("disableSwipe") === "true"
    this.disableScreenshots = localStorage.getItem("disableScreenshots") === "true"
    this.notificationEnabled = localStorage.getItem("notificationEnabled") === "true"
    this.inboxTabName = localStorage.getItem("inboxTabName") || "Inbox"
    this.syncFilePath = localStorage.getItem("syncFilePath") || ""

    this.customFonts = await initFontSystem()

    this.setTheme(this.currentTheme)
    this.setFont(this.currentFont)
    this.applyUiScale(this.uiScale)

    if (!this.noteCategories.includes(this.activeCategory))
    {
      this.activeCategory = this.noteCategories[0] || "Main"
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
  },

  saveData()
  {
    this._dirtyNotes = true
    localStorage.setItem("noteCategories", JSON.stringify(this.noteCategories))
    localStorage.setItem("notes", JSON.stringify(this.notes))
    localStorage.setItem("recycleBin", JSON.stringify(this.recycleBin))
    localStorage.setItem("categoryMeta", JSON.stringify(this.categoryMeta))
    localStorage.setItem("theme", this.currentTheme)
    localStorage.setItem("font", this.currentFont)
    localStorage.setItem("uiScale", this.uiScale)
    localStorage.setItem("doubleTapDelete", this.doubleTapDelete)
    localStorage.setItem("celebrationMode", this.celebrationMode)
    localStorage.setItem("keepKeyboard", this.keepKeyboard)
    localStorage.setItem("uiSounds", this.uiSounds)
    localStorage.setItem("buttonRipples", this.buttonRipples)
    localStorage.setItem("showFab", this.showFab)
    localStorage.setItem("sortAlphabetical", this.sortAlphabetical)
    localStorage.setItem("addNoteBottom", this.addNoteBottom)
    localStorage.setItem("moveCompletedBottom", this.moveCompletedBottom)
    localStorage.setItem("disableSwipe", this.disableSwipe)
    localStorage.setItem("disableScreenshots", this.disableScreenshots)
    localStorage.setItem("notificationEnabled", this.notificationEnabled)
    localStorage.setItem("inboxTabName", this.inboxTabName)
    localStorage.setItem("syncFilePath", this.syncFilePath)
  },

  toggleSortAlphabetical()
  {
    this.sortAlphabetical = !this.sortAlphabetical
    this.saveData()
  },

  // --- SECTION: NOTE & TAB ACTIONS ---
  onInputKeydown(e)
  {
    if (e.key === 'Enter' && !e.shiftKey)
    {
      e.preventDefault()
      this.submitNote()
    }
  },

  submitNote()
  {
    let v = this.noteInput.trim()
    if (!v) return

    if (tryRunGame(v))
    {
      this.noteInput = ''
      return
    }

    if (v.startsWith('/'))
    {
      let t = v.slice(1).trim()
      if (t) this.addTab(t)
    }
    else
    {
      playSound('add', this.uiSounds)
      let now = Date.now()
      let n = { id: now, text: v, completed: false, category: this.activeCategory, pinned: false, updatedAt: now }
      if (this.addNoteBottom) this.notes.push(n)
      else this.notes.unshift(n)
    }
    this.noteInput = ''
    this.saveData()
  },

  toggleNote(n, e)
  {
    n.completed = !n.completed
    n.updatedAt = Date.now()
    if (n.completed)
    {
      playSound('scratch', this.uiSounds)
      if (this.celebrationMode && typeof confetti === 'function')
      {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } })
      }
    }
    if (navigator.vibrate) navigator.vibrate(30)

    let txt = n.text.trim()
    if (/^https?:\/\//i.test(txt) || /^www\./i.test(txt))
    {
      window.location.href = txt.startsWith('http') ? txt : 'https://' + txt
    }
    this.saveData()
  },

  focusNoteInput()
  {
    if (this.currentScreenIdx !== 0)
    {
      this.switchScreen(0)
    }
    let inp = document.getElementById('note-in')
    if (document.activeElement === inp) inp.blur()
    else inp.focus()
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
    if (n)
    {
      n.pinned = !n.pinned
      n.updatedAt = Date.now()
      this.saveData()
    }
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
        if (val)
        {
          n.text = val
          n.updatedAt = Date.now()
          this.saveData()
        }
      })
    }
    this.closeAllMenus()
  },

  executeTrash(id)
  {
    let idx = this.notes.findIndex(x => x.id === id)
    if (idx > -1)
    {
      let n = this.notes.splice(idx, 1)[0]
      n.updatedAt = Date.now()
      this.recycleBin.push(n)
      this.saveData()
    }
  },

  restoreNote(idx)
  {
    let n = this.recycleBin.splice(idx, 1)[0]
    if (n)
    {
      n.updatedAt = Date.now()
      this.notes.push(n)
      this.saveData()
    }
  },

  clearTrash()
  {
    this.recycleBin = []
    this.saveData()
  },

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
    let idx = this.noteCategories.indexOf(oldName)
    if (idx !== -1)
    {
      this.noteCategories[idx] = newName
      let now = Date.now()

      if (!this.categoryMeta) this.categoryMeta = {}
      let meta = this.categoryMeta[oldName] || { id: now, updatedAt: now }
      meta.updatedAt = now
      this.categoryMeta[newName] = meta
      delete this.categoryMeta[oldName]

      this.notes.forEach(n =>
      {
        if (n.category === oldName)
        {
          n.category = newName
          n.updatedAt = now
        }
      })
      if (this.activeCategory === oldName)
      {
        this.activeCategory = newName
      }
      this.saveData()
    }
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
        if (note.category === t)
        {
          note.updatedAt = now
          this.recycleBin.push(note)
          return false
        }
        return true
      })
      if (this.activeCategory === t) this.activeCategory = this.noteCategories[0]
      this.saveData()
    }
    this.closeAllMenus()
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

  // --- SECTION: DATA EXPORT & IMPORT ---
  exportDataCall()
  {
    exportData(this.notes)
  },

  triggerImport()
  {
    if (window.Android && window.Android.importJsonFile) window.Android.importJsonFile()
    else this.$refs.importJsonInput.click()
  },

  importData(e)
  {
    importJsonFile(e.target.files[0], this)
    e.target.value = ''
  },

  mergeNotes(imported)
  {
    if (!Array.isArray(imported)) return
    let now = Date.now()
    imported.forEach(n =>
    {
      if (!n || typeof n.text !== 'string') return
      let cat = n.category || 'Main'
      if (!this.noteCategories.includes(cat)) this.noteCategories.push(cat)
      let noteId = typeof n.id === 'number' && !isNaN(n.id) ? n.id : now + Math.floor(Math.random() * 100000)
      let existingIdx = this.notes.findIndex(x => x.id === noteId)
      let itemUpdatedAt = n.updatedAt || now
      if (existingIdx > -1)
      {
        let existing = this.notes[existingIdx]
        if (itemUpdatedAt >= (existing.updatedAt || 0))
        {
          this.notes[existingIdx] = {
            id: noteId,
            text: n.text,
            completed: Boolean(n.completed),
            category: cat,
            pinned: Boolean(n.pinned),
            updatedAt: itemUpdatedAt
          }
        }
      }
      else
      {
        this.notes.push({
          id: noteId,
          text: n.text,
          completed: Boolean(n.completed),
          category: cat,
          pinned: Boolean(n.pinned),
          updatedAt: itemUpdatedAt
        })
      }
    })
    this.saveData()
  },

  exportMarkdownCall()
  {
    exportMarkdown(this.noteCategories, this.notes, this.categoryMeta)
  },

  triggerImportMD()
  {
    if (window.Android && window.Android.importMarkdownFile) window.Android.importMarkdownFile()
    else this.$refs.importMdInput.click()
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
      window.Android.setupSyncFile("file.md", generateMarkdownString(this.noteCategories, this.notes, this.categoryMeta))
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
    let now = Date.now()
    this.notes.forEach(n =>
    {
      if (!n.updatedAt) n.updatedAt = now
    })
    let mdStr = generateMarkdownString(this.noteCategories, this.notes, this.categoryMeta)
    if (window.Android && window.Android.saveFileSync)
    {
      window.Android.saveFileSync(this.syncFilePath, mdStr)
    }
  },

  toggleScreenshots()
  {
    if (window.Android && window.Android.toggleScreenshots)
    {
      window.Android.toggleScreenshots(this.disableScreenshots)
    }
    this.saveData()
  },

  toggleNotification()
  {
    if (window.Android && window.Android.toggleNotification)
    {
      window.Android.toggleNotification(this.notificationEnabled)
    }
    this.saveData()
  },

  updateInboxTab()
  {
    this.inboxTabName = this.inboxTabName.trim() || "Inbox"
    if (!this.noteCategories.includes(this.inboxTabName))
    {
      this.noteCategories.push(this.inboxTabName)
    }
    if (window.Android && window.Android.setInboxTabName)
    {
      window.Android.setInboxTabName(this.inboxTabName)
    }
    this.saveData()
  }
})

createApp(appStore).mount()
window.appStore = appStore