// snake.js — rewritten as an ES module, with bounce physics on the body.
import {
  createGameOverlay,
  getGameTheme,
  playGameSound,
  triggerConfetti
} from './extras.js'

// --- Constants ---
const GRID = 16
const TILES = 20
const TICK_RATE = 110           // ms per grid step
const BOARD_PX = GRID * TILES
const HEAD_POP_MS = 150         // decay time constant for head "pop" on eat
const SHAKE_TIME = 0.18         // seconds

// --- Easing / math helpers ---
function easeOutBack(t)
{
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function lerp(a, b, t)
{
  return a + (b - a) * t
}

function roundRect(ctx, x, y, w, h, r)
{
  if (typeof ctx.roundRect === 'function')
  {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    return
  }
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// --- Module-level session ---
let session = null

// --- Lifecycle ---
export function startSnakeGame()
{
  if (session)
  {
    return
  }

  if (document.activeElement && typeof document.activeElement.blur === 'function')
  {
    document.activeElement.blur()
  }

  const highScore = parseInt(localStorage.getItem('snake_highscore') || '0', 10)

  const overlay = createGameOverlay({
    onBack: stopSnakeGame,
    onReset: resetHighScore,
    resetLabel: 'reset'
  })

  const theme = getGameTheme()

  const canvas = document.createElement('canvas')
  canvas.width = BOARD_PX
  canvas.height = BOARD_PX
  Object.assign(canvas.style, {
    width: '100%',
    maxWidth: 'min(380px, 58vh)',
    aspectRatio: '1 / 1',
    border: `2px solid ${theme.border}`,
    backgroundColor: theme.surface
  })
  overlay.contentHost.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  const controls = buildControls()
  overlay.contentHost.appendChild(controls)

  session = {
    overlay,
    canvas,
    ctx,
    highScore,
    highScoreBeaten: false,
    snake: [],
    food: { x: 0, y: 0 },
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    score: 0,
    gameOver: false,
    headEatPulse: 0,
    foodPulse: 0,
    accumulatedTime: 0,
    lastFrame: 0,
    rafId: null,
    shakeTime: 0,
    shakeMag: 3
  }

  resetSnakeGame()

  window.addEventListener('keydown', handleInput)
  canvas.addEventListener('click', () =>
  {
    if (session && session.gameOver)
    {
      resetSnakeGame()
    }
  })
  canvas.addEventListener('touchstart', (e) =>
  {
    if (session && session.gameOver)
    {
      e.preventDefault()
      resetSnakeGame()
    }
  }, { passive: false })

  session.lastFrame = performance.now()
  session.rafId = requestAnimationFrame(loop)
}

export function stopSnakeGame()
{
  if (!session)
  {
    return
  }
  if (session.rafId)
  {
    cancelAnimationFrame(session.rafId)
  }
  window.removeEventListener('keydown', handleInput)
  session.overlay.remove()
  session = null
}

function resetHighScore()
{
  if (!session)
  {
    return
  }
  session.highScore = 0
  session.highScoreBeaten = false
  localStorage.setItem('snake_highscore', '0')
  resetSnakeGame()
}

function resetSnakeGame()
{
  if (!session)
  {
    return
  }
  const cx = Math.floor(TILES / 2)
  const cy = Math.floor(TILES / 2)
  session.snake = [
    { x: cx,     y: cy, px: cx,     py: cy },
    { x: cx - 1, y: cy, px: cx - 1, py: cy },
    { x: cx - 2, y: cy, px: cx - 2, py: cy }
  ]
  session.dir = { x: 1, y: 0 }
  session.nextDir = { x: 1, y: 0 }
  session.score = 0
  session.gameOver = false
  session.headEatPulse = 0
  session.foodPulse = 0
  session.accumulatedTime = 0
  session.shakeTime = 0
  spawnFood()
}

function spawnFood()
{
  if (!session)
  {
    return
  }
  let x = 0
  let y = 0
  let tries = 0
  do
  {
    x = Math.floor(Math.random() * TILES)
    y = Math.floor(Math.random() * TILES)
    tries++
  } while (session.snake.some(s => s.x === x && s.y === y) && tries < 60)
  session.food = { x, y }
  session.foodPulse = 1
}

// --- Controls ---
function buildControls()
{
  const host = document.createElement('div')
  Object.assign(host.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(2, 1fr)',
    gap: '8px',
    width: '100%',
    maxWidth: '220px',
    marginTop: '12px'
  })

  const mk = (label, area, fn) =>
  {
    const b = document.createElement('button')
    b.innerText = label
    b.style.gridArea = area
    b.style.padding = '12px'
    b.style.fontSize = '18px'
    b.style.fontWeight = 'bold'
    b.style.cursor = 'pointer'
    b.style.userSelect = 'none'
    b.onclick = (e) =>
    {
      e.preventDefault()
      fn()
    }
    return b
  }

  host.appendChild(mk('W', '1 / 2 / 2 / 3', () =>
  {
    if (session && session.dir.y === 0) session.nextDir = { x: 0, y: -1 }
  }))
  host.appendChild(mk('A', '2 / 1 / 3 / 2', () =>
  {
    if (session && session.dir.x === 0) session.nextDir = { x: -1, y: 0 }
  }))
  host.appendChild(mk('S', '2 / 2 / 3 / 3', () =>
  {
    if (session && session.dir.y === 0) session.nextDir = { x: 0, y: 1 }
  }))
  host.appendChild(mk('D', '2 / 3 / 3 / 4', () =>
  {
    if (session && session.dir.x === 0) session.nextDir = { x: 1, y: 0 }
  }))

  return host
}

// --- Input ---
function handleInput(e)
{
  if (!session || session.gameOver)
  {
    return
  }
  const dir = session.dir
  if ((e.key === 'ArrowUp' || e.key === 'w') && dir.y === 0)
  {
    session.nextDir = { x: 0, y: -1 }
  }
  else if ((e.key === 'ArrowDown' || e.key === 's') && dir.y === 0)
  {
    session.nextDir = { x: 0, y: 1 }
  }
  else if ((e.key === 'ArrowLeft' || e.key === 'a') && dir.x === 0)
  {
    session.nextDir = { x: -1, y: 0 }
  }
  else if ((e.key === 'ArrowRight' || e.key === 'd') && dir.x === 0)
  {
    session.nextDir = { x: 1, y: 0 }
  }
}

// --- Tick: one grid step ---
function tick()
{
  const s = session
  if (!s || s.gameOver)
  {
    return
  }
  s.dir = s.nextDir

  const oldHead = s.snake[0]
  const nx = (oldHead.x + s.dir.x + TILES) % TILES
  const ny = (oldHead.y + s.dir.y + TILES) % TILES

  // Collision: check body excluding head and tail (tail vacates this step).
  for (let i = 1; i < s.snake.length - 1; i++)
  {
    if (s.snake[i].x === nx && s.snake[i].y === ny)
    {
      triggerGameOver()
      return
    }
  }

  // Snapshot previous positions for the interpolation.
  for (let i = 0; i < s.snake.length; i++)
  {
    s.snake[i].px = s.snake[i].x
    s.snake[i].py = s.snake[i].y
  }

  const eating = nx === s.food.x && ny === s.food.y

  if (eating)
  {
    // Grow: push a duplicate tail before shifting.
    const tail = s.snake[s.snake.length - 1]
    s.snake.push({ x: tail.x, y: tail.y, px: tail.x, py: tail.y })

    s.score++
    s.headEatPulse = 1
    s.shakeTime = SHAKE_TIME
    playGameSound('eat')
    spawnFood()

    if (s.score > s.highScore || s.highScore === 0)
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
      localStorage.setItem('snake_highscore', s.highScore.toString())
    }
  }

  // Shift body backward so each segment inherits the position in front of it.
  for (let i = s.snake.length - 1; i >= 1; i--)
  {
    s.snake[i].x = s.snake[i - 1].x
    s.snake[i].y = s.snake[i - 1].y
  }

  // New head position.
  s.snake[0].x = nx
  s.snake[0].y = ny
}

