import {
  createGameOverlay,
  getGameTheme,
  getGameAudioContext,
  playGameSound,
  ensureConfettiLoaded,
  triggerConfetti
} from './extras.js'

const CANVAS_W = 360
const CANVAS_H = 416
const HUD_TOP = 14
const GRID_TOP = 48
const PAD = 16
const CELL = 76
const GAP = 8
const STRIDE = CELL + GAP
const SLIDE_MS = 100

const MERGE_NOTE = {
  4: 261.63, 8: 293.66, 16: 329.63, 32: 392.00, 64: 440.00,
  128: 523.25, 256: 587.33, 512: 659.25, 1024: 783.99, 2048: 880.00
}
const MERGE_NOTE_SUPER = 1046.50

let session = null

// --- helpers ---------------------------------------------------------------

// "#rrggbb" + alpha (0..1) → "#rrggbbaa". Falls through unchanged for
// colors that aren't hex (rgba(), named colors) so this is always safe.
function withAlpha(hex, alpha)
{
  if (!hex || hex[0] !== '#') return hex
  const h = hex.slice(1)
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')
  if (h.length === 6) return '#' + h + a
  if (h.length === 3) return '#' + h[0]+h[0] + h[1]+h[1] + h[2]+h[2] + a
  return hex
}

function persistHighScore()
{
  if (!session) return
  try { localStorage.setItem('2048_highscore', String(session.highScore)) } catch (e) {}
}

function handlePageHide() { persistHighScore() }
function handleVisibility() { if (document.hidden) persistHighScore() }

function fontSizeFor(v)
{
  if (v < 100) return 38
  if (v < 1000) return 32
  if (v < 10000) return 26
  return 22
}

// Repoint --bg / --surface on the overlay so the existing
// `.game-overlay { background: var(--bg) }` rule resolves to the game's
// surface color with no specificity fight. Also set inline `background
// !important` as belt-and-braces. No button CSS is injected — the app's
// stylesheet owns button appearance.
function applyGameTheme(overlay, theme)
{
  const root = overlay.overlay
  const prevBg = root.style.getPropertyValue('--bg')
  const prevSurf = root.style.getPropertyValue('--surface')
  const prevBgProp = root.style.getPropertyValue('background')
  const prevBgPri = root.style.getPropertyPriority('background')

  root.style.setProperty('--bg', theme.surface)
  root.style.setProperty('--surface', theme.surface)
  root.style.setProperty('background', theme.surface, 'important')

  return () =>
  {
    if (prevBg) root.style.setProperty('--bg', prevBg)
    else root.style.removeProperty('--bg')
    if (prevSurf) root.style.setProperty('--surface', prevSurf)
    else root.style.removeProperty('--surface')
    if (prevBgProp) root.style.setProperty('background', prevBgProp, prevBgPri)
    else root.style.removeProperty('background')
  }
}

// Kalimba-style merge note: sine fundamental with a small downward pitch
// bend at start (the "settling into one" feel), 2nd harmonic for body,
// faint 3rd for sparkle. Pentatonic pitch per merge value so chains ring
// musically. Peak ~0.5 gain — audible without being harsh.
function playMergeSound(mergedValue)
{
  try
  {
    const ctx = getGameAudioContext()
    if (!ctx) return
    const t = ctx.currentTime
    const freq = MERGE_NOTE[mergedValue] || MERGE_NOTE_SUPER

    const osc1 = ctx.createOscillator()
    const g1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(freq * 1.03, t)
    osc1.frequency.exponentialRampToValueAtTime(freq, t + 0.07)
    g1.gain.setValueAtTime(0.0001, t)
    g1.gain.exponentialRampToValueAtTime(0.40, t + 0.010)
    g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    osc1.connect(g1)
    g1.connect(ctx.destination)
    osc1.start(t)
    osc1.stop(t + 0.30)

    const osc2 = ctx.createOscillator()
    const g2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(freq * 2, t)
    g2.gain.setValueAtTime(0.0001, t)
    g2.gain.exponentialRampToValueAtTime(0.09, t + 0.005)
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc2.connect(g2)
    g2.connect(ctx.destination)
    osc2.start(t)
    osc2.stop(t + 0.14)

    const osc3 = ctx.createOscillator()
    const g3 = ctx.createGain()
    osc3.type = 'sine'
    osc3.frequency.setValueAtTime(freq * 3, t)
    g3.gain.setValueAtTime(0.0001, t)
    g3.gain.exponentialRampToValueAtTime(0.03, t + 0.004)
    g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    osc3.connect(g3)
    g3.connect(ctx.destination)
    osc3.start(t)
    osc3.stop(t + 0.09)
  }
  catch (e) {}
}

