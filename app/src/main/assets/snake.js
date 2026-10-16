import {
  createGameOverlay,
  getGameTheme,
  playGameSound,
  triggerConfetti
} from './extras.js'

const GRID = 16
const TILES = 20
const TICK_RATE = 110
const BOARD_PX = GRID * TILES
const HEAD_POP_MS = 150
const SHAKE_TIME = 0.18

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

let session = null

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
    display: 'block',
    aspectRatio: '1 / 1',
    border: `2px solid ${theme.border}`,
    backgroundColor: theme.surface
  })
  overlay.contentHost.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  const portraitControls = buildPortraitControls()
  overlay.contentHost.appendChild(portraitControls)

  const landscapeControls = buildLandscapeControls()
  overlay.leftSlot.appendChild(landscapeControls)

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
      canvas.style.width = '100%'
      canvas.style.height = 'auto'
      canvas.style.maxHeight = ''
      canvas.style.maxWidth = 'min(380px, 58vh)'
    }
  }
  applyCanvasSize()

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
    shakeMag: 3,
    applyCanvasSize
  }

  resetSnakeGame()

  window.addEventListener('keydown', handleInput)
  window.addEventListener('resize', applyCanvasSize)
  window.addEventListener('orientationchange', applyCanvasSize)

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
  window.removeEventListener('resize', session.applyCanvasSize)
  window.removeEventListener('orientationchange', session.applyCanvasSize)
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

function setDir(dx, dy)
{
  if (!session || session.gameOver) return
  if (dx !== 0 && session.dir.x !== 0) return
  if (dy !== 0 && session.dir.y !== 0) return
  session.nextDir = { x: dx, y: dy }
}

function buildPortraitControls()
{
  const host = document.createElement('div')
  host.className = 'portrait-only'
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

  host.appendChild(mk('W', '1 / 2 / 2 / 3', () => setDir(0, -1)))
  host.appendChild(mk('A', '2 / 1 / 3 / 2', () => setDir(-1, 0)))
  host.appendChild(mk('S', '2 / 2 / 3 / 3', () => setDir(0, 1)))
  host.appendChild(mk('D', '2 / 3 / 3 / 4', () => setDir(1, 0)))

  return host
}

function buildLandscapeControls()
{
  const host = document.createElement('div')
  Object.assign(host.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 56px)',
    gridTemplateRows: 'repeat(2, 56px)',
    gap: '6px'
  })

  const mk = (label, col, row, fn) =>
  {
    const b = document.createElement('button')
    b.innerText = label
    Object.assign(b.style, {
      gridColumn: `${col} / ${col + 1}`,
      gridRow: `${row} / ${row + 1}`,
      padding: '0',
      fontSize: '22px',
      fontWeight: 'bold',
      cursor: 'pointer',
      userSelect: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    })
    b.onclick = (e) =>
    {
      e.preventDefault()
      fn()
    }
    return b
  }

  host.appendChild(mk('W', 2, 1, () => setDir(0, -1)))
  host.appendChild(mk('A', 1, 2, () => setDir(-1, 0)))
  host.appendChild(mk('S', 2, 2, () => setDir(0, 1)))
  host.appendChild(mk('D', 3, 2, () => setDir(1, 0)))

  return host
}

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

  for (let i = 1; i < s.snake.length - 1; i++)
  {
    if (s.snake[i].x === nx && s.snake[i].y === ny)
    {
      triggerGameOver()
      return
    }
  }

  for (let i = 0; i < s.snake.length; i++)
  {
    s.snake[i].px = s.snake[i].x
    s.snake[i].py = s.snake[i].y
  }

  const eating = nx === s.food.x && ny === s.food.y

  if (eating)
  {
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

  for (let i = s.snake.length - 1; i >= 1; i--)
  {
    s.snake[i].x = s.snake[i - 1].x
    s.snake[i].y = s.snake[i - 1].y
  }

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

  if (s.shakeTime > 0)
  {
    const amp = s.shakeMag * (s.shakeTime / SHAKE_TIME)
    ctx.translate(
      (Math.random() * 2 - 1) * amp,
      (Math.random() * 2 - 1) * amp
    )
  }

  ctx.fillStyle = theme.surface
  ctx.fillRect(-12, -12, W + 24, H + 24)

  const t = s.gameOver ? 1 : Math.min(1, s.accumulatedTime / TICK_RATE)
  const eased = easeOutBack(t)

  const foodScale = 1 + s.foodPulse * 0.45
  const fx = s.food.x * GRID + GRID / 2
  const fy = s.food.y * GRID + GRID / 2
  const fr = (GRID / 2 - 2) * foodScale
  ctx.fillStyle = theme.accent
  ctx.beginPath()
  ctx.arc(fx, fy, fr, 0, Math.PI * 2)
  ctx.fill()

  const len = s.snake.length
  for (let i = len - 1; i >= 0; i--)
  {
    const seg = s.snake[i]
    const isHead = i === 0

    const movedX = Math.abs(seg.x - seg.px)
    const movedY = Math.abs(seg.y - seg.py)
    let rx = seg.x
    let ry = seg.y
    if (movedX <= 1 && movedY <= 1)
    {
      rx = lerp(seg.px, seg.x, eased)
      ry = lerp(seg.py, seg.y, eased)
    }

    const scale = isHead ? 1 + s.headEatPulse * 0.35 : 1
    const size = (GRID - 2) * scale
    const px = rx * GRID + (GRID - size) / 2
    const py = ry * GRID + (GRID - size) / 2

    ctx.fillStyle = isHead ? theme.accent : theme.text
    roundRect(ctx, px, py, size, size, 4)
    ctx.fill()
  }

  ctx.restore()

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