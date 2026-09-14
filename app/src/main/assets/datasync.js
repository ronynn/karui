// --- SECTION: DATA SYNCHRONISATION & FILE I/O HANDLERS ---
export function generateMarkdownString(noteCategories, notes)
{
  let mdStr = ''
  noteCategories.forEach((cat, idx) =>
  {
    mdStr += `## ${cat}\n`
    let catNotes = notes.filter(n => n.category === cat)
    catNotes.forEach(n =>
    {
      let mark = n.completed ? 'x' : ' '
      let pin = n.pinned ? ' pinned:true' : ''
      mdStr += `- [${mark}] ${n.text} <!-- id:${n.id}${pin} -->\n`
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

    let lines = text.split(/\r?\n/)
    let currentCat = "Main"
    let importedNotes = []

    lines.forEach(line =>
    {
      let trimmed = line.trim()
      if (trimmed.startsWith('## '))
      {
        currentCat = trimmed.replace(/^##\s+/, '').trim()
      }
      else if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]'))
      {
        let completed = trimmed.startsWith('- [x]')
        let content = trimmed.replace(/^- \[(x| )\]\s*/, '').trim()
        let noteId = null
        let pinned = false

        let idMatch = content.match(/<!--\s*id:(\d+)(?:\s+pinned:(true|false))?\s*-->/)
        if (idMatch)
        {
          noteId = parseInt(idMatch[1], 10)
          if (idMatch[2])
          {
            pinned = idMatch[2] === 'true'
          }
          content = content.replace(/<!--\s*id:\d+(?:\s+pinned:(?:true|false))?\s*-->/, '').trim()
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
            }
          }

          importedNotes.push({
            id: noteId,
            text: content,
            completed: completed,
            category: currentCat,
            pinned: pinned
          })
        }
      }
    })

    if (importedNotes.length === 0)
    {
      appStore.showToast('Format Error!')
      return
    }

    let importedCategories = [...new Set(importedNotes.map(n => n.category))]

    importedCategories.forEach(c =>
    {
      if (!appStore.noteCategories.includes(c))
      {
        appStore.noteCategories.push(c)
      }
    })

    let remainingNotes = appStore.notes.filter(n => !importedCategories.includes(n.category))
    appStore.notes = [...remainingNotes, ...importedNotes]

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

export function exportMarkdown(noteCategories, notes)
{
  let mdStr = generateMarkdownString(noteCategories, notes)
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
        let note = { id: now + idx, text: item.text, completed: false, category: tabName }
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
      let mdStr = generateMarkdownString(appStore.noteCategories, appStore.notes)
      if (window.Android && window.Android.saveFileSync)
      {
        window.Android.saveFileSync(appStore.syncFilePath, mdStr)
      }
    }
  })
}