// --- visual tiers ----------------------------------------------------------
//
// The whole game reads off theme.* with no intermediate palette. Tile
// styling escalates in four visual states as values grow. Starter tiles
// are barely-there outlines; high tiles glow; 2048 turns solid with a
// bloom so it truly lands as the milestone.

function getTileStyle(value, theme)
{
  if (value <= 4)
  {
    return {
      bg: 'transparent',
      borderWidth: '1.5px',
      borderColor: theme.border,
      fg: theme.text,
      textShadow: 'none',
      boxShadow: 'none'
    }
  }
  if (value <= 64)
  {
    return {
      bg: 'transparent',
      borderWidth: '2px',
      borderColor: theme.accent,
      fg: theme.text,
      textShadow: `0 0 4px ${withAlpha(theme.accent, 0.45)}`,
      boxShadow: 'none'
    }
  }
  if (value <= 1024)
  {
    return {
      bg: 'transparent',
      borderWidth: '2.5px',
      borderColor: theme.accent,
      fg: theme.accent,
      textShadow: `0 0 8px ${withAlpha(theme.accent, 0.65)}`,
      boxShadow: `0 0 8px ${withAlpha(theme.accent, 0.3)}`
    }
  }
  return {
    bg: theme.accent,
    borderWidth: '2.5px',
    borderColor: theme.accent,
    fg: theme.accentTxt,
    textShadow: 'none',
    boxShadow: `0 0 16px ${withAlpha(theme.accent, 0.6)}, 0 0 4px ${withAlpha(theme.accent, 0.9)}`
  }
}

function applyValue(theme, el, inner, value)
{
  const s = getTileStyle(value, theme)
  el.style.background = s.bg
  el.style.border = `${s.borderWidth} solid ${s.borderColor}`
  el.style.boxShadow = s.boxShadow
  inner.style.color = s.fg
  inner.style.textShadow = s.textShadow
  inner.style.fontSize = `${fontSizeFor(value)}px`
  inner.textContent = value
}

function createTileElement(theme, value)
{
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'absolute',
    left: '0', top: '0',
    width: `${CELL}px`, height: `${CELL}px`,
    borderRadius: '8px',
    boxSizing: 'border-box',
    transition: `transform ${SLIDE_MS}ms ease-out`,
    willChange: 'transform',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  })
  const inner = document.createElement('div')
  Object.assign(inner.style, {
    width: '100%', height: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 'bold',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    transformOrigin: 'center center',
    willChange: 'transform',
    pointerEvents: 'none'
  })
  el.appendChild(inner)
  applyValue(theme, el, inner, value)
  return { el, inner }
}

function inBounds(x, y) { return x >= 0 && x < 4 && y >= 0 && y < 4 }

// --- game lifecycle --------------------------------------------------------

