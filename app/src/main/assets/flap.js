let flapConfettiLoaded = false

function ensureFlapConfettiLoaded(callback) 
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
      flapConfettiLoaded = true
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
      flapConfettiLoaded = true
      if (callback) callback()
    })
  }
}

function triggerFlapConfetti() 
{
  ensureFlapConfettiLoaded(() => {
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

const MAX_JUMP_PARTICLES = 12
let flapParticlesPool = []

function initFlapParticlePool()
{
  flapParticlesPool = []
  for (let i = 0; i < MAX_JUMP_PARTICLES; i++)
  {
    flapParticlesPool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 })
  }
}

function spawnJumpParticles(x, y)
{
  let spawned = 0
  for (let i = 0; i < MAX_JUMP_PARTICLES && spawned < 12; i++)
  {
    let p = flapParticlesPool[i]
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

let flapAudioCtx = null

function getFlapAudioContext() 
{
  if (!flapAudioCtx) 
  {
    let AudioCtxClass = window.AudioContext || window.webkitAudioContext
    if (AudioCtxClass) 
    {
      flapAudioCtx = new AudioCtxClass()
    }
  }
  if (flapAudioCtx && flapAudioCtx.state === 'suspended') 
  {
    flapAudioCtx.resume()
  }
  return flapAudioCtx
}

function playFlapSound(type) 
{
  let ctx = getFlapAudioContext()
  if (!ctx) return

  let oscNode = ctx.createOscillator()
  let gainNode = ctx.createGain()
  oscNode.connect(gainNode)
  gainNode.connect(ctx.destination)

  let nowTime = ctx.currentTime

  if (type === 'score') 
  {
    oscNode.type = 'triangle'
    oscNode.frequency.setValueAtTime(523.25, nowTime)
    oscNode.frequency.setValueAtTime(659.25, nowTime + 0.08)
    gainNode.gain.setValueAtTime(0.2, nowTime)
    gainNode.gain.linearRampToValueAtTime(0.01, nowTime + 0.2)
    oscNode.start(nowTime)
    oscNode.stop(nowTime + 0.2)
  } 
  else if (type === 'gameover') 
  {
    oscNode.type = 'sawtooth'
    oscNode.frequency.setValueAtTime(200, nowTime)
    oscNode.frequency.exponentialRampToValueAtTime(60, nowTime + 0.3)
    gainNode.gain.setValueAtTime(0.4, nowTime)
    gainNode.gain.linearRampToValueAtTime(0.01, nowTime + 0.3)
    oscNode.start(nowTime)
    oscNode.stop(nowTime + 0.3)
  }
}

function getFlapThemeColor(varName, fallback) 
{
  let target = document.body || document.documentElement
  let val = getComputedStyle(target).getPropertyValue(varName).trim()
  return val ? val : fallback
}

function getFlapGameTheme() 
{
  return {
    bg: getFlapThemeColor('--bg', '#1d2021'),
    surface: getFlapThemeColor('--surface', '#282828'),
    border: getFlapThemeColor('--border', '#3c3836'),
    text: getFlapThemeColor('--text', '#fbf1c7'),
    accent: getFlapThemeColor('--accent', '#fe8019'),
    accentTxt: getFlapThemeColor('--accent-txt', '#282828'),
    gray: getFlapThemeColor('--gray', '#928374')
  }
}

let flapOverlay = null
let flapCanvas = null
let flapCtx = null
let flapAnimationId = null

let flapBird = { x: 50, y: 150, width: 22, height: 22, gravity: 0.38, lift: -7.5, velocity: 0 }

const MAX_PIPES = 6
let flapPipesPool = []

const PRECOMPUTED_TRACK_SIZE = 500
let flapPrecomputedHeights = new Float32Array(PRECOMPUTED_TRACK_SIZE)
let flapTrackIndex = 0

let flapFrameAccumulator = 0
let flapScore = 0
let flapHighScore = parseInt(localStorage.getItem('flap_highscore') || '0', 10)
let flapIsGameOver = false
let flapIsStarted = false
let flapHighScoreBeaten = false

let flapShakeTimer = 0
let flapFlashTimer = 0
let flapLastFrameTime = 0
let flapCachedTheme = null

function initFlapPoolsAndTrack() 
{
  flapPipesPool = []
  for (let i = 0; i < MAX_PIPES; i++) 
  {
    flapPipesPool.push({ active: false, x: 0, top: 0, bottom: 0, passed: false })
  }

  initFlapParticlePool()

  let gap = 110
  let minHeight = 40
  let maxHeight = 460 - gap - minHeight - 40
  for (let i = 0; i < PRECOMPUTED_TRACK_SIZE; i++) 
  {
    flapPrecomputedHeights[i] = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight
  }
}

function startFlapGame() 
{
  if (flapOverlay) return
  
  if (flapAnimationId) 
  {
    cancelAnimationFrame(flapAnimationId)
    flapAnimationId = null
  }

  if (document.activeElement && typeof document.activeElement.blur === 'function') 
  {
    document.activeElement.blur()
  }

  ensureFlapConfettiLoaded()
  flapHighScore = parseInt(localStorage.getItem('flap_highscore') || '0', 10)
  flapHighScoreBeaten = false
  
  initFlapPoolsAndTrack()
  createFlapUI()
  resetFlapGame()
  
  window.addEventListener('keydown', handleFlapInput)
  flapLastFrameTime = performance.now()
  flapAnimationId = requestAnimationFrame(updateFlapGame)
}

function stopFlapGame() 
{
  if (!flapOverlay) return
  
  if (flapAnimationId)
  {
    cancelAnimationFrame(flapAnimationId)
    flapAnimationId = null
  }
  window.removeEventListener('keydown', handleFlapInput)
  document.body.removeChild(flapOverlay)
  flapOverlay = null
  flapCanvas = null
  flapCtx = null
  flapCachedTheme = null
}

function resetFlapHighScore()
{
  flapHighScore = 0
  localStorage.setItem('flap_highscore', '0')
  flapHighScoreBeaten = false
  resetFlapGame()
}

function createFlapUI() 
{
  flapCachedTheme = getFlapGameTheme()

  flapOverlay = document.createElement('div')
  flapOverlay.style.position = 'fixed'
  flapOverlay.style.top = '0'
  flapOverlay.style.left = '0'
  flapOverlay.style.width = '100vw'
  flapOverlay.style.height = '100vh'
  flapOverlay.style.backgroundColor = flapCachedTheme.bg
  flapOverlay.style.zIndex = '99999'
  flapOverlay.style.display = 'flex'
  flapOverlay.style.flexDirection = 'column'
  flapOverlay.style.alignItems = 'center'
  flapOverlay.style.justifyContent = 'flex-start'
  flapOverlay.style.paddingTop = 'calc(52px + env(safe-area-inset-top, 0px))'
  flapOverlay.style.paddingLeft = '12px'
  flapOverlay.style.paddingRight = '12px'
  flapOverlay.style.paddingBottom = '8px'
  flapOverlay.style.boxSizing = 'border-box'
  flapOverlay.style.fontWeight = 'bold'

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
  backBtn.onclick = stopFlapGame

  let resetBtn = document.createElement('button')
  resetBtn.innerText = 'reset'
  resetBtn.style.padding = '10px 28px'
  resetBtn.style.fontSize = '18px'
  resetBtn.style.fontWeight = 'bold'
  resetBtn.style.width = 'auto'
  resetBtn.style.minWidth = '110px'
  resetBtn.style.cursor = 'pointer'
  resetBtn.onclick = resetFlapHighScore

  topBar.appendChild(backBtn)
  topBar.appendChild(resetBtn)

  flapCanvas = document.createElement('canvas')
  flapCanvas.width = 360
  flapCanvas.height = 476
  flapCanvas.style.width = '94%'
  flapCanvas.style.maxHeight = '72vh'
  flapCanvas.style.border = `2px solid ${flapCachedTheme.border}`
  flapCanvas.style.backgroundColor = flapCachedTheme.surface
  flapCanvas.style.willChange = 'transform'
  flapCanvas.style.transform = 'translateZ(0)'

  flapCtx = flapCanvas.getContext('2d', { alpha: false })
  flapCtx.imageSmoothingEnabled = false

  flapOverlay.appendChild(topBar)
  flapOverlay.appendChild(flapCanvas)

  document.body.appendChild(flapOverlay)

  flapCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault()
    flapAction()
  }, { passive: false })

  flapCanvas.addEventListener('click', flapAction)
}

function resetFlapGame() 
{
  flapBird.y = flapCanvas.height / 2
  flapBird.velocity = 0
  
  for (let i = 0; i < MAX_PIPES; i++) 
  {
    flapPipesPool[i].active = false
  }

  for (let i = 0; i < MAX_JUMP_PARTICLES; i++)
  {
    flapParticlesPool[i].active = false
  }

  flapFrameAccumulator = 0
  flapTrackIndex = 0
  flapScore = 0
  flapShakeTimer = 0
  flapFlashTimer = 0
  flapIsGameOver = false
  flapIsStarted = false
  flapHighScoreBeaten = false
}

function handleFlapInput(e) 
{
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === 'w') 
  {
    e.preventDefault()
    flapAction()
  }
}

