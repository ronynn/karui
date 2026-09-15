let landerConfettiLoaded = false

function ensureLanderConfettiLoaded(callback)
{
  if (typeof confetti === 'function')
  {
    if (callback) callback()
    return
  }

  let existingScript = document.querySelector('script[src="confetti.browser.min.js"]')
  if (!existingScript)
  {
    let scriptTag = document.createElement('script')
    scriptTag.src = 'confetti.browser.min.js'
    scriptTag.onload = () => {
      landerConfettiLoaded = true
      if (callback) callback()
    }
    scriptTag.onerror = () => {
      console.error('Failed to load confetti.browser.min.js from repository root.')
    }
    document.head.appendChild(scriptTag)
  }
  else
  {
    existingScript.addEventListener('load', () => {
      landerConfettiLoaded = true
      if (callback) callback()
    })
  }
}

function triggerLanderConfetti()
{
  ensureLanderConfettiLoaded(() => {
    if (typeof confetti === 'function')
    {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        zIndex: 100000
      })
    }
  })
}

let landerAudioCtx = null
let thrustSourceNode = null
let thrustGainNode = null

function getLanderAudioContext()
{
  if (!landerAudioCtx)
  {
    let AudioCtxClass = window.AudioContext || window.webkitAudioContext
    if (AudioCtxClass)
    {
      landerAudioCtx = new AudioCtxClass()
    }
  }
  if (landerAudioCtx && landerAudioCtx.state === 'suspended')
  {
    landerAudioCtx.resume()
  }
  return landerAudioCtx
}

// Section: Audio Processing

function startThrustSound()
{
  let ctx = getLanderAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended')
  {
    ctx.resume()
  }
  if (thrustSourceNode) return

  let bufferSize = ctx.sampleRate * 1
  let buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  let data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++)
  {
    data[i] = Math.random() * 2 - 1
  }

  thrustSourceNode = ctx.createBufferSource()
  thrustSourceNode.buffer = buffer
  thrustSourceNode.loop = true

  let filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(600, ctx.currentTime)

  thrustGainNode = ctx.createGain()
  thrustGainNode.gain.setValueAtTime(0.85, ctx.currentTime)

  thrustSourceNode.connect(filter)
  filter.connect(thrustGainNode)
  thrustGainNode.connect(ctx.destination)

  thrustSourceNode.start()
}

function stopThrustSound()
{
  if (thrustGainNode && landerAudioCtx)
  {
    thrustGainNode.gain.linearRampToValueAtTime(0.001, landerAudioCtx.currentTime + 0.05)
    setTimeout(() => {
      if (thrustSourceNode)
      {
        try { thrustSourceNode.stop() } catch (e) {}
        thrustSourceNode.disconnect()
        thrustSourceNode = null
        thrustGainNode = null
      }
    }, 50)
  }
}

function playLanderSound(type)
{
  let ctx = getLanderAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended')
  {
    ctx.resume()
  }

  let nowTime = ctx.currentTime

  if (type === 'land')
  {
    let osc1 = ctx.createOscillator()
    let gain1 = ctx.createGain()
    osc1.type = 'square'
    osc1.frequency.setValueAtTime(600, nowTime)
    osc1.frequency.exponentialRampToValueAtTime(100, nowTime + 0.15)
    gain1.gain.setValueAtTime(0.3, nowTime)
    gain1.gain.exponentialRampToValueAtTime(0.001, nowTime + 0.2)

    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(nowTime)
    osc1.stop(nowTime + 0.2)

    let osc2 = ctx.createOscillator()
    let gain2 = ctx.createGain()
    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(1800, nowTime)
    osc2.frequency.exponentialRampToValueAtTime(400, nowTime + 0.25)
    gain2.gain.setValueAtTime(0.25, nowTime)
    gain2.gain.exponentialRampToValueAtTime(0.001, nowTime + 0.25)

    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(nowTime)
    osc2.stop(nowTime + 0.25)
  }
  else if (type === 'crash')
  {
    let oscNode = ctx.createOscillator()
    let gainNode = ctx.createGain()
    oscNode.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscNode.type = 'sawtooth'
    oscNode.frequency.setValueAtTime(150, nowTime)
    oscNode.frequency.exponentialRampToValueAtTime(30, nowTime + 0.4)
    
    gainNode.gain.setValueAtTime(0.4, nowTime)
    gainNode.gain.linearRampToValueAtTime(0.01, nowTime + 0.4)
    
    oscNode.start(nowTime)
    oscNode.stop(nowTime + 0.4)
  }
}

