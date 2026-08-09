// Confetti Script Loader & Helper (Flap Scoped)

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

// Web Audio API Synthesizer (Flap Scoped)

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

  if (type === 'jump') 
  {
    oscNode.type = 'sine'
    oscNode.frequency.setValueAtTime(300, nowTime)
    oscNode.frequency.exponentialRampToValueAtTime(600, nowTime + 0.1)
    gainNode.gain.setValueAtTime(0.3, nowTime)
    gainNode.gain.linearRampToValueAtTime(0.01, nowTime + 0.1)
    oscNode.start(nowTime)
    oscNode.stop(nowTime + 0.1)
  } 
  else if (type === 'score') 
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

// Dynamic Theme Helper

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

// FLAPPY BIRD GAME

let flapOverlay = null
let flapCanvas = null
let flapCtx = null
let flapAnimationId = null

let flapBird = { x: 50, y: 150, width: 22, height: 22, gravity: 0.38, lift: -7.5, velocity: 0, rotation: 0, scaleY: 1 }
let flapPipes = []
let flapParticles = []
let flapFrameCount = 0
let flapScore = 0
let flapHighScore = parseInt(localStorage.getItem('flap_highscore') || '0', 10)
let flapIsGameOver = false
let flapIsStarted = false
let flapHighScoreBeaten = false

let flapShakeTimer = 0
let flapFlashTimer = 0
let flapScoreScale = 1

function startFlapGame() 
{
  if (flapOverlay) return
  
  // Close active inputs to dismiss onscreen keyboard
  if (document.activeElement && typeof document.activeElement.blur === 'function') 
  {
    document.activeElement.blur()
  }

  ensureFlapConfettiLoaded()
  flapHighScore = parseInt(localStorage.getItem('flap_highscore') || '0', 10)
  flapHighScoreBeaten = false
  createFlapUI()
  resetFlapGame()
  window.addEventListener('keydown', handleFlapInput)
  flapAnimationId = requestAnimationFrame(updateFlapGame)
}

function stopFlapGame() 
{
  if (!flapOverlay) return
  
  cancelAnimationFrame(flapAnimationId)
  window.removeEventListener('keydown', handleFlapInput)
  document.body.removeChild(flapOverlay)
  flapOverlay = null
  flapCanvas = null
  flapCtx = null
}

function createFlapUI() 
{
  let theme = getFlapGameTheme()

  flapOverlay = document.createElement('div')
  flapOverlay.id = 'flap-overlay'
  flapOverlay.style.position = 'fixed'
  flapOverlay.style.top = '0'
  flapOverlay.style.left = '0'
  flapOverlay.style.width = '100vw'
  flapOverlay.style.height = '100vh'
  flapOverlay.style.backgroundColor = theme.bg
  flapOverlay.style.zIndex = '99999'
  flapOverlay.style.display = 'flex'
  flapOverlay.style.flexDirection = 'column'
  flapOverlay.style.alignItems = 'center'
  flapOverlay.style.justifyContent = 'center'
  flapOverlay.style.padding = '16px'
  flapOverlay.style.boxSizing = 'border-box'

  let scoreBox = document.createElement('div')
  scoreBox.id = 'flap-score-box'
  scoreBox.innerText = `High Score: ${flapHighScore}`
  scoreBox.style.padding = '12px 28px'
  scoreBox.style.fontSize = '22px'
  scoreBox.style.fontWeight = 'bold'
  scoreBox.style.color = theme.text
  scoreBox.style.border = `2px solid ${theme.border}`
  scoreBox.style.backgroundColor = theme.surface
  scoreBox.style.marginBottom = '16px'
  scoreBox.style.textAlign = 'center'

  flapCanvas = document.createElement('canvas')
  flapCanvas.width = 320
  flapCanvas.height = 460
  flapCanvas.style.maxWidth = '100%'
  flapCanvas.style.maxHeight = '65vh'
  flapCanvas.style.border = `2px solid ${theme.border}`
  flapCanvas.style.backgroundColor = theme.surface

  flapCtx = flapCanvas.getContext('2d')

  let backBtn = document.createElement('button')
  backBtn.innerText = 'Back'
  backBtn.style.padding = '8px 24px'
  backBtn.style.fontSize = '14px'
  backBtn.style.width = 'auto'
  backBtn.style.minWidth = '100px'
  backBtn.style.cursor = 'pointer'
  backBtn.style.marginTop = '28px'
  backBtn.onclick = stopFlapGame

  flapOverlay.appendChild(scoreBox)
  flapOverlay.appendChild(flapCanvas)
  flapOverlay.appendChild(backBtn)

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
  flapBird.rotation = 0
  flapBird.scaleY = 1
  flapPipes = []
  flapParticles = []
  flapFrameCount = 0
  flapScore = 0
  flapShakeTimer = 0
  flapFlashTimer = 0
  flapIsGameOver = false
  flapIsStarted = false
  flapHighScoreBeaten = false
}

function handleFlapInput(e) 
{
  if (e.code === 'Space' || e.code === 'ArrowUp') 
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
  
  playFlapSound('jump')
  flapBird.velocity = flapBird.lift
  flapBird.scaleY = 0.6
  
  let theme = getFlapGameTheme()
  for (let i = 0; i < 5; i++) 
  {
    flapParticles.push({
      x: flapBird.x,
      y: flapBird.y + flapBird.height / 2,
      vx: (Math.random() - 0.5) * 2 - 2,
      vy: (Math.random() - 0.5) * 2,
      size: Math.random() * 4 + 2,
      life: 1,
      color: theme.accent
    })
  }
}

