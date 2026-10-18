

import { nextTick } from './petite-vue.es.js'

const QR_CDN = './qrcode.min.js'
const ECC = 'M'
const MAX_CHUNK_BYTES = 1500
const PREFIX = 'KARUI1'

let qrLibPromise = null

export function loadQrLib()
{
  if (window.qrcode) return Promise.resolve(window.qrcode)
  if (qrLibPromise) return qrLibPromise
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
    if (n.reminderTime) o.tm = n.reminderTime
    items.push(o)
  }
  const meta = categoryMeta && categoryMeta[tab] ? categoryMeta[tab] : null
  return JSON.stringify({ v: 1, t: tab, m: meta, n: items })
}

export function chunkPayload(payload, maxBytes = MAX_CHUNK_BYTES)
{
  const encoder = new TextEncoder()
  if (encoder.encode(payload).length <= maxBytes)
  {
    return [{ seq: 1, total: 1, id: null, data: payload, single: true }]
  }

  const id = Math.random().toString(36).slice(2, 8).toUpperCase()
  const chunks = []
  let i = 0
  while (i < payload.length)
  {
    let lo = i + 1
    let hi = payload.length
    while (lo < hi)
    {
      const mid = Math.floor((lo + hi + 1) / 2)
      if (encoder.encode(payload.slice(i, mid)).length <= maxBytes) lo = mid
      else hi = mid - 1
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

export async function renderQrToDataUrl(text)
{
  const qrcode = await loadQrLib()
  const qr = qrcode(0, ECC)
  qr.addData(text)
  qr.make()
  return qr.createDataURL(4, 4)
}

export function frameToScanString(frame)
{
  if (frame.single) return frame.data
  return `${PREFIX}/${frame.id}/${frame.seq}/${frame.total}/${frame.data}`
}

export function parseScannedText(text)
{
  if (!text || typeof text !== 'string') return { type: 'invalid' }
  const prefix = PREFIX + '/'
  if (text.startsWith(prefix))
  {
    const rest = text.slice(prefix.length)
    const parts = rest.split('/')
    if (parts.length < 4) return { type: 'invalid' }
    const id = parts[0]
    const seq = parseInt(parts[1], 10)
    const total = parseInt(parts[2], 10)
    const data = parts.slice(3).join('/')
    if (!id || isNaN(seq) || isNaN(total) || seq < 1 || seq > total || total < 1)
    {
      return { type: 'invalid' }
    }
    return { type: 'frame', id, seq, total, data }
  }
  try { JSON.parse(text); return { type: 'single', payload: text } }
  catch (e) { return { type: 'invalid' } }
}

export function parseTabPayload(input)
{
  let obj
  if (typeof input === 'string')
  {
    try { obj = JSON.parse(input) }
    catch (e) { return null }
  }
  else
  {
    obj = input
  }
  if (!obj) return null

  if (obj.v === 1 && typeof obj.t === 'string' && Array.isArray(obj.n))
  {
    const notes = obj.n.map(item =>
      {
        if (!item || typeof item.x !== 'string') return null
        const note = {
          id: item.i,
          text: item.x,
          completed: !!item.c,
          category: obj.t,
          pinned: !!item.p,
          updatedAt: item.u || Date.now()
        }
        if (item.g) note.groupId = item.g
        if (item.s) note.scheduledDate = item.s
        if (item.r) note.recurrence = item.r
        if (item.tm) note.reminderTime = item.tm
        return note
      }).filter(Boolean)
    return { tab: obj.t, meta: obj.m || null, notes }
  }

  if (Array.isArray(obj.notes))
  {
    const notes = obj.notes.map(item =>
      {
        if (typeof item === 'string') return { text: item }
        return item
      })
    return { tab: null, meta: null, notes, categories: obj.noteCategories || null }
  }

  if (Array.isArray(obj))
  {
    const notes = obj.map(item =>
      {
        if (typeof item === 'string') return { text: item }
        return item
      })
    return { tab: null, meta: null, notes }
  }

  return null
}

// --- Module: state + methods ---

export function createQrModule()
{
  return {
    // --- QR share state ---
    qrModalVisible: false,
    qrTabName: '',
    qrFrames: [],
    qrFrameIdx: 0,
    qrCurrentImage: '',
    qrBusy: false,

    // --- Paste JSON state ---
    pasteJsonVisible: false,
    pasteJsonText: '',

    // ---------- QR export: full tab ----------

    async showTabQr()
    {
      const tab = this.contextTab
      this.closeAllMenus()
      if (!tab) return

      this.qrTabName = tab
      this.qrFrames = []
      this.qrFrameIdx = 0
      this.qrCurrentImage = ''
      this.qrBusy = true
      this.qrModalVisible = true

      try
      {
        const payload = buildTabPayload(tab, this.notes, this.categoryMeta)
        this.qrFrames = chunkPayload(payload)
        await this.renderQrFrame(0)
      }
      catch (e)
      {
        this.qrModalVisible = false
        this.showToast('QR generation failed')
      }
      finally
      {
        this.qrBusy = false
      }
    },

    // ---------- QR export: single note (plaintext) ----------

    async showNoteQr()
    {
      const id = this.activeNoteMenuId
      this.closeAllMenus()
      const note = this.notes.find(n => n.id === id)
      if (!note) return

      this.qrTabName = note.text.length > 40 ? note.text.slice(0, 40) + '…' : note.text
      this.qrFrames = []
      this.qrFrameIdx = 0
      this.qrCurrentImage = ''
      this.qrBusy = true
      this.qrModalVisible = true

      try
      {
        // Plaintext — raw note text goes into the QR.
        this.qrFrames = chunkPayload(note.text)
        await this.renderQrFrame(0)
      }
      catch (e)
      {
        this.qrModalVisible = false
        this.showToast('QR generation failed')
      }
      finally
      {
        this.qrBusy = false
      }
    },

    async renderQrFrame(idx)
    {
      const frame = this.qrFrames[idx]
      if (!frame) return
      this.qrCurrentImage = await renderQrToDataUrl(frameToScanString(frame))
    },

    async qrPrevFrame()
    {
      if (this.qrBusy || this.qrFrameIdx <= 0) return
      this.qrBusy = true
      this.qrFrameIdx--
      try { await this.renderQrFrame(this.qrFrameIdx) }
      finally { this.qrBusy = false }
    },

    async qrNextFrame()
    {
      if (this.qrBusy || this.qrFrameIdx >= this.qrFrames.length - 1) return
      this.qrBusy = true
      this.qrFrameIdx++
      try { await this.renderQrFrame(this.qrFrameIdx) }
      finally { this.qrBusy = false }
    },

    qrClose()
    {
      this.qrModalVisible = false
      this.qrFrames = []
      this.qrFrameIdx = 0
      this.qrCurrentImage = ''
      this.qrBusy = false
    },

    // ---------- Paste JSON / frames / plaintext ----------

    openPasteJson()
    {
      this.closeAllMenus()
      this.pasteJsonVisible = true
      this.pasteJsonText = ''
      nextTick(() =>
        {
          const el = document.getElementById('paste-json-input')
          if (el) el.focus()
        })
    },

    closePasteJson()
    {
      this.pasteJsonVisible = false
      this.pasteJsonText = ''
    },

    importPastedJson()
    {
      const raw = this.pasteJsonText.trim()
      if (!raw) { this.showToast('Nothing to paste'); return }

      // Direct JSON
      if (raw[0] === '{' || raw[0] === '[')
      {
        this._qrImportPayload(raw)
        return
      }

      // Multi-frame collection?
      const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      const batches = {}
      let hasFrames = false
      for (const line of lines)
      {
        const p = parseScannedText(line)
        if (p.type === 'frame')
        {
          hasFrames = true
          const b = batches[p.id] || (batches[p.id] = { total: p.total, parts: [] })
          b.parts[p.seq - 1] = p.data
        }
      }

      if (hasFrames)
      {
        const ids = Object.keys(batches)
        for (const id of ids)
        {
          const b = batches[id]
          const captured = b.parts.filter(x => x !== undefined).length
          if (captured === b.total)
          {
            this._qrImportPayload(b.parts.join(''))
            return
          }
        }
        const b = batches[ids[0]]
        const captured = b.parts.filter(x => x !== undefined).length
        this.showToast(`Incomplete — ${captured}/${b.total} frames`)
        return
      }

      // Plaintext
      this._qrImportPayload(raw)
    },

    _qrImportPayload(raw)
    {
      // 1) JSON envelope (tab QR or export)
      const parsed = parseTabPayload(raw)
      if (parsed && parsed.notes && parsed.notes.length)
      {
        if (parsed.categories)
        {
          parsed.categories.forEach(c =>
            {
              if (!this.noteCategories.includes(c)) this.noteCategories.push(c)
            })
        }
        const result = this.mergeNotes(parsed.notes)
        const added = (result && typeof result.added === 'number') ? result.added : 0
        this.showToast(added > 0
                       ? `Imported ${added} note${added === 1 ? '' : 's'}`
                       : 'Already in sync — no new notes')
        this.closePasteJson()
        return
      }

      // 2) Plaintext (with optional markdown checkboxes)
      const notes = this._parsePlaintextNotes(raw)
      if (!notes.length)
      {
        this.showToast('No notes found')
        return
      }
      const result = this.mergeNotes(notes)
      const added = (result && typeof result.added === 'number') ? result.added : 0
      this.showToast(added > 0
                     ? `Imported ${added} note${added === 1 ? '' : 's'}`
                     : 'Already in sync — no new notes')
      this.closePasteJson()
    },

    _parsePlaintextNotes(raw)
    {
      const lines = raw.split(/\r?\n/)
      const hasCheckboxes = lines.some(l => /^-\s*\[[ xX]\]/.test(l.trim()))

      // No checkboxes → whole text is one note (preserves multiline)
      if (!hasCheckboxes)
      {
        const text = raw.trim()
        if (!text) return []
        return [{
          id: Date.now() + Math.floor(Math.random() * 100000),
          text,
          completed: false,
          category: this.activeCategory,
          pinned: false,
          updatedAt: Date.now()
        }]
      }

      // Checkbox list → line-by-line into current tab
      const notes = []
      const cat = this.activeCategory
      let idx = 0
      for (const line of lines)
      {
        const trimmed = line.trim()
        if (!trimmed) continue
        const cb = trimmed.match(/^-\s*\[([ xX])\]\s*(.*)$/)
        if (cb)
        {
          const text = cb[2].trim()
          if (!text) continue
          notes.push({
            id: Date.now() + Math.floor(Math.random() * 100000) + idx++,
            text,
            completed: cb[1].toLowerCase() === 'x',
            category: cat,
            pinned: false,
            updatedAt: Date.now()
          })
        }
        else
        {
          notes.push({
            id: Date.now() + Math.floor(Math.random() * 100000) + idx++,
            text: trimmed,
            completed: false,
            category: cat,
            pinned: false,
            updatedAt: Date.now()
          })
        }
      }
      return notes
    }
  }
}