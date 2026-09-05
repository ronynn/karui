
function loadNotificationSettings()
{
  let notifEnabled = localStorage.getItem("notificationEnabled") === "true"
  document.getElementById('notification-toggle').checked = notifEnabled

  let savedTab = localStorage.getItem("inboxTabName") || "Inbox"
  document.getElementById('inbox-tab-name').value = savedTab
  ensureTabExists(savedTab)
  if (window.Android)
  {
    window.Android.setInboxTabName(savedTab)
    if (notifEnabled) window.Android.toggleNotification(true)
  }
}

function toggleNotification(enable)
{
  localStorage.setItem("notificationEnabled", enable)
  if (window.Android)
  {
    window.Android.toggleNotification(enable)
  }
}

function updateInboxTab(name)
{
  name = name.trim() || "Inbox"
  localStorage.setItem("inboxTabName", name)
  ensureTabExists(name)
  if (window.Android)
  {
    window.Android.setInboxTabName(name)
  }
}

function showToast(msg)
{
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    t.classList.remove('show')
  }, 2000)
}

function toggleScreenshots(disabled)
{
  if (window.Android && window.Android.toggleScreenshots)
  {
    window.Android.toggleScreenshots(disabled)
  }
  localStorage.setItem('disableScreenshots', disabled)
}

function initScreenshotSetting()
{
  const isDisabled = localStorage.getItem('disableScreenshots') === 'true'
  const toggleEl = document.getElementById('disable-screenshots-toggle')
  if (toggleEl)
  {
    toggleEl.checked = isDisabled
  }
  if (window.Android && window.Android.toggleScreenshots)
  {
    window.Android.toggleScreenshots(isDisabled)
  }
}

document.addEventListener('DOMContentLoaded', initScreenshotSetting)


// Audio and UI handlers
function playSound(type = 'click')
{
  if (!uiSounds) return
  try
  {
    if (!audioCtx)
    {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioCtx.state === 'suspended')
    {
      audioCtx.resume()
    }

    if (type === 'add' || type === 'scratch')
    {
      let osc = audioCtx.createOscillator()
      let gain = audioCtx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(320, audioCtx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(850, audioCtx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.12)
    }
    else if (type === 'tab')
    {
      let osc = audioCtx.createOscillator()
      let gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(600, audioCtx.currentTime)
      osc.frequency.setValueAtTime(900, audioCtx.currentTime + 0.04)
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.08)
    }
    else
    {
      let osc = audioCtx.createOscillator()
      let gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, audioCtx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.03)
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.03)
    }
  }
  catch(e) {}
}

window.addEventListener('click', e => {
  playSound('click')
  if (buttonRipples)
  {
    let targetBtn = e.target.closest('button, .tab, .theme-btn, #fab-btn')
    if (targetBtn)
    {
      createRipple(e, targetBtn)
    }
  }
}, true)

function createRipple(e, btn)
{
  if (!buttonRipples) return
  btn.classList.add('has-ripple')
  let rect = btn.getBoundingClientRect()
  let circle = document.createElement('span')
  let diameter = Math.max(rect.width, rect.height)
  let radius = diameter / 2
  circle.style.width = circle.style.height = `${diameter}px`
  circle.style.left = `${e.clientX - rect.left - radius}px`
  circle.style.top = `${e.clientY - rect.top - radius}px`
  circle.classList.add('ripple-span')

  let existing = btn.getElementsByClassName('ripple-span')[0]
  if (existing) existing.remove()

  btn.appendChild(circle)
  setTimeout(() => {
    if (circle.parentNode) circle.remove()
  }, 1000)
}

function closeAllMenus()
{
  document.getElementById('context-menu').style.display = 'none'
  document.getElementById('note-dropdown').style.display = 'none'
}

function autoExpandTextarea(el)
{
  el.style.height = 'auto'
  let calculatedHeight = el.scrollHeight
  let maxHeight = window.innerHeight * 0.45
  let minHeight = 80 * uiScale
  let targetHeight = Math.max(minHeight, Math.min(calculatedHeight, maxHeight))
  el.style.height = targetHeight + 'px'
}

