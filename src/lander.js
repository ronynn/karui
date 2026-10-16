import {
  createGameOverlay,
  getGameTheme,
  getGameAudioContext,
  playGameSound,
  triggerConfetti
} from './extras.js'

const CANVAS_W = 376
const CANVAS_H = 400

const PLATFORM_WIDTH = 65
const PLATFORM_HEIGHT = 6
const MIN_PLATFORM_SPACING = 130
const MIN_PLATFORM_VERTICAL_DIFF = 70
const PLATFORM_Y_MIN = 160
const PLATFORM_Y_MAX = CANVAS_H - 40

const GRAVITY = 0.025
const THRUST_FORCE = 0.065
const ROTATION_SPEED = 0.05
const FUEL_START = 100
const FUEL_BURN = 0.5

const ROCKET_HALF_W = 10
const ROCKET_HALF_H = 16
const ROCKET_OFFSET_Y = 18

const SAFE_ANGLE = 0.35
const SAFE_SPEED = 1.4
const MAX_DRIFT_SPEED = 6

const LANDING_SETTLE_RATE = 0.15
const LANDING_SETTLE_ANGLE = 0.05
const LANDING_SETTLE_SPEED = 0.1

const MAX_THRUST_PARTICLES = 30

let session = null
let thrustSource = null
let thrustGain = null

export function startLanderGame()
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
    onBack: stopLanderGame,
    onReset: resetLanderHighScore,
    resetLabel: 'reset'
  })

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  Object.assign(canvas.style, {
    display: 'block',
    border: `2px solid ${theme.border}`,
    backgroundColor: theme.surface,
    touchAction: 'manipulation',
    aspectRatio: `${CANVAS_W} / ${CANVAS_H}`
  })
  overlay.contentHost.appendChild(canvas)
  const ctx = canvas.getContext('2d', { alpha: false })

  const portraitControls = buildPortraitControls()
  overlay.contentHost.appendChild(portraitControls)

  const landscapeRot = buildLandscapeRotControls()
  overlay.leftSlot.appendChild(landscapeRot)

  const landscapeThrust = buildLandscapeThrustButton()
  overlay.rightSlot.appendChild(landscapeThrust)

  function applyCanvasSize()
  {
    if (overlay.isLandscape())
    {
      canvas.style.width = 'auto'
      canvas.style.height = '100%'
      canvas.style.maxHeight = 'calc(100vh - 20px)'
      canvas.style.maxWidth = '100%'
    }
    else
    {
      canvas.style.width = '100%'
      canvas.style.height = 'auto'
      canvas.style.maxHeight = '52vh'
      canvas.style.maxWidth = '380px'
    }
  }
  applyCanvasSize()

  const highScore = parseInt(localStorage.getItem('lander_highscore') || '0', 10)

  const thrustParticles = []
  for (let i = 0; i < MAX_THRUST_PARTICLES; i++)
  {
    thrustParticles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 })
  }

  session = {
    overlay,
    canvas,
    ctx,
    theme,
    highScore,
    highScoreBeaten: false,
    rocket: { x: 0, y: 0, vx: 0, vy: 0, angle: 0 },
    fuel: FUEL_START,
    score: 0,
    startPlatform: { x: 0, y: 0, width: PLATFORM_WIDTH },
    targetPlatform: { x: 0, y: 0, width: PLATFORM_WIDTH },
    keys: { left: false, right: false, thrust: false },
    gameOver: false,
    landed: false,
    settled: false,
    thrustParticles,
    lastFrame: 0,
    rafId: null,
    applyCanvasSize
  }

  resetLanderLevel(true)

  const handleTap = (e) =>
  {
    if (e) e.preventDefault()
    if (session && (session.gameOver || session.settled))
    {
      triggerContinueOrRestart()
    }
  }
  canvas.addEventListener('mousedown', handleTap)
  canvas.addEventListener('touchstart', handleTap, { passive: false })

  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('resize', applyCanvasSize)
  window.addEventListener('orientationchange', applyCanvasSize)

  session.lastFrame = performance.now()
  session.rafId = requestAnimationFrame(loop)
}

