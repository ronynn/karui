// Confetti Script Loader & Helper (Snake Scoped)

let snakeConfettiLoaded = false

function ensureSnakeConfettiLoaded(callback) 
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
      snakeConfettiLoaded = true
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
      snakeConfettiLoaded = true
      if (callback) callback()
    })
  }
}

function triggerSnakeConfetti() 
{
  ensureSnakeConfettiLoaded(() => {
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

// Web Audio API Synthesizer (Snake Scoped)

let snakeAudioCtx = null

function getSnakeAudioContext() 
{
  if (!snakeAudioCtx) 
  {
    let AudioCtxClass = window.AudioContext || window.webkitAudioContext
    if (AudioCtxClass) 
    {
      snakeAudioCtx = new AudioCtxClass()
    }
  }
  if (snakeAudioCtx && snakeAudioCtx.state === 'suspended') 
  {
    snakeAudioCtx.resume()
  }
  return snakeAudioCtx
}

function playSnakeSound(type) 
{
  let ctx = getSnakeAudioContext()
  if (!ctx) return

  let oscNode = ctx.createOscillator()
  let gainNode = ctx.createGain()
  oscNode.connect(gainNode)
  gainNode.connect(ctx.destination)

  let nowTime = ctx.currentTime

  if (type === 'eat') 
  {
    oscNode.type = 'sine'
    oscNode.frequency.setValueAtTime(400, nowTime)
    oscNode.frequency.exponentialRampToValueAtTime(800, nowTime + 0.1)
    gainNode.gain.setValueAtTime(0.25, nowTime)
    gainNode.gain.linearRampToValueAtTime(0.01, nowTime + 0.1)
    oscNode.start(nowTime)
    oscNode.stop(nowTime + 0.1)
  } 
  else if (type === 'gameover') 
  {
    oscNode.type = 'sawtooth'
    oscNode.frequency.setValueAtTime(180, nowTime)
    oscNode.frequency.exponentialRampToValueAtTime(50, nowTime + 0.3)
    gainNode.gain.setValueAtTime(0.4, nowTime)
    gainNode.gain.linearRampToValueAtTime(0.01, nowTime + 0.3)
    oscNode.start(nowTime)
    oscNode.stop(nowTime + 0.3)
  }
}

// Dynamic Theme Helper

function getSnakeThemeColor(varName, fallback) 
{
  let target = document.body || document.documentElement
  let val = getComputedStyle(target).getPropertyValue(varName).trim()
  return val ? val : fallback
}

function getSnakeGameTheme() 
{
  return {
    bg: getSnakeThemeColor('--bg', '#1d2021'),
    surface: getSnakeThemeColor('--surface', '#282828'),
    border: getSnakeThemeColor('--border', '#3c3836'),
    text: getSnakeThemeColor('--text', '#fbf1c7'),
    accent: getSnakeThemeColor('--accent', '#fe8019'),
    accentTxt: getSnakeThemeColor('--accent-txt', '#282828'),
    gray: getSnakeThemeColor('--gray', '#928374')
  }
}

// SNAKE GAME

let snakeOverlay = null
let snakeCanvas = null
let snakeCtx = null
let snakeIntervalId = null

let snakeList = []
let snakeFood = { x: 0, y: 0 }
let snakeDir = { x: 1, y: 0 }
let snakeNextDir = { x: 1, y: 0 }
let snakeGridSize = 16
let snakeTileCount = 20
let snakeScore = 0
let snakeHighScore = parseInt(localStorage.getItem('snake_highscore') || '0', 10)
let snakeGameOver = false
let snakeHighScoreBeaten = false
let snakeScoreScale = 1

let snakeTouchStartX = 0
let snakeTouchStartY = 0

function startSnakeGame() 
{
  if (snakeOverlay) return
  
  // Close active inputs to dismiss onscreen keyboard
  if (document.activeElement && typeof document.activeElement.blur === 'function') 
  {
    document.activeElement.blur()
  }

  ensureSnakeConfettiLoaded()
  snakeHighScore = parseInt(localStorage.getItem('snake_highscore') || '0', 10)
  snakeHighScoreBeaten = false
  createSnakeUI()
  resetSnakeGame()
  window.addEventListener('keydown', handleSnakeInput)
  snakeIntervalId = setInterval(updateSnakeGame, 110)
}

function stopSnakeGame() 
{
  if (!snakeOverlay) return
  
  clearInterval(snakeIntervalId)
  window.removeEventListener('keydown', handleSnakeInput)
  document.body.removeChild(snakeOverlay)
  snakeOverlay = null
  snakeCanvas = null
  snakeCtx = null
}

function createSnakeUI() 
{
  let theme = getSnakeGameTheme()

  snakeOverlay = document.createElement('div')
  snakeOverlay.style.position = 'fixed'
  snakeOverlay.style.top = '0'
  snakeOverlay.style.left = '0'
  snakeOverlay.style.width = '100vw'
  snakeOverlay.style.height = '100vh'
  snakeOverlay.style.backgroundColor = theme.bg
  snakeOverlay.style.zIndex = '99999'
  snakeOverlay.style.display = 'flex'
  snakeOverlay.style.flexDirection = 'column'
  snakeOverlay.style.alignItems = 'center'
  snakeOverlay.style.justifyContent = 'center'
  snakeOverlay.style.padding = '16px'
  snakeOverlay.style.boxSizing = 'border-box'

  let scoreBox = document.createElement('div')
  scoreBox.id = 'snake-score-box'
  scoreBox.innerText = `High Score: ${snakeHighScore}`
  scoreBox.style.padding = '12px 28px'
  scoreBox.style.fontSize = '22px'
  scoreBox.style.fontWeight = 'bold'
  scoreBox.style.color = theme.text
  scoreBox.style.border = `2px solid ${theme.border}`
  scoreBox.style.backgroundColor = theme.surface
  scoreBox.style.marginBottom = '16px'
  scoreBox.style.textAlign = 'center'

  snakeCanvas = document.createElement('canvas')
  snakeCanvas.width = snakeGridSize * snakeTileCount
  snakeCanvas.height = snakeGridSize * snakeTileCount
  snakeCanvas.style.maxWidth = '100%'
  snakeCanvas.style.maxHeight = '65vh'
  snakeCanvas.style.border = `2px solid ${theme.border}`
  snakeCanvas.style.backgroundColor = theme.surface

  snakeCtx = snakeCanvas.getContext('2d')

  let backBtn = document.createElement('button')
  backBtn.innerText = 'Back'
  backBtn.style.padding = '8px 24px'
  backBtn.style.fontSize = '14px'
  backBtn.style.width = 'auto'
  backBtn.style.minWidth = '100px'
  backBtn.style.cursor = 'pointer'
  backBtn.style.marginTop = '28px'
  backBtn.onclick = stopSnakeGame

  snakeOverlay.appendChild(scoreBox)
  snakeOverlay.appendChild(snakeCanvas)
  snakeOverlay.appendChild(backBtn)

  document.body.appendChild(snakeOverlay)

  snakeCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault()
    if (snakeGameOver) 
    {
      resetSnakeGame()
      return
    }
    snakeTouchStartX = e.touches[0].clientX
    snakeTouchStartY = e.touches[0].clientY
  }, { passive: false })

  snakeCanvas.addEventListener('touchend', (e) => {
    if (snakeGameOver) return
    let diffX = e.changedTouches[0].clientX - snakeTouchStartX
    let diffY = e.changedTouches[0].clientY - snakeTouchStartY

    if (Math.abs(diffX) > Math.abs(diffY)) 
    {
      if (Math.abs(diffX) > 20) 
      {
        if (diffX > 0 && snakeDir.x === 0) snakeNextDir = { x: 1, y: 0 }
        else if (diffX < 0 && snakeDir.x === 0) snakeNextDir = { x: -1, y: 0 }
      }
    } 
    else 
    {
      if (Math.abs(diffY) > 20) 
      {
        if (diffY > 0 && snakeDir.y === 0) snakeNextDir = { x: 0, y: 1 }
        else if (diffY < 0 && snakeDir.y === 0) snakeNextDir = { x: 0, y: -1 }
      }
    }
  })

  snakeCanvas.addEventListener('click', () => {
    if (snakeGameOver) resetSnakeGame()
  })
}

function resetSnakeGame() 
{
  snakeList = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
  ]
  snakeDir = { x: 1, y: 0 }
  snakeNextDir = { x: 1, y: 0 }
  snakeScore = 0
  snakeScoreScale = 1
  snakeGameOver = false
  snakeHighScoreBeaten = false
  spawnSnakeFood()
}

