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

const ROT_UP = -0.5
const ROT_DOWN = 1.2
const ROT_VEL_SCALE = 12
const ROT_LERP = 0.15

const SHAKE_FRAMES = 12
const FLASH_FRAMES = 5

const FIXED_MS = 1000 / 60
const MAX_STEPS_PER_FRAME = 5
const MAX_FRAME_MS = 100

const PARTICLE_LIFE = 10

let session = null

function lerp(a, b, t) { return a + (b - a) * t }

// Font state is cached per-session; assigning ctx.font re-parses the string,
// so avoid it on every draw when the value hasn't changed.
function setFont(s, ctx, font)
{
  if (s._font !== font) { ctx.font = font; s._font = font }
}

// localStorage.setItem is a synchronous IPC to the browser process on
// Android WebView (often 1-10 ms). Do NOT call it inside the game loop.
// We keep the high score in memory and flush once, when the round ends.
function persistHighScore()
{
  if (!session) return
  try { localStorage.setItem('flap_highscore', String(session.highScore)) } catch (e) {}
}

function handlePageHide()
{
  persistHighScore()
}

export function startFlapGame()
{
  if (session) return

  if (document.activeElement && typeof document.activeElement.blur === 'function')
  {
    document.activeElement.blur()
  }

  try { getGameAudioContext() } catch (e) {}

  const theme = getGameTheme()
  const overlay = createGameOverlay({
    onBack: stopFlapGame,
    onReset: resetFlapHighScore,
    resetLabel: 'reset'
  })

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  canvas.className = 'game-canvas'
  Object.assign(canvas.style, {
    border: `2px solid ${theme.border}`,
    backgroundColor: theme.bg,
    aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
    width: '94%',
    height: 'auto',
    maxHeight: '72vh',
    touchAction: 'manipulation',
    // Give the canvas its own composited layer so the overlay/page
    // doesn't have to repaint when the canvas contents change.
    display: 'block',
    willChange: 'transform',
    transform: 'translateZ(0)',
    imageRendering: 'pixelated',
    contain: 'paint'
  })
  overlay.contentHost.appendChild(canvas)

  // `desynchronized: true` lets the compositor show the frame immediately
  // instead of queueing it, cutting ~1 frame of latency on Chromium WebView.
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
  ctx.imageSmoothingEnabled = false
  // Paint the canvas with --bg immediately so the first paint matches the
  // overlay background (no flash of black/surface).
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  const highScore = parseInt(localStorage.getItem('flap_highscore') || '0', 10)

  const pipes = []
  for (let i = 0; i < MAX_PIPES; i++)
  {
    pipes.push({ active: false, x: 0, prevX: 0, top: 0, bottom: 0, passed: false })
  }

  const particles = []
  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, size: 0, life: 0 })
  }

  const heights = new Float32Array(TRACK_SIZE)
  const minH = 40
  const maxH = CANVAS_H - GROUND_H - PIPE_GAP - 40
  for (let i = 0; i < TRACK_SIZE; i++)
  {
    heights[i] = minH + Math.random() * (maxH - minH)
  }

  session = {
    overlay,
    canvas,
    ctx,
    theme,
    highScore,
    highScoreBeaten: false,
    // Score text is cached: template literals allocate every frame otherwise.
    scoreText: 'PTS 0',
    hiText: `HI ${highScore}`,
    pipes,
    particles,
    heights,
    trackIndex: 0,
    bird: { y: CANVAS_H / 2, prevY: CANVAS_H / 2, vy: 0, rot: 0, prevRot: 0 },
    spawnAccumulator: 0,
    score: 0,
    started: false,
    gameOver: false,
    shakeFrames: 0,
    flashFrames: 0,
    lastFrame: 0,
    accumulator: 0,
    alpha: 0,
    needsDraw: true,
    _font: '',
    rafId: null,
    applyCanvasSize: null,
    onViewportChange: null
  }

  resetFlapGame()

  // Preload confetti on idle, NOT mid-run. `ensureConfettiLoaded` appends
  // a <script> tag; its fetch + compile + execute would otherwise land
  // right in the middle of the game and cause a visible hitch.
  // requestIdleCallback fires between frames when the main thread is free;
  // the timeout guarantees it eventually runs even if the thread stays busy.
  if (typeof requestIdleCallback === 'function')
  {
    requestIdleCallback(() => { ensureConfettiLoaded().catch(() => {}) }, { timeout: 1500 })
  }
  else
  {
    setTimeout(() => { ensureConfettiLoaded().catch(() => {}) }, 1200)
  }

  function applyCanvasSize()
  {
    if (overlay.isLandscape())
    {
      canvas.style.width = 'auto'
      canvas.style.height = '100%'
      canvas.style.maxHeight = 'calc(100vh - 24px)'
      canvas.style.maxWidth = '100%'
    }
    else
    {
      canvas.style.width = '94%'
      canvas.style.height = 'auto'
      canvas.style.maxHeight = '72vh'
      canvas.style.maxWidth = ''
    }
    // Reading clientWidth forces layout. Only draw when the box is actually
    // big enough; otherwise the first rAF fallback below will retry.
    if (canvas.clientWidth > 100 && canvas.clientHeight > 100)
    {
      try { draw() } catch (e) {}
      if (session) session.needsDraw = false
    }
  }

  session.applyCanvasSize = applyCanvasSize

  // Coalesce resize/orientationchange bursts into a single rAF callback.
  // The URL bar never shows in this app, so continuous resize storms aren't
  // a concern, but orientationchange can fire several times in a row.
  let resizeRaf = 0
  const onViewportChange = () =>
  {
    if (resizeRaf) return
    resizeRaf = requestAnimationFrame(() =>
    {
      resizeRaf = 0
      if (session) applyCanvasSize()
    })
  }
  session.onViewportChange = onViewportChange

  // Draw synchronously; no paint can happen between here and the return
  // of startFlapGame(), so the first frame already shows content.
  applyCanvasSize()
  if (canvas.clientWidth < 100 || canvas.clientHeight < 100)
  {
    requestAnimationFrame(applyCanvasSize)
  }

  window.addEventListener('resize', onViewportChange)
  window.addEventListener('orientationchange', onViewportChange)
  window.addEventListener('pagehide', handlePageHide)

  const handleTap = (e) =>
  {
    if (e) e.preventDefault()
    flapAction()
  }
  canvas.addEventListener('mousedown', handleTap)
  canvas.addEventListener('touchstart', handleTap, { passive: false })
  window.addEventListener('keydown', handleKey)

  session.lastFrame = performance.now()
  session.rafId = requestAnimationFrame(loop)
}

