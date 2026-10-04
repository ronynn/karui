// --- SECTION: DRAG AND DROP HANDLER ---
let dragTarget = null
let dragType = null
let dragImg = null
let hoveredTab = null
let touchTimer = null
let startX = 0
let startY = 0
let activeTouchId = null

function findTrackedTouch(touchList)
{
  if (activeTouchId === null || !touchList)
  {
    return null
  }
  for (let i = 0; i < touchList.length; i++)
  {
    if (touchList[i].identifier === activeTouchId)
    {
      return touchList[i]
    }
  }
  return null
}

function cancelPendingDrag()
{
  if (touchTimer)
  {
    clearTimeout(touchTimer)
    touchTimer = null
  }
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

function cleanDrag(appStore)
{
  cancelPendingDrag()
  document.querySelectorAll('.tab').forEach(t =>
  {
    t.style.opacity = '1'
  })

  if (dragTarget && dragType === 'note')
  {
    if (hoveredTab)
    {
      let tCat = hoveredTab.dataset.tab
      let nId = parseInt(dragTarget.dataset.id)
      let n = appStore.notes.find(x => x.id === nId)
      if (n && n.category !== tCat)
      {
        n.category = tCat
      }
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

  if (dragTarget)
  {
    dragTarget.classList.remove('ghost')
  }
  if (dragImg)
  {
    dragImg.remove()
    dragImg = null
  }
  dragTarget = null
  dragType = null
  hoveredTab = null
}

export function setupDragAndDrop(appStore)
{
  const homeScreen = document.getElementById('home-screen')
  if (!homeScreen)
  {
    return
  }

  homeScreen.addEventListener('touchstart', e => {
    // If a second finger lands (or starts landing), kill everything:
    // no drag should ever begin or continue from a multi-touch gesture.
    if (e.touches.length > 1)
    {
      cancelPendingDrag()
      if (dragTarget)
      {
        cleanDrag(appStore)
      }
      return
    }

    // Already tracking a touch — ignore this one.
    if (activeTouchId !== null)
    {
      return
    }

    const item = e.target.closest('.note-item')
    if (!item || e.target.closest('.note-menu-trigger'))
    {
      return
    }

    const touch = e.changedTouches[0]
    activeTouchId = touch.identifier
    startX = touch.clientX
    startY = touch.clientY

    touchTimer = setTimeout(() => {
      // Guard: something cancelled us between scheduling and firing.
      if (activeTouchId === null)
      {
        touchTimer = null
        return
      }

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
      touchTimer = null
    }, 300)
  }, { passive: true })

  homeScreen.addEventListener('touchmove', e => {
    // Second finger appeared mid-move: abort everything.
    if (e.touches.length > 1)
    {
      cancelPendingDrag()
      if (dragTarget)
      {
        cleanDrag(appStore)
      }
      return
    }

    if (!dragTarget || !dragImg || dragType !== 'note')
    {
      // Still inside the long-press window — cancel it if the finger drifts.
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
    if (!touch)
    {
      // The finger we were tracking has vanished — bail out safely.
      cleanDrag(appStore)
      return
    }

    e.preventDefault()
    moveDragImg(touch.clientX, touch.clientY)

    let elPoint = document.elementFromPoint(touch.clientX, touch.clientY)
    hoveredTab = elPoint ? elPoint.closest('.tab') : null
    document.querySelectorAll('.tab').forEach(t => {
      t.style.opacity = '1'
    })

    if (hoveredTab)
    {
      hoveredTab.style.opacity = '0.5'
    }
    else
    {
      const listEl = document.getElementById('notes-list')
      if (listEl)
      {
        const items = [...listEl.querySelectorAll('.note-item:not(.ghost)')]
        const next = items.find(item => touch.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2)
        if (next)
        {
          listEl.insertBefore(dragTarget, next)
        }
        else
        {
          listEl.appendChild(dragTarget)
        }
      }
    }
  }, { passive: false })

  homeScreen.addEventListener('touchend', e => {
    // If a touch we aren't tracking ended, ignore it — the real finger
    // is still down and we want the drag to continue.
    if (activeTouchId !== null)
    {
      let ended = false
      for (let i = 0; i < e.changedTouches.length; i++)
      {
        if (e.changedTouches[i].identifier === activeTouchId)
        {
          ended = true
          break
        }
      }
      if (!ended)
      {
        return
      }
    }
    cleanDrag(appStore)
  })

  homeScreen.addEventListener('touchcancel', () => {
    cleanDrag(appStore)
  })
}