function spawnSnakeFood() 
{
  snakeFood = {
    x: Math.floor(Math.random() * snakeTileCount),
    y: Math.floor(Math.random() * snakeTileCount)
  }
}

function handleSnakeInput(e) 
{
  if (e.key === 'ArrowUp' || e.key === 'w') 
  {
    if (snakeDir.y === 0) snakeNextDir = { x: 0, y: -1 }
  } 
  else if (e.key === 'ArrowDown' || e.key === 's') 
  {
    if (snakeDir.y === 0) snakeNextDir = { x: 0, y: 1 }
  } 
  else if (e.key === 'ArrowLeft' || e.key === 'a') 
  {
    if (snakeDir.x === 0) snakeNextDir = { x: -1, y: 0 }
  } 
  else if (e.key === 'ArrowRight' || e.key === 'd') 
  {
    if (snakeDir.x === 0) snakeNextDir = { x: 1, y: 0 }
  }
}

function updateSnakeGame() 
{
  let theme = getSnakeGameTheme()
  
  if (snakeScoreScale > 1) 
  {
    snakeScoreScale -= 0.05
  }

  if (!snakeGameOver) 
  {
    snakeDir = snakeNextDir
    
    let head = { 
      x: (snakeList[0].x + snakeDir.x + snakeTileCount) % snakeTileCount, 
      y: (snakeList[0].y + snakeDir.y + snakeTileCount) % snakeTileCount 
    }

    for (let segment of snakeList) 
    {
      if (segment.x === head.x && segment.y === head.y) 
      {
        triggerSnakeGameOver()
        break
      }
    }

    if (!snakeGameOver) 
    {
      snakeList.unshift(head)

      if (head.x === snakeFood.x && head.y === snakeFood.y) 
      {
        snakeScore++
        snakeScoreScale = 1.5
        playSnakeSound('eat')
        if (snakeScore > snakeHighScore || snakeHighScore === 0) 
        {
          if (!snakeHighScoreBeaten) 
          {
            triggerSnakeConfetti()
            if (navigator.vibrate) 
            {
              navigator.vibrate([100, 50, 100, 50, 200])
            }
            snakeHighScoreBeaten = true
          }
          snakeHighScore = snakeScore
          localStorage.setItem('snake_highscore', snakeHighScore.toString())
          let sBox = document.getElementById('snake-score-box')
          if (sBox) sBox.innerText = `High Score: ${snakeHighScore}`
        }
        spawnSnakeFood()
      } 
      else 
      {
        snakeList.pop()
      }
    }
  }

  drawSnakeGame(theme)
}

