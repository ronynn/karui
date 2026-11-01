import { initFontSystem, processFontUpload, deleteFontFromDB } from './fonts.js'

// Whitelist — only these vars are honoured. Anything else in a custom
// theme JSON is silently dropped, so a malformed paste can't nuke layout.
const THEME_VARS = ['--bg', '--surface', '--border', '--text', '--accent', '--accent-txt', '--gray']

function clearInlineThemeVars()
{
  THEME_VARS.forEach(v => document.documentElement.style.removeProperty(v))
}

export function applyCustomThemeVars(vars)
{
  clearInlineThemeVars()
  for (const k in vars)
  {
    if (THEME_VARS.includes(k)) document.documentElement.style.setProperty(k, vars[k])
  }
}

export function applyTheme(theme, customThemes)
{
  const ct = (customThemes || []).find(t => t.key === theme)
  if (ct)
  {
    document.documentElement.removeAttribute('data-theme')
    applyCustomThemeVars(ct.vars)
  }
  else
  {
    clearInlineThemeVars()
    document.documentElement.setAttribute('data-theme', theme)
  }
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
    customThemes: [],
    syncFilePath: '',
    calendarEnabled: true,
    calendarTabName: 'Calkarui',
    calendarRef: null,
    enterNewLine: false,

    // --- theme import modal ---
    themeImportVisible: false,
    themeImportText: '',

    themes: [
      { key: 'gruvbox', label: 'GRUVBOX' },
      { key: 'crt-amber', label: 'CRT-AMBER' },
      { key: 'sepia-terminal', label: 'SEPIA-TERM' },
      { key: 'sepia', label: 'SEPIA' },
      { key: 'wheat', label: 'WHEAT' },
      { key: 'paper', label: 'PAPER' },
      { key: 'gruvbox-light', label: 'GRUV-LIGHT' },
      { key: 'monokai', label: 'MONOKAI' },
      { key: 'monokai-pro', label: 'KAI-PRO' },
      { key: 'zenburn', label: 'ZENBURN' },
      { key: 'gruvbox-material', label: 'GMATERIAL' },
      { key: 'everforest', label: 'EVERFOREST' },
      { key: 'everforest-light', label: 'FOREST-LIGHT' },
      { key: 'sol-dark', label: 'SOL-DARK' },
      { key: 'sol-light', label: 'SOL-LIGHT' },
      { key: 'papercolor-light', label: 'PAPER' },
      { key: 'tokyo-night', label: 'TOKYO-NIGHT' },
      { key: 'things', label: 'THINGS' },
      { key: 'nord', label: 'NORD' },
      { key: 'rose-pine', label: 'ROSE-PINE' },
      { key: 'sakura', label: 'SAKURA' },
      { key: 'amoled', label: 'AMOLED' },
      { key: 'charcoal', label: 'CHARCOAL' },
      { key: 'slate', label: 'SLATE' },
      { key: 'newsprint', label: 'NEWSPRINT' },
      { key: 'catppuccin', label: 'CATPPUCCIN' },
      { key: 'catppuccin-frappe', label: 'FRAPPE' },
      { key: 'purple', label: 'PURPLE' }
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
      applyTheme(t, this.customThemes)
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

    // --- custom themes ---
    openThemeImport()
    {
      this.themeImportVisible = true
      this.themeImportText = JSON.stringify({
        name: "My Theme",
        vars: {
          "--bg": "#1d2021",
          "--surface": "#282828",
          "--border": "#3c3836",
          "--text": "#ebdbb2",
          "--accent": "#fabd2f",
          "--accent-txt": "#1d2021",
          "--gray": "#928374"
        }
      }, null, 2)
    },

    closeThemeImport()
    {
      this.themeImportVisible = false
      this.themeImportText = ''
    },

    importTheme()
    {
      try
      {
        const raw = this.themeImportText.trim()
        if (!raw) throw new Error('empty')
        const obj = JSON.parse(raw)
        if (!obj || typeof obj.name !== 'string' || !obj.name.trim()) throw new Error('name')
        if (!obj.vars || typeof obj.vars !== 'object') throw new Error('vars')

        const cleaned = {}
        for (const k of THEME_VARS)
        {
          if (typeof obj.vars[k] === 'string' && obj.vars[k].trim())
          {
            cleaned[k] = obj.vars[k].trim()
          }
        }
        if (!Object.keys(cleaned).length) throw new Error('no vars')

        const slug = obj.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'theme'
        const key = 'custom_' + slug
        const theme = { key, name: obj.name.trim(), vars: cleaned }

        this.customThemes = this.customThemes.filter(t => t.key !== key).concat(theme)
        localStorage.setItem('customThemes', JSON.stringify(this.customThemes))
        this.setTheme(key)
        this.showToast('Theme imported')
        this.closeThemeImport()
      }
      catch (e)
      {
        this.showToast('Invalid theme format')
      }
    },

    deleteCustomTheme(key)
    {
      this.customThemes = this.customThemes.filter(t => t.key !== key)
      localStorage.setItem('customThemes', JSON.stringify(this.customThemes))
      if (this.currentTheme === key)
      {
        this.setTheme('gruvbox')
      }
      else
      {
        this.saveData()
      }
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
        if (this.currentScreen === 'calendar') this.currentScreen = 'home'
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
      if (el) el.click()
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
      if (this.currentFont === fontName) this.setFont('system-ui')
    },

    startFontHold(fontName) { startFontLongPress(fontName, this, 1000) },
    cancelFontHold() { clearFontLongPress() }
  }
}

// These were referenced in the original but not imported — add the guard
// here so `startFontHold` doesn't throw if you trim imports later.
import { startFontLongPress, clearFontLongPress } from './fonts.js'