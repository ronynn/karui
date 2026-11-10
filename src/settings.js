import { initFontSystem, processFontUpload, deleteFontFromDB,
         startFontLongPress, clearFontLongPress } from './fonts.js'

// Whitelist — only these vars are honoured. Anything else in a custom
// theme JSON is silently dropped, so a malformed paste can't nuke layout.
const THEME_VARS = ['--bg', '--surface', '--border', '--text', '--accent', '--accent-txt', '--gray']

// DYNAMIC is a built-in pseudo-theme. Its vars are stored under their
// own localStorage key so it never appears in `customThemes` — otherwise
// the theme grid would render a duplicate button next to the hardcoded
// DYNAMIC button in the HTML.
const DYNAMIC_KEY = 'dynamic_wallpaper'
const DYNAMIC_STORAGE = 'dynamicThemeVars'

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
  if (theme === DYNAMIC_KEY)
  {
    let vars = null
    try { vars = JSON.parse(localStorage.getItem(DYNAMIC_STORAGE) || 'null') } catch (e) {}
    if (vars)
    {
      document.documentElement.removeAttribute('data-theme')
      applyCustomThemeVars(vars)
      return
    }
    // Vars missing (e.g., app data cleared) — fall back to gruvbox so
    // the UI is never left in a broken state.
    clearInlineThemeVars()
    document.documentElement.setAttribute('data-theme', 'gruvbox')
    return
  }

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


  // Notify Android of bar icon mode + background colour for smoother next launch.
  // Deferred to rAF because CSS custom properties are set synchronously but
  // getComputedStyle needs a frame to pick them up.
  if (window.Android)
  {
    requestAnimationFrame(() =>
    {
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--bg').trim()
      if (!bg) return

      if (window.Android.setThemeBackgroundColor)
        window.Android.setThemeBackgroundColor(bg)

      if (window.Android.setSystemBarsLightMode)
        window.Android.setSystemBarsLightMode(isLightColor(bg))
    })
  }
}

function isLightColor(color)
{
  let r = 0, g = 0, b = 0
  try
  {
    if (color.startsWith('#'))
    {
      const h = color.slice(1)
      if (h.length === 3)
      {
        r = parseInt(h[0] + h[0], 16)
        g = parseInt(h[1] + h[1], 16)
        b = parseInt(h[2] + h[2], 16)
      }
      else
      {
        r = parseInt(h.slice(0, 2), 16)
        g = parseInt(h.slice(2, 4), 16)
        b = parseInt(h.slice(4, 6), 16)
      }
    }
    else
    {
      const m = color.match(/(\d+)/g)
      if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2] }
    }
  }
  catch (e) { return false }
  // Perceived luminance (ITU-R BT.601)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 128
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
      { key: 'catppuccin', label: 'CATPPUCCIN' },
      { key: 'catppuccin-frappe', label: 'FRAPPE' },

      { key: 'monokai', label: 'MONOKAI' },
      { key: 'monokai-pro', label: 'KAI-PRO' },
      { key: 'zenburn', label: 'ZENBURN' },
      { key: 'rose-pine', label: 'ROSE-PINE' },

      { key: 'sol-dark', label: 'SOL-DARK' },
      { key: 'nord', label: 'NORD' },

      { key: 'tokyo-night', label: 'TOKYO-NIGHT' },
      { key: 'amoled', label: 'AMOLED' },
      { key: 'charcoal', label: 'CHARCOAL' },
      { key: 'gruvbox-material', label: 'GMATERIAL' },

      { key: 'everforest', label: 'EVERFOREST' },
      { key: 'everforest-light', label: 'EV-LIGHT' },
      { key: 'sepia', label: 'SEPIA' },
      { key: 'wheat', label: 'WHEAT' },
      { key: 'paper', label: 'PAPER' },
      { key: 'gruvbox-light', label: 'GRUV-LIGHT' },

      { key: 'sol-light', label: 'SOL-LIGHT' },
      { key: 'papercolor-light', label: 'CUPERTINO' },
      { key: 'things', label: 'THINGS' },
      { key: 'sakura', label: 'SAKURA' },
      { key: 'purple', label: 'PURPLE' },

      { key: 'slate', label: 'SLATE' },
      { key: 'newsprint', label: 'NEWSPRINT' },
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

    // --- dynamic wallpaper theme ---
    applyDynamicTheme(silent)
    {
      // Prune any stale DYNAMIC entry left in customThemes by a previous
      // build. Runs on every click and on silent startup, so the
      // duplicate button disappears without user action.
      if ((this.customThemes || []).some(t => t.key === DYNAMIC_KEY))
      {
        this.customThemes = this.customThemes.filter(t => t.key !== DYNAMIC_KEY)
        localStorage.setItem('customThemes', JSON.stringify(this.customThemes))
      }

      if (!window.Android || !window.Android.getDynamicWallpaperTheme)
      {
        if (!silent) this.showToast('Not available on this build')
        return
      }

      try
      {
        const json = window.Android.getDynamicWallpaperTheme()
        const data = JSON.parse(json)
        if (!data.ok) throw new Error(data.error || 'no_color')

        const vars = {
          '--bg': data.bg,
          '--surface': data.surface,
          '--border': data.border,
          '--text': data.text,
          '--accent': data.accent,
          '--accent-txt': data.accentTxt,
          '--gray': data.gray
        }

        localStorage.setItem(DYNAMIC_STORAGE, JSON.stringify(vars))
        this.setTheme(DYNAMIC_KEY)
        if (!silent) this.showToast('Dynamic theme applied')
      }
      catch (e)
      {
        if (!silent) this.showToast('Could not read wallpaper')
      }
    },

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