import {
  createGameOverlay,
  getGameTheme,
  playGameSound,
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

const PULSE_DECAY_MS = 120
const SHAKE_FRAMES = 12
const FLASH_FRAMES = 5

let session = null

export function startFlapGame()
{
  if (session)
  {
    return
  }

  if (document.activeElement && typeof document.activeElement.blur === 'function')
  {
    document.activeElement.blur()
  }

  const theme = getGameTheme()
  const overlay = createGameOverlay({
    onBack: stopFlapGame,
    onReset: resetFlapHighScore,
    resetLabel: 'reset'
  })

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  Object.assign(canvas.style, {
    border: `2px solid ${theme.border}`,
    backgroundColor: theme.surface,
    willChange: 'transform',
    transform: 'translateZ(0)',
    display: 'block',
    touchAction: 'manipulation',
    aspectRatio: `${CANVAS_W} / ${CANVAS_H}`
  })
  overlay.contentHost.appendChild(canvas)

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
  }
  applyCanvasSize()
  window.addEventListener('resize', applyCanvasSize)
  window.addEventListener('orientationchange', applyCanvasSize)

  const ctx = canvas.getContext('2d', { alpha: false })
  ctx.imageSmoothingEnabled = false

  const highScore = parseInt(localStorage.getItem('flap_highscore') || '0', 10)

  const pipes = []
  for (let i = 0; i < MAX_PIPES; i++)
  {
    pipes.push({ active: false, x: 0, top: 0, bottom: 0, passed: false })
  }

  const particles = []
  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 })
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
    pipes,
    particles,
    heights,
    trackIndex: 0,
    bird: { y: CANVAS_H / 2, vy: 0, pulse: 0, rot: 0 },
    spawnAccumulator: 0,
    score: 0,
    started: false,
    gameOver: false,
    shakeFrames: 0,
    flashFrames: 0,
    lastFrame: 0,
    rafId: null,
    applyCanvasSize
  }

  resetFlapGame()

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
  if (!session)
  {
    return
  }
  if (session.rafId)
  {
    cancelAnimationFrame(session.rafId)
  }
  window.removeEventListener('keydown', handleKey)
  window.removeEventListener('resize', session.applyCanvasSize)
  window.removeEventListener('orientationchange', session.applyCanvasSize)
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
  if (!s)
  {
    return
  }
  if (s.gameOver)
  {
    resetFlapGame()
    return
  }
  if (!s.started)
  {
    s.started = true
  }
  s.bird.vy = BIRD_LIFT
  s.bird.pulse = 1
  spawnJumpParticles(BIRD_X + BIRD_W / 2, s.bird.y + BIRD_H)
}

function spawnJumpParticles(x, y)
{
  const s = session
  if (!s)
  {
    return
  }
  let spawned = 0
  for (let i = 0; i < MAX_PARTICLES && spawned < 6; i++)
  {
    const p = s.particles[i]
    if (!p.active)
    {
      p.active = true
      p.x = x
      p.y = y
      p.vx = (Math.random() - 0.5) * 2.5
      p.vy = Math.random() * 1.5 + 0.5
      p.life = 10
      spawned++
    }
  }
}

function resetFlapHighScore()
{
  const s = session
  if (!s)
  {
    return
  }
  s.highScore = 0
  s.highScoreBeaten = false
  localStorage.setItem('flap_highscore', '0')
  resetFlapGame()
}

function resetFlapGame()
{
  const s = session
  if (!s)
  {
    return
  }
  s.bird.y = CANVAS_H / 2
  s.bird.vy = 0
  s.bird.pulse = 0
  s.bird.rot = 0
  for (let i = 0; i < MAX_PIPES; i++)
  {
    s.pipes[i].active = false
  }
  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    s.particles[i].active = false
  }
  s.trackIndex = 0
  s.spawnAccumulator = 0
  s.score = 0
  s.started = false
  s.gameOver = false
  s.shakeFrames = 0
  s.flashFrames = 0
}