export function stopLanderGame()
{
  if (!session)
  {
    return
  }
  stopThrustSound()
  if (session.rafId)
  {
    cancelAnimationFrame(session.rafId)
  }
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('resize', session.applyCanvasSize)
  window.removeEventListener('orientationchange', session.applyCanvasSize)
  session.overlay.remove()
  session = null
}

function makeHoldBtn(label, width, fontSize, onDown, onUp)
{
  const b = document.createElement('button')
  b.innerText = label
  Object.assign(b.style, {
    padding: '14px',
    fontSize: fontSize || '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
    userSelect: 'none',
    width: width,
    touchAction: 'none'
  })
  const down = (e) => { e.preventDefault(); if (onDown) onDown() }
  const up = (e) => { e.preventDefault(); if (onUp) onUp() }
  b.addEventListener('touchstart', down, { passive: false })
  b.addEventListener('touchend', up, { passive: false })
  b.addEventListener('mousedown', down)
  b.addEventListener('mouseup', up)
  b.addEventListener('mouseleave', up)
  return b
}

function buildPortraitControls()
{
  const host = document.createElement('div')
  host.className = 'portrait-only'
  Object.assign(host.style, {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: '380px',
    marginTop: '12px',
    gap: '8px'
  })

  const rotRow = document.createElement('div')
  Object.assign(rotRow.style, { display: 'flex', gap: '8px' })

  const leftBtn = makeHoldBtn('L', '55px', '18px',
    () => { if (session) session.keys.left = true },
    () => { if (session) session.keys.left = false })

  const rightBtn = makeHoldBtn('R', '55px', '18px',
    () => { if (session) session.keys.right = true },
    () => { if (session) session.keys.right = false })

  rotRow.appendChild(leftBtn)
  rotRow.appendChild(rightBtn)

  const thrustBtn = makeHoldBtn('THRUST', '180px', '18px',
    () =>
    {
      const s = session
      if (!s)
      {
        return
      }
      if (s.gameOver || s.settled)
      {
        triggerContinueOrRestart()
      }
      else
      {
        s.keys.thrust = true
        startThrustSound()
      }
    },
    () =>
    {
      if (session)
      {
        session.keys.thrust = false
      }
      stopThrustSound()
    })

  host.appendChild(rotRow)
  host.appendChild(thrustBtn)
  return host
}

function buildLandscapeRotControls()
{
  const host = document.createElement('div')
  Object.assign(host.style, {
    display: 'flex',
    flexDirection: 'row',
    gap: '8px',
    alignItems: 'center'
  })

  const leftBtn = makeHoldBtn('L', '56px', '20px',
    () => { if (session) session.keys.left = true },
    () => { if (session) session.keys.left = false })

  const rightBtn = makeHoldBtn('R', '56px', '20px',
    () => { if (session) session.keys.right = true },
    () => { if (session) session.keys.right = false })

  host.appendChild(leftBtn)
  host.appendChild(rightBtn)
  return host
}

function buildLandscapeThrustButton()
{
  const thrustBtn = makeHoldBtn('THRUST', '96px', '16px',
    () =>
    {
      const s = session
      if (!s)
      {
        return
      }
      if (s.gameOver || s.settled)
      {
        triggerContinueOrRestart()
      }
      else
      {
        s.keys.thrust = true
        startThrustSound()
      }
    },
    () =>
    {
      if (session)
      {
        session.keys.thrust = false
      }
      stopThrustSound()
    })

  thrustBtn.style.height = '70px'
  thrustBtn.style.padding = '0'
  thrustBtn.style.marginTop = '18px'
  return thrustBtn
}

