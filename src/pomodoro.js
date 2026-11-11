const POMODORO_KEY = 'pomodoroEndTime'
const POMODORO_STATE_KEY = 'pomodoroState'
const POMODORO_HISTORY_KEY = 'pomodoroHistory'
const HISTORY_RETENTION_DAYS = 60
const HISTORY_MAX_ENTRIES = 500
const GRAPH_DAYS = 14
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Module-level cache — kept out of the reactive store so writing it doesn't
// trigger re-renders.
let _graphCache = null
let _graphCacheKey = ''

function dayKey(ts)
{
  const d = ts ? new Date(ts) : new Date()
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

export function createPomodoroModule()
{
  return {
    pomodoroRunning: false,
    pomodoroEndTime: null,
    pomodoroRemaining: 25 * 60,
    pomodoroTotal: 25 * 60,
    pomodoroHistory: [],
    _pomodoroIntervalId: null,

    pomodoroPresets: [
      { label: '5m',  minutes: 5 },
      { label: '15m', minutes: 15 },
      { label: '25m', minutes: 25 },
      { label: '50m', minutes: 50 }
    ],

    get pomodoroDisplay()
    {
      const s = Math.max(0, this.pomodoroRemaining)
      const m = Math.floor(s / 60)
      const sec = s % 60
      return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
    },

    // Aggregated per-day minutes for the last GRAPH_DAYS days.
    // Oldest entry is index 0 (leftmost bar); today is last.
    get pomodoroGraphData()
    {
      const hist = this.pomodoroHistory
      const lastEnd = hist.length ? (hist[hist.length - 1].endTime || 0) : 0
      const key = hist.length + ':' + lastEnd + ':' + dayKey()
      if (_graphCacheKey === key && _graphCache) return _graphCache

      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const result = []
      const buckets = new Map()

      for (let i = GRAPH_DAYS - 1; i >= 0; i--)
      {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const k = dayKey(d.getTime())
        const day = {
          date: k,
          label: DAY_NAMES[d.getDay()],
          dayNum: d.getDate(),
          minutes: 0,
          count: 0,
          isToday: i === 0
        }
        buckets.set(k, day)
        result.push(day)
      }

      for (let i = 0; i < hist.length; i++)
      {
        const entry = hist[i]
        const bucket = buckets.get(dayKey(entry.endTime))
        if (bucket)
        {
          bucket.minutes += entry.minutes || 0
          bucket.count++
        }
      }

      _graphCacheKey = key
      _graphCache = result
      return result
    },

    get pomodoroGraphMax()
    {
      let max = 1
      const data = this.pomodoroGraphData
      for (let i = 0; i < data.length; i++)
      {
        if (data[i].minutes > max) max = data[i].minutes
      }
      return max
    },

    get pomodoroHistoryTotal()
    {
      let total = 0
      for (const e of this.pomodoroHistory) total += e.minutes || 0
      return total
    },

    get pomodoroHistoryCount()
    {
      return this.pomodoroHistory.length
    },

    startPomodoro(minutes)
    {
      this._stopPomodoroInternal(true)
      const m = minutes || 25
      const ms = m * 60 * 1000
      this.pomodoroEndTime = Date.now() + ms
      this.pomodoroTotal = m * 60
      this.pomodoroRemaining = m * 60
      this.pomodoroRunning = true
      try
      {
        localStorage.setItem(POMODORO_KEY, String(this.pomodoroEndTime))
        localStorage.setItem(POMODORO_STATE_KEY,
          JSON.stringify({ endTime: this.pomodoroEndTime, minutes: m }))
      }
      catch (e) {}

      if (window.Android && typeof window.Android.startPomodoroTimer === 'function')
      {
        try { window.Android.startPomodoroTimer(this.pomodoroEndTime) } catch (e) {}
      }
      else if (window.Android && typeof window.Android.schedulePomodoro === 'function')
      {
        try { window.Android.schedulePomodoro(this.pomodoroEndTime) } catch (e) {}
      }

      this._pomodoroIntervalId = setInterval(() => this._tickPomodoro(), 1000)
    },

    stopPomodoro()
    {
      const was = this.pomodoroRunning
      this._stopPomodoroInternal(true)
      if (was && this.showToast) this.showToast('Pomodoro stopped')
    },

    _stopPomodoroInternal(notifyNative)
    {
      if (this._pomodoroIntervalId)
      {
        clearInterval(this._pomodoroIntervalId)
        this._pomodoroIntervalId = null
      }
      this.pomodoroRunning = false
      this.pomodoroEndTime = null
      this.pomodoroRemaining = this.pomodoroTotal || 25 * 60
      try
      {
        localStorage.removeItem(POMODORO_KEY)
        localStorage.removeItem(POMODORO_STATE_KEY)
      }
      catch (e) {}

      if (notifyNative && window.Android && typeof window.Android.stopPomodoroTimer === 'function')
      {
        try { window.Android.stopPomodoroTimer() } catch (e) {}
      }
    },

    _tickPomodoro()
    {
      if (!this.pomodoroRunning || !this.pomodoroEndTime) return
      const remaining = Math.max(0, Math.floor((this.pomodoroEndTime - Date.now()) / 1000))
      this.pomodoroRemaining = remaining
      if (remaining <= 0) this._onPomodoroDone()
    },

    _recordPomodoroCompletion(endTime, minutes)
    {
      if (!endTime || !minutes || minutes <= 0) return
      this.pomodoroHistory.push({ endTime, minutes })

      const cutoff = Date.now() - HISTORY_RETENTION_DAYS * 86400000
      if (this.pomodoroHistory.length > HISTORY_MAX_ENTRIES ||
          (this.pomodoroHistory.length > 0 && this.pomodoroHistory[0].endTime < cutoff))
      {
        this.pomodoroHistory = this.pomodoroHistory
          .filter(x => x.endTime >= cutoff)
          .slice(-HISTORY_MAX_ENTRIES)
      }

      try
      {
        localStorage.setItem(POMODORO_HISTORY_KEY, JSON.stringify(this.pomodoroHistory))
      }
      catch (e) {}
    },

    _onPomodoroDone()
    {
      if (this._pomodoroIntervalId)
      {
        clearInterval(this._pomodoroIntervalId)
        this._pomodoroIntervalId = null
      }
      const endTime = this.pomodoroEndTime || Date.now()
      const minutes = Math.round((this.pomodoroTotal || 1500) / 60)

      this.pomodoroRunning = false
      this.pomodoroEndTime = null
      this.pomodoroRemaining = 0
      try
      {
        localStorage.removeItem(POMODORO_KEY)
        localStorage.removeItem(POMODORO_STATE_KEY)
      }
      catch (e) {}

      this._recordPomodoroCompletion(endTime, minutes)

      if (this.showToast) this.showToast('Pomodoro complete!')
      if (typeof navigator !== 'undefined' && navigator.vibrate)
      {
        try { navigator.vibrate([200, 100, 200, 100, 200]) } catch (e) {}
      }
      if (window.Android && typeof window.Android.notifyPomodoroDone === 'function')
      {
        try { window.Android.notifyPomodoroDone() } catch (e) {}
      }
      else if (typeof Notification !== 'undefined' && Notification.permission === 'granted')
      {
        try { new Notification('Pomodoro', { body: 'Time is up.' }) } catch (e) {}
      }
    },

    resumePomodoroIfNeeded()
    {
      let state = null
      try { state = JSON.parse(localStorage.getItem(POMODORO_STATE_KEY) || 'null') } catch (e) {}

      if (!state || !state.endTime)
      {
        let legacy = 0
        try { legacy = parseInt(localStorage.getItem(POMODORO_KEY) || '0', 10) } catch (e) {}
        if (!legacy) return
        state = { endTime: legacy, minutes: 25 }
      }

      const remaining = Math.floor((state.endTime - Date.now()) / 1000)

      if (remaining > 0)
      {
        if (window.Android && typeof window.Android.isPomodoroRunning === 'function')
        {
          let nativeRunning = false
          try { nativeRunning = !!window.Android.isPomodoroRunning() } catch (e) {}
          if (!nativeRunning)
          {
            try
            {
              localStorage.removeItem(POMODORO_KEY)
              localStorage.removeItem(POMODORO_STATE_KEY)
            }
            catch (e) {}
            this.pomodoroRunning = false
            this.pomodoroEndTime = null
            this.pomodoroRemaining = this.pomodoroTotal || 25 * 60
            if (this.showToast) this.showToast('Pomodoro was stopped')
            return
          }
        }

        this.pomodoroEndTime = state.endTime
        this.pomodoroTotal = (state.minutes || 25) * 60
        this.pomodoroRemaining = remaining
        this.pomodoroRunning = true
        this._pomodoroIntervalId = setInterval(() => this._tickPomodoro(), 1000)

        if (window.Android && typeof window.Android.startPomodoroTimer === 'function')
        {
          try { window.Android.startPomodoroTimer(state.endTime) } catch (e) {}
        }
      }
      else
      {
        try
        {
          localStorage.removeItem(POMODORO_KEY)
          localStorage.removeItem(POMODORO_STATE_KEY)
        }
        catch (e) {}
        this._recordPomodoroCompletion(state.endTime, state.minutes || 25)
        if (this.showToast) this.showToast('Pomodoro finished while you were away')
      }
    },

    loadPomodoroHistory()
    {
      try
      {
        const raw = localStorage.getItem(POMODORO_HISTORY_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed))
        {
          this.pomodoroHistory = parsed.filter(e => e && e.endTime && e.minutes > 0)
        }
      }
      catch (e)
      {
        this.pomodoroHistory = []
      }
    }
  }
}