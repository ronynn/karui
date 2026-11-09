import {
  createGameOverlay,
  getGameTheme,
  getGameAudioContext,
  playGameSound
} from './extras.js'

const GRID_W = 100
const GRID_H = 100
const MAX_DISPLAY_PX = 500
const MIN_ZOOM = 1
const MAX_ZOOM = 8
const MAX_UNDO = 30
const TAPER_START_LEN = 4
const TAPER_MIN = 0.15
const TAIL_STAMPS = 5
const TAIL_STEP = 1.2

const PICO8_RGB = [
  [0, 0, 0], [29, 43, 83], [126, 37, 83], [0, 135, 81],
  [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232],
  [255, 0, 77], [255, 163, 0], [255, 236, 39], [0, 228, 54],
  [41, 173, 255], [131, 118, 156], [255, 119, 168], [255, 204, 170]
]

let session = null

function packRGBA(r, g, b, a) { return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0 }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }

function injectStyles()
{
  if (document.getElementById('pixel-style')) return
  const st = document.createElement('style')
  st.id = 'pixel-style'
  st.textContent = `
    .game-canvas-host.pixel-host {
      flex: 1 1 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      height: 100% !important;
    }
    @media (orientation: landscape) {
      .game-canvas-host.pixel-host {
        flex: 0 0 auto !important;
      }
      .game-overlay.pixel-overlay {
        padding-left: max(6px, env(safe-area-inset-left, 0px)) !important;
        padding-right: max(6px, env(safe-area-inset-right, 0px)) !important;
      }
    }

    .pixel-wrap {
      display: flex;
      width: 100%;
      height: 100%;
      padding: 4px;
      box-sizing: border-box;
      overflow: hidden;
      gap: 4px;
      min-width: 0;
      min-height: 0;
    }
    .pixel-wrap.portrait {
      flex-direction: column;
      padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
    }
    .pixel-wrap.landscape { flex-direction: row; padding: 2px; }

    .pixel-sidebar {
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex-shrink: 0;
      box-sizing: border-box;
    }
    .pixel-wrap.portrait  .pixel-sidebar { display: contents; }
    .pixel-wrap.landscape .pixel-sidebar { width: 96px; }

    .pixel-palette {
      display: grid;
      gap: 2px;
      padding: 3px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 3px;
      box-sizing: border-box;
    }
    .pixel-wrap.portrait .pixel-palette {
      order: 1;
      grid-template-columns: repeat(16, 1fr);
      width: 100%;
    }
    .pixel-wrap.landscape .pixel-palette {
      grid-template-columns: repeat(4, 1fr);
      width: 100%;
    }
    .pixel-palette button {
      width: 100%;
      aspect-ratio: 1;
      padding: 0;
      border: 2px solid var(--border);
      border-radius: 2px;
      cursor: pointer;
      box-sizing: border-box;
    }

    .pixel-canvas-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .pixel-wrap.portrait  .pixel-canvas-wrap { order: 2; flex: 1; }
    .pixel-wrap.landscape .pixel-canvas-wrap { flex: 0 0 auto; }

    .pixel-canvas {
      display: block;
      image-rendering: pixelated;
      touch-action: none;
      cursor: crosshair;
      user-select: none;
      -webkit-user-select: none;
      border-radius: 2px;
      box-shadow: inset 0 0 0 2px var(--border);
      background: #ffffff;
    }

    .pixel-tools {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 3px;
      box-sizing: border-box;
    }
    .pixel-wrap.portrait  .pixel-tools { order: 3; width: 100%; }
    .pixel-wrap.landscape .pixel-tools { width: 100%; }

    .pixel-tools-row { display: flex; gap: 3px; width: 100%; }
    .pixel-wrap.portrait  .pixel-tools-row.pixel-buttons { flex-direction: row; }
    .pixel-wrap.landscape .pixel-tools-row.pixel-buttons { flex-direction: column; }

    .pixel-tools label {
      display: block;
      font-family: monospace;
      font-size: 10px;
      color: var(--text);
      white-space: nowrap;
      width: 100%;
    }
    .pixel-tools input[type=range] {
      width: 100%;
      accent-color: var(--accent);
      margin: 0;
      min-width: 0;
    }

    .pixel-btn {
      flex: 1;
      padding: 5px 4px;
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 3px;
      cursor: pointer;
      font-family: monospace;
      font-size: 10px;
      font-weight: bold;
      white-space: nowrap;
      min-width: 0;
      box-sizing: border-box;
    }
    .pixel-btn.active { background: var(--accent); color: var(--accent-txt); }
    .pixel-wrap.landscape .pixel-btn { flex: 0 0 auto; width: 100%; }
  `
  document.head.appendChild(st)
}