function flapAction() 
{
  if (flapIsGameOver) 
  {
    resetFlapGame()
    return
  }
  if (!flapIsStarted) 
  {
    flapIsStarted = true
  }
  
  flapBird.velocity = flapBird.lift
  spawnJumpParticles(flapBird.x + flapBird.width / 2, flapBird.y + flapBird.height)
}

function spawnPipeFromPool() 
{
  for (let i = 0; i < MAX_PIPES; i++) 
  {
    let p = flapPipesPool[i]
    if (!p.active) 
    {
      let topHeight = flapPrecomputedHeights[flapTrackIndex]
      flapTrackIndex = (flapTrackIndex + 1) % PRECOMPUTED_TRACK_SIZE
      
      let gap = 110
      p.active = true
      p.x = flapCanvas.width
      p.top = topHeight
      p.bottom = flapCanvas.height - topHeight - gap
      p.passed = false
      break
    }
  }
}

function updateFlapGame(now) 
{
  if (!flapOverlay) return

  let delta = now - flapLastFrameTime
  flapLastFrameTime = now

  let clampedDelta = Math.min(delta, 32)
  let timeFactor = clampedDelta / 16.667

  if (flapShakeTimer > 0) flapShakeTimer--
  if (flapFlashTimer > 0) flapFlashTimer--

  if (flapShakeTimer > 0) 
  {
    flapCtx.save()
    let dx = (Math.random() - 0.5) * 8
    let dy = (Math.random() - 0.5) * 8
    flapCtx.translate(dx, dy)
  }

  if (flapIsStarted && !flapIsGameOver) 
  {
    flapFrameAccumulator += timeFactor
    
    flapBird.velocity += flapBird.gravity * timeFactor
    flapBird.y += flapBird.velocity * timeFactor

    if (flapFrameAccumulator >= 85) 
    {
      flapFrameAccumulator = 0
      spawnPipeFromPool()
    }

    for (let i = 0; i < MAX_PIPES; i++) 
    {
      let p = flapPipesPool[i]
      if (!p.active) continue

      p.x -= 2.2 * timeFactor

      if (!p.passed && p.x + 45 < flapBird.x) 
      {
        p.passed = true
        flapScore++
        playFlapSound('score')
        
        if (flapScore > flapHighScore || flapHighScore === 0) 
        {
          if (!flapHighScoreBeaten) 
          {
            triggerFlapConfetti()
            if (navigator.vibrate) 
            {
              navigator.vibrate([100, 50, 100, 50, 200])
            }
            flapHighScoreBeaten = true
          }
          flapHighScore = flapScore
          localStorage.setItem('flap_highscore', flapHighScore.toString())
        }
      }

      if (
        flapBird.x + flapBird.width > p.x &&
        flapBird.x < p.x + 45 &&
        (flapBird.y < p.top || flapBird.y + flapBird.height > flapCanvas.height - p.bottom)
      ) 
      {
        triggerFlapGameOver()
      }

      if (p.x + 45 < 0) 
      {
        p.active = false
      }
    }

    if (flapBird.y + flapBird.height >= flapCanvas.height - 24 || flapBird.y <= 0) 
    {
      triggerFlapGameOver()
    }

    for (let i = 0; i < MAX_JUMP_PARTICLES; i++)
    {
      let particle = flapParticlesPool[i]
      if (!particle.active) continue

      particle.x += particle.vx * timeFactor
      particle.y += particle.vy * timeFactor
      particle.life -= timeFactor

      if (particle.life <= 0)
      {
        particle.active = false
      }
    }
  }

  drawFlapGame(flapCachedTheme)
  if (flapShakeTimer > 0) 
  {
    flapCtx.restore()
  }

  if (flapFlashTimer > 0) 
  {
    flapCtx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    flapCtx.fillRect(0, 0, flapCanvas.width, flapCanvas.height)
  }

  flapAnimationId = requestAnimationFrame(updateFlapGame)
}