function handleKeyDown(e)
{
  const s = session
  if (!s)
  {
    return
  }
  getGameAudioContext()

  if (s.gameOver || s.settled)
  {
    if (e.code === 'Space' || e.key === 'w' || e.key === 'ArrowUp')
    {
      e.preventDefault()
      triggerContinueOrRestart()
    }
    return
  }

  if (e.key === 'ArrowLeft' || e.key === 'a')
  {
    s.keys.left = true
  }
  if (e.key === 'ArrowRight' || e.key === 'd')
  {
    s.keys.right = true
  }
  if (e.key === 'ArrowUp' || e.key === 'w' || e.code === 'Space')
  {
    e.preventDefault()
    if (!s.keys.thrust)
    {
      startThrustSound()
    }
    s.keys.thrust = true
  }
}

function handleKeyUp(e)
{
  const s = session
  if (!s)
  {
    return
  }
  if (e.key === 'ArrowLeft' || e.key === 'a')
  {
    s.keys.left = false
  }
  if (e.key === 'ArrowRight' || e.key === 'd')
  {
    s.keys.right = false
  }
  if (e.key === 'ArrowUp' || e.key === 'w' || e.code === 'Space')
  {
    s.keys.thrust = false
    stopThrustSound()
  }
}

function startThrustSound()
{
  const ctx = getGameAudioContext()
  if (!ctx || thrustSource)
  {
    return
  }

  const bufferSize = Math.floor(ctx.sampleRate * 1)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++)
  {
    data[i] = Math.random() * 2 - 1
  }

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(600, ctx.currentTime)

  thrustGain = ctx.createGain()
  thrustGain.gain.setValueAtTime(0.85, ctx.currentTime)

  thrustSource = ctx.createBufferSource()
  thrustSource.buffer = buffer
  thrustSource.loop = true

  thrustSource.connect(filter)
  filter.connect(thrustGain)
  thrustGain.connect(ctx.destination)
  thrustSource.start()
}

function stopThrustSound()
{
  if (!thrustSource)
  {
    return
  }
  const ctx = getGameAudioContext()
  const src = thrustSource
  const gain = thrustGain
  thrustSource = null
  thrustGain = null

  if (ctx && gain)
  {
    gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.05)
  }
  setTimeout(() =>
  {
    try { src.stop() } catch (e) {}
    try { src.disconnect() } catch (e) {}
    if (gain)
    {
      try { gain.disconnect() } catch (e) {}
    }
  }, 60)
}

function generatePlatforms()
{
  const s = session
  const pw = PLATFORM_WIDTH

  const x1 = 10 + Math.floor(Math.random() * (CANVAS_W - pw - 20))
  const y1 = PLATFORM_Y_MIN + Math.floor(Math.random() * (PLATFORM_Y_MAX - PLATFORM_Y_MIN))

  let x2 = 0
  let y2 = 0
  let valid = false
  let attempts = 0
  while (!valid && attempts < 100)
  {
    x2 = 10 + Math.floor(Math.random() * (CANVAS_W - pw - 20))
    y2 = PLATFORM_Y_MIN + Math.floor(Math.random() * (PLATFORM_Y_MAX - PLATFORM_Y_MIN))
    const dx = Math.abs(x1 - x2)
    const dy = Math.abs(y1 - y2)
    if (dx >= MIN_PLATFORM_SPACING || dy >= MIN_PLATFORM_VERTICAL_DIFF)
    {
      valid = true
    }
    attempts++
  }

  s.startPlatform = { x: x1, y: y1, width: pw }
  s.targetPlatform = { x: x2, y: y2, width: pw }
}

function resetLanderHighScore()
{
  const s = session
  if (!s)
  {
    return
  }
  s.highScore = 0
  s.highScoreBeaten = false
  localStorage.setItem('lander_highscore', '0')
  s.score = 0
  resetLanderLevel(false)
}