function formatNoteText(str)
{
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setupScrollHeader()
{
  document.querySelectorAll('.screen').forEach(scr => {
    scr.addEventListener('scroll', () => {
      let topBar = document.getElementById('top-bar')
      if (scr.scrollTop > 10)
      {
        topBar.classList.add('scrolled')
      }
      else
      {
        topBar.classList.remove('scrolled')
      }
    })
  })
}

function setupVisualViewport()
{
  const updateFab = () => {
    let fab = document.getElementById('fab-btn')
    if (!fab) return

    if (window.visualViewport)
    {
      let vv = window.visualViewport
      let keyboardHeight = window.innerHeight - vv.height
      let layoutScrollTop = window.scrollY || document.documentElement.scrollTop
      let visualOffsetTop = vv.offsetTop

      if (keyboardHeight > 100 || visualOffsetTop > 0)
      {
        let translateY = -(keyboardHeight + (visualOffsetTop - layoutScrollTop))
        fab.style.transform = `translateY(${translateY}px)`
      }
      else
      {
        fab.style.transform = 'translateY(0px)'
      }
    }
  }

  if (window.visualViewport)
  {
    window.visualViewport.addEventListener('resize', updateFab)
    window.visualViewport.addEventListener('scroll', updateFab)
  }

  window.addEventListener('resize', updateFab)
  window.addEventListener('scroll', updateFab)

  updateFab()
}

function setupInputFocusScroll()
{
  document.addEventListener('focusin', e => {
    if ((e.target.tagName === 'INPUT' && e.target.type === 'text') || e.target.tagName === 'TEXTAREA')
    {
      setTimeout(() => {
        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 250)
    }
  })
}

function focusNoteInput()
{
  if (currentScreenIdx !== 0)
  {
    switchScreen(0)
  }
  let inp = document.getElementById('note-in')
  if (document.activeElement === inp)
  {
    inp.blur()
  }
  else
  {
    inp.focus()
  }
}

function setUiSize(s, btn)
{
  uiScale = s
  applyUiScale(s)
  saveData()
}

function applyUiScale(s)
{
  document.documentElement.style.setProperty('--ui-scale', s)
  let btns = document.querySelectorAll('#ui-size-btns button')
  btns.forEach(b => {
    let scaleVal = 1
    if (b.innerText === 'S') scaleVal = 0.85
    else if (b.innerText === 'M') scaleVal = 1
    else if (b.innerText === 'L') scaleVal = 1.15
    else if (b.innerText === 'XL') scaleVal = 1.3
    b.classList.toggle('active', Math.abs(scaleVal - s) < 0.05)
  })
}

function toggleDt(v) { doubleTapDelete = v; saveData(); }
function toggleCelebration(v) { celebrationMode = v; saveData(); }
function toggleKeepKeyboard(v) { keepKeyboard = v; saveData(); }
function toggleUiSounds(v) { uiSounds = v; saveData(); }
function toggleButtonRipples(v)
{
  buttonRipples = v
  if (!v)
  {
    document.querySelectorAll('.ripple-span').forEach(el => el.remove())
  }
  saveData()
}
function toggleFab(v)
{
  showFab = v
  document.getElementById('fab-btn').style.display = (v && currentScreenIdx === 0) ? 'flex' : 'none'
  saveData()
}
function toggleSortAlpha(v)
{
  sortAlphabetical = v
  document.getElementById('add-btm-toggle').disabled = v
  saveData()
  renderNotes()
}
function toggleAddBtm(v) { addNoteBottom = v; saveData(); }
function toggleMoveCompletedBottom(v) { moveCompletedBottom = v; saveData(); renderNotes(); }
function toggleDisableSwipe(v) { disableSwipe = v; saveData(); }

function actionDeleteNote()
{
  if (!activeNoteMenuId) return
  let id = activeNoteMenuId
  if (doubleTapDelete)
  {
    let now = Date.now()
    if (now - lastTrashTap < 300)
    {
      executeTrash(id)
      showToast('Note deleted')
      closeAllMenus()
    }
    else
    {
      if (navigator.vibrate) navigator.vibrate(15)
      showToast('Tap delete again to confirm')
    }
    lastTrashTap = now
  }
  else
  {
    executeTrash(id)
    showToast('Note deleted')
    closeAllMenus()
  }
}


function actionTogglePinNote()
{
  if (!activeNoteMenuId) return
  let n = notes.find(x => x.id === activeNoteMenuId)
  if (n)
  {
    n.pinned = !n.pinned
    renderNotes()
    saveData()
  }
  closeAllMenus()
}

function actionCopyNote()
{
  if (!activeNoteMenuId) return
  let n = notes.find(x => x.id === activeNoteMenuId)
  if (n)
  {
    navigator.clipboard.writeText(n.text)
    if (navigator.vibrate) navigator.vibrate(15)
    showToast('Note copied')
  }
  closeAllMenus()
}

function actionEditNote()
{
  if (!activeNoteMenuId) return
  let n = notes.find(x => x.id === activeNoteMenuId)
  if (n)
  {
    openPrompt('Edit Note', n.text, val => {
      if (val)
      {
        n.text = val
        renderTabs()
        renderNotes()
        saveData()
      }
    })
  }
  closeAllMenus()
}

function updateStats()
{
  let rem = 0, comp = 0
  let currentCatNotes = notes.filter(n => n.category === activeCategory)
  currentCatNotes.forEach(n => n.completed ? comp++ : rem++)
  let statsTxt = `Remaining: ${rem} \u00A0\u00A0 Completed: ${comp}`
  if (activeCategory.includes('%'))
  {
    let total = rem + comp
    let pct = total > 0 ? Math.round((comp / total) * 100) : 0
    statsTxt += ` \u00A0\u00A0 (${pct}%)`
  }
  document.getElementById('stats').textContent = statsTxt
}

function openNoteMenu(e, id)
{
  e.stopPropagation();

  // Toggle off if clicking the menu target of an already active note
  const menu = document.getElementById('note-dropdown');
  if (activeNoteMenuId === id && menu.style.display === 'block')
  {
    closeAllMenus();
    return;
  }

  closeAllMenus();
  activeNoteMenuId = id;

  let n = notes.find(x => x.id === id);
  let pinBtn = document.getElementById('btn-pin-note');
  if (pinBtn)
  {
    pinBtn.textContent = (n && n.pinned) ? 'Unpin Note' : 'Pin Note';
  }

  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 120) + 'px';
  menu.style.top = e.clientY + 'px';
}

function renderTabs()
{
  closeAllMenus()
  const bar = document.getElementById('tabs-bar'); bar.innerHTML = ''
  noteCategories.forEach(t => {
    const d = document.createElement('div')
    d.className = `tab ${activeCategory === t ? 'active' : ''}`

    let tabLabel = t
    if (t.includes('%'))
    {
      let catNotes = notes.filter(n => n.category === t)
      let tot = catNotes.length
      let comp = catNotes.filter(n => n.completed).length
      let pct = tot > 0 ? Math.round((comp / tot) * 100) : 0
      tabLabel = t.replace('%', `${pct}%`)
    }

    d.textContent = tabLabel; d.dataset.tab = t
    d.onclick = () => {
      closeAllMenus()
      activeCategory = t
      if (!keepKeyboard && document.activeElement) document.activeElement.blur()
      renderTabs()
      renderNotes()
    }
    bindLongPress(d, 'tab'); bar.appendChild(d)
  })
}

function renderNotes()
{
  closeAllMenus()
  const list = document.getElementById('notes-list'), trash = document.getElementById('trash-list')
  list.innerHTML = ''; trash.innerHTML = ''

  let currentCatNotes = notes.filter(n => n.category === activeCategory)

  let pinned = currentCatNotes.filter(n => n.pinned)
  let unpinned = currentCatNotes.filter(n => !n.pinned)

  if (sortAlphabetical)
  {
    pinned.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }))
    unpinned.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }))
  }

  currentCatNotes = [...pinned, ...unpinned]

  if (moveCompletedBottom)
  {
    let uncompleted = currentCatNotes.filter(n => !n.completed)
    let completed = currentCatNotes.filter(n => n.completed)
    currentCatNotes = [...uncompleted, ...completed]
  }

  currentCatNotes.forEach(n => {
    const d = document.createElement('div')
    d.className = `note-item ${n.completed ? 'done' : ''}`; d.dataset.id = n.id

    let pinPrefix = n.pinned ? `<span class="pin-icon">⊢</span>` : ''

    d.innerHTML = `<span>${pinPrefix}${formatNoteText(n.text)}</span>
                   <span onclick="openNoteMenu(event, ${n.id})" style="color:var(--gray); padding: 0 10px; font-weight: bold; cursor: pointer; flex-shrink: 0;">:</span>`
    d.onclick = (e) => {
      if (e.target.tagName === 'SPAN' && e.target.innerText === ':') return;

      n.completed = !n.completed;
      if (n.completed)
      {
        playSound('scratch');
        if (celebrationMode && typeof confetti === 'function')
        {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
        }
      }
      if (navigator.vibrate) navigator.vibrate(30);

      let txt = n.text.trim();
      if (/^https?:\/\//i.test(txt) || /^www\./i.test(txt))
      {
        window.location.href = txt.startsWith('http') ? txt : 'https://' + txt;
      }

      // Directly mutate DOM class to avoid restarting CSS keyframe animations across the list
      d.classList.toggle('done', n.completed);

      updateStats();
      saveData();

      // Only re-render full list if sorting rules force order repositioning
      if (moveCompletedBottom)
      {
        renderNotes();
      }
    }
    bindLongPress(d, 'note'); list.appendChild(d)
  })

  recycleBin.forEach((n, idx) => {
    const d = document.createElement('div'); d.className = 'note-item'; d.style.padding = '8px 0'
    d.innerHTML = `<span>${formatNoteText(n.text)}</span><span onclick="restoreNote(${idx})" style="color:var(--gray); padding: 0 5px; flex-shrink: 0;">√r</span>`
    trash.appendChild(d)
  })

  updateStats()
}

