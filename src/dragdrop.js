// --- SECTION: DRAG AND DROP HANDLER ---
let dragTarget = null
let dragType = null
let dragImg = null
let hoveredTab = null
let touchTimer = null
let startX = 0
let startY = 0
let activeTouchId = null
let currentTouchY = 0
let scrollRAF = null

function findTrackedTouch(touchList)
{
  if (activeTouchId === null || !touchList) return null
  for (let i = 0; i < touchList.length; i++)
  {
    if (touchList[i].identifier === activeTouchId) return touchList[i]
  }
  return null
}

function cancelPendingDrag()
{
  if (touchTimer) { clearTimeout(touchTimer); touchTimer = null }
  activeTouchId = null
}

function moveDragImg(x, y)
{
  if (dragImg)
  {
    dragImg.style.left = (x - 20) + 'px'
    dragImg.style.top = (y - 20) + 'px'
  }
}

function positionDragTarget(touchY)
{
  if (!dragTarget || hoveredTab) return
  const listEl = document.getElementById('notes-list')
  if (!listEl) return
  const items = [...listEl.querySelectorAll('.note-item:not(.ghost)')]
  const next = items.find(item => touchY < item.getBoundingClientRect().top + item.offsetHeight / 2)
  if (next) listEl.insertBefore(dragTarget, next)
  else listEl.appendChild(dragTarget)
}

function autoScrollLoop()
{
  if (!dragTarget) { scrollRAF = null; return }

  const screen = document.getElementById('home-screen')
  if (screen)
  {
    const rect = screen.getBoundingClientRect()
    const edgeZone = Math.min(100, rect.height * 0.2)
    let scrollDelta = 0

    if (currentTouchY < rect.top + edgeZone)
    {
      const intensity = 1 - (currentTouchY - rect.top) / edgeZone
      scrollDelta = -(4 + intensity * 10)
    }
    else if (currentTouchY > rect.bottom - edgeZone)
    {
      const intensity = 1 - (rect.bottom - currentTouchY) / edgeZone
      scrollDelta = 4 + intensity * 10
    }

    if (scrollDelta !== 0)
    {
      const before = screen.scrollTop
      screen.scrollTop += scrollDelta
      if (screen.scrollTop !== before) positionDragTarget(currentTouchY)
    }
  }

  scrollRAF = requestAnimationFrame(autoScrollLoop)
}

function startAutoScroll()
{
  if (scrollRAF) return
  scrollRAF = requestAnimationFrame(autoScrollLoop)
}

function stopAutoScroll()
{
  if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null }
}

function cleanDrag(appStore)
{
  cancelPendingDrag()
  stopAutoScroll()

  document.querySelectorAll('.tab').forEach(t => { t.style.opacity = '1' })

  if (dragTarget && dragType === 'note')
  {
    if (hoveredTab)
    {
      let tCat = hoveredTab.dataset.tab
      let nId = parseInt(dragTarget.dataset.id)
      let n = appStore.notes.find(x => x.id === nId)
      if (n && n.category !== tCat) n.category = tCat
    }
    else
    {
      const listEl = document.getElementById('notes-list')
      if (listEl)
      {
        const ids = [...listEl.querySelectorAll('.note-item')].map(x => parseInt(x.dataset.id))
        let currentCatNotes = ids.map(id => appStore.notes.find(x => x.id === id)).filter(Boolean)
        let otherCatNotes = appStore.notes.filter(x => x.category !== appStore.activeCategory)
        appStore.notes = [...currentCatNotes, ...otherCatNotes]
      }
    }
    appStore.saveData()
  }

  if (dragTarget) dragTarget.classList.remove('ghost')
  if (dragImg) { dragImg.remove(); dragImg = null }
  dragTarget = null
  dragType = null
  hoveredTab = null
}

export function setupDragAndDrop(appStore)
{
  const homeScreen = document.getElementById('home-screen')
  if (!homeScreen) return

  homeScreen.addEventListener('touchstart', e => {
    if (e.touches.length > 1)
    {
      cancelPendingDrag()
      if (dragTarget) cleanDrag(appStore)
      return
    }
    if (activeTouchId !== null) return

    const item = e.target.closest('.note-item')
    if (!item || e.target.closest('.note-menu-trigger')) return

    const touch = e.changedTouches[0]
    activeTouchId = touch.identifier
    startX = touch.clientX
    startY = touch.clientY
    currentTouchY = touch.clientY

    touchTimer = setTimeout(() => {
      if (activeTouchId === null) { touchTimer = null; return }

      dragTarget = item
      dragType = 'note'
      dragTarget.classList.add('ghost')

      dragImg = item.cloneNode(true)
      dragImg.style.position = 'fixed'
      dragImg.style.pointerEvents = 'none'
      dragImg.style.opacity = '0.8'
      dragImg.style.zIndex = '1000'
      dragImg.style.width = item.offsetWidth + 'px'
      document.body.appendChild(dragImg)
      moveDragImg(startX, startY)
      startAutoScroll()
      touchTimer = null
    }, 300)
  }, { passive: true })

  homeScreen.addEventListener('touchmove', e => {
    if (e.touches.length > 1)
    {
      cancelPendingDrag()
      if (dragTarget) cleanDrag(appStore)
      return
    }

    if (!dragTarget || !dragImg || dragType !== 'note')
    {
      if (touchTimer)
      {
        const tracked = findTrackedTouch(e.touches) || e.changedTouches[0]
        if (tracked && (Math.abs(tracked.clientX - startX) > 10 || Math.abs(tracked.clientY - startY) > 10))
        {
          cancelPendingDrag()
        }
      }
      return
    }

    const touch = findTrackedTouch(e.touches)
    if (!touch) { cleanDrag(appStore); return }

    e.preventDefault()
    currentTouchY = touch.clientY
    moveDragImg(touch.clientX, touch.clientY)

    let elPoint = document.elementFromPoint(touch.clientX, touch.clientY)
    hoveredTab = elPoint ? elPoint.closest('.tab') : null
    document.querySelectorAll('.tab').forEach(t => { t.style.opacity = '1' })

    if (hoveredTab)
    {
      hoveredTab.style.opacity = '0.5'
    }
    else
    {
      positionDragTarget(touch.clientY)
    }
  }, { passive: false })

  homeScreen.addEventListener('touchend', e => {
    if (activeTouchId !== null)
    {
      let ended = false
      for (let i = 0; i < e.changedTouches.length; i++)
      {
        if (e.changedTouches[i].identifier === activeTouchId) { ended = true; break }
      }
      if (!ended) return
    }
    cleanDrag(appStore)
  })

  homeScreen.addEventListener('touchcancel', () => { cleanDrag(appStore) })
}