function spawnPipe()
{
  const s = session
  if (!s)
  {
    return
  }
  for (let i = 0; i < MAX_PIPES; i++)
  {
    const p = s.pipes[i]
    if (!p.active)
    {
      const top = s.heights[s.trackIndex]
      s.trackIndex = (s.trackIndex + 1) % TRACK_SIZE
      p.active = true
      p.x = CANVAS_W
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
  if (!s || s.gameOver)
  {
    return
  }
  s.gameOver = true
  s.shakeFrames = SHAKE_FRAMES
  s.flashFrames = FLASH_FRAMES
  playGameSound('gameover')
  if (navigator.vibrate)
  {
    navigator.vibrate(200)
  }
  if (s.score > s.highScore)
  {
    s.highScore = s.score
    localStorage.setItem('flap_highscore', s.highScore.toString())
  }
}

function update(dt)
{
  const s = session
  if (!s || !s.started || s.gameOver)
  {
    return
  }

  s.bird.vy += BIRD_GRAVITY * dt
  s.bird.y += s.bird.vy * dt

  const targetRot = Math.max(ROT_UP, Math.min(ROT_DOWN, s.bird.vy / ROT_VEL_SCALE))
  s.bird.rot += (targetRot - s.bird.rot) * Math.min(1, ROT_LERP * dt)

  s.bird.pulse *= Math.exp(-(16.67 * dt) / PULSE_DECAY_MS)

  s.spawnAccumulator += 16.67 * dt
  if (s.spawnAccumulator >= PIPE_SPAWN_MS)
  {
    s.spawnAccumulator -= PIPE_SPAWN_MS
    spawnPipe()
  }

  for (let i = 0; i < MAX_PIPES; i++)
  {
    const p = s.pipes[i]
    if (!p.active)
    {
      continue
    }
    p.x -= PIPE_SPEED * dt

    if (!p.passed && p.x + PIPE_W < BIRD_X)
    {
      p.passed = true
      s.score++
      playGameSound('score')
      if (s.score > s.highScore)
      {
        if (!s.highScoreBeaten)
        {
          triggerConfetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } })
          if (navigator.vibrate)
          {
            navigator.vibrate([100, 50, 100, 50, 200])
          }
          s.highScoreBeaten = true
        }
        s.highScore = s.score
        localStorage.setItem('flap_highscore', s.highScore.toString())
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

    if (p.x + PIPE_W < 0)
    {
      p.active = false
    }
  }

  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    const p = s.particles[i]
    if (!p.active)
    {
      continue
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.life -= dt
    if (p.life <= 0)
    {
      p.active = false
    }
  }

  if (s.bird.y + BIRD_H >= CANVAS_H - GROUND_H || s.bird.y <= 0)
  {
    triggerGameOver()
  }
}

function loop(now)
{
  const s = session
  if (!s)
  {
    return
  }

  const deltaMs = Math.min(32, now - s.lastFrame)
  s.lastFrame = now
  const dt = deltaMs / 16.667

  update(dt)

  if (s.shakeFrames > 0)
  {
    s.shakeFrames--
  }
  if (s.flashFrames > 0)
  {
    s.flashFrames--
  }

  draw()
  s.rafId = requestAnimationFrame(loop)
}

function draw()
{
  const s = session
  if (!s)
  {
    return
  }
  const ctx = s.ctx
  const theme = s.theme

  ctx.save()

  if (s.shakeFrames > 0)
  {
    const amp = (s.shakeFrames / SHAKE_FRAMES) * 8
    ctx.translate(
      (Math.random() - 0.5) * amp,
      (Math.random() - 0.5) * amp
    )
  }

  ctx.fillStyle = theme.surface
  ctx.fillRect(-12, -12, CANVAS_W + 24, CANVAS_H + 24)

  for (let i = 0; i < MAX_PIPES; i++)
  {
    const p = s.pipes[i]
    if (!p.active)
    {
      continue
    }

    const bottomY = CANVAS_H - GROUND_H - p.bottom

    ctx.fillStyle = theme.border
    ctx.fillRect(p.x, 0, PIPE_W, p.top)
    ctx.fillStyle = theme.accent
    ctx.fillRect(
      p.x - PIPE_CAP_OVERHANG,
      p.top - PIPE_CAP_H,
      PIPE_W + PIPE_CAP_OVERHANG * 2,
      PIPE_CAP_H
    )

    ctx.fillStyle = theme.border
    ctx.fillRect(p.x, bottomY, PIPE_W, p.bottom)
    ctx.fillStyle = theme.accent
    ctx.fillRect(
      p.x - PIPE_CAP_OVERHANG,
      bottomY,
      PIPE_W + PIPE_CAP_OVERHANG * 2,
      PIPE_CAP_H
    )
  }

  ctx.fillStyle = theme.gray
  ctx.fillRect(0, CANVAS_H - GROUND_H, CANVAS_W, GROUND_H)
  ctx.fillStyle = theme.accent
  ctx.fillRect(0, CANVAS_H - GROUND_H, CANVAS_W, 4)

  ctx.fillStyle = theme.accent
  for (let i = 0; i < MAX_PARTICLES; i++)
  {
    const p = s.particles[i]
    if (p.active)
    {
      ctx.fillRect(p.x, p.y, 3, 3)
    }
  }

  const pulse = s.bird.pulse
  const w = BIRD_W * (1 + pulse * 0.15)
  const h = BIRD_H * (1 - pulse * 0.15)

  ctx.save()
  ctx.translate(BIRD_X + BIRD_W / 2, s.bird.y + BIRD_H / 2)
  ctx.rotate(s.bird.rot)

  ctx.fillStyle = theme.accent
  ctx.fillRect(-w / 2, -h / 2, w, h)

  ctx.fillStyle = theme.accentTxt
  ctx.fillRect(w / 2 - 6, -h / 2 + 4, 4, 4)

  ctx.restore()

  ctx.restore()

  ctx.fillStyle = theme.text
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`PTS ${s.score}`, 12, 28)
  ctx.textAlign = 'right'
  ctx.fillText(`HI ${s.highScore}`, CANVAS_W - 12, 28)

  if (!s.started && !s.gameOver)
  {
    ctx.fillStyle = theme.text
    ctx.font = '15px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('Tap or Space to Jump', CANVAS_W / 2, CANVAS_H / 2)
  }

  if (s.gameOver)
  {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 26px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 10)
    ctx.font = 'bold 14px monospace'
    ctx.fillText('Tap Canvas to Restart', CANVAS_W / 2, CANVAS_H / 2 + 20)
  }

  if (s.flashFrames > 0)
  {
    ctx.fillStyle = `rgba(255,255,255,${(s.flashFrames / FLASH_FRAMES) * 0.3})`
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }
}