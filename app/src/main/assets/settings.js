import { initFontSystem, processFontUpload, deleteFontFromDB } from './fonts.js'

// --- pure DOM appliers ---
export function applyTheme(theme)
{
  document.body.setAttribute('data-theme', theme)
}

export function applyFont(font)
{
  document.body.style.fontFamily = font.startsWith('CustomFont_') ? `'${font}', system-ui, sans-serif` : font
}

export function applyUiScale(scale)
{
  document.documentElement.style.setProperty('--ui-scale', scale)
}

export function createSettingsModule()
{
  return {
    // --- state ---
    currentTheme: 'gruvbox',
    currentFont: 'system-ui',
    uiScale: 1,
    celebrationMode: false,
    keepKeyboard: false,
    uiSounds: false,
    buttonRipples: false,
    showFab: false,
    disableSwipe: false,
    disableScreenshots: false,
    notificationEnabled: false,
    inboxTabName: 'Inbox',
    customFonts: [],
    syncFilePath: '',
    calendarEnabled: true,
    calendarTabName: 'Calkarui',
    calendarRef: null,
    enterNewLine: false,

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

    // --- setters ---
    setTheme(t)
    {
      this.currentTheme = t
      applyTheme(t)
      this.saveData()
    },

    setFont(f)
    {
      this.currentFont = f
      applyFont(f)
      this.saveData()
    },

    setUiSize(s)
    {
      this.uiScale = s
      applyUiScale(s)
      this.saveData()
    },

    // --- calendar ---
    toggleCalendarEnabled()
    {
      if (this.calendarEnabled)
      {
        if (!this.noteCategories.includes(this.calendarTabName))
        {
          this.noteCategories.push(this.calendarTabName)
        }
      }
      else
      {
        if (this.currentScreen === 'calendar')
        {
          this.currentScreen = 'home'
        }
      }
      this.saveData()
      setTimeout(() =>
      {
        if (this.calendarEnabled && !this.calendarRef)
        {
          this.calendarRef = initCalendar(this)
        }
      }, 50)
    },

    renameCalendarTab(newName)
    {
      let trimmed = (newName || '').trim() || 'Calkarui'
      let oldName = this.calendarTabName
      if (oldName !== trimmed)
      {
        this.renameTabInternal(oldName, trimmed)
        this.calendarTabName = trimmed
        this.saveData()
      }
    },

    // --- native toggles ---
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
      this.inboxTabName = this.inboxTabName.trim() || 'Inbox'
      if (!this.noteCategories.includes(this.inboxTabName))
      {
        this.noteCategories.push(this.inboxTabName)
      }
      if (window.Android && window.Android.setInboxTabName)
      {
        window.Android.setInboxTabName(this.inboxTabName)
      }
      this.saveData()
    },

    // --- custom fonts ---
    triggerFontUpload()
    {
      let el = document.getElementById('font-file-input')
      if (el)
      {
        el.click()
      }
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
        alert('Failed to load font file.')
      }
      finally
      {
        e.target.value = ''
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

    startFontHold(fontName)
    {
      startFontLongPress(fontName, this, 1000)
    },

    cancelFontHold()
    {
      clearFontLongPress()
    }
  }
}