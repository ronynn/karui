
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

window.syncNotesArrayFromAndroid = function(jsonInput)
{
  try
  {
    let items = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput
    if (!Array.isArray(items)) return
    let now = Date.now()
    items.forEach((item, idx) => {
      if (!item.text) return
      let tabName = item.tab || 'Inbox'
      ensureTabExists(tabName)
      let note = { id: now + idx, text: item.text, completed: false, category: tabName }
      if (addNoteBottom) notes.push(note)
      else notes.unshift(note)
    })
    saveData()
    if (noteCategories.includes(activeCategory))
    {
      renderTabs()
      renderNotes()
    }
  }
  catch(e) {}
}

window.syncNoteFromAndroid = function(text, tabName)
{
  window.syncNotesArrayFromAndroid([{ text: text, tab: tabName }])
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