function getLanderThemeColor(varName, fallback)
{
  let target = document.body || document.documentElement
  let val = getComputedStyle(target).getPropertyValue(varName).trim()
  return val ? val : fallback
}

function getLanderGameTheme()
{
  return {
    bg: getLanderThemeColor('--bg', '#1d2021'),
    surface: getLanderThemeColor('--surface', '#282828'),
    border: getLanderThemeColor('--border', '#3c3836'),
    text: getLanderThemeColor('--text', '#fbf1c7'),
    accent: getLanderThemeColor('--accent', '#fe8019'),
    accentTxt: getLanderThemeColor('--accent-txt', '#282828'),
    gray: getLanderThemeColor('--gray', '#928374')
  }
}

let landerOverlay = null
let landerCanvas = null
let landerCtx = null
let landerAnimFrameId = null

let landerRocket = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 }
let landerFuel = 100
let landerScore = 0
let landerHighScore = parseInt(localStorage.getItem('lander_highscore') || '0', 10)

let landerStartPlatform = { x: 0, y: 0, width: 65 }
let landerTargetPlatform = { x: 0, y: 0, width: 65 }

let landerKeys = { left: false, right: false, thrust: false }
let landerGameOver = false
let landerLanded = false
let landerSettled = false
let landerHighScoreBeaten = false

let landerLastFrameTime = 0

function startLanderGame()
{
  if (landerOverlay) return
  
  if (document.activeElement && typeof document.activeElement.blur === 'function')
  {
    document.activeElement.blur()
  }

  ensureLanderConfettiLoaded()
  landerHighScore = parseInt(localStorage.getItem('lander_highscore') || '0', 10)
  landerHighScoreBeaten = false
  
  createLanderUI()
  resetLanderLevel(true)
  
  window.addEventListener('keydown', handleLanderKeyDown)
  window.addEventListener('keyup', handleLanderKeyUp)
  
  landerLastFrameTime = performance.now()
  landerAnimFrameId = requestAnimationFrame(landerGameLoop)
}

function stopLanderGame()
{
  if (!landerOverlay) return
  
  stopThrustSound()
  if (landerAnimFrameId)
  {
    cancelAnimationFrame(landerAnimFrameId)
    landerAnimFrameId = null
  }
  
  window.removeEventListener('keydown', handleLanderKeyDown)
  window.removeEventListener('keyup', handleLanderKeyUp)
  document.body.removeChild(landerOverlay)
  
  landerOverlay = null
  landerCanvas = null
  landerCtx = null
}

function resetLanderHighScore()
{
  landerHighScore = 0
  localStorage.setItem('lander_highscore', '0')
  landerHighScoreBeaten = false
  landerScore = 0
  resetLanderLevel(false)
}

function triggerContinueOrRestart()
{
  if (landerGameOver || landerLanded)
  {
    if (landerGameOver) landerScore = 0
    resetLanderLevel(false)
  }
}

// Section: UI Initialization