export function startPixelGame()
{
  if (session) return
  if (document.activeElement && typeof document.activeElement.blur === 'function')
    document.activeElement.blur()
  try { getGameAudioContext() } catch (e) {}

  injectStyles()

  const theme = getGameTheme()
  const overlay = createGameOverlay({
    onBack: stopPixelGame,
    onReset: clearCanvasExternal,
    resetLabel: 'clear'
  })
  overlay.contentHost.classList.add('pixel-host')
  overlay.overlay.classList.add('pixel-overlay')
  overlay.leftSlot.style.display = 'none'
  overlay.rightSlot.style.display = 'none'

  const pixels = new Uint32Array(GRID_W * GRID_H)
  const bgColor = packRGBA(255, 255, 255, 255)
  pixels.fill(bgColor)

  const dataCanvas = document.createElement('canvas')
  dataCanvas.width = GRID_W
  dataCanvas.height = GRID_H
  const dataCtx = dataCanvas.getContext('2d')
  const imageData = dataCtx.createImageData(GRID_W, GRID_H)
  const imgBuf = new Uint32Array(imageData.data.buffer)

  const displayCanvas = document.createElement('canvas')
  displayCanvas.className = 'pixel-canvas'
  displayCanvas.width = 100
  displayCanvas.height = 100
  const displayCtx = displayCanvas.getContext('2d', { alpha: false })
  displayCtx.fillStyle = '#ffffff'
  displayCtx.fillRect(0, 0, 100, 100)

  // Sharp base for effect pipeline
  const fxCanvas = document.createElement('canvas')
  const fxCtx = fxCanvas.getContext('2d')

  // Three channel-isolated canvases for RGB split
  const redCanvas = document.createElement('canvas')
  const redCtx = redCanvas.getContext('2d')
  const greenCanvas = document.createElement('canvas')
  const greenCtx = greenCanvas.getContext('2d')
  const blueCanvas = document.createElement('canvas')
  const blueCtx = blueCanvas.getContext('2d')

  // ---- DOM ----
  const wrap = document.createElement('div')
  wrap.className = 'pixel-wrap portrait'

  const sidebar = document.createElement('div')
  sidebar.className = 'pixel-sidebar'

  const palette = document.createElement('div')
  palette.className = 'pixel-palette'

  const tools = document.createElement('div')
  tools.className = 'pixel-tools'

  const canvasWrap = document.createElement('div')
  canvasWrap.className = 'pixel-canvas-wrap'
  canvasWrap.appendChild(displayCanvas)

  sidebar.appendChild(palette)
  sidebar.appendChild(tools)
  wrap.appendChild(sidebar)
  wrap.appendChild(canvasWrap)
  overlay.contentHost.appendChild(wrap)

  const swatches = []
  for (let i = 0; i < 16; i++)
  {
    const [r, g, b] = PICO8_RGB[i]
    const sw = document.createElement('button')
    sw.type = 'button'
    sw.style.background = `rgb(${r},${g},${b})`
    sw.addEventListener('click', (e) => { e.preventDefault(); if (session) selectColor(i) })
    palette.appendChild(sw)
    swatches.push(sw)
  }

  const brushRow = document.createElement('div')
  brushRow.className = 'pixel-tools-row'
  brushRow.style.flexDirection = 'column'

  const brushLabel = document.createElement('label')
  brushLabel.textContent = 'BRUSH 1'

  const brushSlider = document.createElement('input')
  brushSlider.type = 'range'
  brushSlider.min = '1'
  brushSlider.max = '16'
  brushSlider.value = '1'
  brushSlider.addEventListener('input', () => {
    if (!session) return
    session.brushSize = parseInt(brushSlider.value, 10)
    brushLabel.textContent = `BRUSH ${brushSlider.value}`
  })
  brushRow.appendChild(brushLabel)
  brushRow.appendChild(brushSlider)

  const btnRow = document.createElement('div')
  btnRow.className = 'pixel-tools-row pixel-buttons'

  let aaOn = true
  const aaBtn = document.createElement('button')
  aaBtn.type = 'button'
  aaBtn.className = 'pixel-btn active'
  aaBtn.textContent = 'AA'
  aaBtn.addEventListener('click', (e) => {
    e.preventDefault()
    aaOn = !aaOn
    aaBtn.classList.toggle('active', aaOn)
  })

  const undoBtn = document.createElement('button')
  undoBtn.type = 'button'
  undoBtn.className = 'pixel-btn'
  undoBtn.textContent = 'UNDO'
  undoBtn.addEventListener('click', (e) => {
    e.preventDefault()
    if (session) undoStroke()
  })

  let fxOn = false
  const fxBtn = document.createElement('button')
  fxBtn.type = 'button'
  fxBtn.className = 'pixel-btn'
  fxBtn.textContent = 'GLITCH'
  fxBtn.addEventListener('click', (e) => {
    e.preventDefault()
    fxOn = !fxOn
    fxBtn.classList.toggle('active', fxOn)
    if (session) { session.fxOn = fxOn; scheduleRender() }
  })

  btnRow.appendChild(aaBtn)
  btnRow.appendChild(undoBtn)
  btnRow.appendChild(fxBtn)

  tools.appendChild(brushRow)
  tools.appendChild(btnRow)

  session = {
    overlay, theme, wrap, sidebar, palette, canvasWrap, tools,
    pixels, bgColor,
    dataCanvas, dataCtx, imageData, imgBuf,
    displayCanvas, displayCtx,
    fxCanvas, fxCtx,
    redCanvas, redCtx, greenCanvas, greenCtx, blueCanvas, blueCtx,
    swatches, brushSlider, brushLabel, aaBtn, undoBtn, fxBtn,
    brushSize: 1,
    selectedColor: 0,
    colorRGB: PICO8_RGB[0].slice(),
    viewZoom: MIN_ZOOM,
    viewPanX: 0,
    viewPanY: 0,
    drawing: false,
    strokeFirst: true,
    strokeDistance: 0,
    lastX: 0,
    lastY: 0,
    lastDirX: 0,
    lastDirY: 0,
    undoStack: [],
    strokeChanges: null,
    activePointers: new Map(),
    pinchStartDist: 0,
    pinchStartZoom: 0,
    pinchStartMidX: 0,
    pinchStartMidY: 0,
    pinchStartPanX: 0,
    pinchStartPanY: 0,
    panning: false,
    panStartX: 0,
    panStartY: 0,
    panStartPanX: 0,
    panStartPanY: 0,
    fxOn: false,
    renderScheduled: false,
    _keydown: null,
    _resize: null,
    _render: null,
    _scheduleRender: null
  }

  Object.defineProperty(session, 'aa', { get: () => aaOn })

  function selectColor(i)
  {
    const s = session
    if (!s) return
    s.selectedColor = i
    s.colorRGB = PICO8_RGB[i].slice()
    for (let k = 0; k < s.swatches.length; k++)
      s.swatches[k].style.borderColor = k === i ? theme.accent : theme.border
  }

  function scheduleRender()
  {
    const s = session
    if (!s || s.renderScheduled) return
    s.renderScheduled = true
    requestAnimationFrame(() => {
      if (!session) return
      session.renderScheduled = false
      render()
    })
  }

  function applyOrientation()
  {
    const s = session
    if (!s) return
    const portrait = window.innerHeight >= window.innerWidth
    s.wrap.className = 'pixel-wrap ' + (portrait ? 'portrait' : 'landscape')
    computeLayout()
  }

  function computeLayout()
  {
    const s = session
    if (!s) return
    const portrait = window.innerHeight >= window.innerWidth
    let avail

    if (portrait)
    {
      const r = s.canvasWrap.getBoundingClientRect()
      avail = Math.min(r.width, r.height, MAX_DISPLAY_PX)
      s.overlay.contentHost.style.width = ''
    }
    else
    {
      const byHeight = window.innerHeight - 20
      const byWidth = window.innerWidth - 250
      avail = Math.min(byHeight, byWidth, MAX_DISPLAY_PX)
      const sidebarAndPadding = 96 + 4 + 4 + 4
      s.overlay.contentHost.style.width = (avail + sidebarAndPadding) + 'px'
    }

    avail = Math.max(40, Math.round(avail))

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    s.displayCanvas.style.width = avail + 'px'
    s.displayCanvas.style.height = avail + 'px'
    s.displayCanvas.width = Math.round(avail * dpr)
    s.displayCanvas.height = Math.round(avail * dpr)

    s.displayCtx.fillStyle = '#ffffff'
    s.displayCtx.fillRect(0, 0, s.displayCanvas.width, s.displayCanvas.height)

    clampView()
    scheduleRender()
  }

  function clampView()
  {
    const s = session
    const vis = GRID_W / s.viewZoom
    s.viewPanX = clamp(s.viewPanX, 0, GRID_W - vis)
    s.viewPanY = clamp(s.viewPanY, 0, GRID_H - vis)
  }

  // ---- Render ----
  // Plain path (no effect, or actively drawing to keep input fast).
  // Glitch path (effect on, not drawing): RGB split + scanlines + vignette.
  function render()
  {
    const s = session
    if (!s) return
    const dw = s.displayCanvas.width
    const dh = s.displayCanvas.height
    if (dw === 0 || dh === 0) return

    s.imgBuf.set(s.pixels)
    s.dataCtx.putImageData(s.imageData, 0, 0)

    const vis = GRID_W / s.viewZoom
    const srcX = clamp(s.viewPanX, 0, GRID_W - vis)
    const srcY = clamp(s.viewPanY, 0, GRID_H - vis)
    const dctx = s.displayCtx

    // During a stroke: skip the effect so input stays snappy.
    const useEffect = s.fxOn && !s.drawing

    if (!useEffect)
    {
      dctx.imageSmoothingEnabled = false
      dctx.fillStyle = '#ffffff'
      dctx.fillRect(0, 0, dw, dh)
      dctx.drawImage(s.dataCanvas, srcX, srcY, vis, vis, 0, 0, dw, dh)
      return
    }

    // 1. Sharp base render into fxCanvas
    if (s.fxCanvas.width !== dw) s.fxCanvas.width = dw
    if (s.fxCanvas.height !== dh) s.fxCanvas.height = dh
    const tctx = s.fxCtx
    tctx.imageSmoothingEnabled = false
    tctx.fillStyle = '#000'
    tctx.fillRect(0, 0, dw, dh)
    tctx.drawImage(s.dataCanvas, srcX, srcY, vis, vis, 0, 0, dw, dh)

    // 2. Isolate R / G / B channels (multiply with pure color keeps that
    //    channel and zeroes the others — cheap, no ctx.filter needed)
    if (s.redCanvas.width !== dw)
    {
      s.redCanvas.width = dw; s.greenCanvas.width = dw; s.blueCanvas.width = dw
    }
    if (s.redCanvas.height !== dh)
    {
      s.redCanvas.height = dh; s.greenCanvas.height = dh; s.blueCanvas.height = dh
    }

    const rc = s.redCtx
    rc.globalCompositeOperation = 'source-over'
    rc.drawImage(s.fxCanvas, 0, 0)
    rc.globalCompositeOperation = 'multiply'
    rc.fillStyle = '#ff0000'
    rc.fillRect(0, 0, dw, dh)
    rc.globalCompositeOperation = 'source-over'

    const gc = s.greenCtx
    gc.globalCompositeOperation = 'source-over'
    gc.drawImage(s.fxCanvas, 0, 0)
    gc.globalCompositeOperation = 'multiply'
    gc.fillStyle = '#00ff00'
    gc.fillRect(0, 0, dw, dh)
    gc.globalCompositeOperation = 'source-over'

    const bc = s.blueCtx
    bc.globalCompositeOperation = 'source-over'
    bc.drawImage(s.fxCanvas, 0, 0)
    bc.globalCompositeOperation = 'multiply'
    bc.fillStyle = '#0000ff'
    bc.fillRect(0, 0, dw, dh)
    bc.globalCompositeOperation = 'source-over'

    // 3. Composite the three channels with an X offset → chromatic aberration
    dctx.imageSmoothingEnabled = false
    dctx.globalCompositeOperation = 'source-over'
    dctx.fillStyle = '#000'
    dctx.fillRect(0, 0, dw, dh)

    const aberr = Math.max(2, Math.round(dw * 0.004))
    dctx.globalCompositeOperation = 'lighter'
    dctx.drawImage(s.redCanvas,   aberr, 0)
    dctx.drawImage(s.greenCanvas, 0, 0)
    dctx.drawImage(s.blueCanvas, -aberr, 0)
    dctx.globalCompositeOperation = 'source-over'

    // 4. Scanlines
    const gap = 3
    dctx.globalAlpha = 0.14
    dctx.fillStyle = '#000'
    for (let y = 0; y < dh; y += gap)
    {
      dctx.fillRect(0, y, dw, 1)
    }
    dctx.globalAlpha = 1

    // 5. Vignette
    const cx = dw / 2, cy = dh / 2
    const innerR = Math.min(dw, dh) * 0.35
    const outerR = Math.max(dw, dh) * 0.75
    const grad = dctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.55)')
    dctx.fillStyle = grad
    dctx.fillRect(0, 0, dw, dh)
  }

  session._render = render
  session._scheduleRender = scheduleRender

  function screenToGrid(cx, cy)
  {
    const s = session
    const r = s.displayCanvas.getBoundingClientRect()
    const relX = r.width > 0 ? (cx - r.left) / r.width : 0
    const relY = r.height > 0 ? (cy - r.top) / r.height : 0
    const vis = GRID_W / s.viewZoom
    return { x: s.viewPanX + relX * vis, y: s.viewPanY + relY * vis }
  }

  function applyStamp(gx, gy, taper, record)
  {
    const s = session
    const size = s.brushSize * taper
    if (size < 0.4) return
    const cr = s.colorRGB[0], cg = s.colorRGB[1], cb = s.colorRGB[2]
    const target = s.pixels

    if (size < 1.05)
    {
      const px = Math.floor(gx), py = Math.floor(gy)
      if (px < 0 || px >= GRID_W || py < 0 || py >= GRID_H) return
      const idx = py * GRID_W + px
      const old = target[idx]
      const nv = packRGBA(cr, cg, cb, 255)
      if (nv === old) return
      if (record && s.strokeChanges && !s.strokeChanges.has(idx))
        s.strokeChanges.set(idx, old)
      target[idx] = nv
      return
    }

    const aa = s.aa
    const r = size / 2
    const coreR = aa ? r * 0.55 : r
    const rSq = r * r
    const minX = Math.max(0, Math.floor(gx - r - 1))
    const maxX = Math.min(GRID_W - 1, Math.ceil(gx + r + 1))
    const minY = Math.max(0, Math.floor(gy - r - 1))
    const maxY = Math.min(GRID_H - 1, Math.ceil(gy + r + 1))

    for (let y = minY; y <= maxY; y++)
    {
      for (let x = minX; x <= maxX; x++)
      {
        const dx = x + 0.5 - gx
        const dy = y + 0.5 - gy
        const d2 = dx * dx + dy * dy
        if (d2 > rSq) continue
        const d = Math.sqrt(d2)
        let alpha
        if (d <= coreR) alpha = 1
        else
        {
          const t = (d - coreR) / (r - coreR)
          alpha = 1 - t * t * (3 - 2 * t)
        }
        if (alpha <= 0.02) continue

        const idx = y * GRID_W + x
        const old = target[idx]
        const orr = old & 0xFF
        const og = (old >>> 8) & 0xFF
        const ob = (old >>> 16) & 0xFF
        const nr = Math.round(orr * (1 - alpha) + cr * alpha)
        const ng = Math.round(og * (1 - alpha) + cg * alpha)
        const nb = Math.round(ob * (1 - alpha) + cb * alpha)
        const nv = packRGBA(nr, ng, nb, 255)
        if (nv === old) continue
        if (record && s.strokeChanges && !s.strokeChanges.has(idx))
          s.strokeChanges.set(idx, old)
        target[idx] = nv
      }
    }
  }

  function stamp(gx, gy, taper) { applyStamp(gx, gy, taper, true) }

  function startStroke()
  {
    const s = session
    s.strokeChanges = new Map()
    s.drawing = true
    s.strokeFirst = true
    s.strokeDistance = 0
  }

  function strokeTo(gx, gy)
  {
    const s = session
    if (s.strokeFirst)
    {
      s.strokeFirst = false
      s.strokeDistance = 0
      s.lastX = gx
      s.lastY = gy
      s.lastDirX = 0
      s.lastDirY = 0
      stamp(gx, gy, TAPER_MIN)
      return
    }
    const dx = gx - s.lastX
    const dy = gy - s.lastY
    const dist = Math.hypot(dx, dy)
    if (dist < 0.001) return
    s.lastDirX = dx / dist
    s.lastDirY = dy / dist

    const step = Math.max(0.35, s.brushSize / 6)
    const steps = Math.max(1, Math.ceil(dist / step))
    for (let i = 1; i <= steps; i++)
    {
      const t = i / steps
      const px = s.lastX + dx * t
      const py = s.lastY + dy * t
      s.strokeDistance += dist / steps
      let taper = 1
      if (s.strokeDistance < TAPER_START_LEN)
        taper = TAPER_MIN + (1 - TAPER_MIN) * (s.strokeDistance / TAPER_START_LEN)
      stamp(px, py, taper)
    }
    s.lastX = gx
    s.lastY = gy
  }

  function applyEndTaper()
  {
    const s = session
    if (!s.lastDirX && !s.lastDirY) return
    if (s.brushSize <= 1) return
    for (let i = 1; i <= TAIL_STAMPS; i++)
    {
      const t = i / (TAIL_STAMPS + 1)
      const taper = TAPER_MIN + (1 - TAPER_MIN) * (1 - t) * 0.55
      const offset = i * TAIL_STEP
      stamp(s.lastX + s.lastDirX * offset, s.lastY + s.lastDirY * offset, taper)
    }
  }

  function commitStroke()
  {
    const s = session
    if (!s) return
    applyEndTaper()

    const changes = s.strokeChanges
    if (changes && changes.size > 0)
    {
      const idxs = [], olds = []
      changes.forEach((v, k) => { idxs.push(k); olds.push(v) })
      s.undoStack.push({ idxs, olds })
      if (s.undoStack.length > MAX_UNDO) s.undoStack.shift()
    }
    s.strokeChanges = null
    s.drawing = false
    s.strokeFirst = true
    scheduleRender()
  }

  function cancelStroke()
  {
    const s = session
    if (s.strokeChanges)
      s.strokeChanges.forEach((v, k) => { s.pixels[k] = v })
    s.strokeChanges = null
    s.drawing = false
    s.strokeFirst = true
    scheduleRender()
  }

  function undoStroke()
  {
    const s = session
    const last = s.undoStack.pop()
    if (!last) return
    for (let i = 0; i < last.idxs.length; i++)
      s.pixels[last.idxs[i]] = last.olds[i]
    scheduleRender()
    try { playGameSound('click') } catch (e) {}
  }

  function onPointerDown(e)
  {
    const s = session
    if (!s) return
    try { displayCanvas.setPointerCapture(e.pointerId) } catch (err) {}
    s.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (s.activePointers.size === 2)
    {
      if (s.drawing) cancelStroke()
      s.panning = false
      const pts = Array.from(s.activePointers.values())
      s.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      s.pinchStartZoom = s.viewZoom
      s.pinchStartMidX = (pts[0].x + pts[1].x) / 2
      s.pinchStartMidY = (pts[0].y + pts[1].y) / 2
      s.pinchStartPanX = s.viewPanX
      s.pinchStartPanY = s.viewPanY
      return
    }

    if (e.pointerType !== 'touch' && (e.button === 1 || e.button === 2 || e.shiftKey))
    {
      e.preventDefault()
      s.panning = true
      s.panStartX = e.clientX
      s.panStartY = e.clientY
      s.panStartPanX = s.viewPanX
      s.panStartPanY = s.viewPanY
      return
    }

    e.preventDefault()
    startStroke()
    const g = screenToGrid(e.clientX, e.clientY)
    strokeTo(g.x, g.y)
    scheduleRender()
  }

  function onPointerMove(e)
  {
    const s = session
    if (!s) return
    if (!s.activePointers.has(e.pointerId)) return
    s.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (s.activePointers.size === 2)
    {
      e.preventDefault()
      const pts = Array.from(s.activePointers.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const midX = (pts[0].x + pts[1].x) / 2
      const midY = (pts[0].y + pts[1].y) / 2
      if (s.pinchStartDist <= 0) return

      const scale = dist / s.pinchStartDist
      const newZoom = clamp(s.pinchStartZoom * scale, MIN_ZOOM, MAX_ZOOM)
      const r = s.displayCanvas.getBoundingClientRect()
      const relX = r.width > 0 ? (s.pinchStartMidX - r.left) / r.width : 0.5
      const relY = r.height > 0 ? (s.pinchStartMidY - r.top) / r.height : 0.5
      const oldVis = GRID_W / s.pinchStartZoom
      const gx = s.pinchStartPanX + relX * oldVis
      const gy = s.pinchStartPanY + relY * oldVis

      s.viewZoom = newZoom
      const newVis = GRID_W / newZoom
      s.viewPanX = gx - relX * newVis
      s.viewPanY = gy - relY * newVis

      const panDx = (midX - s.pinchStartMidX) * oldVis / (r.width || 1)
      const panDy = (midY - s.pinchStartMidY) * oldVis / (r.height || 1)
      s.viewPanX -= panDx
      s.viewPanY -= panDy

      clampView()
      scheduleRender()
      return
    }

    if (s.panning)
    {
      e.preventDefault()
      const r = s.displayCanvas.getBoundingClientRect()
      const vis = GRID_W / s.viewZoom
      const cpp = r.width > 0 ? vis / r.width : 0
      s.viewPanX = s.panStartPanX - (e.clientX - s.panStartX) * cpp
      s.viewPanY = s.panStartPanY - (e.clientY - s.panStartY) * cpp
      clampView()
      scheduleRender()
      return
    }

    if (!s.drawing) return
    e.preventDefault()
    const g = screenToGrid(e.clientX, e.clientY)
    strokeTo(g.x, g.y)
    scheduleRender()
  }

  function onPointerUp(e)
  {
    const s = session
    if (!s) return
    s.activePointers.delete(e.pointerId)
    if (s.activePointers.size === 0)
    {
      if (s.drawing) commitStroke()
      s.panning = false
    }
    try { displayCanvas.releasePointerCapture(e.pointerId) } catch (err) {}
  }

  displayCanvas.addEventListener('pointerdown', onPointerDown)
  displayCanvas.addEventListener('pointermove', onPointerMove)
  displayCanvas.addEventListener('pointerup', onPointerUp)
  displayCanvas.addEventListener('pointercancel', onPointerUp)
  displayCanvas.addEventListener('contextmenu', (e) => e.preventDefault())

  function onKeyDown(e)
  {
    const s = session
    if (!s || s.viewZoom <= MIN_ZOOM) return
    let dx = 0, dy = 0
    if (e.key === 'ArrowLeft') dx = -1
    else if (e.key === 'ArrowRight') dx = 1
    else if (e.key === 'ArrowUp') dy = -1
    else if (e.key === 'ArrowDown') dy = 1
    else return
    e.preventDefault()
    s.viewPanX += dx; s.viewPanY += dy
    clampView()
    scheduleRender()
  }
  window.addEventListener('keydown', onKeyDown)
  session._keydown = onKeyDown

  function onResize()
  {
    if (!session) return
    applyOrientation()
  }
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)
  session._resize = onResize

  selectColor(0)
  applyOrientation()
  scheduleRender()
}

function clearCanvasExternal()
{
  if (!session) return
  const s = session
  const idxs = [], olds = []
  for (let i = 0; i < s.pixels.length; i++)
  {
    if (s.pixels[i] !== s.bgColor) { idxs.push(i); olds.push(s.pixels[i]) }
  }
  if (idxs.length === 0) return
  s.pixels.fill(s.bgColor)
  s.undoStack.push({ idxs, olds })
  if (s.undoStack.length > MAX_UNDO) s.undoStack.shift()

  s.imgBuf.set(s.pixels)
  s.dataCtx.putImageData(s.imageData, 0, 0)
  if (s._render) s._render()
  try { playGameSound('click') } catch (e) {}
}

export function stopPixelGame()
{
  if (!session) return
  if (session._keydown) window.removeEventListener('keydown', session._keydown)
  if (session._resize)
  {
    window.removeEventListener('resize', session._resize)
    window.removeEventListener('orientationchange', session._resize)
  }
  session.overlay.remove()
  session = null
}