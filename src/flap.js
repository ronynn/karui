import {
  createGameOverlay,
  getGameTheme,
  getGameAudioContext,
  playGameSound,
  ensureConfettiLoaded,
  triggerConfetti
} from './extras.js'

const CANVAS_W = 360
const CANVAS_H = 476
const GROUND_H = 24
const PIPE_W = 45
const PIPE_GAP = 110
const PIPE_CAP_H = 14
const PIPE_CAP_OVERHANG = 4
const PIPE_SPAWN_MS = 1400
const PIPE_SPEED = 2.2
const MAX_PIPES = 6
const MAX_PARTICLES = 12
const TRACK_SIZE = 500

const BIRD_X = 50
const BIRD_W = 22
const BIRD_H = 22
const BIRD_GRAVITY = 0.38
const BIRD_LIFT = -7.5
const BIRD_GLIDE_GRAVITY = 0.18
const BIRD_GLIDE_MAX_FALL = 4

// Glide moves the bird forward and pulls it back when you let go.
// Fast lerp forward, slow lerp back — the "glide then recover" feel.
const GLIDE_FORWARD_MAX = 22
const GLIDE_FORWARD_LERP = 0.25
const GLIDE_RETURN_LERP = 0.06

const ROT_UP = -0.5
const ROT_DOWN = 1.2
const ROT_VEL_SCALE = 12
const ROT_LERP = 0.15
const GLIDE_ROT = 0.28

const SHAKE_FRAMES = 12
const FLASH_FRAMES = 5

const FIXED_MS = 1000 / 60
const MAX_STEPS_PER_FRAME = 5
const MAX_FRAME_MS = 100

const PARTICLE_LIFE = 10

let session = null

function lerp(a, b, t) { return a + (b - a) * t }

function persistHighScore()
{
  if (!session) return
  try { localStorage.setItem('flap_highscore', String(session.highScore)) } catch (e) {}
}

function handlePageHide() { persistHighScore() }
function handleVisibility() { if (document.hidden) persistHighScore() }

function ensureFlapStyles()
{
  if (document.getElementById('flap-game-styles')) return
  const s = document.createElement('style')
  s.id = 'flap-game-styles'
  s.textContent = `
    @keyframes flapWing {
      0%, 100% { transform: scaleY(1) }
      50%      { transform: scaleY(0.35) }
    }
    @keyframes flapCloudA {
      from { transform: translate3d(400px, 0, 0) }
      to   { transform: translate3d(-120px, 0, 0) }
    }
    @keyframes flapCloudB {
      from { transform: translate3d(400px, 0, 0) }
      to   { transform: translate3d(-120px, 0, 0) }
    }
  `
  document.head.appendChild(s)
}

function makePipe(theme)
{
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'absolute', left: '0', top: '0',
    width: `${PIPE_W}px`, height: `${CANVAS_H}px`,
    display: 'none', willChange: 'transform'
  })
  const body = () =>
  {
    const d = document.createElement('div')
    Object.assign(d.style, {
      position: 'absolute', left: '0',
      width: `${PIPE_W}px`, background: theme.border
    })
    return d
  }
  const cap = () =>
  {
    const d = document.createElement('div')
    Object.assign(d.style, {
      position: 'absolute', left: `${-PIPE_CAP_OVERHANG}px`,
      width: `${PIPE_W + PIPE_CAP_OVERHANG * 2}px`,
      height: `${PIPE_CAP_H}px`, background: theme.accent
    })
    return d
  }
  const topBody = body(), topCap = cap(), bottomBody = body(), bottomCap = cap()
  el.append(topBody, topCap, bottomBody, bottomCap)
  return { el, topBody, topCap, bottomBody, bottomCap }
}

function makeParticle(theme)
{
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'absolute', left: '0', top: '0',
    width: '1px', height: '1px',
    marginLeft: '-0.5px', marginTop: '-0.5px',
    background: theme.text, display: 'none',
    transformOrigin: 'center center',
    willChange: 'transform, opacity',
    pointerEvents: 'none'
  })
  return el
}

