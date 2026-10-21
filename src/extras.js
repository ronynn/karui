let audioCtx = null

export function playSound(type = 'click', uiSoundsEnabled = true)
{
  if (!uiSoundsEnabled) return
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

    let osc = audioCtx.createOscillator()
    let gain = audioCtx.createGain()

    if (type === 'add' || type === 'scratch')
    {
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
  catch (e) {}
}

export function createRipple(e, btn)
{
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

let confettiPromise = null

export function ensureConfettiLoaded()
{
  if (typeof confetti === 'function')
  {
    return Promise.resolve()
  }
  if (confettiPromise)
  {
    return confettiPromise
  }
  confettiPromise = new Promise((resolve, reject) =>
  {
    const existing = document.querySelector('script[src="confetti.browser.min.js"]')
    if (existing)
    {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('confetti load failed')))
    }
    else
    {
      const s = document.createElement('script')
      s.src = 'confetti.browser.min.js'
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('confetti load failed'))
      document.head.appendChild(s)
    }
  })
  return confettiPromise
}

export function triggerConfetti(opts)
{
  ensureConfettiLoaded()
    .then(() =>
    {
      if (typeof confetti === 'function')
      {
        confetti(Object.assign({ zIndex: 100000 }, opts || {}))
      }
    })
    .catch(() => {})
}

export function getGameTheme()
{
  const target = document.body || document.documentElement
  const style = getComputedStyle(target)
  const get = (name, fallback) => style.getPropertyValue(name).trim() || fallback
  return {
    bg:        get('--bg', '#1d2021'),
    surface:   get('--surface', '#282828'),
    border:    get('--border', '#3c3836'),
    text:      get('--text', '#fbf1c7'),
    accent:    get('--accent', '#fe8019'),
    accentTxt: get('--accent-txt', '#282828'),
    gray:      get('--gray', '#928374')
  }
}

let gameAudioCtx = null

export function getGameAudioContext()
{
  if (!gameAudioCtx)
  {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx)
    {
      gameAudioCtx = new Ctx()
    }
  }
  if (gameAudioCtx && gameAudioCtx.state === 'suspended')
  {
    gameAudioCtx.resume()
  }
  return gameAudioCtx
}

function tone(ctx, startTime, opts)
{
  const type = opts.type || 'sine'
  const freq = opts.freq || 440
  const duration = opts.duration || 0.1
  const gain = opts.gain != null ? opts.gain : 0.2
  const freqEnd = opts.freqEnd != null ? opts.freqEnd : null
  const gainEnd = opts.gainEnd != null ? opts.gainEnd : 0.001

  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  if (freqEnd != null)
  {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration)
  }
  g.gain.setValueAtTime(gain, startTime)
  g.gain.exponentialRampToValueAtTime(gainEnd, startTime + duration)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.02)
}

export function playGameSound(type)
{
  const ctx = getGameAudioContext()
  if (!ctx)
  {
    return
  }
  const now = ctx.currentTime

  if (type === 'eat')
  {
    tone(ctx, now,        { type: 'sine',     freq: 523.25, duration: 0.06, gain: 0.20 })
    tone(ctx, now + 0.05, { type: 'sine',     freq: 659.25, duration: 0.10, gain: 0.18 })
  }
  else if (type === 'gameover')
  {
    tone(ctx, now, { type: 'sawtooth', freq: 220, freqEnd: 40, duration: 0.40, gain: 0.35 })
  }
  else if (type === 'score')
  {
    tone(ctx, now, { type: 'square', freq: 880, duration: 0.10, gain: 0.15 })
  }
  else if (type === 'jump')
  {
    tone(ctx, now,        { type: 'square', freq: 500, duration: 0.05, gain: 0.15 })
    tone(ctx, now + 0.05, { type: 'square', freq: 700, duration: 0.05, gain: 0.15 })
  }
  else if (type === 'hit')
  {
    tone(ctx, now, { type: 'square', freq: 300, freqEnd: 100, duration: 0.15, gain: 0.20 })
  }
  else
  {
    tone(ctx, now, { type: 'sine', freq: 800, freqEnd: 300, duration: 0.03, gain: 0.12 })
  }
}

function makeTopButton(label, onClick)
{
  const b = document.createElement('button')
  b.innerText = label
  b.onclick = (e) =>
  {
    e.preventDefault()
    if (onClick)
    {
      onClick()
    }
  }
  return b
}

export function createGameOverlay(opts)
{
  const options = opts || {}
  const lsMedia = window.matchMedia('(orientation: landscape) and (max-height: 600px)')

  const overlay = document.createElement('div')
  overlay.className = 'game-overlay'

  const backBtn  = makeTopButton('back', options.onBack)
  const resetBtn = makeTopButton(options.resetLabel || 'reset', options.onReset)

  const topBar = document.createElement('div')
  topBar.className = 'game-top-bar'
  topBar.appendChild(backBtn)
  topBar.appendChild(resetBtn)

  const playArea = document.createElement('div')
  playArea.className = 'game-play-area'

  const leftSlot   = document.createElement('div')
  leftSlot.className   = 'game-left-slot'

  const centerHost = document.createElement('div')
  centerHost.className = 'game-canvas-host'

  const rightSlot  = document.createElement('div')
  rightSlot.className  = 'game-right-slot'

  playArea.appendChild(topBar)
  playArea.appendChild(leftSlot)
  playArea.appendChild(centerHost)
  playArea.appendChild(rightSlot)
  overlay.appendChild(playArea)

  document.body.appendChild(overlay)

  return {
    overlay,
    contentHost: centerHost,
    topBar,
    leftSlot,
    rightSlot,
    backBtn,
    resetBtn,
    reveal() {},
    isLandscape: () => lsMedia.matches,
    remove()
    {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
    }
  }
}