function resetLanderLevel(resetScore)
{
  const s = session
  if (!s)
  {
    return
  }
  stopThrustSound()
  if (resetScore)
  {
    s.score = 0
  }

  generatePlatforms()

  s.rocket.x = s.startPlatform.x + s.startPlatform.width / 2
  s.rocket.y = s.startPlatform.y - ROCKET_OFFSET_Y
  s.rocket.vx = 0
  s.rocket.vy = 0
  s.rocket.angle = 0

  s.fuel = FUEL_START
  s.gameOver = false
  s.landed = false
  s.settled = false
  s.keys.left = false
  s.keys.right = false
  s.keys.thrust = false
  s.highScoreBeaten = false
  for (let i = 0; i < MAX_THRUST_PARTICLES; i++)
  {
    s.thrustParticles[i].active = false
  }
}

function triggerContinueOrRestart()
{
  const s = session
  if (!s)
  {
    return
  }
  if (s.gameOver)
  {
    s.score = 0
  }
  resetLanderLevel(false)
}

function spawnThrustParticle(x, y, angle)
{
  const s = session
  for (let i = 0; i < MAX_THRUST_PARTICLES; i++)
  {
    const p = s.thrustParticles[i]
    if (!p.active)
    {
      p.active = true
      p.x = x + (Math.random() - 0.5) * 4
      p.y = y + (Math.random() - 0.5) * 4
      p.vx = -Math.sin(angle) * 2 + (Math.random() - 0.5)
      p.vy = Math.cos(angle) * 2 + (Math.random() - 0.5)
      p.life = 1
      return
    }
  }
}

function triggerLanderGameOver()
{
  const s = session
  if (!s || s.gameOver)
  {
    return
  }
  stopThrustSound()
  s.gameOver = true
  playGameSound('hit')
  if (navigator.vibrate)
  {
    navigator.vibrate(200)
  }
  if (s.score > s.highScore)
  {
    s.highScore = s.score
    localStorage.setItem('lander_highscore', s.highScore.toString())
  }
}

function triggerLanderSuccess()
{
  const s = session
  s.score++
  playGameSound('eat')

  const isFirstEver = (s.highScore === 0 && s.score === 1)
  const isNewHigh = (s.score > s.highScore && s.highScore > 0)
  if ((isFirstEver || isNewHigh) && !s.highScoreBeaten)
  {
    triggerConfetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } })
    if (navigator.vibrate)
    {
      navigator.vibrate([100, 50, 100, 50, 200])
    }
    s.highScoreBeaten = true
  }

  if (s.score > s.highScore)
  {
    s.highScore = s.score
    localStorage.setItem('lander_highscore', s.highScore.toString())
  }
}

