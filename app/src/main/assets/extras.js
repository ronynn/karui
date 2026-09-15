// --- SECTION: EXTRAS & UTILITIES ---
let audioCtx = null

export function playSound(type = 'click', uiSoundsEnabled = true)
{
  if (!uiSoundsEnabled) return
  try
  {
    if (!audioCtx)
    {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioCtx.state === 'suspended')
    {
      audioCtx.resume()
    }

    let osc = audioCtx.createOscillator()
    let gain = audioCtx.createGain()

    if (type === 'add' || type === 'scratch')
    {
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(320, audioCtx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(850, audioCtx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.12)
    }
    else if (type === 'tab')
    {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(600, audioCtx.currentTime)
      osc.frequency.setValueAtTime(900, audioCtx.currentTime + 0.04)
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.08)
    }
    else
    {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, audioCtx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.03)
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.03)
    }
  }
  catch (e) {}
}

export function createRipple(e, btn)
{
  btn.classList.add('has-ripple')
  let rect = btn.getBoundingClientRect()
  let circle = document.createElement('span')
  let diameter = Math.max(rect.width, rect.height)
  let radius = diameter / 2
  circle.style.width = circle.style.height = `${diameter}px`
  circle.style.left = `${e.clientX - rect.left - radius}px`
  circle.style.top = `${e.clientY - rect.top - radius}px`
  circle.classList.add('ripple-span')

  let existing = btn.getElementsByClassName('ripple-span')[0]
  if (existing) existing.remove()

  btn.appendChild(circle)
  setTimeout(() => {
    if (circle.parentNode) circle.remove()
  }, 1000)
}

export const gameRegistry = {
  'FLAPTHEBIRD': () => typeof startFlapGame === 'function' && startFlapGame(),
  'MOON': () => typeof startFlapGame === 'function' && startLanderGame(),
  'SLITHER': () => typeof startSnakeGame === 'function' && startSnakeGame()
}

export function tryRunGame(code)
{
  const isGame = Boolean(gameRegistry[code])
  gameRegistry[code]?.()
  return isGame
}