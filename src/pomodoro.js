// Pomodoro module. JS drives the in-app 1Hz timer. Native AlarmManager
// handles the notification when backgrounded/killed — only if the OS
// notification permission is granted. Otherwise the toast is the only
// signal.
const POMODORO_KEY = 'pomodoroEndTime'

export function createPomodoroModule()
{
  return {
    pomodoroRunning: false,
    pomodoroEndTime: null,
    pomodoroRemaining: 25 * 60,
    pomodoroTotal: 25 * 60,
    _pomodoroIntervalId: null,

    get pomodoroDisplay()
    {
      const s = Math.max(0, this.pomodoroRemaining)
      const m = Math.floor(s / 60)
      const sec = s % 60
      return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
    },

    startPomodoro(minutes)
    {
      this._stopPomodoroInternal()
      const m = minutes || 25
      const ms = m * 60 * 1000
      this.pomodoroEndTime = Date.now() + ms
      this.pomodoroTotal = m * 60
      this.pomodoroRemaining = m * 60
      this.pomodoroRunning = true
      try { localStorage.setItem(POMODORO_KEY, String(this.pomodoroEndTime)) } catch (e) {}
      this._pomodoroIntervalId = setInterval(() => this._tickPomodoro(), 1000)
      if (window.Android && typeof window.Android.schedulePomodoro === 'function')
      {
        try { window.Android.schedulePomodoro(this.pomodoroEndTime) } catch (e) {}
      }
    },

    stopPomodoro()
    {
      const was = this.pomodoroRunning
      this._stopPomodoroInternal()
      if (was && this.showToast) this.showToast('Pomodoro stopped')
    },

    _stopPomodoroInternal()
    {
      if (this._pomodoroIntervalId)
      {
        clearInterval(this._pomodoroIntervalId)
        this._pomodoroIntervalId = null
      }
      this.pomodoroRunning = false
      this.pomodoroEndTime = null
      this.pomodoroRemaining = this.pomodoroTotal || 25 * 60
      try { localStorage.removeItem(POMODORO_KEY) } catch (e) {}
      if (window.Android && typeof window.Android.cancelPomodoro === 'function')
      {
        try { window.Android.cancelPomodoro() } catch (e) {}
      }
    },

    _tickPomodoro()
    {
      if (!this.pomodoroRunning || !this.pomodoroEndTime) return
      const remaining = Math.max(0, Math.floor((this.pomodoroEndTime - Date.now()) / 1000))
      this.pomodoroRemaining = remaining
      if (remaining <= 0) this._onPomodoroDone()
    },

    _onPomodoroDone()
    {
      if (this._pomodoroIntervalId)
      {
        clearInterval(this._pomodoroIntervalId)
        this._pomodoroIntervalId = null
      }
      this.pomodoroRunning = false
      this.pomodoroEndTime = null
      this.pomodoroRemaining = 0
      try { localStorage.removeItem(POMODORO_KEY) } catch (e) {}
      if (this.showToast) this.showToast('Pomodoro complete!')
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200])
      // Native path handles the notification transition + clears prefs.
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
      let stored = 0
      try { stored = parseInt(localStorage.getItem(POMODORO_KEY) || '0', 10) } catch (e) {}
      if (!stored) return
      const remaining = Math.floor((stored - Date.now()) / 1000)
      if (remaining > 0)
      {
        // Native is authoritative. If native says "not running" but the JS
        // local storage still has a future endTime, the user must have
        // tapped Stop from the notification action while the app was
        // backgrounded. Clear local state so we don't ghost-resume.
        if (window.Android && typeof window.Android.isPomodoroRunning === 'function')
        {
          let nativeRunning = false
          try { nativeRunning = !!window.Android.isPomodoroRunning() } catch (e) {}
          if (!nativeRunning)
          {
            try { localStorage.removeItem(POMODORO_KEY) } catch (e) {}
            this.pomodoroRunning = false
            this.pomodoroEndTime = null
            this.pomodoroRemaining = this.pomodoroTotal || 25 * 60
            if (this.showToast) this.showToast('Pomodoro was stopped')
            return
          }
        }
        this.pomodoroEndTime = stored
        this.pomodoroTotal = this.pomodoroTotal || 25 * 60
        this.pomodoroRemaining = remaining
        this.pomodoroRunning = true
        this._pomodoroIntervalId = setInterval(() => this._tickPomodoro(), 1000)
      }
      else
      {
        try { localStorage.removeItem(POMODORO_KEY) } catch (e) {}
        if (this.showToast) this.showToast('Pomodoro finished while you were away')
      }
    },
  }
}