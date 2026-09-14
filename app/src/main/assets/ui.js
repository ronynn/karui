import { processFontUpload, deleteFontFromDB } from './fonts.js'
import { playSound, createRipple } from './extras.js'

// --- SECTION: COMPUTED HELPERS ---
export function getDisplayedNotes(appStore)
{
  let key = `${appStore.activeCategory}_${appStore.sortAlphabetical}_${appStore.moveCompletedBottom}_${appStore.notes.length}`
  if (appStore._cacheKey === key && !appStore._dirtyNotes)
  {
    return appStore._displayedCache
  }

  let result = []
  let len = appStore.notes.length
  for (let i = 0; i < len; i++)
  {
    if (appStore.notes[i].category === appStore.activeCategory)
    {
      result.push(appStore.notes[i])
    }
  }

  result.sort((a, b) =>
  {
    if (a.pinned !== b.pinned)
    {
      return a.pinned ? -1 : 1
    }
    if (appStore.moveCompletedBottom && a.completed !== b.completed)
    {
      return a.completed ? 1 : -1
    }
    if (appStore.sortAlphabetical)
    {
      return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })
    }
    return 0
  })

  appStore._cacheKey = key
  appStore._dirtyNotes = false
  appStore._displayedCache = result
  return result
}

export function getStatsText(appStore)
{
  let rem = 0
  let comp = 0
  let currentCatNotes = appStore.notes.filter(n => n.category === appStore.activeCategory)
  currentCatNotes.forEach(n => n.completed ? comp++ : rem++)
  return `Remaining: ${rem} \u00A0\u00A0 Completed: ${comp}`
}

// --- SECTION: UI & GRAPHICS INTERACTIONS ---
export function openNoteMenu(appStore, e, id)
{
  if (appStore.activeNoteMenuId === id && appStore.noteMenuVisible)
  {
    closeAllMenus(appStore)
    return
  }
  closeAllMenus(appStore)
  appStore.activeNoteNoteId = id
  appStore.activeNoteMenuId = id

  let estimatedWidth = 140
  let estimatedHeight = 180
  let clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : window.innerWidth / 2)
  let clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : window.innerHeight / 2)

  let posX = Math.min(clientX, window.innerWidth - estimatedWidth - 12)
  let posY = Math.min(clientY, window.innerHeight - estimatedHeight - 12)

  appStore.noteMenuPos = {
    x: Math.max(12, posX),
    y: Math.max(12, posY)
  }
  appStore.noteMenuVisible = true
}

export function openContextMenu(appStore, e, tab)
{
  closeAllMenus(appStore)
  appStore.contextTab = tab
  appStore.contextMenuVisible = true
}

export function closeAllMenus(appStore)
{
  appStore.contextMenuVisible = false
  appStore.noteMenuVisible = false
}

export function handleGlobalClick(appStore, e)
{
  playSound('click', appStore.uiSounds)
  if (appStore.buttonRipples)
  {
    let targetBtn = e.target.closest('button, .tab, .theme-btn, #fab-btn')
    if (targetBtn) createRipple(e, targetBtn)
  }
  if (!e.target.closest('.menu'))
  {
    closeAllMenus(appStore)
  }
}

export function autoExpandTextarea(appStore, el)
{
  if (!el) return
  el.style.height = 'auto'
  let calculatedHeight = el.scrollHeight
  let maxHeight = window.innerHeight * 0.45
  let minHeight = 80 * appStore.uiScale
  let targetHeight = Math.max(minHeight, Math.min(calculatedHeight, maxHeight))
  el.style.height = targetHeight + 'px'
}

export async function loadCustomFontHelper(appStore, file)
{
  try
  {
    const fontObj = await processFontUpload(file)
    if (fontObj)
    {
      appStore.customFonts.push(fontObj)
      appStore.setFont(fontObj.name)
    }
  }
  catch (err)
  {
    alert("Failed to load font file.")
  }
}

export async function deleteCustomFontHelper(appStore, fontName)
{
  await deleteFontFromDB(fontName)
  appStore.customFonts = appStore.customFonts.filter(f => f.name !== fontName)
  if (appStore.currentFont === fontName)
  {
    appStore.setFont('system-ui')
  }
}