function updateFlapGame() 
{
  let theme = getFlapGameTheme()
  flapCtx.clearRect(0, 0, flapCanvas.width, flapCanvas.height)

  if (flapShakeTimer > 0) flapShakeTimer--
  if (flapFlashTimer > 0) flapFlashTimer--
  if (flapScoreScale > 1) flapScoreScale -= 0.05

  flapCtx.save()
  if (flapShakeTimer > 0) 
  {
    let dx = (Math.random() - 0.5) * 8
    let dy = (Math.random() - 0.5) * 8
    flapCtx.translate(dx, dy)
  }

  if (flapIsStarted && !flapIsGameOver) 
  {
    flapFrameCount++
    
    flapBird.velocity += flapBird.gravity
    flapBird.y += flapBird.velocity
    flapBird.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, flapBird.velocity * 0.08))
    flapBird.scaleY += (1 - flapBird.scaleY) * 0.15

    if (flapFrameCount % 85 === 0) 
    {
      let gap = 110
      let minHeight = 40
      let maxHeight = flapCanvas.height - gap - minHeight - 40
      let topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight

      flapPipes.push({
        x: flapCanvas.width,
        top: topHeight,
        bottom: flapCanvas.height - topHeight - gap,
        passed: false
      })
    }

    for (let i = flapPipes.length - 1; i >= 0; i--) 
    {
      let p = flapPipes[i]
      p.x -= 2.2

      if (!p.passed && p.x + 45 < flapBird.x) 
      {
        p.passed = true
        flapScore++
        flapScoreScale = 1.5
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
          let sBox = document.getElementById('flap-score-box')
          if (sBox) sBox.innerText = `High Score: ${flapHighScore}`
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
        flapPipes.splice(i, 1)
      }
    }

    if (flapBird.y + flapBird.height >= flapCanvas.height - 24 || flapBird.y <= 0) 
    {
      triggerFlapGameOver()
    }
  }

  for (let i = flapParticles.length - 1; i >= 0; i--) 
  {
    let pt = flapParticles[i]
    pt.x += pt.vx
    pt.y += pt.vy
    pt.life -= 0.03
    if (pt.life <= 0) 
    {
      flapParticles.splice(i, 1)
    }
  }

  drawFlapGame(theme)
  flapCtx.restore()

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
    let sBox = document.getElementById('flap-score-box')
    if (sBox) sBox.innerText = `High Score: ${flapHighScore}`
  }
}

function drawFlapGame(theme) 
{
  for (let pt of flapParticles) 
  {
    flapCtx.fillStyle = pt.color
    flapCtx.globalAlpha = pt.life
    flapCtx.beginPath()
    flapCtx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2)
    flapCtx.fill()
    flapCtx.globalAlpha = 1
  }

  flapCtx.fillStyle = theme.gray
  flapCtx.fillRect(0, flapCanvas.height - 24, flapCanvas.width, 24)
  flapCtx.fillStyle = theme.accent
  flapCtx.fillRect(0, flapCanvas.height - 24, flapCanvas.width, 4)

  for (let p of flapPipes) 
  {
    flapCtx.fillStyle = theme.surface
    flapCtx.strokeStyle = theme.border
    flapCtx.lineWidth = 2

    flapCtx.fillRect(p.x, 0, 45, p.top)
    flapCtx.strokeRect(p.x, 0, 45, p.top)

    let bottomY = flapCanvas.height - p.bottom
    flapCtx.fillRect(p.x, bottomY, 45, p.bottom)
    flapCtx.strokeRect(p.x, bottomY, 45, p.bottom)
  }

  flapCtx.save()
  flapCtx.translate(flapBird.x + flapBird.width / 2, flapBird.y + flapBird.height / 2)
  flapCtx.rotate(flapBird.rotation)
  flapCtx.scale(1, flapBird.scaleY)

  flapCtx.fillStyle = theme.accent
  flapCtx.strokeStyle = theme.border
  flapCtx.lineWidth = 2
  flapCtx.fillRect(-flapBird.width / 2, -flapBird.height / 2, flapBird.width, flapBird.height)
  flapCtx.strokeRect(-flapBird.width / 2, -flapBird.height / 2, flapBird.width, flapBird.height)

  flapCtx.fillStyle = theme.accentTxt
  flapCtx.fillRect(2, -4, 4, 4)
  flapCtx.restore()

  flapCtx.save()
  flapCtx.fillStyle = theme.text
  flapCtx.font = `bold ${Math.floor(26 * flapScoreScale)}px sans-serif`
  flapCtx.textAlign = 'center'
  flapCtx.fillText(flapScore, flapCanvas.width / 2, 45)
  flapCtx.restore()

  if (!flapIsStarted) 
  {
    flapCtx.fillStyle = theme.text
    flapCtx.font = '15px sans-serif'
    flapCtx.textAlign = 'center'
    flapCtx.fillText('Tap or Space to Jump', flapCanvas.width / 2, flapCanvas.height / 2)
  }

  if (flapIsGameOver) 
  {
    flapCtx.fillStyle = 'rgba(0,0,0,0.5)'
    flapCtx.fillRect(0, 0, flapCanvas.width, flapCanvas.height)
    
    flapCtx.fillStyle = '#fff'
    flapCtx.font = 'bold 26px sans-serif'
    flapCtx.textAlign = 'center'
    flapCtx.fillText('GAME OVER', flapCanvas.width / 2, flapCanvas.height / 2 - 10)
    
    flapCtx.font = '14px sans-serif'
    flapCtx.fillText('Tap to Restart', flapCanvas.width / 2, flapCanvas.height / 2 + 20)
  }
}