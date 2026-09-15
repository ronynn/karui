// --- SECTION: CALENDAR COMPONENT ---
export function initCalendar(appStore)
{
  const calendarStyles = `
.calendar-container { width: 100%; }
.calendar-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.75rem; width: 100%; }
.calendar-header .nav-arrow { background: transparent; border: none; color: var(--text); font-size: 1.5rem; cursor: pointer; padding: 0.25rem 0.5rem; line-height: 1; flex-shrink: 0; min-width: auto; width: auto; height: auto; }
.calendar-header .month-btn { flex: 1; background: transparent; border: none; color: var(--text); font-size: 1.2rem; font-weight: bold; cursor: pointer; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0.25rem 0; min-width: 0; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.25rem; }
.calendar-weekday { text-align: center; font-weight: bold; color: var(--gray); font-size: 0.75rem; }
.calendar-day { text-align: center; height: 3.5rem; overflow: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; cursor: pointer; border: 1px solid transparent; background: var(--surface); color: var(--text); font-size: 0.875rem; box-sizing: border-box; position: relative; }
.calendar-day:hover { border-color: var(--border); }
.calendar-day.other-month { opacity: 0.3; }
.calendar-day.today { border-color: var(--accent); color: var(--accent); }
.calendar-day.selected { background: var(--accent); color: var(--accent-txt); }
.event-dots { display: flex; justify-content: center; gap: 0.15rem; margin-top: 0.2rem; min-height: 0.6rem; }
.event-dot { width: 0.4rem; height: 0.4rem; border-radius: 50%; background: var(--accent); }
.event-count { font-size: 0.6rem; line-height: 1; color: var(--accent); margin-top: 0.2rem; }
.monthly-events { margin-top: 1.5rem; border-top: 1px dashed var(--border); padding-top: 1rem; }
.monthly-events h4 { font-size: 0.875rem; color: var(--gray); margin-bottom: 0.5rem; text-transform: uppercase; }
.monthly-event-item { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.375rem 0; border-bottom: 1px dashed rgba(255,255,255,0.1); }
.monthly-event-item.completed { opacity: 0.55; text-decoration: line-through; }
.monthly-event-date { font-weight: bold; color: var(--accent); white-space: nowrap; font-size: 0.75rem; }
.monthly-event-text { flex: 1; font-size: 0.875rem; cursor: pointer; }
.calendar-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; z-index: 1000; }
.calendar-modal.active { display: flex; }
.calendar-modal-content { background: var(--bg); border: 1px solid var(--border); padding: 1rem; width: 90%; max-width: 400px; max-height: 80%; overflow-y: auto; box-sizing: border-box; }
.calendar-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.calendar-modal-header h3 { font-size: 1rem; margin: 0; }
.calendar-modal-close { cursor: pointer; font-size: 1.5rem; line-height: 1; padding: 0 0.5rem; background: none; border: none; color: var(--text); width: auto; }
.calendar-event-list { list-style: none; margin: 0 0 1rem 0; padding: 0; }
.calendar-event-list li { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px dashed var(--border); }
.calendar-event-list li:last-child { border-bottom: none; }
.calendar-add-btn { width: 100%; padding: 0.5rem; background: var(--accent); color: var(--accent-txt); border: none; font-weight: bold; cursor: pointer; box-sizing: border-box; }
.calendar-add-form textarea { width: 100%; min-height: 3rem; resize: vertical; max-height: 12rem; padding: 0.5rem; background: var(--surface); color: var(--text); border: 1px solid var(--border); font-size: 0.875rem; box-sizing: border-box; }
.calendar-add-form-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.calendar-add-form-actions button { flex: 1; padding: 0.5rem; background: var(--accent); color: var(--accent-txt); border: none; font-weight: bold; cursor: pointer; box-sizing: border-box; }
.calendar-add-form-actions button:last-child { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
`

  if (!document.getElementById('calendar-component-styles'))
  {
    const styleEl = document.createElement('style')
    styleEl.id = 'calendar-component-styles'
    styleEl.textContent = calendarStyles
    document.head.appendChild(styleEl)
  }

  let currentDate = new Date()
  let selectedDateStr = null

  function toDateString(year, month, day)
  {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
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
    let match = note.text.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/)
    if (match)
    {
      return { date: match[1], text: match[2], note: note }
    }
    return { date: null, text: note.text, note: note }
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
    modal.addEventListener('click', (e) =>
    {
      if (e.target === modal) closeModal()
    })
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
      return `<li style="display:flex; justify-content:space-between; align-items:center;">
        <span style="text-decoration:${strike}; cursor:pointer;" data-id="${item.note.id}" class="cal-toggle">${escapeHtml(item.text)}</span>
        <span style="cursor:pointer; color:var(--gray);" data-id="${item.note.id}" class="cal-del">√d</span>
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
        if (note)
        {
          appStore.toggleNote(note, e)
          showEventList(dateStr, body)
        }
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

    document.getElementById('add-event-btn').addEventListener('click', () =>
    {
      showAddEventForm(dateStr, body)
    })
  }

  function showAddEventForm(dateStr, body)
  {
    body.innerHTML = `
      <div class="calendar-add-form">
        <textarea id="event-text" rows="4" placeholder="Enter event details..."></textarea>
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
        let now = Date.now()
        let cat = appStore.calendarTabName || 'Calkarui'
        let note = {
          id: now,
          text: `${dateStr} ${text}`,
          completed: false,
          category: cat,
          pinned: false,
          updatedAt: now
        }
        if (appStore.addNoteBottom) appStore.notes.push(note)
        else appStore.notes.unshift(note)
        appStore.saveData()
        closeModal()
      }
    })
    document.getElementById('cancel-event').addEventListener('click', () =>
    {
      showEventList(dateStr, body)
    })
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
    const monthlyEvents = []

    for (let d = 1; d <= daysInMonth; d++)
    {
      const dateStr = toDateString(year, month, d)
      const dayNotes = calNotes.map(parseNoteDateAndText).filter(item => item.date === dateStr)
      eventsCount[dateStr] = dayNotes.length
      dayNotes.forEach(item =>
      {
        monthlyEvents.push(item)
      })
    }

    monthlyEvents.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    const monthNames = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ]

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
    for (let i = 0; i < startWeekday; i++)
    {
      dayCells += `<div class="calendar-day other-month"></div>`
    }
    for (let d = 1; d <= daysInMonth; d++)
    {
      const dateStr = toDateString(year, month, d)
      const todayStr = new Date().toISOString().slice(0, 10)
      const isToday = dateStr === todayStr
      const isSelected = dateStr === selectedDateStr
      const eventCount = eventsCount[dateStr] || 0
      
      let dotsHtml = ''
      if (eventCount > 0)
      {
        if (eventCount <= 3)
        {
          for (let i = 0; i < eventCount; i++)
          {
            dotsHtml += `<span class="event-dot"></span>`
          }
        }
        else
        {
          dotsHtml = `<span class="event-count">3+</span>`
        }
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
    if (remainder !== 0)
    {
      for (let i = 0; i < 7 - remainder; i++)
      {
        dayCells += `<div class="calendar-day other-month"></div>`
      }
    }

    const monthlyEventsHtml = monthlyEvents.length > 0
      ? monthlyEvents.map(item => `
          <div class="monthly-event-item ${item.note.completed ? 'completed' : ''}">
            <span class="monthly-event-date">${item.date}</span>
            <span class="monthly-event-text" data-id="${item.note.id}">${escapeHtml(item.text)}</span>
          </div>
        `).join('')
      : '<div class="monthly-event-item"><span class="monthly-event-text">No events this month</span></div>'

    container.innerHTML = headerHtml + `<div class="calendar-grid">${weekdaysHtml}${dayCells}</div>` +
      `<div class="monthly-events"><h4>Events this month</h4>${monthlyEventsHtml}</div>`
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
        if (note)
        {
          appStore.toggleNote(note, e)
          renderCalendar()
        }
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