function clearTrash() { recycleBin = []; renderTabs(); renderNotes(); saveData(); }

function openPrompt(title, defaultVal, cb)
{
  document.getElementById('modal-title').innerText = title
  const inp = document.getElementById('modal-input'); inp.value = defaultVal
  autoExpandTextarea(inp)
  document.getElementById('modal-overlay').style.display = 'flex'
  setTimeout(() => inp.focus(), 100); modalCb = cb
}

function closeModal(saveAction)
{
  document.getElementById('modal-overlay').style.display = 'none'
  if (saveAction && modalCb) modalCb(document.getElementById('modal-input').value.trim())
}

function renameTab(n)
{
  if (n && !noteCategories.includes(n))
  {
    notes.forEach(x => { if(x.category === contextTab) x.category = n; })
    recycleBin.forEach(x => { if(x.category === contextTab) x.category = n; })
    noteCategories[noteCategories.indexOf(contextTab)] = n
    activeCategory = n; renderTabs(); renderNotes(); saveData()
  }
}

function addTab(n)
{
  if (n && !noteCategories.includes(n))
  {
    playSound('tab')
    noteCategories.push(n); activeCategory = n; renderTabs(); renderNotes(); saveData()
  }
}

function deleteTabClick()
{
  let t = contextTab || activeCategory
  if (noteCategories.length > 1)
  {
    noteCategories = noteCategories.filter(x => x !== t)
    notes = notes.filter(note => {
      if (note.category === t) { recycleBin.push(note); return false; }
      return true
    })
    if (activeCategory === t) activeCategory = noteCategories[0]
    renderTabs(); renderNotes(); saveData()
  }
}

