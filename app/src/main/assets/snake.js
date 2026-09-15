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

  let nowTime = ctx.currentTime

  if (type === 'eat')
  {
    let oscNode = ctx.createOscillator()
    let gainNode = ctx.createGain()
    oscNode.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscNode.type = 'sine'
    oscNode.frequency.setValueAtTime(523.25, nowTime)
    oscNode.frequency.setValueAtTime(659.25, nowTime + 0.05)
    
    gainNode.gain.setValueAtTime(0.2, nowTime)
    gainNode.gain.linearRampToValueAtTime(0.01, nowTime + 0.12)
    
    oscNode.start(nowTime)
    oscNode.stop(nowTime + 0.12)
  }
  else if (type === 'gameover')
  {
    let oscNode = ctx.createOscillator()
    let gainNode = ctx.createGain()
    oscNode.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscNode.type = 'sawtooth'
    oscNode.frequency.setValueAtTime(220, nowTime)
    oscNode.frequency.exponentialRampToValueAtTime(40, nowTime + 0.4)
    
    gainNode.gain.setValueAtTime(0.35, nowTime)
    gainNode.gain.linearRampToValueAtTime(0.01, nowTime + 0.4)
    
    oscNode.start(nowTime)
    oscNode.stop(nowTime + 0.4)
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
let snakeAnimFrameId = null

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

// Timing variables for rAF loop
let lastFrameTime = 0
let accumulatedTime = 0
const tickRate = 110

function startSnakeGame()
{
  if (snakeOverlay) return
  
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
  
  lastFrameTime = performance.now()
  accumulatedTime = 0
  snakeAnimFrameId = requestAnimationFrame(gameLoop)
}

function stopSnakeGame()
{
  if (!snakeOverlay) return
  
  if (snakeAnimFrameId)
  {
    cancelAnimationFrame(snakeAnimFrameId)
  }
  window.removeEventListener('keydown', handleSnakeInput)
  document.body.removeChild(snakeOverlay)
  snakeOverlay = null
  snakeCanvas = null
  snakeCtx = null
}

function resetSnakeHighScore()
{
  snakeHighScore = 0
  localStorage.setItem('snake_highscore', '0')
  snakeHighScoreBeaten = false
  resetSnakeGame()
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
  snakeOverlay.style.justifyContent = 'flex-start'
  snakeOverlay.style.paddingTop = 'calc(52px + env(safe-area-inset-top, 0px))'
  snakeOverlay.style.paddingLeft = '8px'
  snakeOverlay.style.paddingRight = '8px'
  snakeOverlay.style.paddingBottom = '8px'
  snakeOverlay.style.boxSizing = 'border-box'
  snakeOverlay.style.fontWeight = 'bold'

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
  backBtn.onclick = stopSnakeGame

  let resetBtn = document.createElement('button')
  resetBtn.innerText = 'reset'
  resetBtn.style.padding = '10px 28px'
  resetBtn.style.fontSize = '18px'
  resetBtn.style.fontWeight = 'bold'
  resetBtn.style.width = 'auto'
  resetBtn.style.minWidth = '110px'
  resetBtn.style.cursor = 'pointer'
  resetBtn.onclick = resetSnakeHighScore

  topBar.appendChild(backBtn)
  topBar.appendChild(resetBtn)

  snakeCanvas = document.createElement('canvas')
  snakeCanvas.width = snakeGridSize * snakeTileCount
  snakeCanvas.height = snakeGridSize * snakeTileCount
  snakeCanvas.style.width = '100%'
  snakeCanvas.style.maxWidth = '380px'
  snakeCanvas.style.maxHeight = '58vh'
  snakeCanvas.style.border = `2px solid ${theme.border}`
  snakeCanvas.style.backgroundColor = theme.surface

  snakeCtx = snakeCanvas.getContext('2d')

  let controlsContainer = document.createElement('div')
  controlsContainer.style.display = 'grid'
  controlsContainer.style.gridTemplateColumns = 'repeat(3, 1fr)'
  controlsContainer.style.gridTemplateRows = 'repeat(2, 1fr)'
  controlsContainer.style.gap = '8px'
  controlsContainer.style.width = '100%'
  controlsContainer.style.maxWidth = '220px'
  controlsContainer.style.marginTop = '12px'

  function makeArrowButton(label, gridArea, onClick)
  {
    let btn = document.createElement('button')
    btn.innerText = label
    btn.style.gridArea = gridArea
    btn.style.padding = '12px'
    btn.style.fontSize = '18px'
    btn.style.fontWeight = 'bold'
    btn.style.cursor = 'pointer'
    btn.style.userSelect = 'none'
    btn.onclick = (e) => {
      e.preventDefault()
      onClick()
    }
    return btn
  }

  let upBtn = makeArrowButton('W', '1 / 2 / 2 / 3', () => {
    if (snakeDir.y === 0) snakeNextDir = { x: 0, y: -1 }
  })
  let leftBtn = makeArrowButton('A', '2 / 1 / 3 / 2', () => {
    if (snakeDir.x === 0) snakeNextDir = { x: -1, y: 0 }
  })
  let downBtn = makeArrowButton('S', '2 / 2 / 3 / 3', () => {
    if (snakeDir.y === 0) snakeNextDir = { x: 0, y: 1 }
  })
  let rightBtn = makeArrowButton('D', '2 / 3 / 3 / 4', () => {
    if (snakeDir.x === 0) snakeNextDir = { x: 1, y: 0 }
  })

  controlsContainer.appendChild(upBtn)
  controlsContainer.appendChild(leftBtn)
  controlsContainer.appendChild(downBtn)
  controlsContainer.appendChild(rightBtn)

  snakeOverlay.appendChild(topBar)
  snakeOverlay.appendChild(snakeCanvas)
  snakeOverlay.appendChild(controlsContainer)

  document.body.appendChild(snakeOverlay)

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

function updateSnakeGameLogic()
{
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
        }
        spawnSnakeFood()
      }
      else
      {
        snakeList.pop()
      }
    }
  }
}

function gameLoop(now)
{
  if (!snakeOverlay) return

  let delta = now - lastFrameTime
  lastFrameTime = now
  accumulatedTime += delta

  // Process game movement steps based on precise delta time
  while (accumulatedTime >= tickRate)
  {
    updateSnakeGameLogic()
    accumulatedTime -= tickRate
  }

  let theme = getSnakeGameTheme()
  drawSnakeGame(theme)

  snakeAnimFrameId = requestAnimationFrame(gameLoop)
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

  snakeCtx.fillStyle = theme.text
  snakeCtx.font = 'bold 16px monospace'
  
  snakeCtx.textAlign = 'left'
  snakeCtx.fillText(`PTS ${snakeScore}`, 12, 28)

  snakeCtx.textAlign = 'right'
  snakeCtx.fillText(`HI ${snakeHighScore}`, snakeCanvas.width - 12, 28)

  if (snakeGameOver)
  {
    snakeCtx.fillStyle = 'rgba(0,0,0,0.5)'
    snakeCtx.fillRect(0, 0, snakeCanvas.width, snakeCanvas.height)

    snakeCtx.fillStyle = '#fff'
    snakeCtx.font = 'bold 26px monospace'
    snakeCtx.textAlign = 'center'
    snakeCtx.fillText('GAME OVER', snakeCanvas.width / 2, snakeCanvas.height / 2 - 10)

    snakeCtx.font = 'bold 14px monospace'
    snakeCtx.fillText('Tap Canvas to Restart', snakeCanvas.width / 2, snakeCanvas.height / 2 + 20)
  }
}