export function start2048Game()
{
  if (session) return
  if (document.activeElement && typeof document.activeElement.blur === 'function')
    document.activeElement.blur()

  try { getGameAudioContext() } catch (e) {}
  ensureConfettiLoaded().catch(() => {})

  const theme = getGameTheme()
  const overlay = createGameOverlay({
    onBack: stop2048Game,
    onReset: reset2048HighScore,
    resetLabel: 'reset'
  })

  const themeCleanup = applyGameTheme(overlay, theme)

  const stage = document.createElement('div')
  Object.assign(stage.style, {
    position: 'relative',
    border: `2px solid ${theme.border}`,
    backgroundColor: theme.surface,
    aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
    width: '94%', height: 'auto', maxHeight: '72vh',
    overflow: 'hidden',
    borderRadius: '12px',
    touchAction: 'none',
    display: 'block', boxSizing: 'border-box',
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

  // Board: bg-colored recess with 12px corners. Cells sit on top at
  // surface color, so they read as cutouts punched back to the stage.
  const gridBg = document.createElement('div')
  Object.assign(gridBg.style, {
    position: 'absolute',
    left: `${PAD}px`, top: `${GRID_TOP}px`,
    width: `${4 * CELL + 3 * GAP}px`,
    height: `${4 * CELL + 3 * GAP}px`,
    background: theme.bg,
    border: `1px solid ${withAlpha(theme.border, 0.35)}`,
    borderRadius: '12px',
    boxSizing: 'border-box',
    overflow: 'hidden'
  })
  viewport.appendChild(gridBg)
  for (let i = 0; i < 16; i++)
  {
    const c = document.createElement('div')
    const x = (i % 4) * STRIDE
    const y = Math.floor(i / 4) * STRIDE
    Object.assign(c.style, {
      position: 'absolute',
      left: `${x}px`, top: `${y}px`,
      width: `${CELL}px`, height: `${CELL}px`,
      background: theme.surface,
      borderRadius: '8px'
    })
    gridBg.appendChild(c)
  }

  const tilesLayer = document.createElement('div')
  Object.assign(tilesLayer.style, {
    position: 'absolute',
    left: `${PAD}px`, top: `${GRID_TOP}px`,
    width: `${4 * CELL + 3 * GAP}px`,
    height: `${4 * CELL + 3 * GAP}px`,
    pointerEvents: 'none'
  })
  viewport.appendChild(tilesLayer)

  const scoreEl = document.createElement('div')
  Object.assign(scoreEl.style, {
    position: 'absolute', left: '12px', top: `${HUD_TOP}px`,
    font: 'bold 16px monospace', lineHeight: '1',
    color: theme.text, pointerEvents: 'none', whiteSpace: 'nowrap'
  })
  viewport.appendChild(scoreEl)

  const hiEl = document.createElement('div')
  Object.assign(hiEl.style, {
    position: 'absolute', right: '12px', top: `${HUD_TOP}px`,
    font: 'bold 16px monospace', lineHeight: '1',
    color: theme.text, pointerEvents: 'none', whiteSpace: 'nowrap'
  })
  viewport.appendChild(hiEl)

  const goEl = document.createElement('div')
  Object.assign(goEl.style, {
    position: 'absolute', inset: '0',
    background: 'rgba(0,0,0,0.55)',
    display: 'none',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '10px', pointerEvents: 'none'
  })
  const goTitle = document.createElement('div')
  Object.assign(goTitle.style, { font: 'bold 26px monospace', color: '#fff', whiteSpace: 'nowrap' })
  const goSub = document.createElement('div')
  Object.assign(goSub.style, { font: 'bold 14px monospace', color: '#fff', whiteSpace: 'nowrap' })
  goEl.append(goTitle, goSub)
  viewport.appendChild(goEl)

  const stored = parseInt(localStorage.getItem('2048_highscore') || '0', 10)
  const highScore = Number.isFinite(stored) && stored > 0 ? stored : 0

  session = {
    overlay, stage, viewport,
    gridBg, tilesLayer,
    theme,
    scoreEl, hiEl, goEl, goTitle, goSub,
    score: 0,
    highScore,
    scoreText: 'SCORE 0',
    hiText: `HI ${highScore}`,
    grid: new Array(16).fill(null),
    tiles: [],
    animating: false,
    gameOver: false,
    won: false,
    applyStageSize: null,
    onViewportChange: null,
    _touchX: 0,
    _touchY: 0,
    _themeCleanup: themeCleanup,
    _resizeRaf: 0
  }

  reset2048Board()

  function applyStageSize()
  {
    if (!stage.isConnected) return
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
      viewport.style.transform =
        `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale.toFixed(5)})`
    }
  }
  session.applyStageSize = applyStageSize

  const onViewportChange = () =>
  {
    if (session && session._resizeRaf) return
    const raf = requestAnimationFrame(() =>
    {
      if (session) session._resizeRaf = 0
      if (session && session.stage === stage) applyStageSize()
    })
    if (session) session._resizeRaf = raf
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

  const onKey = (e) =>
  {
    if (!session || session.gameOver) return
    let dir = null
    if (e.code === 'ArrowLeft' || e.code === 'Numpad4' || e.key === 'a' || e.key === 'A') dir = 'left'
    else if (e.code === 'ArrowRight' || e.code === 'Numpad6' || e.key === 'd' || e.key === 'D') dir = 'right'
    else if (e.code === 'ArrowUp' || e.code === 'Numpad8' || e.key === 'w' || e.key === 'W') dir = 'up'
    else if (e.code === 'ArrowDown' || e.code === 'Numpad2' || e.key === 's' || e.key === 'S') dir = 'down'
    if (!dir) return
    e.preventDefault()
    move(dir)
  }
  window.addEventListener('keydown', onKey)
  session._onKey = onKey

  const onTouchStart = (e) =>
  {
    if (!session) return
    if (e.touches.length !== 1) return
    session._touchX = e.touches[0].clientX
    session._touchY = e.touches[0].clientY
  }
  const onTouchEnd = (e) =>
  {
    if (!session) return
    if (session.gameOver) return
    if (!e.changedTouches || e.changedTouches.length === 0) return
    const dx = e.changedTouches[0].clientX - session._touchX
    const dy = e.changedTouches[0].clientY - session._touchY
    const adx = Math.abs(dx), ady = Math.abs(dy)
    if (Math.max(adx, ady) < 20) return
    move(adx > ady ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
  }
  stage.addEventListener('touchstart', onTouchStart, { passive: true })
  stage.addEventListener('touchend', onTouchEnd, { passive: true })
  session._onTouchStart = onTouchStart
  session._onTouchEnd = onTouchEnd
}

export function stop2048Game()
{
  if (!session) return
  const s = session
  persistHighScore()
  if (s._resizeRaf) cancelAnimationFrame(s._resizeRaf)
  window.removeEventListener('keydown', s._onKey)
  window.removeEventListener('pagehide', handlePageHide)
  window.removeEventListener('visibilitychange', handleVisibility)
  s.stage.removeEventListener('touchstart', s._onTouchStart)
  s.stage.removeEventListener('touchend', s._onTouchEnd)
  if (s.onViewportChange)
  {
    window.removeEventListener('resize', s.onViewportChange)
    window.removeEventListener('orientationchange', s.onViewportChange)
  }
  if (s._themeCleanup) s._themeCleanup()
  s.overlay.remove()
  session = null
}

function reset2048HighScore()
{
  const s = session
  if (!s) return
  s.highScore = 0
  s.hiText = 'HI 0'
  try { localStorage.setItem('2048_highscore', '0') } catch (e) {}
  reset2048Board()
}

function reset2048Board()
{
  const s = session
  if (!s) return
  for (const t of s.tiles) t.el.remove()
  s.tiles.length = 0
  s.grid.fill(null)
  s.score = 0
  s.scoreText = 'SCORE 0'
  s.gameOver = false
  s.won = false
  s.animating = false
  s.goEl.style.display = 'none'
  s.scoreEl.textContent = s.scoreText
  s.hiEl.textContent = s.hiText
  spawnTile()
  spawnTile()
}

function spawnTile()
{
  const s = session
  if (!s) return
  const empty = []
  for (let i = 0; i < 16; i++) if (!s.grid[i]) empty.push(i)
  if (empty.length === 0) return
  const idx = empty[Math.floor(Math.random() * empty.length)]
  const x = idx % 4
  const y = Math.floor(idx / 4)
  const value = Math.random() < 0.9 ? 2 : 4

  const { el, inner } = createTileElement(s.theme, value)
  el.style.transform = `translate3d(${x * STRIDE}px, ${y * STRIDE}px, 0)`
  s.tilesLayer.appendChild(el)

  const tile = { value, x, y, el, inner, justMerged: false }
  s.grid[idx] = tile
  s.tiles.push(tile)

  inner.animate(
    [{ transform: 'scale(0)' }, { transform: 'scale(1)' }],
    { duration: 160, easing: 'ease-out' }
  )
}

function popMergedTile(tile)
{
  tile.inner.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.22)' },
      { transform: 'scale(1)' }
    ],
    { duration: 180, easing: 'ease-out' }
  )
}