function moveTab(dir)
{
  let idx = noteCategories.indexOf(contextTab)
  if (idx < 0) return
  let nIdx = idx + dir
  if (nIdx >= 0 && nIdx < noteCategories.length)
  {
    let t = noteCategories[idx]
    noteCategories[idx] = noteCategories[nIdx]
    noteCategories[nIdx] = t
    renderTabs(); saveData()
  }
  closeAllMenus()
}

function showMenu()
{ 
  closeAllMenus()
  const m = document.getElementById('context-menu') 
  m.style.display = 'block'
  document.getElementById('menu-tab-title').textContent = contextTab
  let idx = noteCategories.indexOf(contextTab)
  document.getElementById('btn-mv-l').style.display = idx > 0 ? 'block' : 'none'
  document.getElementById('btn-mv-r').style.display = idx < noteCategories.length - 1 ? 'block' : 'none'
}

function bindLongPress(el, type)
{
  el.addEventListener('touchstart', e => {
    touchTimer = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(60)
      dragType = type; dragTarget = el
      if (type === 'tab') { contextTab = el.dataset.tab; showMenu(); return; }
      el.classList.add('ghost')
      dragImg = el.cloneNode(true); dragImg.className = 'drag-image'; document.body.appendChild(dragImg)
      moveDragImg(e.touches[0].clientX, e.touches[0].clientY)
    }, 250)
  }, {passive:true})
  el.addEventListener('touchend', cleanDrag)
  el.addEventListener('touchmove', e => {
    if(!dragImg) {
      clearTimeout(touchTimer)
    } else {
      if(dragType === 'note') e.preventDefault()
      moveDragImg(e.touches[0].clientX, e.touches[0].clientY)
    }
  }, {passive:false})
}

