// --- SECTION: CALENDAR COMPONENT ---
// --- Calendar notification module (moved out of index.js) ---
export function createCalendarModule()
{
  return {
    calendarNotificationsEnabled: false,
    _lastSyncedCalendarJson: '',

    syncCalendarEventsToAndroid()
    {
      if (!window.Android || typeof window.Android.updateCalendarEvents !== 'function') return

      if (!this.calendarEnabled)
      {
        if (this._lastSyncedCalendarJson !== '[]')
        {
          this._lastSyncedCalendarJson = '[]'
          try { window.Android.updateCalendarEvents('[]') } catch (e) {}
        }
        return
      }

      const cat = this.calendarTabName || 'Calkarui'
      const dateRe = /^(\d{4}-\d{2}-\d{2})\s+([\s\S]+)$/
      const events = []

      this.notes.forEach(n =>
        {
          if (!n || n.category !== cat || !n.text) return

          const m = n.text.match(dateRe)
          if (m)
          {
            const ev = { date: m[1], text: m[2].trim(), id: n.id, completed: !!n.completed }
            if (n.reminderTime) ev.time = n.reminderTime
            events.push(ev)
            return
          }

          if (n.scheduledDate && /^\d{4}-\d{2}-\d{2}$/.test(n.scheduledDate))
          {
            const ev = {
              date: n.scheduledDate,
              text: n.text.replace(/^\d{4}-\d{2}-\d{2}\s+/, '').trim(),
              id: n.id,
              completed: !!n.completed
            }
            if (n.reminderTime) ev.time = n.reminderTime
            events.push(ev)
          }
        })

      const json = JSON.stringify(events)
      if (json === this._lastSyncedCalendarJson) return
      this._lastSyncedCalendarJson = json

      try { window.Android.updateCalendarEvents(json) } catch (e) {}
    },

    toggleCalendarNotifications()
    {
      localStorage.setItem('calendarNotificationsEnabled', this.calendarNotificationsEnabled)

      if (this.calendarNotificationsEnabled && !this.notificationEnabled)
      {
        this.notificationEnabled = true
        if (window.Android && typeof window.Android.toggleNotification === 'function')
        {
          window.Android.toggleNotification(true)
        }
      }

      this.syncCalendarEventsToAndroid()

      if (window.Android && typeof window.Android.setCalendarNotificationsEnabled === 'function')
      {
        window.Android.setCalendarNotificationsEnabled(this.calendarNotificationsEnabled)
        this.showToast(this.calendarNotificationsEnabled
                       ? 'Daily calendar reminder enabled'
                       : 'Daily calendar reminder disabled')
      }
      else if (this.calendarNotificationsEnabled)
      {
        this.showToast('Calendar notifications only work in the Android app')
      }
    }
  }
}

