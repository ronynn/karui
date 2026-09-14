// --- SECTION: DATA SYNCHRONISATION & FILE I/O HANDLERS ---
export function generateMarkdownString(noteCategories, notes, categoryMeta = {})
{
  let mdStr = ''
  noteCategories.forEach((cat, idx) =>
  {
    let catId = categoryMeta[cat]?.id || (Date.now() + idx)
    let catUpdated = categoryMeta[cat]?.updatedAt || Date.now()
    mdStr += `## ${cat} <!-- cat_id:${catId} u:${catUpdated} -->\n`
    
    let catNotes = notes.filter(n => n.category === cat)
    catNotes.forEach(n =>
    {
      let mark = n.completed ? 'x' : ' '
      let pin = n.pinned ? ' pinned:true' : ''
      let updated = n.updatedAt || Date.now()
      mdStr += `- [${mark}] ${n.text} <!-- id:${n.id} u:${updated}${pin} -->\n`
    })
    if (idx < noteCategories.length - 1)
    {
      mdStr += '\n'
    }
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
      else if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]'))
      {
        let completed = trimmed.startsWith('- [x]')
        let content = trimmed.replace(/^- \[(x| )\]\s*/, '').trim()
        let noteId = null
        let pinned = false
        let updatedAt = Date.now()

        let metaMatch = content.match(/<!--\s*id:(\d+)(?:\s+u:(\d+))?(?:\s+pinned:(true|false))?\s*-->/)
        if (metaMatch)
        {
          noteId = parseInt(metaMatch[1], 10)
          if (metaMatch[2])
          {
            updatedAt = parseInt(metaMatch[2], 10)
          }
          if (metaMatch[3])
          {
            pinned = metaMatch[3] === 'true'
          }
          content = content.replace(/<!--\s*id:\d+.*-->/, '').trim()
        }

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
            }
          }

          importedNotes.push({
            id: noteId,
            text: content,
            completed: completed,
            category: currentCat,
            pinned: pinned,
            updatedAt: updatedAt
          })
        }
      }
    })

    if (importedNotes.length === 0 && importedCategories.length === 0)
    {
      appStore.showToast('Format Error!')
      return
    }

    let noteMap = new Map()
    appStore.notes.forEach(n =>
    {
      noteMap.set(n.id, n)
    })

    importedNotes.forEach(imp =>
    {
      if (noteMap.has(imp.id))
      {
        let existing = noteMap.get(imp.id)
        if ((imp.updatedAt || 0) >= (existing.updatedAt || 0))
        {
          noteMap.set(imp.id, imp)
        }
      }
      else
      {
        noteMap.set(imp.id, imp)
      }
    })

    appStore.notes = Array.from(noteMap.values())

    if (!appStore.categoryMeta)
    {
      appStore.categoryMeta = {}
    }

    importedCategories.forEach(catObj =>
    {
      if (!appStore.noteCategories.includes(catObj.name))
      {
        appStore.noteCategories.push(catObj.name)
      }

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
    appStore.showToast('Synced!')
  }
  catch (err)
  {
    appStore.showToast('Format Error!')
  }
}

export function exportData(notes)
{
  let fileData = JSON.stringify(notes)
  if (window.Android && window.Android.saveFile)
  {
    window.Android.saveFile("notes.json", fileData, "application/json")
  }
  else
  {
    const blob = new Blob([fileData], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = "notes.json"
    a.click()
    URL.revokeObjectURL(url)
  }
}

export function importJsonFile(file, appStore)
{
  if (!file) return
  const r = new FileReader()
  r.onload = ev =>
  {
    try
    {
      let data = JSON.parse(ev.target.result)
      if (!Array.isArray(data))
      {
        appStore.showToast('Format Error!')
        return
      }
      let isValid = data.every(n => n && typeof n.text === 'string')
      if (!isValid)
      {
        appStore.showToast('Format Error!')
        return
      }
      appStore.mergeNotes(data)
      appStore.showToast('Synced!')
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
  if (window.Android && window.Android.saveFile)
  {
    window.Android.saveFile("notes.md", mdStr, "text/markdown")
  }
  else
  {
    const blob = new Blob([mdStr], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = "notes.md"
    a.click()
    URL.revokeObjectURL(url)
  }
}

export function importMarkdownFile(file, appStore)
{
  if (!file) return
  const r = new FileReader()
  r.onload = ev =>
  {
    parseMarkdownAndMerge(ev.target.result, appStore)
  }
  r.readAsText(file)
}

export function setupNativeHooks(appStore)
{
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

  window.setAndroidNotes = (jsonString) =>
  {
    try { appStore.mergeNotes(JSON.parse(jsonString)) } catch (err) {}
  }

  window.onSyncFileSelected = (fileUri) =>
  {
    appStore.syncFilePath = fileUri
    appStore.saveData()
    appStore.showToast('Sync connected!')
  }

  window.importMarkdownFromAndroid = (mdText) =>
  {
    parseMarkdownAndMerge(mdText, appStore)
  }

  window.addEventListener('beforeunload', () =>
  {
    if (appStore.syncFilePath)
    {
      let mdStr = generateMarkdownString(appStore.noteCategories, appStore.notes, appStore.categoryMeta)
      if (window.Android && window.Android.saveFileSync)
      {
        window.Android.saveFileSync(appStore.syncFilePath, mdStr)
      }
    }
  })
}