function createLanderUI()
{
  let theme = getLanderGameTheme()

  landerOverlay = document.createElement('div')
  landerOverlay.style.position = 'fixed'
  landerOverlay.style.top = '0'
  landerOverlay.style.left = '0'
  landerOverlay.style.width = '100vw'
  landerOverlay.style.height = '100vh'
  landerOverlay.style.backgroundColor = theme.bg
  landerOverlay.style.zIndex = '99999'
  landerOverlay.style.display = 'flex'
  landerOverlay.style.flexDirection = 'column'
  landerOverlay.style.alignItems = 'center'
  landerOverlay.style.justifyContent = 'flex-start'
  landerOverlay.style.paddingTop = 'calc(52px + env(safe-area-inset-top, 0px))'
  landerOverlay.style.paddingLeft = '8px'
  landerOverlay.style.paddingRight = '8px'
  landerOverlay.style.paddingBottom = '8px'
  landerOverlay.style.boxSizing = 'border-box'
  landerOverlay.style.fontWeight = 'bold'

  let topBar = document.createElement('div')
  topBar.style.display = 'flex'
  topBar.style.alignItems = 'center'
  topBar.style.justifyContent = 'space-between'
  topBar.style.width = '100%'
  topBar.style.maxWidth = '380px'
  topBar.style.marginTop = '4px'
  topBar.style.marginBottom = '12px'

  let backBtn = document.createElement('button')
  backBtn.innerText = 'back'
  backBtn.style.padding = '10px 28px'
  backBtn.style.fontSize = '18px'
  backBtn.style.fontWeight = 'bold'
  backBtn.style.width = 'auto'
  backBtn.style.minWidth = '110px'
  backBtn.style.cursor = 'pointer'
  backBtn.onclick = stopLanderGame

  let resetBtn = document.createElement('button')
  resetBtn.innerText = 'reset'
  resetBtn.style.padding = '10px 28px'
  resetBtn.style.fontSize = '18px'
  resetBtn.style.fontWeight = 'bold'
  resetBtn.style.width = 'auto'
  resetBtn.style.minWidth = '110px'
  resetBtn.style.cursor = 'pointer'
  resetBtn.onclick = resetLanderHighScore

  topBar.appendChild(backBtn)
  topBar.appendChild(resetBtn)

  landerCanvas = document.createElement('canvas')
  landerCanvas.width = 376
  landerCanvas.height = 400
  landerCanvas.style.width = '100%'
  landerCanvas.style.maxWidth = '380px'
  landerCanvas.style.maxHeight = '52vh'
  landerCanvas.style.border = `2px solid ${theme.border}`
  landerCanvas.style.backgroundColor = theme.surface

  landerCtx = landerCanvas.getContext('2d')

  let controlsContainer = document.createElement('div')
  controlsContainer.style.display = 'flex'
  controlsContainer.style.justifyContent = 'space-between'
  controlsContainer.style.width = '100%'
  controlsContainer.style.maxWidth = '380px'
  controlsContainer.style.marginTop = '12px'
  controlsContainer.style.gap = '8px'

  let rotContainer = document.createElement('div')
  rotContainer.style.display = 'flex'
  rotContainer.style.gap = '8px'

  function makeBtn(label, width, onStart, onEnd)
  {
    let btn = document.createElement('button')
    btn.innerText = label
    btn.style.padding = '14px'
    btn.style.fontSize = '18px'
    btn.style.fontWeight = 'bold'
    btn.style.cursor = 'pointer'
    btn.style.userSelect = 'none'
    btn.style.width = width
    
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); onStart() }, { passive: false })
    btn.addEventListener('touchend', (e) => { e.preventDefault(); onEnd() }, { passive: false })
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); onStart() })
    btn.addEventListener('mouseup', (e) => { e.preventDefault(); onEnd() })
    btn.addEventListener('mouseleave', (e) => { e.preventDefault(); onEnd() })
    
    return btn
  }

  let leftBtn = makeBtn('L', '55px', () => { landerKeys.left = true }, () => { landerKeys.left = false })
  let rightBtn = makeBtn('R', '55px', () => { landerKeys.right = true }, () => { landerKeys.right = false })
  
  rotContainer.appendChild(leftBtn)
  rotContainer.appendChild(rightBtn)

  let thrustBtn = makeBtn('THRUST', '180px', () => { 
    if (landerGameOver || landerLanded)
    {
      triggerContinueOrRestart()
    }
    else
    {
      landerKeys.thrust = true
      startThrustSound()
    }
  }, () => { 
    landerKeys.thrust = false
    stopThrustSound()
  })

  controlsContainer.appendChild(rotContainer)
  controlsContainer.appendChild(thrustBtn)

  landerOverlay.appendChild(topBar)
  landerOverlay.appendChild(landerCanvas)
  landerOverlay.appendChild(controlsContainer)

  document.body.appendChild(landerOverlay)

  landerCanvas.addEventListener('click', triggerContinueOrRestart)
}