export function stopFlapGame()
{
  if (!session) return
  if (session.rafId) cancelAnimationFrame(session.rafId)
  window.removeEventListener('keydown', handleKey)
  window.removeEventListener('pagehide', handlePageHide)
  if (session.onViewportChange)
  {
    window.removeEventListener('resize', session.onViewportChange)
    window.removeEventListener('orientationchange', session.onViewportChange)
  }
  session.overlay.remove()
  session = null
}

function handleKey(e)
{
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w')
  {
    e.preventDefault()
    flapAction()
  }
}

function flapAction()
{
  const s = session
  if (!s) return
  if (s.gameOver)
  {
    resetFlapGame()
    return
  }
  if (!s.started) s.started = true
  try { getGameAudioContext() } catch (e) {}
  s.bird.vy = BIRD_LIFT
  spawnJumpParticles(BIRD_X + BIRD_W / 2, s.bird.y + BIRD_H)
}

// Particles leave from under the bird and trail down-and-left in a puff,
// angled 20°–55° below horizontal (mirroring the bird's downward flap).
// They grow slightly and fade out as they die.
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
      p.vx = -Math.cos(angle) * speed   // always leftward
      p.vy = Math.sin(angle) * speed    // always downward
      p.size = 3 + Math.random() * 2    // 3–5 px base
      p.life = PARTICLE_LIFE
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
  for (let i = 0; i < MAX_PIPES; i++)
  {
    s.pipes[i].active = false
    s.pipes[i].prevX = 0
  }
  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    s.particles[i].active = false
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
  if (s.score > s.highScore)
  {
    s.highScore = s.score
    s.hiText = `HI ${s.highScore}`
    persistHighScore()   // one synchronous write, at round end
  }
}

function update()
{
  const s = session
  if (!s || !s.started || s.gameOver) return

  s.bird.vy += BIRD_GRAVITY
  s.bird.y += s.bird.vy

  const targetRot = Math.max(ROT_UP, Math.min(ROT_DOWN, s.bird.vy / ROT_VEL_SCALE))
  s.bird.rot += (targetRot - s.bird.rot) * ROT_LERP

  s.spawnAccumulator += FIXED_MS
  if (s.spawnAccumulator >= PIPE_SPAWN_MS)
  {
    s.spawnAccumulator -= PIPE_SPAWN_MS
    spawnPipe()
  }

  for (let i = 0; i < MAX_PIPES; i++)
  {
    const p = s.pipes[i]
    if (!p.active) continue
    p.x -= PIPE_SPEED

    if (!p.passed && p.x + PIPE_W < BIRD_X)
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
        // NO localStorage write here — persisted on game over.
      }
    }

    const bTop = s.bird.y
    const bBottom = s.bird.y + BIRD_H
    const bRight = BIRD_X + BIRD_W
    const colLeft = p.x - PIPE_CAP_OVERHANG
    const colRight = p.x + PIPE_W + PIPE_CAP_OVERHANG
    if (bRight > colLeft && BIRD_X < colRight)
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

  if (s.shakeFrames > 0) s.shakeFrames--
  if (s.flashFrames > 0) s.flashFrames--

  // Skip drawing on frames where nothing can have visually changed:
  // pre-start idle (waiting for first tap) and fully-settled game over.
  const active =
    (s.started && !s.gameOver) ||
    s.shakeFrames > 0 ||
    s.flashFrames > 0 ||
    s.needsDraw
  if (active)
  {
    s.needsDraw = false
    draw()
  }

  s.rafId = requestAnimationFrame(loop)
}

