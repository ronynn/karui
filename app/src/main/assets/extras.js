// --- SECTION: EXTRAS & UTILITIES ---
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

// ============================================================
// --- SECTION: GAME INFRASTRUCTURE ---
// ============================================================

// --- Confetti (lazy loaded once, reused) ---
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

// --- Theme reader: pulls live CSS vars so games follow the active theme ---
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

// --- Shared Web Audio synth for games (unconditional, game sounds always on) ---
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

// --- Reusable overlay scaffold ---
function makeTopButton(label, onClick)
{
  const b = document.createElement('button')
  b.innerText = label
  b.style.padding = '10px 28px'
  b.style.fontSize = '18px'
  b.style.fontWeight = 'bold'
  b.style.width = 'auto'
  b.style.minWidth = '110px'
  b.style.cursor = 'pointer'
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
  const theme = getGameTheme()

  const overlay = document.createElement('div')
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    backgroundColor: theme.bg,
    color: theme.text,
    zIndex: '99999',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 'calc(52px + env(safe-area-inset-top, 0px))',
    paddingLeft: '8px',
    paddingRight: '8px',
    paddingBottom: '8px',
    boxSizing: 'border-box',
    fontWeight: 'bold'
  })

  const topBar = document.createElement('div')
  Object.assign(topBar.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: '380px',
    marginTop: '4px',
    marginBottom: '12px'
  })

  const backBtn = makeTopButton('back', options.onBack)
  const resetBtn = makeTopButton(options.resetLabel || 'reset', options.onReset)
  topBar.appendChild(backBtn)
  topBar.appendChild(resetBtn)

  const contentHost = document.createElement('div')
  Object.assign(contentHost.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    flex: '1',
    minHeight: '0'
  })

  overlay.appendChild(topBar)
  overlay.appendChild(contentHost)
  document.body.appendChild(overlay)

  return {
    overlay,
    contentHost,
    topBar,
    remove()
    {
      if (overlay.parentNode)
      {
        overlay.parentNode.removeChild(overlay)
      }
    }
  }
}

// --- Registry: all games lazy-loaded as ES modules ---
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
  Promise.resolve()
    .then(loader)
    .catch(err => console.error('Game load failed:', err))
  return true
}