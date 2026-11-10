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
      this._stopPomodoroInternal(true)
      const m = minutes || 25
      const ms = m * 60 * 1000
      this.pomodoroEndTime = Date.now() + ms
      this.pomodoroTotal = m * 60
      this.pomodoroRemaining = m * 60
      this.pomodoroRunning = true
      try { localStorage.setItem(POMODORO_KEY, String(this.pomodoroEndTime)) } catch (e) {}

      // Native: shows the small floating overlay if overlay permission is
      // granted, otherwise shows the notification countdown. Either way,
      // a completion notification fires at endTime.
      if (window.Android && typeof window.Android.startPomodoroTimer === 'function')
      {
        try { window.Android.startPomodoroTimer(this.pomodoroEndTime) } catch (e) {}
      }
      else if (window.Android && typeof window.Android.schedulePomodoro === 'function')
      {
        try { window.Android.schedulePomodoro(this.pomodoroEndTime) } catch (e) {}
      }

      // In-app ticker (visible when user is looking at the Karui UI).
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
      try { localStorage.removeItem(POMODORO_KEY) } catch (e) {}

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
      if (typeof navigator !== 'undefined' && navigator.vibrate)
      {
        try { navigator.vibrate([200, 100, 200, 100, 200]) } catch (e) {}
      }
      // Native handles the completion notification + cancels the alarm.
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
        // Reconcile with native — if user tapped Stop from the notification
        // action while the app was closed, don't ghost-resume the JS timer.
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

        // Ensure the native overlay / countdown is showing again — the
        // process may have been killed and restarted.
        if (window.Android && typeof window.Android.startPomodoroTimer === 'function')
        {
          try { window.Android.startPomodoroTimer(stored) } catch (e) {}
        }
      }
      else
      {
        try { localStorage.removeItem(POMODORO_KEY) } catch (e) {}
        if (this.showToast) this.showToast('Pomodoro finished while you were away')
      }
    },
  }
}