function generatePlatforms()
{
  let pWidth = 65
  let minSpacing = 130
  
  let yMin = 160
  let yMax = landerCanvas.height - 40
  
  let x1 = Math.floor(Math.random() * (landerCanvas.width - pWidth - 20)) + 10
  let y1 = Math.floor(Math.random() * (yMax - yMin)) + yMin
  
  let x2 = 0
  let y2 = 0
  
  let valid = false
  while (!valid)
  {
    x2 = Math.floor(Math.random() * (landerCanvas.width - pWidth - 20)) + 10
    y2 = Math.floor(Math.random() * (yMax - yMin)) + yMin
    
    let dx = Math.abs(x1 - x2)
    let dy = Math.abs(y1 - y2)
    
    if (dx >= minSpacing || dy >= 70)
    {
      valid = true
    }
  }

  landerStartPlatform = { x: x1, y: y1, width: pWidth }
  landerTargetPlatform = { x: x2, y: y2, width: pWidth }
}

function resetLanderLevel(resetScore)
{
  stopThrustSound()
  if (resetScore) landerScore = 0
  
  generatePlatforms()
  
  landerRocket.x = landerStartPlatform.x + landerStartPlatform.width / 2
  landerRocket.y = landerStartPlatform.y - 18
  landerRocket.vx = 0
  landerRocket.vy = 0
  landerRocket.angle = 0
  
  landerFuel = 100
  landerGameOver = false
  landerLanded = false
  landerSettled = false
  landerHighScoreBeaten = false
}

function handleLanderKeyDown(e)
{
  getLanderAudioContext()

  if (landerGameOver || landerLanded)
  {
    if (e.code === 'Space' || e.key === 'w' || e.key === 'ArrowUp')
    {
      triggerContinueOrRestart()
    }
    return
  }

  if (e.key === 'ArrowLeft' || e.key === 'a') landerKeys.left = true
  if (e.key === 'ArrowRight' || e.key === 'd') landerKeys.right = true
  if (e.key === 'ArrowUp' || e.key === 'w' || e.code === 'Space')
  {
    if (!landerKeys.thrust) startThrustSound()
    landerKeys.thrust = true
  }
}

function handleLanderKeyUp(e)
{
  if (e.key === 'ArrowLeft' || e.key === 'a') landerKeys.left = false
  if (e.key === 'ArrowRight' || e.key === 'd') landerKeys.right = false
  if (e.key === 'ArrowUp' || e.key === 'w' || e.code === 'Space')
  {
    landerKeys.thrust = false
    stopThrustSound()
  }
}

// Section: Game Loop & Dynamics