// --- Loading spinner shown while we wait for the viewport to settle ---

function createLoadingSpinner()
{
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.top = '0'
  host.style.left = '0'
  host.style.right = '0'
  host.style.bottom = '0'
  host.style.background = 'var(--bg)'
  host.style.zIndex = '99998'
  host.style.display = 'flex'
  host.style.alignItems = 'center'
  host.style.justifyContent = 'center'

  const spinner = document.createElement('div')
  spinner.style.width = '32px'
  spinner.style.height = '32px'
  spinner.style.border = '3px solid var(--surface)'
  spinner.style.borderTopColor = 'var(--accent)'
  spinner.style.borderRadius = '50%'
  spinner.style.animation = 'karui-spin 0.7s linear infinite'
  host.appendChild(spinner)

  if (!document.getElementById('karui-spin-keyframes'))
  {
    const style = document.createElement('style')
    style.id = 'karui-spin-keyframes'
    style.textContent = '@keyframes karui-spin { to { transform: rotate(360deg); } }'
    document.head.appendChild(style)
  }

  document.body.appendChild(host)

  return {
    remove()
    {
      if (host.parentNode) host.parentNode.removeChild(host)
    }
  }
}

// Resolves when the viewport (window.innerHeight/Width) has been unchanged
// for 3 consecutive frames, after an initial settling period. Enter-key
// presses open the soft keyboard, which changes the viewport height when
// it dismisses. We must not create a position:fixed game overlay during
// that transition, or it gets created at the "keyboard still up" size and
// visibly resizes when the keyboard finishes animating away.
function waitForStableViewport(minMs, maxMs)
{
  return new Promise(resolve =>
  {
    const start = performance.now()
    let lastH = window.innerHeight
    let lastW = window.innerWidth
    let stableCount = 0

    const check = () =>
    {
      const elapsed = performance.now() - start
      const h = window.innerHeight
      const w = window.innerWidth

      if (h === lastH && w === lastW)
      {
        stableCount++
      }
      else
      {
        stableCount = 0
        lastH = h
        lastW = w
      }

      if ((elapsed >= minMs && stableCount >= 3) || elapsed >= maxMs)
      {
        resolve()
        return
      }
      requestAnimationFrame(check)
    }
    check()
  })
}

export const gameRegistry = {
  FLAPTHEBIRD: async () =>
  {
    const mod = await import('./flap.js')
    mod.startFlapGame()
    return true
  },
  MOONMAN: async () =>
  {
    const mod = await import('./lander.js')
    mod.startLanderGame()
    return true
  },
  SLITHER: async () =>
  {
    const mod = await import('./snake.js')
    mod.startSnakeGame()
    return true
  }
}

export function tryRunGame(code)
{
  const loader = gameRegistry[code]
  if (!loader)
  {
    return false
  }

  // Did the user start the game with the keyboard open? (Enter key path)
  // If so, the viewport is about to shrink back to its resting size as the
  // soft keyboard animates away. Creating a position:fixed overlay during
  // that transition is what caused the FOUC on Android WebView.
  const active = document.activeElement
  const hadKeyboard = !!(
    active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT'
    )
  )
  if (hadKeyboard && typeof active.blur === 'function')
  {
    active.blur()
  }

  // Show the spinner immediately, in the same synchronous tick as the
  // key press. It covers the notes screen for the entire process, and
  // (unlike the game canvas) it's centred and tiny, so viewport resize
  // during keyboard dismissal doesn't cause a visible jump.
  const loading = createLoadingSpinner()

  // Wait for the viewport to be stable before creating the game overlay.
  // If no keyboard was involved (E button path), skip the wait entirely.
  const settled = hadKeyboard
    ? waitForStableViewport(250, 900)
    : Promise.resolve()

  // Remove the spinner only once the game overlay is actually visible --
  // for flap, this means waiting through its own internal canvas-size-
  // stability check, which guarantees the canvas never appears mid-layout.
  const removeWhenGameVisible = (startTime) =>
  {
    const gameOverlay = document.querySelector('.game-overlay')
    const now = performance.now()
    const visible = gameOverlay && gameOverlay.style.visibility !== 'hidden'
    if (visible || now - startTime > 3000)
    {
      loading.remove()
    }
    else
    {
      requestAnimationFrame(() => removeWhenGameVisible(startTime))
    }
  }

  settled
    .then(() => Promise.resolve().then(loader))
    .then(() =>
    {
      removeWhenGameVisible(performance.now())
    })
    .catch(err =>
    {
      loading.remove()
      console.error('Game load failed:', err)
    })

  return true
}