function draw()
{
  const s = session
  if (!s) return
  const ctx = s.ctx
  const theme = s.theme
  const alpha = s.alpha

  ctx.save()

  if (s.shakeFrames > 0)
  {
    const amp = (s.shakeFrames / SHAKE_FRAMES) * 8
    ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp)
  }

  ctx.fillStyle = theme.surface
  ctx.fillRect(-12, -12, CANVAS_W + 24, CANVAS_H + 24)

  for (let i = 0; i < MAX_PIPES; i++)
  {
    const p = s.pipes[i]
    if (!p.active) continue
    const x = lerp(p.prevX, p.x, alpha)
    const bottomY = CANVAS_H - GROUND_H - p.bottom

    ctx.fillStyle = theme.border
    ctx.fillRect(x, 0, PIPE_W, p.top)
    ctx.fillStyle = theme.accent
    ctx.fillRect(x - PIPE_CAP_OVERHANG, p.top - PIPE_CAP_H, PIPE_W + PIPE_CAP_OVERHANG * 2, PIPE_CAP_H)

    ctx.fillStyle = theme.border
    ctx.fillRect(x, bottomY, PIPE_W, p.bottom)
    ctx.fillStyle = theme.accent
    ctx.fillRect(x - PIPE_CAP_OVERHANG, bottomY, PIPE_W + PIPE_CAP_OVERHANG * 2, PIPE_CAP_H)
  }

  ctx.fillStyle = theme.gray
  ctx.fillRect(0, CANVAS_H - GROUND_H, CANVAS_W, GROUND_H)
  ctx.fillStyle = theme.accent
  ctx.fillRect(0, CANVAS_H - GROUND_H, CANVAS_W, 4)

  // Particles: grow slightly as they fade out (puff effect), in text color
  // so they read as distinct from the accent-colored bird and pipes.
  ctx.fillStyle = theme.text
  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    const p = s.particles[i]
    if (!p.active) continue
    const t = p.life / PARTICLE_LIFE               // 1 (new) → 0 (dead)
    ctx.globalAlpha = t
    const sz = p.size * (1.5 - t * 0.5)            // 1× → 1.5× as it fades
    ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz)
  }
  ctx.globalAlpha = 1

  // Bird: pure rotation, no squash/stretch.
  const birdY = lerp(s.bird.prevY, s.bird.y, alpha)
  const birdRot = lerp(s.bird.prevRot, s.bird.rot, alpha)

  ctx.save()
  ctx.translate(BIRD_X + BIRD_W / 2, birdY + BIRD_H / 2)
  ctx.rotate(birdRot)
  ctx.fillStyle = theme.accent
  ctx.fillRect(-BIRD_W / 2, -BIRD_H / 2, BIRD_W, BIRD_H)
  ctx.fillStyle = theme.accentTxt
  ctx.fillRect(BIRD_W / 2 - 6, -BIRD_H / 2 + 4, 4, 4)
  ctx.restore()

  ctx.restore()

  setFont(s, ctx, 'bold 16px monospace')
  ctx.fillStyle = theme.text
  ctx.textAlign = 'left'
  ctx.fillText(s.scoreText, 12, 28)
  ctx.textAlign = 'right'
  ctx.fillText(s.hiText, CANVAS_W - 12, 28)

  if (!s.started && !s.gameOver)
  {
    setFont(s, ctx, '15px monospace')
    ctx.fillStyle = theme.text
    ctx.textAlign = 'center'
    ctx.fillText('Tap or Space to Jump', CANVAS_W / 2, CANVAS_H / 2)
  }

  if (s.gameOver)
  {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    setFont(s, ctx, 'bold 26px monospace')
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 10)
    setFont(s, ctx, 'bold 14px monospace')
    ctx.fillText('Tap Canvas to Restart', CANVAS_W / 2, CANVAS_H / 2 + 20)
  }

  if (s.flashFrames > 0)
  {
    ctx.fillStyle = `rgba(255,255,255,${(s.flashFrames / FLASH_FRAMES) * 0.3})`
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }
}