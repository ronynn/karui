// --- SECTION: DATA SYNCHRONISATION & FILE I/O HANDLERS ---
//
// Locked-tab policy (matches notes.js):
//   * READ / EXPORT / SYNC paths must exclude locked tabs. Their notes are
//     never written to a markdown file, never reach Android's calendar sync,
//     and never appear in an export JSON.
//   * WRITE paths (Android quick-capture, share-sheet intent) are allowed
//     into locked tabs. The user is present when they share, so appending is
//     fine; the content is simply hidden behind the PIN on next read.
//   * MERGE / IMPORT into a locked tab is skipped: silently overwriting
//     hidden notes with imported data the user cannot verify is worse than
//     refusing the merge. The caller reports "skipped" counts.
//
// `clean = true` emits a metadata-free markdown file: just category headers
// and `- [ ] text` / `- [x] text` lines. Useful for sharing / QR payloads.
export function generateMarkdownString(noteCategories, notes, categoryMeta = {}, clean = false)
{
  let mdStr = ''
  noteCategories.forEach((cat, idx) =>
  {
    if (clean)
    {
      mdStr += `## ${cat}\n`
    }
    else
    {
      let catId = categoryMeta[cat]?.id || (Date.now() + idx)
      let catUpdated = categoryMeta[cat]?.updatedAt || Date.now()
      mdStr += `## ${cat} <!-- cat_id:${catId} u:${catUpdated} -->\n`
    }

    let catNotes = notes.filter(n => n.category === cat)
    catNotes.forEach(n =>
    {
      let mark = n.completed ? 'x' : ' '
      let rawText = (n.text || '').replace(/^(?:- \[[ xX]\]\s*)+/, '')
      let sanitizedText = rawText.replace(/\r?\n/g, '\\n')

      if (clean)
      {
        mdStr += `- [${mark}] ${sanitizedText}\n`
      }
      else
      {
        let pin = n.pinned ? ' pinned:true' : ''
        let updated = n.updatedAt || Date.now()

        let extra = ''
        if (n.groupId) extra += ` gid:${n.groupId}`
        if (n.scheduledDate) extra += ` sd:${n.scheduledDate}`
        if (n.recurrence) extra += ` rec:${n.recurrence}`

        mdStr += `- [${mark}] ${sanitizedText} <!-- id:${n.id} u:${updated}${pin}${extra} -->\n`
      }
    })
    if (idx < noteCategories.length - 1) mdStr += '\n'
  })
  return mdStr
}