function updateLanderGame(deltaFactor)
{
  let sp = landerStartPlatform
  let tp = landerTargetPlatform
  let speed = Math.sqrt(landerRocket.vx * landerRocket.vx + landerRocket.vy * landerRocket.vy)

  let onStartPlat = (
    landerRocket.x >= sp.x - 5 && 
    landerRocket.x <= sp.x + sp.width + 5 &&
    Math.abs(landerRocket.y - (sp.y - 18)) < 2
  )

  let onTargetPlat = (
    landerRocket.x >= tp.x - 5 && 
    landerRocket.x <= tp.x + tp.width + 5 &&
    Math.abs(landerRocket.y - (tp.y - 18)) < 2
  )

  let isGrounded = (onStartPlat || onTargetPlat) && speed < 0.05

  if (landerLanded && !landerSettled)
  {
    landerRocket.angle += (0 - landerRocket.angle) * 0.15 * deltaFactor
    landerRocket.vx *= 0.7
    landerRocket.vy *= 0.7

    if (Math.abs(landerRocket.angle) < 0.05 && speed < 0.1)
    {
      landerRocket.angle = 0
      landerRocket.vx = 0
      landerRocket.vy = 0
      landerSettled = true
      playLanderSound('land')
      triggerLanderSuccess()
    }
    return
  }

  if (landerGameOver || landerSettled) return

  if (!isGrounded)
  {
    if (landerKeys.left) landerRocket.angle -= 0.05 * deltaFactor
    if (landerKeys.right) landerRocket.angle += 0.05 * deltaFactor
  }

  landerRocket.vy += 0.025 * deltaFactor

  if (landerKeys.thrust && landerFuel > 0)
  {
    let force = 0.065
    landerRocket.vx += Math.sin(landerRocket.angle) * force * deltaFactor
    landerRocket.vy -= Math.cos(landerRocket.angle) * force * deltaFactor
    landerFuel -= 0.5 * deltaFactor
    if (landerFuel <= 0)
    {
      landerFuel = 0
      stopThrustSound()
    }
  }

  landerRocket.x += landerRocket.vx * deltaFactor
  landerRocket.y += landerRocket.vy * deltaFactor

  if (
    landerRocket.x >= sp.x - 5 && 
    landerRocket.x <= sp.x + sp.width + 5 &&
    landerRocket.y >= sp.y - 18 && 
    landerRocket.y <= sp.y
  )
  {
    if (speed > 1.4)
    {
      triggerLanderGameOver()
      return
    }
    landerRocket.y = sp.y - 18
    landerRocket.vy = 0
    landerRocket.vx *= 0.9
  }

  if (
    landerRocket.x >= tp.x - 5 && 
    landerRocket.x <= tp.x + tp.width + 5 &&
    landerRocket.y >= tp.y - 18 && 
    landerRocket.y <= tp.y
  )
  {
    let safeAngle = Math.abs(landerRocket.angle) < 0.35
    let safeSpeed = speed < 1.4

    if (safeAngle && safeSpeed)
    {
      landerLanded = true
      landerRocket.y = tp.y - 18
    }
    else
    {
      triggerLanderGameOver()
    }
    return
  }

  if (landerRocket.x < 0 || landerRocket.x > landerCanvas.width || landerRocket.y < 0 || landerRocket.y >= landerCanvas.height - 10)
  {
    triggerLanderGameOver()
  }
}

function triggerLanderSuccess()
{
  landerScore++

  let isFirstScoreEver = (landerHighScore === 0 && landerScore === 1)
  let isNewHighScore = (landerScore > landerHighScore && landerHighScore > 0)

  if (isFirstScoreEver || isNewHighScore)
  {
    if (!landerHighScoreBeaten)
    {
      triggerLanderConfetti()
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200])
      landerHighScoreBeaten = true
    }
  }

  if (landerScore > landerHighScore)
  {
    landerHighScore = landerScore
    localStorage.setItem('lander_highscore', landerHighScore.toString())
  }
}

function triggerLanderGameOver()
{
  if (landerGameOver) return
  stopThrustSound()
  landerGameOver = true
  playLanderSound('crash')
  if (navigator.vibrate) navigator.vibrate(200)
}

function landerGameLoop(now)
{
  if (!landerOverlay) return

  let delta = now - landerLastFrameTime
  landerLastFrameTime = now
  
  let deltaFactor = Math.min(delta / 16.667, 2)

  updateLanderGame(deltaFactor)
  
  let theme = getLanderGameTheme()
  drawLanderGame(theme)

  landerAnimFrameId = requestAnimationFrame(landerGameLoop)
}

// Section: Rendering

