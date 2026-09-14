// --- SECTION: DRAG AND DROP HANDLER ---
let dragTarget = null
let dragType = null
let dragImg = null
let hoveredTab = null
let touchTimer = null
let startX = 0
let startY = 0

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
  clearTimeout(touchTimer)
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
    const item = e.target.closest('.note-item')
    if (!item || e.target.closest('.note-menu-trigger'))
    {
      return
    }

    startX = e.touches[0].clientX
    startY = e.touches[0].clientY

    touchTimer = setTimeout(() => {
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
    }, 300)
  }, { passive: true })

  homeScreen.addEventListener('touchmove', e => {
    if (!dragTarget || !dragImg || dragType !== 'note')
    {
      if (touchTimer)
      {
        const touch = e.touches[0]
        if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10)
        {
          clearTimeout(touchTimer)
        }
      }
      return
    }

    e.preventDefault()
    const touch = e.touches[0]
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

  homeScreen.addEventListener('touchend', () => {
    cleanDrag(appStore)
  })

  homeScreen.addEventListener('touchcancel', () => {
    cleanDrag(appStore)
  })
}