function triggerGameOver()
{
  if (!session)
  {
    return
  }
  session.gameOver = true
  session.accumulatedTime = TICK_RATE
  playGameSound('gameover')
  if (navigator.vibrate)
  {
    navigator.vibrate(200)
  }
  if (session.score > session.highScore)
  {
    session.highScore = session.score
    localStorage.setItem('snake_highscore', session.highScore.toString())
  }
}

// --- Main loop ---
function loop(now)
{
  if (!session)
  {
    return
  }
  const s = session
  const delta = now - s.lastFrame
  s.lastFrame = now

  if (!s.gameOver)
  {
    s.accumulatedTime += delta
    while (s.accumulatedTime >= TICK_RATE)
    {
      tick()
      s.accumulatedTime -= TICK_RATE
      if (s.gameOver)
      {
        break
      }
    }
  }

  // Pulse / shake decay
  const decay = Math.exp(-delta / HEAD_POP_MS)
  s.headEatPulse *= decay
  s.foodPulse *= decay
  if (s.shakeTime > 0)
  {
    s.shakeTime = Math.max(0, s.shakeTime - delta / 1000)
  }

  draw()
  s.rafId = requestAnimationFrame(loop)
}

// --- Render ---
function draw()
{
  const s = session
  if (!s)
  {
    return
  }
  const ctx = s.ctx
  const theme = getGameTheme()
  const W = s.canvas.width
  const H = s.canvas.height

  ctx.save()

  // Screen shake on eat / game over
  if (s.shakeTime > 0)
  {
    const amp = s.shakeMag * (s.shakeTime / SHAKE_TIME)
    ctx.translate(
      (Math.random() * 2 - 1) * amp,
      (Math.random() * 2 - 1) * amp
    )
  }

  // Background (oversized so shake never exposes edges)
  ctx.fillStyle = theme.surface
  ctx.fillRect(-12, -12, W + 24, H + 24)

  // Progress within the current tick
  const t = s.gameOver ? 1 : Math.min(1, s.accumulatedTime / TICK_RATE)
  const eased = easeOutBack(t)

  // --- Food (pop-in pulse) ---
  const foodScale = 1 + s.foodPulse * 0.45
  const fx = s.food.x * GRID + GRID / 2
  const fy = s.food.y * GRID + GRID / 2
  const fr = (GRID / 2 - 2) * foodScale
  ctx.fillStyle = theme.accent
  ctx.beginPath()
  ctx.arc(fx, fy, fr, 0, Math.PI * 2)
  ctx.fill()

  // --- Snake: tail first so head renders on top ---
  const len = s.snake.length
  for (let i = len - 1; i >= 0; i--)
  {
    const seg = s.snake[i]
    const isHead = i === 0

    // Only interpolate when the segment moved 1 tile (skip wraps)
    const movedX = Math.abs(seg.x - seg.px)
    const movedY = Math.abs(seg.y - seg.py)
    let rx = seg.x
    let ry = seg.y
    if (movedX <= 1 && movedY <= 1)
    {
      rx = lerp(seg.px, seg.x, eased)
      ry = lerp(seg.py, seg.y, eased)
    }

    // Bounce: head scales up briefly when eating.
    const scale = isHead ? 1 + s.headEatPulse * 0.35 : 1
    const size = (GRID - 2) * scale
    const px = rx * GRID + (GRID - size) / 2
    const py = ry * GRID + (GRID - size) / 2

    ctx.fillStyle = isHead ? theme.accent : theme.text
    roundRect(ctx, px, py, size, size, 4)
    ctx.fill()
  }

  ctx.restore()

  // --- HUD (unaffected by shake) ---
  ctx.fillStyle = theme.text
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`PTS ${s.score}`, 12, 28)
  ctx.textAlign = 'right'
  ctx.fillText(`HI ${s.highScore}`, W - 12, 28)

  if (s.gameOver)
  {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 26px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', W / 2, H / 2 - 10)
    ctx.font = 'bold 14px monospace'
    ctx.fillText('Tap Canvas to Restart', W / 2, H / 2 + 20)
  }
}