function drawLanderGame(theme)
{
  landerCtx.fillStyle = theme.surface
  landerCtx.fillRect(0, 0, landerCanvas.width, landerCanvas.height)

  landerCtx.fillStyle = theme.gray
  landerCtx.fillRect(landerStartPlatform.x, landerStartPlatform.y, landerStartPlatform.width, 6)

  landerCtx.fillStyle = theme.accent
  landerCtx.fillRect(landerTargetPlatform.x, landerTargetPlatform.y, landerTargetPlatform.width, 6)

  landerCtx.save()
  landerCtx.translate(landerRocket.x, landerRocket.y)
  landerCtx.rotate(landerRocket.angle)

  if (landerKeys.thrust && landerFuel > 0 && !landerGameOver && !landerSettled)
  {
    landerCtx.fillStyle = theme.accent
    landerCtx.beginPath()
    landerCtx.moveTo(-6, 12)
    landerCtx.lineTo(6, 12)
    landerCtx.lineTo(0, 12 + Math.random() * 10 + 6)
    landerCtx.closePath()
    landerCtx.fill()
  }

  landerCtx.fillStyle = theme.text
  landerCtx.beginPath()
  landerCtx.moveTo(0, -16)
  landerCtx.lineTo(10, 12)
  landerCtx.lineTo(-10, 12)
  landerCtx.closePath()
  landerCtx.fill()

  landerCtx.restore()

  landerCtx.fillStyle = theme.text
  landerCtx.font = 'bold 16px monospace'
  landerCtx.textAlign = 'left'
  landerCtx.fillText(`PTS ${landerScore}`, 12, 28)

  landerCtx.textAlign = 'right'
  landerCtx.fillText(`HI ${landerHighScore}`, landerCanvas.width - 12, 28)

  let barWidth = 70
  let barHeight = 6
  let startX = 12
  let startY = landerCanvas.height - 42

  landerCtx.fillStyle = theme.text
  landerCtx.font = 'bold 10px monospace'
  landerCtx.textAlign = 'left'

  landerCtx.fillText('FUEL', startX, startY)
  landerCtx.fillStyle = '#cc241d'
  landerCtx.fillRect(startX + 40, startY - 7, barWidth, barHeight)
  landerCtx.fillStyle = theme.accent
  let currentFuelPct = Math.max(0, Math.min(100, landerFuel)) / 100
  landerCtx.fillRect(startX + 40, startY - 7, barWidth * currentFuelPct, barHeight)

  let tiltY = startY + 14
  landerCtx.fillStyle = theme.text
  landerCtx.fillText('TILT', startX, tiltY)
  landerCtx.fillStyle = theme.border
  landerCtx.fillRect(startX + 40, tiltY - 7, barWidth, barHeight)
  
  let clampedAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, landerRocket.angle))
  let tiltNormalized = (clampedAngle + Math.PI / 2) / Math.PI
  let indicatorPos = (startX + 40) + tiltNormalized * barWidth
  
  landerCtx.fillStyle = theme.text
  landerCtx.fillRect((startX + 40) + barWidth / 2 - 1, tiltY - 8, 2, barHeight + 2)
  landerCtx.fillStyle = theme.accent
  landerCtx.fillRect(indicatorPos - 2, tiltY - 8, 4, barHeight + 2)

  let speedY = tiltY + 14
  let currentSpeed = Math.sqrt(landerRocket.vx * landerRocket.vx + landerRocket.vy * landerRocket.vy)
  let maxSpeedScale = 2.0
  let speedPct = Math.min(currentSpeed / maxSpeedScale, 1.0)
  
  landerCtx.fillStyle = theme.text
  landerCtx.fillText('SPD', startX, speedY)
  landerCtx.fillStyle = theme.border
  landerCtx.fillRect(startX + 40, speedY - 7, barWidth, barHeight)
  landerCtx.fillStyle = currentSpeed > 0.4 ? '#fb4934' : theme.accent
  
  let fillWidth = barWidth * speedPct
  if (currentSpeed > 0.01 && fillWidth < 2)
  {
    fillWidth = 2
  }
  landerCtx.fillRect(startX + 40, speedY - 7, fillWidth, barHeight)

  if (landerGameOver || landerSettled)
  {
    landerCtx.fillStyle = 'rgba(0,0,0,0.5)'
    landerCtx.fillRect(0, 0, landerCanvas.width, landerCanvas.height)

    landerCtx.fillStyle = '#fff'
    landerCtx.font = 'bold 26px monospace'
    landerCtx.textAlign = 'center'
    
    if (landerSettled)
    {
      landerCtx.fillText('SUCCESSFUL LANDING!', landerCanvas.width / 2, landerCanvas.height / 2 - 10)
      landerCtx.font = 'bold 14px monospace'
      landerCtx.fillText('Tap Canvas or Press Thrust to Continue', landerCanvas.width / 2, landerCanvas.height / 2 + 20)
    }
    else
    {
      landerCtx.fillText('CRASHED!', landerCanvas.width / 2, landerCanvas.height / 2 - 10)
      landerCtx.font = 'bold 14px monospace'
      landerCtx.fillText('Tap Canvas or Press Thrust to Restart', landerCanvas.width / 2, landerCanvas.height / 2 + 20)
    }
  }
}