function triggerSnakeGameOver() 
{
  snakeGameOver = true
  playSnakeSound('gameover')
  
  if (navigator.vibrate) 
  {
    navigator.vibrate(200)
  }

  if (snakeScore > snakeHighScore) 
  {
    snakeHighScore = snakeScore
    localStorage.setItem('snake_highscore', snakeHighScore.toString())
    let sBox = document.getElementById('snake-score-box')
    if (sBox) sBox.innerText = `High Score: ${snakeHighScore}`
  }
}

function drawSnakeGame(theme) 
{
  snakeCtx.fillStyle = theme.surface
  snakeCtx.fillRect(0, 0, snakeCanvas.width, snakeCanvas.height)

  snakeCtx.fillStyle = theme.accent
  snakeCtx.beginPath()
  snakeCtx.arc(
    snakeFood.x * snakeGridSize + snakeGridSize / 2,
    snakeFood.y * snakeGridSize + snakeGridSize / 2,
    snakeGridSize / 2 - 2,
    0,
    Math.PI * 2
  )
  snakeCtx.fill()

  for (let i = 0; i < snakeList.length; i++) 
  {
    snakeCtx.fillStyle = i === 0 ? theme.accent : theme.text
    snakeCtx.fillRect(
      snakeList[i].x * snakeGridSize + 1,
      snakeList[i].y * snakeGridSize + 1,
      snakeGridSize - 2,
      snakeGridSize - 2
    )
  }

  snakeCtx.save()
  snakeCtx.fillStyle = theme.text
  snakeCtx.font = `bold ${Math.floor(26 * snakeScoreScale)}px sans-serif`
  snakeCtx.textAlign = 'center'
  snakeCtx.fillText(snakeScore, snakeCanvas.width / 2, 45)
  snakeCtx.restore()

  if (snakeGameOver) 
  {
    snakeCtx.fillStyle = 'rgba(0,0,0,0.5)'
    snakeCtx.fillRect(0, 0, snakeCanvas.width, snakeCanvas.height)

    snakeCtx.fillStyle = '#fff'
    snakeCtx.font = 'bold 26px sans-serif'
    snakeCtx.textAlign = 'center'
    snakeCtx.fillText('GAME OVER', snakeCanvas.width / 2, snakeCanvas.height / 2 - 10)

    snakeCtx.font = '14px sans-serif'
    snakeCtx.fillText('Tap to Restart', snakeCanvas.width / 2, snakeCanvas.height / 2 + 20)
  }
}