export function initCalendar(appStore)
{
  let currentDate = new Date()
  let selectedDateStr = null

  function toDateString(year, month, day)
  {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function todayStr()
  {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function escapeHtml(str)
  {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  function getCalendarNotes()
  {
    let cat = appStore.calendarTabName || 'Calkarui'
    return appStore.notes.filter(n => n.category === cat)
  }

  function parseNoteDateAndText(note)
  {
    if (note.scheduledDate)
    {
      const displayText = note.text.replace(/^\d{4}-\d{2}-\d{2}\s+/, '')
      return { date: note.scheduledDate, text: displayText, note: note, isRecurring: true }
    }
    // [\s\S] matches newlines too, so multiline notes work.
    let match = note.text.match(/^(\d{4}-\d{2}-\d{2})\s*([\s\S]*)$/)
    if (match) return { date: match[1], text: match[2], note: note, isRecurring: false }
    return { date: null, text: note.text, note: note, isRecurring: false }
  }

  function createModal()
  {
    if (document.getElementById('calendar-modal')) return
    const modal = document.createElement('div')
    modal.className = 'calendar-modal'
    modal.id = 'calendar-modal'
    modal.innerHTML = `
      <div class="calendar-modal-content">
        <div class="calendar-modal-header">
          <h3 id="modal-date-title">Events</h3>
          <button class="calendar-modal-close" id="modal-close">×</button>
        </div>
        <div id="modal-body"></div>
      </div>
    `
    document.body.appendChild(modal)
    modal.querySelector('#modal-close').addEventListener('click', closeModal)
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })
  }

  function openModal(dateStr)
  {
    createModal()
    const modal = document.getElementById('calendar-modal')
    const title = document.getElementById('modal-date-title')
    const body = document.getElementById('modal-body')
    title.textContent = `Events for ${dateStr}`
    showEventList(dateStr, body)
    modal.classList.add('active')
    selectedDateStr = dateStr
  }

  function closeModal()
  {
    const modal = document.getElementById('calendar-modal')
    if (modal) modal.classList.remove('active')
    selectedDateStr = null
    renderCalendar()
  }

  function showEventList(dateStr, body)
  {
    const calNotes = getCalendarNotes()
    const dayEvents = calNotes.map(parseNoteDateAndText).filter(item => item.date === dateStr)

    let itemsHtml = dayEvents.map(item =>
    {
      let strike = item.note.completed ? 'line-through' : 'none'
      return `<li style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
        <span style="text-decoration:${strike}; cursor:pointer;" data-id="${item.note.id}" class="cal-toggle">${escapeHtml(item.text)}</span>
        <span style="cursor:pointer; color:var(--gray); flex-shrink:0;" data-id="${item.note.id}" class="cal-del">√d</span>
      </li>`
    }).join('')

    body.innerHTML = `
      <ul class="calendar-event-list">
        ${itemsHtml || '<li>No events yet</li>'}
      </ul>
      <button class="calendar-add-btn" id="add-event-btn">+</button>
    `

    body.querySelectorAll('.cal-toggle').forEach(el =>
    {
      el.addEventListener('click', (e) =>
      {
        let id = parseInt(e.target.dataset.id, 10)
        let note = appStore.notes.find(n => n.id === id)
        if (note) { appStore.toggleNote(note, e); showEventList(dateStr, body) }
      })
    })

    body.querySelectorAll('.cal-del').forEach(el =>
    {
      el.addEventListener('click', (e) =>
      {
        let id = parseInt(e.target.dataset.id, 10)
        appStore.executeTrash(id)
        showEventList(dateStr, body)
      })
    })

    document.getElementById('add-event-btn').addEventListener('click', () => { showAddEventForm(dateStr, body) })
  }

  function showAddEventForm(dateStr, body)
  {
    body.innerHTML = `
      <div class="calendar-add-form">
        <textarea id="event-text" rows="4" placeholder="Enter event details... (prefix with !1w for recurring)"></textarea>
        <div class="calendar-add-form-actions">
          <button id="save-event">Save</button>
          <button id="cancel-event">Cancel</button>
        </div>
      </div>
    `
    document.getElementById('save-event').addEventListener('click', () =>
    {
      const text = document.getElementById('event-text').value.trim()
      if (text)
      {
        appStore.addNote(text, appStore.calendarTabName, dateStr)
        appStore.saveData()
        closeModal()
      }
    })
    document.getElementById('cancel-event').addEventListener('click', () => { showEventList(dateStr, body) })
  }

  function renderCalendar()
  {
    const container = document.getElementById('calendar-container')
    if (!container) return

    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startWeekday = firstDay.getDay()

    const calNotes = getCalendarNotes()
    const eventsCount = {}
    const recurringCount = {}
    const monthlyEvents = []

    for (let d = 1; d <= daysInMonth; d++)
    {
      const dateStr = toDateString(year, month, d)
      const dayNotes = calNotes.map(parseNoteDateAndText).filter(item => item.date === dateStr)
      eventsCount[dateStr] = dayNotes.length
      recurringCount[dateStr] = dayNotes.filter(x => x.isRecurring).length
      dayNotes.forEach(item => { if (!item.isRecurring) monthlyEvents.push(item) })
    }

    monthlyEvents.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    const monthNames = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"]

    const headerHtml = `
      <div class="calendar-header">
        <button class="nav-arrow cal-prev" aria-label="Previous month">←</button>
        <button class="month-btn" id="month-btn">${monthNames[month]} ${year}</button>
        <button class="nav-arrow cal-next" aria-label="Next month">→</button>
      </div>
    `

    const hiddenInput = document.createElement('input')
    hiddenInput.type = 'month'
    hiddenInput.id = 'hidden-month-input'
    hiddenInput.style.cssText = 'position:absolute; left:-9999px; opacity:0; width:1px; height:1px;'
    hiddenInput.value = `${year}-${String(month + 1).padStart(2, '0')}`

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const weekdaysHtml = weekDays.map(w => `<div class="calendar-weekday">${w}</div>`).join('')

    let dayCells = ''
    for (let i = 0; i < startWeekday; i++) dayCells += `<div class="calendar-day other-month"></div>`
    for (let d = 1; d <= daysInMonth; d++)
    {
      const dateStr = toDateString(year, month, d)
      const todayS = todayStr()
      const isToday = dateStr === todayS
      const isSelected = dateStr === selectedDateStr
      const recurring = recurringCount[dateStr] || 0
      const oneOff = (eventsCount[dateStr] || 0) - recurring

      let dotsHtml = ''
      if (recurring > 0) dotsHtml += `<span class="event-dot recurring"></span>`
      if (oneOff > 0)
      {
        for (let i = 0; i < Math.min(oneOff, 3); i++) dotsHtml += `<span class="event-dot"></span>`
      }

      dayCells += `
        <div class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">
          <span>${d}</span>
          ${dotsHtml ? `<div class="event-dots">${dotsHtml}</div>` : ''}
        </div>
      `
    }
    const totalCells = startWeekday + daysInMonth
    const remainder = totalCells % 7
    if (remainder !== 0) for (let i = 0; i < 7 - remainder; i++) dayCells += `<div class="calendar-day other-month"></div>`

    const monthlyEventsHtml = monthlyEvents.length > 0
      ? monthlyEvents.map(item => `
          <div class="monthly-event-item ${item.note.completed ? 'completed' : ''}">
            <span class="monthly-event-date">${item.date}</span>
            <span class="monthly-event-text" data-id="${item.note.id}">${escapeHtml(item.text)}</span>
          </div>
        `).join('')
      : '<div class="monthly-event-item"><span class="monthly-event-text">No events this month</span></div>'

    const todayS = todayStr()
    const recurringToday = calNotes
      .map(parseNoteDateAndText)
      .filter(item => item.isRecurring && item.date === todayS)

    const recurringTodayHtml = recurringToday.length > 0
      ? recurringToday.map(item => `
          <div class="recurring-today-item ${item.note.completed ? 'completed' : ''}">
            <span class="recurring-today-text" data-id="${item.note.id}">${escapeHtml(item.text)}</span>
          </div>
        `).join('')
      : '<div class="recurring-today-empty">Nothing due today</div>'

    container.innerHTML = headerHtml +
      `<div class="calendar-grid">${weekdaysHtml}${dayCells}</div>` +
      `<div class="monthly-events"><h4>Events this month</h4>${monthlyEventsHtml}</div>` +
      `<div class="recurring-today"><h4>Recurring today</h4>${recurringTodayHtml}</div>`
    container.appendChild(hiddenInput)

    container.querySelector('.cal-prev').addEventListener('click', () =>
    {
      currentDate.setMonth(currentDate.getMonth() - 1)
      renderCalendar()
    })
    container.querySelector('.cal-next').addEventListener('click', () =>
    {
      currentDate.setMonth(currentDate.getMonth() + 1)
      renderCalendar()
    })

    container.querySelector('#month-btn').addEventListener('click', () =>
    {
      const input = container.querySelector('#hidden-month-input')
      if (input)
      {
        if (typeof input.showPicker === 'function') input.showPicker()
        else input.click()
      }
    })

    container.querySelector('#hidden-month-input').addEventListener('change', (e) =>
    {
      const value = e.target.value
      if (value)
      {
        const [y, m] = value.split('-').map(Number)
        currentDate = new Date(y, m - 1, 1)
        renderCalendar()
      }
    })

    container.querySelectorAll('.calendar-day[data-date]').forEach(day =>
    {
      day.addEventListener('click', (e) =>
      {
        selectedDateStr = e.currentTarget.dataset.date
        openModal(selectedDateStr)
      })
    })

    container.querySelectorAll('.monthly-event-text[data-id]').forEach(el =>
    {
      el.addEventListener('click', (e) =>
      {
        let id = parseInt(e.target.dataset.id, 10)
        let note = appStore.notes.find(n => n.id === id)
        if (note) { appStore.toggleNote(note, e); renderCalendar() }
      })
    })

    container.querySelectorAll('.recurring-today-text[data-id]').forEach(el =>
    {
      el.addEventListener('click', (e) =>
      {
        let id = parseInt(e.target.dataset.id, 10)
        let note = appStore.notes.find(n => n.id === id)
        if (note) { appStore.toggleNote(note, e); renderCalendar() }
      })
    })
  }

  renderCalendar()

  const calendarTitle = document.getElementById('calendar-title')
  if (calendarTitle)
  {
    calendarTitle.addEventListener('click', () =>
    {
      currentDate = new Date()
      selectedDateStr = null
      renderCalendar()
    })
  }

  return { renderCalendar }
}