function move(dir)
{
  const s = session
  if (!s || s.animating || s.gameOver) return

  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
  const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0

  const cells = []
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++)
      cells.push({ x, y })

  cells.sort((a, b) =>
  {
    if (dx < 0) return a.x - b.x || a.y - b.y
    if (dx > 0) return b.x - a.x || a.y - b.y
    if (dy < 0) return a.y - b.y || a.x - b.x
    if (dy > 0) return b.y - a.y || a.x - b.x
    return 0
  })

  const newGrid = new Array(16).fill(null)
  const moves = []
  let scoreGain = 0
  let maxMerged = 0
  let movedSomething = false

  for (const cell of cells)
  {
    const idx = cell.y * 4 + cell.x
    const tile = s.grid[idx]
    if (!tile) continue

    let nx = cell.x, ny = cell.y
    let checkX = nx + dx, checkY = ny + dy
    while (inBounds(checkX, checkY) && !newGrid[checkY * 4 + checkX])
    {
      nx = checkX
      ny = checkY
      checkX += dx
      checkY += dy
    }

    let merged = false
    if (inBounds(checkX, checkY))
    {
      const neighbor = newGrid[checkY * 4 + checkX]
      if (neighbor && neighbor.value === tile.value && !neighbor.justMerged)
      {
        neighbor.justMerged = true
        moves.push({ tile, tx: checkX, ty: checkY, mergeInto: neighbor })
        scoreGain += tile.value * 2
        if (tile.value * 2 > maxMerged) maxMerged = tile.value * 2
        merged = true
        movedSomething = true
      }
    }

    if (!merged)
    {
      if (nx !== cell.x || ny !== cell.y)
      {
        moves.push({ tile, tx: nx, ty: ny })
        movedSomething = true
      }
      newGrid[ny * 4 + nx] = tile
    }
  }

  if (!movedSomething) return

  s.animating = true
  for (const m of moves)
  {
    m.tile.el.style.transform = `translate3d(${m.tx * STRIDE}px, ${m.ty * STRIDE}px, 0)`
    m.tile.x = m.tx
    m.tile.y = m.ty
  }

  const mySession = s
  setTimeout(() =>
  {
    if (session !== mySession) return
    const s2 = session
    if (!s2) return

    for (const m of moves)
    {
      if (m.mergeInto)
      {
        const t = m.mergeInto
        t.value *= 2
        applyValue(s2.theme, t.el, t.inner, t.value)
        popMergedTile(t)

        if (t.value === 2048 && !s2.won)
        {
          s2.won = true
          triggerConfetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } })
          if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200])
        }

        m.tile.el.remove()
        const ti = s2.tiles.indexOf(m.tile)
        if (ti >= 0) s2.tiles.splice(ti, 1)
      }
    }

    s2.grid = newGrid
    for (const t of s2.tiles) t.justMerged = false

    s2.score += scoreGain
    s2.scoreText = `SCORE ${s2.score}`
    s2.scoreEl.textContent = s2.scoreText

    if (maxMerged > 0) playMergeSound(maxMerged)

    spawnTile()
    s2.animating = false

    if (s2.score > s2.highScore)
    {
      s2.highScore = s2.score
      s2.hiText = `HI ${s2.highScore}`
      s2.hiEl.textContent = s2.hiText
    }

    if (!canMove())
    {
      s2.gameOver = true
      s2.goTitle.textContent = 'GAME OVER'
      s2.goSub.textContent = 'Tap reset to try again'
      s2.goEl.style.display = 'flex'
      playGameSound('gameover')
      if (navigator.vibrate) navigator.vibrate(200)
      persistHighScore()
    }
  }, SLIDE_MS)
}

function canMove()
{
  const s = session
  if (!s) return false
  for (let y = 0; y < 4; y++)
  {
    for (let x = 0; x < 4; x++)
    {
      const t = s.grid[y * 4 + x]
      if (!t) return true
      if (x < 3)
      {
        const r = s.grid[y * 4 + x + 1]
        if (r && r.value === t.value) return true
      }
      if (y < 3)
      {
        const d = s.grid[(y + 1) * 4 + x]
        if (d && d.value === t.value) return true
      }
    }
  }
  return false
}