function makeBird(theme)
{
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'absolute',
    left: `${BIRD_X}px`, top: '0',
    width: `${BIRD_W}px`, height: `${BIRD_H}px`,
    background: theme.accent,
    transformOrigin: 'center center',
    willChange: 'transform'
  })
  const wing = document.createElement('div')
  Object.assign(wing.style, {
    position: 'absolute',
    left: '2px', top: '9px',
    width: '12px', height: '5px',
    background: theme.accentTxt,
    transformOrigin: 'left center',
    animation: 'flapWing 0.32s ease-in-out infinite'
  })
  const eye = document.createElement('div')
  Object.assign(eye.style, {
    position: 'absolute',
    left: `${BIRD_W - 6}px`, top: '4px',
    width: '4px', height: '4px',
    background: theme.accentTxt
  })
  el.append(wing, eye)
  el._wing = wing
  return el
}

function makeGround(theme)
{
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'absolute', left: '0', bottom: '0',
    width: '100%', height: `${GROUND_H}px`,
    background: theme.gray
  })
  const stripe = document.createElement('div')
  Object.assign(stripe.style, {
    position: 'absolute', left: '0', top: '0',
    width: '100%', height: '4px', background: theme.accent
  })
  el.appendChild(stripe)
  return el
}

export function startFlapGame()
{
  if (session) return

  if (document.activeElement && typeof document.activeElement.blur === 'function')
  {
    document.activeElement.blur()
  }

  try { getGameAudioContext() } catch (e) {}
  ensureConfettiLoaded().catch(() => {})
  ensureFlapStyles()

  const theme = getGameTheme()
  const overlay = createGameOverlay({
    onBack: stopFlapGame,
    onReset: resetFlapHighScore,
    resetLabel: 'reset'
  })

  const stage = document.createElement('div')
  Object.assign(stage.style, {
    position: 'relative',
    border: `2px solid ${theme.border}`,
    backgroundColor: theme.surface,
    aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
    width: '94%', height: 'auto', maxHeight: '72vh',
    overflow: 'hidden',
    touchAction: 'manipulation',
    display: 'block', boxSizing: 'content-box',
    contain: 'layout paint style',
    willChange: 'transform', transform: 'translateZ(0)',
    userSelect: 'none', webkitUserSelect: 'none',
    webkitTapHighlightColor: 'transparent'
  })
  overlay.contentHost.appendChild(stage)

  const viewport = document.createElement('div')
  Object.assign(viewport.style, {
    position: 'absolute', left: '0', top: '0',
    width: `${CANVAS_W}px`, height: `${CANVAS_H}px`,
    transformOrigin: 'top left', willChange: 'transform'
  })
  stage.appendChild(viewport)

  // Clouds only — the sun gradient is gone.
  const cloud = (top, name, dur, delay, w, h) => {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute', left: '0', top,
      width: `${w}px`, height: `${h}px`,
      borderRadius: '12px',
      background: `${theme.text}1f`,
      pointerEvents: 'none',
      animation: `${name} ${dur} linear infinite`,
      animationDelay: delay,
      willChange: 'transform'
    })
    return el
  }
  viewport.appendChild(cloud('54px', 'flapCloudA', '24s', '-6s', 80, 22))
  viewport.appendChild(cloud('120px', 'flapCloudB', '36s', '-20s', 110, 26))

  const world = document.createElement('div')
  Object.assign(world.style, {
    position: 'absolute', left: '0', top: '0',
    width: `${CANVAS_W}px`, height: `${CANVAS_H}px`,
    willChange: 'transform'
  })
  viewport.appendChild(world)

  const pipes = []
  for (let i = 0; i < MAX_PIPES; i++)
  {
    const parts = makePipe(theme)
    world.appendChild(parts.el)
    pipes.push({
      active: false, x: 0, prevX: 0, top: 0, bottom: 0, passed: false,
      el: parts.el,
      topBody: parts.topBody, topCap: parts.topCap,
      bottomBody: parts.bottomBody, bottomCap: parts.bottomCap
    })
  }

  world.appendChild(makeGround(theme))

  const particles = []
  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    const el = makeParticle(theme)
    world.appendChild(el)
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, size: 0, life: 0, el })
  }

  const birdEl = makeBird(theme)
  world.appendChild(birdEl)

  const scoreEl = document.createElement('div')
  Object.assign(scoreEl.style, {
    position: 'absolute', left: '12px', top: '16px',
    font: 'bold 16px monospace', lineHeight: '1',
    color: theme.text, pointerEvents: 'none', whiteSpace: 'nowrap'
  })
  viewport.appendChild(scoreEl)

  const hiEl = document.createElement('div')
  Object.assign(hiEl.style, {
    position: 'absolute', right: '12px', top: '16px',
    font: 'bold 16px monospace', lineHeight: '1',
    color: theme.text, pointerEvents: 'none', whiteSpace: 'nowrap'
  })
  viewport.appendChild(hiEl)

  const hintEl = document.createElement('div')
  Object.assign(hintEl.style, {
    position: 'absolute', left: '50%', top: '50%',
    transform: 'translate(-50%, -50%)',
    font: '15px monospace', color: theme.text,
    pointerEvents: 'none', whiteSpace: 'pre-line',
    textAlign: 'center', lineHeight: '1.4'
  })
  hintEl.textContent = 'Tap to Jump\nHold to Glide'
  viewport.appendChild(hintEl)

  const gameoverEl = document.createElement('div')
  Object.assign(gameoverEl.style, {
    position: 'absolute', inset: '0',
    background: 'rgba(0,0,0,0.5)', display: 'none',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '10px', pointerEvents: 'none'
  })
  const goTitle = document.createElement('div')
  Object.assign(goTitle.style, { font: 'bold 26px monospace', color: '#fff', whiteSpace: 'nowrap' })
  goTitle.textContent = 'GAME OVER'
  const goSub = document.createElement('div')
  Object.assign(goSub.style, { font: 'bold 14px monospace', color: '#fff', whiteSpace: 'nowrap' })
  goSub.textContent = 'Tap to Restart'
  gameoverEl.append(goTitle, goSub)
  viewport.appendChild(gameoverEl)

  const flashEl = document.createElement('div')
  Object.assign(flashEl.style, {
    position: 'absolute', inset: '0',
    background: '#fff', opacity: '0', pointerEvents: 'none'
  })
  viewport.appendChild(flashEl)

  const stored = parseInt(localStorage.getItem('flap_highscore') || '0', 10)
  const highScore = Number.isFinite(stored) && stored > 0 ? stored : 0

  const heights = new Float32Array(TRACK_SIZE)
  const minH = 40
  const maxH = CANVAS_H - GROUND_H - PIPE_GAP - 40
  for (let i = 0; i < TRACK_SIZE; i++) heights[i] = minH + Math.random() * (maxH - minH)

  session = {
    overlay, stage, viewport, world, theme,
    highScore, highScoreBeaten: false,
    scoreText: 'PTS 0', hiText: `HI ${highScore}`,
    scoreEl, hiEl, hintEl, gameoverEl, flashEl,
    pipes, particles, heights, trackIndex: 0,
    bird: {
      el: birdEl, wing: birdEl._wing,
      y: CANVAS_H / 2, prevY: CANVAS_H / 2,
      vy: 0, rot: 0, prevRot: 0,
      xOffset: 0, prevXOffset: 0
    },
    wasGliding: false,
    holding: false,
    spawnAccumulator: 0,
    score: 0, started: false, gameOver: false,
    shakeFrames: 0, flashFrames: 0,
    lastFrame: 0, accumulator: 0, alpha: 0,
    needsDraw: true,
    rafId: null,
    applyStageSize: null,
    onViewportChange: null
  }

  resetFlapGame()

  function applyStageSize()
  {
    if (overlay.isLandscape())
    {
      stage.style.width = 'auto'
      stage.style.height = '100%'
      stage.style.maxHeight = 'calc(100vh - 24px)'
      stage.style.maxWidth = '100%'
    }
    else
    {
      stage.style.width = '94%'
      stage.style.height = 'auto'
      stage.style.maxHeight = '72vh'
      stage.style.maxWidth = ''
    }
    const cw = stage.clientWidth, ch = stage.clientHeight
    if (cw > 100 && ch > 100)
    {
      const scale = Math.min(cw / CANVAS_W, ch / CANVAS_H)
      const dx = (cw - CANVAS_W * scale) / 2
      const dy = (ch - CANVAS_H * scale) / 2
      viewport.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale.toFixed(5)})`
      draw()
      if (session) session.needsDraw = false
    }
  }
  session.applyStageSize = applyStageSize

  let resizeRaf = 0
  const onViewportChange = () =>
  {
    if (resizeRaf) return
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; if (session) applyStageSize() })
  }
  session.onViewportChange = onViewportChange

  applyStageSize()
  if (stage.clientWidth < 100 || stage.clientHeight < 100)
  {
    requestAnimationFrame(applyStageSize)
  }

  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('visibilitychange', handleVisibility)

  const handlePressStart = (e) =>
  {
    if (e) e.preventDefault()
    const s = session
    if (!s) return
    if (s.gameOver) { resetFlapGame(); return }
    flapAction()
    s.holding = true
  }
  const handlePressEnd = () => { if (session) session.holding = false }

  stage.addEventListener('mousedown', handlePressStart)
  stage.addEventListener('touchstart', handlePressStart, { passive: false })
  window.addEventListener('mouseup', handlePressEnd)
  window.addEventListener('touchend', handlePressEnd)
  window.addEventListener('touchcancel', handlePressEnd)

  const onKeyDown = (e) =>
  {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w')
    {
      e.preventDefault()
      if (e.repeat) return
      handlePressStart(e)
    }
  }
  const onKeyUp = (e) =>
  {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w') handlePressEnd()
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  session._onKeyDown = onKeyDown
  session._onKeyUp = onKeyUp
  session._onMouseUp = handlePressEnd
  session._onTouchEnd = handlePressEnd
  session._onMouseDown = handlePressStart
  session._onTouchStart = handlePressStart

  session.lastFrame = performance.now()
  session.rafId = requestAnimationFrame(loop)
}

export function stopFlapGame()
{
  if (!session) return
  const s = session
  persistHighScore()
  if (s.rafId) cancelAnimationFrame(s.rafId)
  window.removeEventListener('pagehide', handlePageHide)
  window.removeEventListener('visibilitychange', handleVisibility)
  window.removeEventListener('keydown', s._onKeyDown)
  window.removeEventListener('keyup', s._onKeyUp)
  window.removeEventListener('mouseup', s._onMouseUp)
  window.removeEventListener('touchend', s._onTouchEnd)
  window.removeEventListener('touchcancel', s._onTouchEnd)
  if (s.onViewportChange)
  {
    window.removeEventListener('resize', s.onViewportChange)
    window.removeEventListener('orientationchange', s.onViewportChange)
  }
  s.overlay.remove()
  session = null
}

function flapAction()
{
  const s = session
  if (!s) return
  if (s.gameOver) { resetFlapGame(); return }
  if (!s.started) s.started = true
  try { getGameAudioContext() } catch (e) {}
  s.bird.vy = BIRD_LIFT
  spawnJumpParticles(BIRD_X + BIRD_W / 2, s.bird.y + BIRD_H)
}

function spawnJumpParticles(x, y)
{
  const s = session
  if (!s) return
  let spawned = 0
  for (let i = 0; i < MAX_PARTICLES && spawned < 6; i++)
  {
    const p = s.particles[i]
    if (!p.active)
    {
      const angle = (20 + Math.random() * 35) * Math.PI / 180
      const speed = 1.0 + Math.random() * 1.5
      p.active = true
      p.x = x + (Math.random() - 0.5) * BIRD_W * 0.7
      p.y = y + Math.random() * 2
      p.vx = -Math.cos(angle) * speed
      p.vy = Math.sin(angle) * speed
      p.size = 3 + Math.random() * 2
      p.life = PARTICLE_LIFE
      p.el.style.display = 'block'
      spawned++
    }
  }
}

function resetFlapHighScore()
{
  const s = session
  if (!s) return
  s.highScore = 0
  s.highScoreBeaten = false
  s.hiText = 'HI 0'
  try { localStorage.setItem('flap_highscore', '0') } catch (e) {}
  resetFlapGame()
}

function resetFlapGame()
{
  const s = session
  if (!s) return
  s.bird.y = CANVAS_H / 2
  s.bird.prevY = s.bird.y
  s.bird.vy = 0
  s.bird.rot = 0
  s.bird.prevRot = 0
  s.bird.xOffset = 0
  s.bird.prevXOffset = 0

  for (let i = 0; i < MAX_PIPES; i++)
  {
    s.pipes[i].active = false
    s.pipes[i].prevX = 0
    s.pipes[i].el.style.display = 'none'
  }
  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    s.particles[i].active = false
    s.particles[i].el.style.display = 'none'
  }

  s.trackIndex = 0
  s.spawnAccumulator = 0
  s.score = 0
  s.scoreText = 'PTS 0'
  s.started = false
  s.gameOver = false
  s.shakeFrames = 0
  s.flashFrames = 0
  s.accumulator = 0
  s.alpha = 0
  s.needsDraw = true
  s.holding = false
  s.wasGliding = false

  s.world.style.transform = ''
  s.gameoverEl.style.display = 'none'
  s.hintEl.style.display = 'block'
  s.flashEl.style.opacity = '0'
  s.scoreEl.textContent = s.scoreText
  s.hiEl.textContent = s.hiText
  s.bird.el.style.transform = `translate3d(0, ${(CANVAS_H / 2).toFixed(2)}px, 0) rotate(0rad)`
  s.bird.wing.style.animation = ''
  s.bird.wing.style.transform = ''
}

function spawnPipe()
{
  const s = session
  if (!s) return
  for (let i = 0; i < MAX_PIPES; i++)
  {
    const p = s.pipes[i]
    if (!p.active)
    {
      const top = s.heights[s.trackIndex]
      s.trackIndex = (s.trackIndex + 1) % TRACK_SIZE
      p.active = true
      p.x = CANVAS_W
      p.prevX = CANVAS_W
      p.top = top
      p.bottom = CANVAS_H - GROUND_H - top - PIPE_GAP
      p.passed = false
      const bottomY = CANVAS_H - GROUND_H - p.bottom
      p.topBody.style.height = `${top}px`
      p.topCap.style.top = `${top - PIPE_CAP_H}px`
      p.bottomBody.style.top = `${bottomY}px`
      p.bottomBody.style.height = `${p.bottom}px`
      p.bottomCap.style.top = `${bottomY}px`
      p.el.style.transform = `translate3d(${CANVAS_W}px, 0, 0)`
      p.el.style.display = 'block'
      return
    }
  }
}

function triggerGameOver()
{
  const s = session
  if (!s || s.gameOver) return
  s.gameOver = true
  s.shakeFrames = SHAKE_FRAMES
  s.flashFrames = FLASH_FRAMES
  s.needsDraw = true
  playGameSound('gameover')
  if (navigator.vibrate) navigator.vibrate(200)
  persistHighScore()
}

function update()
{
  const s = session
  if (!s || !s.started || s.gameOver) return

  const isGliding = s.holding && s.bird.vy > 0

  if (isGliding)
  {
    s.bird.vy += BIRD_GLIDE_GRAVITY
    if (s.bird.vy > BIRD_GLIDE_MAX_FALL) s.bird.vy = BIRD_GLIDE_MAX_FALL
  }
  else
  {
    s.bird.vy += BIRD_GRAVITY
  }
  s.bird.y += s.bird.vy

  // Forward-on-glide, slow return when released.
  const targetOffset = isGliding ? GLIDE_FORWARD_MAX : 0
  const rate = isGliding ? GLIDE_FORWARD_LERP : GLIDE_RETURN_LERP
  s.bird.xOffset += (targetOffset - s.bird.xOffset) * rate

  const targetRot = isGliding
    ? GLIDE_ROT
    : Math.max(ROT_UP, Math.min(ROT_DOWN, s.bird.vy / ROT_VEL_SCALE))
  s.bird.rot += (targetRot - s.bird.rot) * ROT_LERP

  s.spawnAccumulator += FIXED_MS
  if (s.spawnAccumulator >= PIPE_SPAWN_MS)
  {
    s.spawnAccumulator -= PIPE_SPAWN_MS
    spawnPipe()
  }

  const bLeft = BIRD_X + s.bird.xOffset
  const bRight = bLeft + BIRD_W
  const bTop = s.bird.y
  const bBottom = s.bird.y + BIRD_H

  for (let i = 0; i < MAX_PIPES; i++)
  {
    const p = s.pipes[i]
    if (!p.active) continue
    p.x -= PIPE_SPEED

    if (!p.passed && p.x + PIPE_W < bLeft)
    {
      p.passed = true
      s.score++
      s.scoreText = `PTS ${s.score}`
      playGameSound('score')

      if (s.score > s.highScore)
      {
        if (!s.highScoreBeaten)
        {
          triggerConfetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } })
          if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200])
          s.highScoreBeaten = true
        }
        s.highScore = s.score
        s.hiText = `HI ${s.highScore}`
      }
    }

    const colLeft = p.x - PIPE_CAP_OVERHANG
    const colRight = p.x + PIPE_W + PIPE_CAP_OVERHANG
    if (bRight > colLeft && bLeft < colRight)
    {
      if (bTop < p.top || bBottom > CANVAS_H - GROUND_H - p.bottom)
      {
        triggerGameOver()
        return
      }
    }

    if (p.x + PIPE_W < 0) p.active = false
  }

  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    const p = s.particles[i]
    if (!p.active) continue
    p.x += p.vx
    p.y += p.vy
    p.life--
    if (p.life <= 0) p.active = false
  }

  if (s.bird.y + BIRD_H >= CANVAS_H - GROUND_H || s.bird.y <= 0)
  {
    triggerGameOver()
  }
}

function capturePrevState()
{
  const s = session
  s.bird.prevY = s.bird.y
  s.bird.prevRot = s.bird.rot
  s.bird.prevXOffset = s.bird.xOffset
  for (let i = 0; i < MAX_PIPES; i++)
  {
    const p = s.pipes[i]
    if (p.active) p.prevX = p.x
  }
}

function loop(now)
{
  const s = session
  if (!s) return

  const frameMs = Math.min(MAX_FRAME_MS, now - s.lastFrame)
  s.lastFrame = now
  s.accumulator += frameMs

  let steps = 0
  while (s.accumulator >= FIXED_MS && steps < MAX_STEPS_PER_FRAME)
  {
    capturePrevState()
    update()
    s.accumulator -= FIXED_MS
    steps++
  }
  if (s.accumulator > FIXED_MS * MAX_STEPS_PER_FRAME) s.accumulator = 0
  s.alpha = s.accumulator / FIXED_MS

  if (s.shakeFrames > 0) { s.shakeFrames--; if (s.shakeFrames === 0) s.needsDraw = true }
  if (s.flashFrames > 0) { s.flashFrames--; if (s.flashFrames === 0) s.needsDraw = true }

  const active =
    (s.started && !s.gameOver) ||
    s.shakeFrames > 0 ||
    s.flashFrames > 0 ||
    s.needsDraw
  if (active) { s.needsDraw = false; draw() }

  s.rafId = requestAnimationFrame(loop)
}

function draw()
{
  const s = session
  if (!s) return
  const alpha = s.alpha

  if (s.shakeFrames > 0)
  {
    const amp = (s.shakeFrames / SHAKE_FRAMES) * 8
    const dx = (Math.random() - 0.5) * amp
    const dy = (Math.random() - 0.5) * amp
    s.world.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`
  }
  else if (s.world.style.transform !== '')
  {
    s.world.style.transform = ''
  }

  for (let i = 0; i < MAX_PIPES; i++)
  {
    const p = s.pipes[i]
    if (!p.active)
    {
      if (p.el.style.display !== 'none') p.el.style.display = 'none'
      continue
    }
    if (p.el.style.display !== 'block') p.el.style.display = 'block'
    const x = lerp(p.prevX, p.x, alpha)
    p.el.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`
  }

  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    const p = s.particles[i]
    if (!p.active)
    {
      if (p.el.style.display !== 'none') p.el.style.display = 'none'
      continue
    }
    if (p.el.style.display !== 'block') p.el.style.display = 'block'
    const t = p.life / PARTICLE_LIFE
    const scale = p.size * (1.5 - t * 0.5)
    p.el.style.transform = `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`
    p.el.style.opacity = t.toFixed(3)
  }

  const isGliding = s.holding && s.bird.vy > 0 && s.started && !s.gameOver
  if (isGliding !== s.wasGliding)
  {
    s.wasGliding = isGliding
    if (isGliding)
    {
      s.bird.wing.style.animation = 'none'
      s.bird.wing.style.transform = 'scaleY(0.5)'
    }
    else
    {
      s.bird.wing.style.animation = ''
      s.bird.wing.style.transform = ''
    }
  }

  const bx = lerp(s.bird.prevXOffset, s.bird.xOffset, alpha)
  const by = lerp(s.bird.prevY, s.bird.y, alpha)
  const br = lerp(s.bird.prevRot, s.bird.rot, alpha)
  s.bird.el.style.transform =
    `translate3d(${bx.toFixed(2)}px, ${by.toFixed(2)}px, 0) rotate(${br.toFixed(4)}rad)`

  if (s.scoreEl.textContent !== s.scoreText) s.scoreEl.textContent = s.scoreText
  if (s.hiEl.textContent !== s.hiText) s.hiEl.textContent = s.hiText

  const showHint = !s.started && !s.gameOver ? 'block' : 'none'
  if (s.hintEl.style.display !== showHint) s.hintEl.style.display = showHint

  const goDisp = s.gameOver ? 'flex' : 'none'
  if (s.gameoverEl.style.display !== goDisp) s.gameoverEl.style.display = goDisp

  if (s.flashFrames > 0)
  {
    s.flashEl.style.opacity = ((s.flashFrames / FLASH_FRAMES) * 0.3).toFixed(3)
  }
  else if (s.flashEl.style.opacity !== '0')
  {
    s.flashEl.style.opacity = '0'
  }
}