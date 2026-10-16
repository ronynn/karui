// --- SECTION: INDEXEDDB FONT STORAGE & MANAGEMENT ---
const DB_NAME = 'KaruiFontDB'
const DB_VERSION = 1
const STORE_NAME = 'fonts'

function openFontDB()
{
  return new Promise((resolve, reject) =>
  {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = e =>
    {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME))
      {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' })
      }
    }
    request.onsuccess = e => resolve(e.target.result)
    request.onerror = e => reject(e.target.error)
  })
}

export async function saveFontToDB(fontObj)
{
  const db = await openFontDB()
  return new Promise((resolve, reject) =>
  {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(fontObj)
    req.onsuccess = () => resolve()
    req.onerror = e => reject(e.target.error)
  })
}

export async function loadFontsFromDB()
{
  const db = await openFontDB()
  return new Promise((resolve, reject) =>
  {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = e => reject(e.target.error)
  })
}

export async function deleteFontFromDB(name)
{
  const db = await openFontDB()
  return new Promise((resolve, reject) =>
  {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(name)
    req.onsuccess = () => resolve()
    req.onerror = e => reject(e.target.error)
  })
}

export async function initFontSystem()
{
  try
  {
    const customFonts = await loadFontsFromDB()
    for (const fontItem of customFonts)
    {
      try
      {
        const font = new FontFace(fontItem.name, `url(${fontItem.data})`)
        const loadedFont = await font.load()
        document.fonts.add(loadedFont)
      }
      catch (err) {}
    }
    return customFonts
  }
  catch (e)
  {
    return []
  }
}

export async function processFontUpload(file)
{
  if (!file) return null
  const cleanName = file.name.replace(/\.[^/.]+$/, "")
  const fontIdentifier = `CustomFont_${Date.now()}`

  return new Promise((resolve, reject) =>
  {
    const r = new FileReader()
    r.onload = async (ev) =>
    {
      const fontData = ev.target.result
      try
      {
        const font = new FontFace(fontIdentifier, `url(${fontData})`)
        const loadedFont = await font.load()
        document.fonts.add(loadedFont)
        const fontObj = {
          name: fontIdentifier,
          label: cleanName,
          data: fontData
        }
        await saveFontToDB(fontObj)
        resolve(fontObj)
      }
      catch (err)
      {
        reject(err)
      }
    }
    r.onerror = e => reject(e)
    r.readAsDataURL(file)
  })
}

// --- SECTION: LONG PRESS FONT DELETION HANDLER ---
let pressTimer = null

export function startFontLongPress(fontName, appStore, holdTimeMs = 4000)
{
  clearFontLongPress()
  pressTimer = setTimeout(async () =>
  {
    try
    {
      await deleteFontFromDB(fontName)
      for (const font of document.fonts)
      {
        if (font.family === fontName)
        {
          document.fonts.delete(font)
        }
      }
      appStore.customFonts = appStore.customFonts.filter(f => f.name !== fontName)
      if (appStore.currentFont === fontName)
      {
        appStore.setFont('system-ui')
      }
      if (typeof appStore.showToast === 'function')
      {
        appStore.showToast('Font deleted!')
      }
    }
    catch (err)
    {
      if (typeof appStore.showToast === 'function')
      {
        appStore.showToast('Failed to delete font')
      }
    }
  }, holdTimeMs)
}

export function clearFontLongPress()
{
  if (pressTimer)
  {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}