function moveDragImg(x, y) { if(dragImg) { dragImg.style.left = (x - 20) + 'px'; dragImg.style.top = (y - 20) + 'px'; } }

function cleanDrag()
{
  clearTimeout(touchTimer)
  document.querySelectorAll('.tab').forEach(t => t.style.opacity = '1')

  if (dragTarget && dragType === 'note')
  {
    if (hoveredTab)
    {
      let tCat = hoveredTab.dataset.tab
      let nId = parseInt(dragTarget.dataset.id)
      let n = notes.find(x => x.id === nId)
      if (n && n.category !== tCat) { n.category = tCat; }
      dragTarget.remove()
    }
    else
    {
      const ids = [...document.getElementById('notes-list').querySelectorAll('.note-item')].map(x => parseInt(x.dataset.id))
      let currentCatNotes = ids.map(id => notes.find(x => x.id === id)).filter(Boolean)
      let otherCatNotes = notes.filter(x => x.category !== activeCategory)
      notes = [...currentCatNotes, ...otherCatNotes]
    }
    saveData()
    renderTabs()
    if (hoveredTab) renderNotes()
  }

  if (dragTarget) dragTarget.classList.remove('ghost')
  if (dragImg) { dragImg.remove(); dragImg = null; }
  dragTarget = null; dragType = null; hoveredTab = null
}

function setupDragAndDrop()
{
  document.getElementById('home-screen').addEventListener('touchmove', e => {
    if (!dragTarget || !dragImg || dragType !== 'note') return
    e.preventDefault()
    const touch = e.touches[0]

    let elPoint = document.elementFromPoint(touch.clientX, touch.clientY)
    hoveredTab = elPoint ? elPoint.closest('.tab') : null
    document.querySelectorAll('.tab').forEach(t => t.style.opacity = '1')

    if (hoveredTab)
    {
      hoveredTab.style.opacity = '0.5'
    }
    else
    {
      const items = [...document.getElementById('notes-list').querySelectorAll('.note-item:not(.ghost)')]
      const next = items.find(item => touch.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2)
      if (next) document.getElementById('notes-list').insertBefore(dragTarget, next)
      else document.getElementById('notes-list').appendChild(dragTarget)
    }
  }, {passive:false})
}