function update(dt)
{
  const s = session
  if (!s)
  {
    return
  }

  const rocket = s.rocket
  const sp = s.startPlatform
  const tp = s.targetPlatform

  const speed = Math.hypot(rocket.vx, rocket.vy)

  if (s.landed && !s.settled)
  {
    rocket.angle += (0 - rocket.angle) * LANDING_SETTLE_RATE * dt
    rocket.vx *= Math.pow(0.7, dt)
    rocket.vy *= Math.pow(0.7, dt)

    if (Math.abs(rocket.angle) < LANDING_SETTLE_ANGLE && speed < LANDING_SETTLE_SPEED)
    {
      rocket.angle = 0
      rocket.vx = 0
      rocket.vy = 0
      s.settled = true
      triggerLanderSuccess()
    }
    return
  }

  if (s.gameOver || s.settled)
  {
    return
  }

  if (s.keys.left)
  {
    rocket.angle -= ROTATION_SPEED * dt
  }
  if (s.keys.right)
  {
    rocket.angle += ROTATION_SPEED * dt
  }

  rocket.vy += GRAVITY * dt

  if (s.keys.thrust && s.fuel > 0)
  {
    rocket.vx += Math.sin(rocket.angle) * THRUST_FORCE * dt
    rocket.vy -= Math.cos(rocket.angle) * THRUST_FORCE * dt
    s.fuel -= FUEL_BURN * dt
    if (s.fuel <= 0)
    {
      s.fuel = 0
      stopThrustSound()
    }

    if (Math.random() < 0.7)
    {
      const px = rocket.x - Math.sin(rocket.angle) * ROCKET_HALF_H * 0.7
      const py = rocket.y + Math.cos(rocket.angle) * ROCKET_HALF_H * 0.7
      spawnThrustParticle(px, py, rocket.angle)
    }
  }

  if (rocket.vx > MAX_DRIFT_SPEED) rocket.vx = MAX_DRIFT_SPEED
  if (rocket.vx < -MAX_DRIFT_SPEED) rocket.vx = -MAX_DRIFT_SPEED
  if (rocket.vy > MAX_DRIFT_SPEED) rocket.vy = MAX_DRIFT_SPEED
  if (rocket.vy < -MAX_DRIFT_SPEED) rocket.vy = -MAX_DRIFT_SPEED

  rocket.x += rocket.vx * dt
  rocket.y += rocket.vy * dt

  for (let i = 0; i < MAX_THRUST_PARTICLES; i++)
  {
    const p = s.thrustParticles[i]
    if (!p.active)
    {
      continue
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.life -= 0.06 * dt
    if (p.life <= 0)
    {
      p.active = false
    }
  }

  if (
    rocket.x >= sp.x - 5 &&
    rocket.x <= sp.x + sp.width + 5 &&
    rocket.y + ROCKET_HALF_H >= sp.y &&
    rocket.y - ROCKET_HALF_H <= sp.y
  )
  {
    if (speed > SAFE_SPEED)
    {
      triggerLanderGameOver()
      return
    }
    rocket.y = sp.y - ROCKET_OFFSET_Y
    rocket.vy = 0
    rocket.vx *= Math.pow(0.9, dt)
  }

  if (
    rocket.x >= tp.x - 5 &&
    rocket.x <= tp.x + tp.width + 5 &&
    rocket.y + ROCKET_HALF_H >= tp.y &&
    rocket.y - ROCKET_HALF_H <= tp.y
  )
  {
    const safeAngle = Math.abs(rocket.angle) < SAFE_ANGLE
    const safeSpeed = speed < SAFE_SPEED
    if (safeAngle && safeSpeed)
    {
      s.landed = true
      rocket.y = tp.y - ROCKET_OFFSET_Y
      rocket.vy = 0
    }
    else
    {
      triggerLanderGameOver()
    }
    return
  }

  if (
    rocket.x < 0 ||
    rocket.x > CANVAS_W ||
    rocket.y < 0 ||
    rocket.y > CANVAS_H + 20
  )
  {
    triggerLanderGameOver()
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
  const dt = Math.min(deltaMs / 16.667, 2)

  update(dt)
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
  const rocket = s.rocket

  ctx.fillStyle = theme.surface
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.fillStyle = theme.gray
  for (let i = 0; i < 22; i++)
  {
    const sx = (i * 53) % CANVAS_W
    const sy = (i * 97) % (CANVAS_H - 40)
    ctx.fillRect(sx, sy, 1, 1)
  }

  ctx.fillStyle = theme.gray
  ctx.fillRect(s.startPlatform.x, s.startPlatform.y, s.startPlatform.width, PLATFORM_HEIGHT)

  ctx.fillStyle = theme.accent
  ctx.fillRect(s.targetPlatform.x, s.targetPlatform.y, s.targetPlatform.width, PLATFORM_HEIGHT)
  ctx.fillStyle = theme.accentTxt
  for (let i = 0; i < 3; i++)
  {
    ctx.fillRect(s.targetPlatform.x + s.targetPlatform.width / 2 - 12 + i * 10, s.targetPlatform.y + 2, 4, 2)
  }

  for (let i = 0; i < MAX_THRUST_PARTICLES; i++)
  {
    const p = s.thrustParticles[i]
    if (!p.active)
    {
      continue
    }
    ctx.fillStyle = `rgba(255, 200, 100, ${p.life})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2.5 * p.life + 0.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.save()
  ctx.translate(rocket.x, rocket.y)
  ctx.rotate(rocket.angle)

  if (s.keys.thrust && s.fuel > 0 && !s.gameOver && !s.settled)
  {
    ctx.fillStyle = theme.accent
    ctx.beginPath()
    ctx.moveTo(-6, 12)
    ctx.lineTo(6, 12)
    ctx.lineTo(0, 12 + Math.random() * 10 + 6)
    ctx.closePath()
    ctx.fill()
  }

  ctx.fillStyle = theme.text
  ctx.beginPath()
  ctx.moveTo(0, -16)
  ctx.lineTo(ROCKET_HALF_W, 12)
  ctx.lineTo(-ROCKET_HALF_W, 12)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = theme.accentTxt
  ctx.beginPath()
  ctx.arc(0, -6, 2.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()

  ctx.fillStyle = theme.text
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`PTS ${s.score}`, 12, 26)
  ctx.textAlign = 'right'
  ctx.fillText(`HI ${s.highScore}`, CANVAS_W - 12, 26)

  const barW = 70
  const barH = 6
  const sx = 12
  let sy = CANVAS_H - 42

  ctx.font = 'bold 10px monospace'
  ctx.textAlign = 'left'

  ctx.fillStyle = theme.text
  ctx.fillText('FUEL', sx, sy)
  ctx.fillStyle = '#cc241d'
  ctx.fillRect(sx + 40, sy - 7, barW, barH)
  ctx.fillStyle = theme.accent
  ctx.fillRect(sx + 40, sy - 7, barW * Math.max(0, s.fuel / FUEL_START), barH)

  const tiltY = sy + 14
  ctx.fillStyle = theme.text
  ctx.fillText('TILT', sx, tiltY)
  ctx.fillStyle = theme.border
  ctx.fillRect(sx + 40, tiltY - 7, barW, barH)

  const clampedAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rocket.angle))
  const tiltNorm = (clampedAngle + Math.PI / 2) / Math.PI
  const tiltX = sx + 40 + tiltNorm * barW

  ctx.fillStyle = theme.text
  ctx.fillRect(sx + 40 + barW / 2 - 1, tiltY - 8, 2, barH + 2)
  ctx.fillStyle = theme.accent
  ctx.fillRect(tiltX - 2, tiltY - 8, 4, barH + 2)

  const speedY = tiltY + 14
  const curSpeed = Math.hypot(rocket.vx, rocket.vy)
  const speedPct = Math.min(curSpeed / 2.0, 1)
  ctx.fillStyle = theme.text
  ctx.fillText('SPD', sx, speedY)
  ctx.fillStyle = theme.border
  ctx.fillRect(sx + 40, speedY - 7, barW, barH)
  ctx.fillStyle = curSpeed > SAFE_SPEED ? '#fb4934' : theme.accent
  let fillW = barW * speedPct
  if (curSpeed > 0.01 && fillW < 2)
  {
    fillW = 2
  }
  ctx.fillRect(sx + 40, speedY - 7, fillW, barH)

  if (s.gameOver || s.settled)
  {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 26px monospace'
    ctx.textAlign = 'center'
    if (s.settled)
    {
      ctx.fillText('SUCCESSFUL LANDING!', CANVAS_W / 2, CANVAS_H / 2 - 10)
      ctx.font = 'bold 14px monospace'
      ctx.fillText('Tap Canvas or Thrust to Continue', CANVAS_W / 2, CANVAS_H / 2 + 20)
    }
    else
    {
      ctx.fillText('CRASHED!', CANVAS_W / 2, CANVAS_H / 2 - 10)
      ctx.font = 'bold 14px monospace'
      ctx.fillText('Tap Canvas or Thrust to Restart', CANVAS_W / 2, CANVAS_H / 2 + 20)
    }
  }
}