export function parseMarkdownAndMerge(text, appStore)
{
  try
  {
    if (!text || typeof text !== 'string')
    {
      appStore.showToast('Format Error!')
      return
    }

    let cleanText = text.replace(/\r/g, '')
    let lines = cleanText.split('\n')
    let currentCat = 'Main'
    let importedNotes = []
    let importedCategories = []

    lines.forEach(line =>
    {
      let trimmed = line.trim()
      if (trimmed.startsWith('## '))
      {
        let catMatch = trimmed.match(/^##\s+(.*?)(?:\s+<!--\s*cat_id:(\d+)\s+u:(\d+)\s*-->)?$/)
        if (catMatch)
        {
          currentCat = catMatch[1].replace(/<!--.*?-->/g, '').trim()
          let catId = catMatch[2] ? parseInt(catMatch[2], 10) : null
          let catUpdated = catMatch[3] ? parseInt(catMatch[3], 10) : Date.now()
          importedCategories.push({ id: catId, name: currentCat, updatedAt: catUpdated })
        }
        else
        {
          currentCat = trimmed.replace(/^##\s+/, '').replace(/<!--.*?-->/g, '').trim()
          importedCategories.push({ id: null, name: currentCat, updatedAt: Date.now() })
        }
      }
      else if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]') || trimmed.startsWith('- [X]'))
      {
        let completed = trimmed.startsWith('- [x]') || trimmed.startsWith('- [X]')
        let content = trimmed.replace(/^(?:- \[[ xX]\]\s*)+/, '').trim()
        let noteId = null
        let pinned = false
        let updatedAt = Date.now()
        let groupId = null
        let scheduledDate = null
        let recurrence = null

        let metaMatch = content.match(
          /<!--\s*id:(\d+)(?:\s+u:(\d+))?(?:\s+pinned:(true|false))?(?:\s+gid:(\d+))?(?:\s+sd:(\d{4}-\d{2}-\d{2}))?(?:\s+rec:([a-z0-9-]+))?\s*-->/i
        )
        if (metaMatch)
        {
          noteId = parseInt(metaMatch[1], 10)
          if (metaMatch[2]) updatedAt = parseInt(metaMatch[2], 10)
          if (metaMatch[3]) pinned = metaMatch[3] === 'true'
          if (metaMatch[4]) groupId = parseInt(metaMatch[4], 10)
          if (metaMatch[5]) scheduledDate = metaMatch[5]
          if (metaMatch[6]) recurrence = metaMatch[6].toLowerCase()
          content = content.replace(/<!--\s*id:\d+.*-->/, '').trim()
        }

        content = content.replace(/\\n/g, '\n')

        if (content)
        {
          if (!noteId || isNaN(noteId))
          {
            let existing = appStore.notes.find(x => x.text === content && x.category === currentCat)
            noteId = existing ? existing.id : (Date.now() + Math.floor(Math.random() * 100000))
            if (existing)
            {
              pinned = existing.pinned
              updatedAt = existing.updatedAt || Date.now()
              if (existing.groupId) groupId = existing.groupId
              if (existing.scheduledDate) scheduledDate = existing.scheduledDate
              if (existing.recurrence) recurrence = existing.recurrence
            }
          }

          let note = {
            id: noteId,
            text: content,
            completed: completed,
            category: currentCat,
            pinned: pinned,
            updatedAt: updatedAt
          }
          if (groupId) note.groupId = groupId
          if (scheduledDate) note.scheduledDate = scheduledDate
          if (recurrence) note.recurrence = recurrence
          importedNotes.push(note)
        }
      }
    })

    if (importedNotes.length === 0 && importedCategories.length === 0)
    {
      appStore.showToast('Format Error!')
      return
    }

    let noteMap = new Map()
    appStore.notes.forEach(n => { noteMap.set(n.id, n) })

    // Locked-tab import guard: merging into a locked tab overwrites notes
    // the user cannot verify. Skip those categories entirely on import.
    const locked = (cat) => typeof appStore.isTabLocked === 'function' && appStore.isTabLocked(cat)
    let skippedLocked = 0

    importedNotes.forEach(imp =>
    {
      if (imp.category && locked(imp.category)) { skippedLocked++; return }
      if (noteMap.has(imp.id))
      {
        let existing = noteMap.get(imp.id)
        if ((imp.updatedAt || 0) >= (existing.updatedAt || 0)) noteMap.set(imp.id, imp)
      }
      else noteMap.set(imp.id, imp)
    })

    appStore.notes = Array.from(noteMap.values())

    if (!appStore.categoryMeta) appStore.categoryMeta = {}

    importedCategories.forEach(catObj =>
    {
      if (locked(catObj.name)) return
      if (!appStore.noteCategories.includes(catObj.name)) appStore.noteCategories.push(catObj.name)
      let existingMeta = appStore.categoryMeta[catObj.name]
      if (!existingMeta || (catObj.updatedAt >= (existingMeta.updatedAt || 0)))
      {
        appStore.categoryMeta[catObj.name] = {
          id: catObj.id || (existingMeta ? existingMeta.id : Date.now()),
          updatedAt: catObj.updatedAt
        }
      }
    })

    appStore.saveData()
    appStore.showToast(skippedLocked > 0 ? `Synced (${skippedLocked} skipped, locked tab)` : 'Synced!')
  }
  catch (err)
  {
    appStore.showToast('Format Error!')
  }
}

function saveTextFile(filename, content, mime)
{
  if (window.Android && window.Android.saveFile)
  {
    window.Android.saveFile(filename, content, mime)
  }
  else
  {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}

export function exportData(notes)
{
  saveTextFile("notes.json", JSON.stringify(notes), "application/json")
}

export function importJsonFile(file, appStore)
{
  if (!file) return
  const r = new FileReader()
  r.onload = ev =>
  {
    try
    {
      let parsed = JSON.parse(ev.target.result)
      let items = []
      if (Array.isArray(parsed)) items = parsed
      else if (parsed && Array.isArray(parsed.notes))
      {
        items = parsed.notes
        if (Array.isArray(parsed.noteCategories))
        {
          parsed.noteCategories.forEach(c =>
          {
            if (typeof c === 'string' && !appStore.noteCategories.includes(c)) appStore.noteCategories.push(c)
          })
        }
      }
      else
      {
        appStore.showToast('Format Error!')
        return
      }

      let validNotes = items.map(item =>
      {
        if (typeof item === 'string') return { text: item }
        if (item && typeof item.text === 'string') return item
        return null
      }).filter(Boolean)

      if (validNotes.length === 0 && items.length > 0)
      {
        appStore.showToast('Format Error!')
        return
      }

      const result = appStore.mergeNotes(validNotes)
      if (result && result.skipped > 0)
      {
        appStore.showToast(`Synced (${result.skipped} skipped, locked tab)`)
      }
      else
      {
        appStore.showToast('Synced!')
      }
    }
    catch (err)
    {
      appStore.showToast('Format Error!')
    }
  }
  r.readAsText(file)
}

export function exportMarkdown(noteCategories, notes, categoryMeta)
{
  let mdStr = generateMarkdownString(noteCategories, notes, categoryMeta)
  saveTextFile("notes.md", mdStr, "text/markdown")
}

// Metadata-free markdown for sharing / QR / copy-paste.
export function exportCleanMarkdown(noteCategories, notes, categoryMeta)
{
  let mdStr = generateMarkdownString(noteCategories, notes, categoryMeta, true)
  saveTextFile("notes-clean.md", mdStr, "text/markdown")
}

export function importMarkdownFile(file, appStore)
{
  if (!file) return
  const r = new FileReader()
  r.onload = ev => { parseMarkdownAndMerge(ev.target.result, appStore) }
  r.readAsText(file)
}

export function setupNativeHooks(appStore)
{
  // ==========================================================================
  // WRITE path — Android quick-capture / share intent.
  //
  // Locked tabs are ALLOWED here: the user is physically present when they
  // share into Karui, so appending to a locked tab is fine. The note will
  // simply be hidden behind the PIN on the next read. This was a deliberate
  // call (see policy comment at top of file).
  // ==========================================================================
  window.syncNotesArrayFromAndroid = (jsonInput) =>
  {
    try
    {
      let items = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput
      if (!Array.isArray(items)) return
      let now = Date.now()
      items.forEach((item, idx) =>
      {
        if (!item.text) return
        let tabName = item.tab || 'Inbox'
        if (!appStore.noteCategories.includes(tabName)) appStore.noteCategories.push(tabName)
        let note = { id: now + idx, text: item.text, completed: false, category: tabName, updatedAt: now }
        if (appStore.addNoteBottom) appStore.notes.push(note)
        else appStore.notes.unshift(note)
      })
      appStore.saveData()
    }
    catch (e) {}
  }

  window.syncNoteFromAndroid = (text, tabName) =>
  {
    window.syncNotesArrayFromAndroid([{ text: text, tab: tabName }])
  }

  // ==========================================================================
  // MERGE path — Android bulk-set. Goes through mergeNotes so the locked-tab
  // merge guard in notes.js applies (skips locked tabs, reports count).
  // ==========================================================================
  window.setAndroidNotes = (jsonString) =>
  {
    try
    {
      const parsed = JSON.parse(jsonString)
      const result = appStore.mergeNotes(parsed)
      if (result && result.skipped > 0)
      {
        appStore.showToast(`Synced (${result.skipped} skipped, locked tab)`)
      }
    }
    catch (err) {}
  }

  window.onSyncFileSelected = (fileUri) =>
  {
    appStore.syncFilePath = fileUri
    appStore.saveData()
    appStore.showToast('Sync connected!')
  }

  window.syncCalendarEventsToAndroid = () => { appStore.syncCalendarEventsToAndroid() }

  window.importMarkdownFromAndroid = (mdText) => { parseMarkdownAndMerge(mdText, appStore) }

  // ==========================================================================
  // READ path — beforeunload silent sync. Locked-tab notes MUST be excluded,
  // otherwise closing the app would happily write hidden notes into the
  // sync file on disk.
  // ==========================================================================
  window.addEventListener('beforeunload', () =>
  {
    if (appStore.syncFilePath)
    {
      let now = Date.now()
      const safeNotes = appStore.notes.filter(n => !(appStore.isTabLocked && appStore.isTabLocked(n.category)))
      const safeCats = appStore.noteCategories.filter(t => !(appStore.isTabLocked && appStore.isTabLocked(t)))
      safeNotes.forEach(n => { if (!n.updatedAt) n.updatedAt = now })
      let mdStr = generateMarkdownString(safeCats, safeNotes, appStore.categoryMeta)
      if (window.Android && window.Android.saveFileSync)
      {
        window.Android.saveFileSync(appStore.syncFilePath, mdStr)
      }
    }
  })
}