function triggerFlapGameOver() 
{
  if (flapIsGameOver) return
  flapIsGameOver = true
  flapShakeTimer = 12
  flapFlashTimer = 5
  playFlapSound('gameover')
  
  if (navigator.vibrate) 
  {
    navigator.vibrate(200)
  }

  if (flapScore > flapHighScore) 
  {
    flapHighScore = flapScore
    localStorage.setItem('flap_highscore', flapHighScore.toString())
  }
}

function drawFlapGame(theme) 
{
  flapCtx.fillStyle = theme.surface
  flapCtx.fillRect(0, 0, flapCanvas.width, flapCanvas.height - 24)

  flapCtx.fillStyle = theme.gray
  flapCtx.fillRect(0, flapCanvas.height - 24, flapCanvas.width, 24)
  flapCtx.fillStyle = theme.accent
  flapCtx.fillRect(0, flapCanvas.height - 24, flapCanvas.width, 4)

  flapCtx.fillStyle = theme.border
  for (let i = 0; i < MAX_PIPES; i++) 
  {
    let p = flapPipesPool[i]
    if (!p.active) continue

    flapCtx.fillRect(p.x, 0, 45, p.top)

    let bottomY = flapCanvas.height - p.bottom
    flapCtx.fillRect(p.x, bottomY, 45, p.bottom)
  }

  flapCtx.fillStyle = theme.accent
  flapCtx.fillRect(flapBird.x, flapBird.y, flapBird.width, flapBird.height)

  flapCtx.fillStyle = theme.accentTxt
  flapCtx.fillRect(flapBird.x + flapBird.width - 6, flapBird.y + 4, 4, 4)

  flapCtx.fillStyle = theme.accent
  for (let i = 0; i < MAX_JUMP_PARTICLES; i++)
  {
    let particle = flapParticlesPool[i]
    if (particle.active)
    {
      flapCtx.fillRect(particle.x, particle.y, 3, 3)
    }
  }

  flapCtx.fillStyle = theme.text
  flapCtx.font = 'bold 16px monospace'
  
  flapCtx.textAlign = 'left'
  flapCtx.fillText(`PTS ${flapScore}`, 12, 28)

  flapCtx.textAlign = 'right'
  flapCtx.fillText(`HI ${flapHighScore}`, flapCanvas.width - 12, 28)

  if (!flapIsStarted) 
  {
    flapCtx.fillStyle = theme.text
    flapCtx.font = '15px monospace'
    flapCtx.textAlign = 'center'
    flapCtx.fillText('Tap or Space to Jump', flapCanvas.width / 2, flapCanvas.height / 2)
  }

  if (flapIsGameOver) 
  {
    flapCtx.fillStyle = 'rgba(0,0,0,0.5)'
    flapCtx.fillRect(0, 0, flapCanvas.width, flapCanvas.height)
    
    flapCtx.fillStyle = '#fff'
    flapCtx.font = 'bold 26px monospace'
    flapCtx.textAlign = 'center'
    flapCtx.fillText('GAME OVER', flapCanvas.width / 2, flapCanvas.height / 2 - 10)
    
    flapCtx.font = 'bold 14px monospace'
    flapCtx.fillText('Tap Canvas to Restart', flapCanvas.width / 2, flapCanvas.height / 2 + 20)
  }
}