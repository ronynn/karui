import { createApp, reactive } from './petite-vue.es.js'
import { setupDragAndDrop } from './dragdrop.js'
import { initFontSystem, processFontUpload, deleteFontFromDB } from './fonts.js'
import { generateMarkdownString, exportData, importJsonFile, exportMarkdown, importMarkdownFile, setupNativeHooks } from './datasync.js'
import { playSound, createRipple, tryRunGame } from './extras.js'

const appStore = reactive(
{
  noteCategories: ['Main'],
  activeCategory: 'Main',
  notes: [],
  recycleBin: [],
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

  get displayedNotes()
  {
    let key = `${this.activeCategory}_${this.sortAlphabetical}_${this.moveCompletedBottom}_${this.notes.length}`
    if (this._cacheKey === key && !this._dirtyNotes)
    {
      return this._displayedCache
    }

    let result = []
    let len = this.notes.length
    for (let i = 0; i < len; i++)
    {
      if (this.notes[i].category === this.activeCategory)
      {
        result.push(this.notes[i])
      }
    }

    result.sort((a, b) =>
    {
      if (a.pinned !== b.pinned)
      {
        return a.pinned ? -1 : 1
      }
      if (this.moveCompletedBottom && a.completed !== b.completed)
      {
        return a.completed ? 1 : -1
      }
      if (this.sortAlphabetical)
      {
        return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })
      }
      return 0
    })

    this._cacheKey = key
    this._dirtyNotes = false
    this._displayedCache = result
    return result
  },

  get statsText()
  {
    let rem = 0
    let comp = 0
    let currentCatNotes = this.notes.filter(n => n.category === this.activeCategory)
    currentCatNotes.forEach(n => n.completed ? comp++ : rem++)
    return `Remaining: ${rem} \u00A0\u00A0 Completed: ${comp}`
  },

  get contextMenuStyle()
  {
    return {
      display: this.contextMenuVisible ? 'block' : 'none'
    }
  },

  get noteMenuStyle()
  {
    return {
      display: this.noteMenuVisible ? 'block' : 'none',
      left: `${this.noteMenuPos.x}px`,
      top: `${this.noteMenuPos.y}px`
    }
  },

  get activeNotePinned()
  {
    let n = this.notes.find(x => x.id === this.activeNoteMenuId)
    return n ? n.pinned : false
  },

  get canMoveTabLeft()
  {
    return this.noteCategories.indexOf(this.contextTab) > 0
  },

  get canMoveTabRight()
  {
    let idx = this.noteCategories.indexOf(this.contextTab)
    return idx >= 0 && idx < this.noteCategories.length - 1
  },

  // --- SECTION: INITIALISATION & LIFECYCLE ---
  async init()
  {
    this.noteCategories = JSON.parse(localStorage.getItem("noteCategories")) || ["Main"]
    this.notes = JSON.parse(localStorage.getItem("notes")) || []
    this.recycleBin = JSON.parse(localStorage.getItem("recycleBin")) || []
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

  // --- SECTION: GESTURES & INTERACTIONS ---
  handleTouchStart(e)
  {
    if (this.disableSwipe) return
    this.touchStartX = e.touches[0].clientX
    this.touchStartY = e.touches[0].clientY
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
      if (deltaX < 0 && this.currentScreenIdx === 0)
      {
        this.switchScreen(1)
      }
      else if (deltaX > 0 && this.currentScreenIdx === 1)
      {
        this.switchScreen(0)
      }
    }
    this.touchStartX = 0
    this.touchStartY = 0
    this.touchEndX = 0
    this.touchEndY = 0
  },

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

  handleFabClick(e)
  {
    if (e) e.preventDefault()
    let active = document.activeElement
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'))
    {
      active.blur()
      return
    }
    this.focusNoteInput()
  },

  // --- SECTION: NAVIGATION & UI CONTROLS ---
  switchScreen(idx)
  {
    this.currentScreenIdx = idx
    this.closeAllMenus()
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

  selectTab(tab)
  {
    this.closeAllMenus()
    this.activeCategory = tab
    if (!this.keepKeyboard && document.activeElement)
    {
      document.activeElement.blur()
    }
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

  setTheme(t)
  {
    this.currentTheme = t
    document.body.setAttribute('data-theme', t)
    this.saveData()
  },

  setFont(f)
  {
    this.currentFont = f
    document.body.style.fontFamily = f.startsWith('CustomFont_') ? `'${f}', system-ui, sans-serif` : f
    this.saveData()
  },

  setUiSize(s)
  {
    this.uiScale = s
    this.applyUiScale(s)
    this.saveData()
  },

  applyUiScale(s)
  {
    document.documentElement.style.setProperty('--ui-scale', s)
  },

  toggleSortAlphabetical()
  {
    this.sortAlphabetical = !this.sortAlphabetical
    this.saveData()
  },

  // --- SECTION: ACTIONS & HANDLERS ---
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
      let n = { id: Date.now(), text: v, completed: false, category: this.activeCategory, pinned: false }
      if (this.addNoteBottom) this.notes.push(n)
      else this.notes.unshift(n)
    }
    this.noteInput = ''
    this.saveData()
  },

  toggleNote(n, e)
  {
    n.completed = !n.completed
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

  // --- SECTION: MENUS & MODALS ---
  closeAllMenus()
  {
    this.contextMenuVisible = false
    this.noteMenuVisible = false
  },

  openContextMenu(e, tab)
  {
    this.closeAllMenus()
    this.contextTab = tab
    this.contextMenuVisible = true
  },

  openNoteMenu(e, id)
  {
    if (this.activeNoteMenuId === id && this.noteMenuVisible)
    {
      this.closeAllMenus()
      return
    }
    this.closeAllMenus()
    this.activeNoteMenuId = id

    let estimatedWidth = 140
    let estimatedHeight = 180
    let clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : window.innerWidth / 2)
    let clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : window.innerHeight / 2)

    let posX = Math.min(clientX, window.innerWidth - estimatedWidth - 12)
    let posY = Math.min(clientY, window.innerHeight - estimatedHeight - 12)

    this.noteMenuPos = {
      x: Math.max(12, posX),
      y: Math.max(12, posY)
    }
    this.noteMenuVisible = true
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
      this.recycleBin.push(n)
      this.saveData()
    }
  },

  restoreNote(idx)
  {
    let n = this.recycleBin.splice(idx, 1)[0]
    if (n)
    {
      this.notes.push(n)
      this.saveData()
    }
  },

  clearTrash()
  {
    this.recycleBin = []
    this.saveData()
  },

  openPrompt(title, defaultVal, cb)
  {
    this.modalTitle = title
    this.modalInput = defaultVal
    this.modalCb = cb
    this.modalVisible = true
  },

  closeModal(saveAction)
  {
    this.modalVisible = false
    if (saveAction && this.modalCb)
    {
      this.modalCb(this.modalInput.trim())
    }
  },

  addTab(n)
  {
    if (n && !this.noteCategories.includes(n))
    {
      playSound('tab', this.uiSounds)
      this.noteCategories.push(n)
      this.activeCategory = n
      this.saveData()
    }
  },

  renameTab(n)
  {
    if (n && !this.noteCategories.includes(n))
    {
      this.notes.forEach(x => { if (x.category === this.contextTab) x.category = n })
      this.recycleBin.forEach(x => { if (x.category === this.contextTab) x.category = n })
      this.noteCategories[this.noteCategories.indexOf(this.contextTab)] = n
      this.activeCategory = n
      this.saveData()
    }
  },

  deleteTabClick()
  {
    let t = this.contextTab || this.activeCategory
    if (this.noteCategories.length > 1)
    {
      this.noteCategories = this.noteCategories.filter(x => x !== t)
      this.notes = this.notes.filter(note =>
      {
        if (note.category === t) { this.recycleBin.push(note); return false }
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

  // --- SECTION: UTILITIES & EVENT HANDLERS ---
  handleGlobalClick(e)
  {
    playSound('click', this.uiSounds)
    if (this.buttonRipples)
    {
      let targetBtn = e.target.closest('button, .tab, .theme-btn, #fab-btn')
      if (targetBtn) createRipple(e, targetBtn)
    }
    if (!e.target.closest('.menu'))
    {
      this.closeAllMenus()
    }
  },

  autoExpandTextarea(el)
  {
    if (!el) return
    el.style.height = 'auto'
    let calculatedHeight = el.scrollHeight
    let maxHeight = window.innerHeight * 0.45
    let minHeight = 80 * this.uiScale
    let targetHeight = Math.max(minHeight, Math.min(calculatedHeight, maxHeight))
    el.style.height = targetHeight + 'px'
  },

  // --- SECTION: CUSTOM FONTS ---
  triggerFontUpload()
  {
    this.$refs.fontFileInput.click()
  },

  async loadCustomFont(e)
  {
    try
    {
      const fontObj = await processFontUpload(e.target.files[0])
      if (fontObj)
      {
        this.customFonts.push(fontObj)
        this.setFont(fontObj.name)
      }
    }
    catch (err)
    {
      alert("Failed to load font file.")
    }
  },

  async deleteCustomFont(fontName)
  {
    await deleteFontFromDB(fontName)
    this.customFonts = this.customFonts.filter(f => f.name !== fontName)
    if (this.currentFont === fontName)
    {
      this.setFont('system-ui')
    }
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
    imported.forEach(n =>
    {
      if (!n || typeof n.text !== 'string') return
      let cat = n.category || 'Main'
      if (!this.noteCategories.includes(cat)) this.noteCategories.push(cat)
      let noteId = typeof n.id === 'number' && !isNaN(n.id) ? n.id : Date.now() + Math.floor(Math.random() * 100000)
      if (!this.notes.some(x => x.id === noteId))
      {
        this.notes.push({
          id: noteId,
          text: n.text,
          completed: Boolean(n.completed),
          category: cat,
          pinned: Boolean(n.pinned)
        })
      }
    })
    this.saveData()
  },

  exportMarkdownCall()
  {
    exportMarkdown(this.noteCategories, this.notes)
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
      window.Android.setupSyncFile("file.md", generateMarkdownString(this.noteCategories, this.notes))
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
    let mdStr = generateMarkdownString(this.noteCategories, this.notes)
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