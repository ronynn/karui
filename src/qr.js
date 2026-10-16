// qr.js — tab-to-QR encoding. Uses qrcode-generator via CDN (swap for a
// vendored copy later by changing QR_CDN to './vendor/qrcode.min.js').
const QR_CDN = './qrcode.min.js'
const ECC = 'M'                 // error correction: L/M/Q/H. M is camera-photo friendly.
const MAX_CHUNK_BYTES = 1500    // per-frame payload budget before the KARUI1/… prefix
const PREFIX = 'KARUI1'         // marker so the receiver can identify our frames

let qrLibPromise = null

export function loadQrLib()
{
  if (window.qrcode)
  {
    return Promise.resolve(window.qrcode)
  }
  if (qrLibPromise)
  {
    return qrLibPromise
  }
  qrLibPromise = new Promise((resolve, reject) =>
  {
    const s = document.createElement('script')
    s.src = QR_CDN
    s.onload = () => window.qrcode ? resolve(window.qrcode) : reject(new Error('qrcode missing'))
    s.onerror = () => reject(new Error('QR lib load failed'))
    document.head.appendChild(s)
  })
  return qrLibPromise
}

// Compact JSON for one tab. Kept short-keyed so more notes fit per QR.
// Field map: v=version, t=tab, n=notes[]; per note:
//   i=id  x=text  c=completed(0/1)  p=pinned(1)  u=updatedAt
//   g=groupId  s=scheduledDate  r=recurrence
export function buildTabPayload(tab, notes, categoryMeta)
{
  const items = []
  for (const n of notes)
  {
    if (!n || n.category !== tab || typeof n.text !== 'string') continue
    const o = { i: n.id, x: n.text, c: n.completed ? 1 : 0, u: n.updatedAt || 0 }
    if (n.pinned) o.p = 1
    if (n.groupId) o.g = n.groupId
    if (n.scheduledDate) o.s = n.scheduledDate
    if (n.recurrence) o.r = n.recurrence
    items.push(o)
  }
  const meta = categoryMeta && categoryMeta[tab] ? categoryMeta[tab] : null
  return JSON.stringify({ v: 1, t: tab, m: meta, n: items })
}

// Splits a payload into QR-safe chunks. Multi-byte safe (chunks by UTF-8 bytes).
// Returns: [{ seq, total, id, data, single }]
export function chunkPayload(payload, maxBytes = MAX_CHUNK_BYTES)
{
  const encoder = new TextEncoder()
  const totalBytes = encoder.encode(payload).length
  if (totalBytes <= maxBytes)
  {
    return [{ seq: 1, total: 1, id: null, data: payload, single: true }]
  }

  const id = Math.random().toString(36).slice(2, 8).toUpperCase()
  const chunks = []
  let i = 0
  while (i < payload.length)
  {
    // Binary-search the longest prefix that fits the byte budget.
    let lo = i + 1
    let hi = payload.length
    while (lo < hi)
    {
      const mid = Math.floor((lo + hi + 1) / 2)
      if (encoder.encode(payload.slice(i, mid)).length <= maxBytes)
      {
        lo = mid
      }
      else
      {
        hi = mid - 1
      }
    }
    chunks.push(payload.slice(i, lo))
    i = lo
  }

  return chunks.map((data, idx) => ({
    seq: idx + 1,
    total: chunks.length,
    id,
    data,
    single: false
  }))
}

// Renders one frame to a data URL. Cell size 4px, 4-module quiet zone.
export async function renderQrToDataUrl(text)
{
  const qrcode = await loadQrLib()
  const qr = qrcode(0, ECC)   // 0 = auto type number
  qr.addData(text)
  qr.make()
  return qr.createDataURL(4, 4)
}

// Builds the exact string that goes into the QR for one frame.
export function frameToScanString(frame)
{
  if (frame.single)
  {
    return frame.data
  }
  return `${PREFIX}/${frame.id}/${frame.seq}/${frame.total}/${frame.data}`
}