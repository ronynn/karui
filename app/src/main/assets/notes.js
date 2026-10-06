import { playSound, tryRunGame } from './extras.js'

export function createNotesModule()
{
  return {
    // --- state ---
    noteCategories: ['Main'],
    activeCategory: 'Main',
    notes: [],
    recycleBin: [],
    categoryMeta: {},
    sortAlphabetical: false,
    addNoteBottom: false,
    moveCompletedBottom: false,
    doubleTapDelete: false,

    contextMenuVisible: false,
    contextTab: '',
    noteMenuVisible: false,
    noteMenuPos: { x: 0, y: 0 },
    activeNoteMenuId: null,
    lastTrashTap: 0,

    _displayedCache: [],
    _cacheKey: '',
    _dirtyNotes: true,

    // --- getters ---
    get displayedNotes()
    {
      let key = `${this.activeCategory}_${this.sortAlphabetical}_${this.moveCompletedBottom}_${this.notes.length}`
      if (this._cacheKey === key && !this._dirtyNotes)
      {
        return this._displayedCache
      }

      let result = []
      let len = this.notes.length
      for (let i = 0; i < len; i++)
      {
        if (this.notes[i].category === this.activeCategory)
        {
          result.push(this.notes[i])
        }
      }

      result.sort((a, b) =>
      {
        if (a.pinned !== b.pinned)
        {
          return a.pinned ? -1 : 1
        }
        if (this.moveCompletedBottom && a.completed !== b.completed)
        {
          return a.completed ? 1 : -1
        }
        if (this.sortAlphabetical)
        {
          return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })
        }
        return 0
      })

      this._cacheKey = key
      this._dirtyNotes = false
      this._displayedCache = result
      return result
    },

    get statsText()
    {
      let rem = 0
      let comp = 0
      for (let i = 0; i < this.notes.length; i++)
      {
        let n = this.notes[i]
        if (n.category !== this.activeCategory)
        {
          continue
        }
        if (n.completed)
        {
          comp++
        }
        else
        {
          rem++
        }
      }
      return `Remaining: ${rem} \u00A0\u00A0 Completed: ${comp}`
    },

    get puffableCount()
    {
      let cat = this.contextTab
      if (!cat)
      {
        return 0
      }
      let c = 0
      for (let i = 0; i < this.notes.length; i++)
      {
        if (this.notes[i].category === cat && this.notes[i].completed)
        {
          c++
        }
      }
      return c
    },

    get activeNotePinned()
    {
      let n = this.notes.find(x => x.id === this.activeNoteMenuId)
      return n ? n.pinned : false
    },

    get canMoveTabLeft()
    {
      return this.noteCategories.indexOf(this.contextTab) > 0
    },

    get canMoveTabRight()
    {
      let idx = this.noteCategories.indexOf(this.contextTab)
      return idx >= 0 && idx < this.noteCategories.length - 1
    },

    get contextMenuStyle()
    {
      return {
        display: this.contextMenuVisible ? 'block' : 'none',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }
    },

    get noteMenuStyle()
    {
      return {
        display: this.noteMenuVisible ? 'block' : 'none',
        left: `${this.noteMenuPos.x}px`,
        top: `${this.noteMenuPos.y}px`
      }
    },

    // --- tab/list actions ---
    toggleSortAlphabetical()
    {
      this.sortAlphabetical = !this.sortAlphabetical
      this.saveData()
    },

    getTabLabel(t)
    {
      if (t.includes('%'))
      {
        let catNotes = this.notes.filter(n => n.category === t)
        let tot = catNotes.length
        let comp = catNotes.filter(n => n.completed).length
        let pct = tot > 0 ? Math.round((comp / tot) * 100) : 0
        return t.replace('%', `${pct}%`)
      }
      return t
    },

    selectTab(tab)
    {
      this.closeAllMenus()
      this.activeCategory = tab
      if (!this.keepKeyboard && document.activeElement)
      {
        document.activeElement.blur()
      }
    },

    // --- note CRUD ---
    submitNote()
    {
      let v = this.noteInput.trim()
      if (!v)
      {
        return
      }

      if (tryRunGame(v))
      {
        this.noteInput = ''
        return
      }

      if (v.startsWith('/'))
      {
        let t = v.slice(1).trim()
        if (t)
        {
          this.addTab(t)
        }
      }
      else
      {
        playSound('add', this.uiSounds)
        let now = Date.now()
        let n = { id: now, text: v, completed: false, category: this.activeCategory, pinned: false, updatedAt: now }
        if (this.addNoteBottom)
        {
          this.notes.push(n)
        }
        else
        {
          this.notes.unshift(n)
        }
      }
      this.noteInput = ''
      this.saveData()
    },

    toggleNote(n, e)
    {
      n.completed = !n.completed
      n.updatedAt = Date.now()
      if (n.completed)
      {
        playSound('scratch', this.uiSounds)
        if (this.celebrationMode && typeof confetti === 'function')
        {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } })
        }
      }
      if (navigator.vibrate)
      {
        navigator.vibrate(30)
      }

      let txt = n.text.trim()
      if (/^https?:\/\//i.test(txt) || /^www\./i.test(txt))
      {
        window.location.href = txt.startsWith('http') ? txt : 'https://' + txt
      }
      this.saveData()
    },

    executeTrash(id)
    {
      let idx = this.notes.findIndex(x => x.id === id)
      if (idx > -1)
      {
        let n = this.notes.splice(idx, 1)[0]
        n.updatedAt = Date.now()
        this.recycleBin.push(n)
        this.saveData()
      }
    },

    restoreNote(idx)
    {
      let n = this.recycleBin.splice(idx, 1)[0]
      if (n)
      {
        n.updatedAt = Date.now()
        this.notes.push(n)
        this.saveData()
      }
    },

    clearTrash()
    {
      this.recycleBin = []
      this.saveData()
    },

    // --- note dropdown menu ---
    openNoteMenu(e, id)
    {
      if (this.activeNoteMenuId === id && this.noteMenuVisible)
      {
        this.closeAllMenus()
        return
      }
      this.closeAllMenus()
      this.activeNoteMenuId = id

      let estimatedWidth = 140
      let estimatedHeight = 180
      let clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : window.innerWidth / 2)
      let clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : window.innerHeight / 2)

      let posX = Math.min(clientX, window.innerWidth - estimatedWidth - 12)
      let posY = Math.min(clientY, window.innerHeight - estimatedHeight - 12)

      this.noteMenuPos = {
        x: Math.max(12, posX),
        y: Math.max(12, posY)
      }
      this.noteMenuVisible = true
    },

    actionDeleteNote()
    {
      if (!this.activeNoteMenuId)
      {
        return
      }
      let id = this.activeNoteMenuId
      if (this.doubleTapDelete)
      {
        let now = Date.now()
        if (now - this.lastTrashTap < 300)
        {
          this.executeTrash(id)
          this.showToast('Note deleted')
          this.closeAllMenus()
        }
        else
        {
          if (navigator.vibrate)
          {
            navigator.vibrate(15)
          }
          this.showToast('Tap delete again to confirm')
        }
        this.lastTrashTap = now
      }
      else
      {
        this.executeTrash(id)
        this.showToast('Note deleted')
        this.closeAllMenus()
      }
    },

    actionTogglePinNote()
    {
      if (!this.activeNoteMenuId)
      {
        return
      }
      let n = this.notes.find(x => x.id === this.activeNoteMenuId)
      if (n)
      {
        n.pinned = !n.pinned
        n.updatedAt = Date.now()
        this.saveData()
      }
      this.closeAllMenus()
    },

    actionCopyNote()
    {
      if (!this.activeNoteMenuId)
      {
        return
      }
      let n = this.notes.find(x => x.id === this.activeNoteMenuId)
      if (n)
      {
        navigator.clipboard.writeText(n.text)
        if (navigator.vibrate)
        {
          navigator.vibrate(15)
        }
        this.showToast('Note copied')
      }
      this.closeAllMenus()
    },

    actionEditNote()
    {
      if (!this.activeNoteMenuId)
      {
        return
      }
      let n = this.notes.find(x => x.id === this.activeNoteMenuId)
      if (n)
      {
        this.openPrompt('Edit Note', n.text, val =>
        {
          if (val)
          {
            n.text = val
            n.updatedAt = Date.now()
            this.saveData()
          }
        })
      }
      this.closeAllMenus()
    },

    // --- tab context menu ---
    openContextMenu(e, tab)
    {
      this.closeAllMenus()
      this.contextTab = tab
      this.contextMenuVisible = true
    },

    moveTab(dir)
    {
      let idx = this.noteCategories.indexOf(this.contextTab)
      if (idx < 0)
      {
        return
      }
      let nIdx = idx + dir
      if (nIdx >= 0 && nIdx < this.noteCategories.length)
      {
        let t = this.noteCategories[idx]
        this.noteCategories[idx] = this.noteCategories[nIdx]
        this.noteCategories[nIdx] = t
        this.saveData()
      }
      this.closeAllMenus()
    },

    // --- tab lifecycle ---
    addTab(n)
    {
      if (n && !this.noteCategories.includes(n))
      {
        playSound('tab', this.uiSounds)
        this.noteCategories.push(n)
        this.activeCategory = n
        let now = Date.now()
        if (!this.categoryMeta)
        {
          this.categoryMeta = {}
        }
        this.categoryMeta[n] = { id: now, updatedAt: now }
        this.saveData()
      }
    },

    renameTab(newName)
    {
      let oldName = this.contextTab || this.activeCategory
      if (!newName || oldName === newName)
      {
        return
      }
      this.renameTabInternal(oldName, newName.trim())
      this.saveData()
    },

    renameCategory(oldCat, newCat)
    {
      if (!oldCat || !newCat || !newCat.trim() || oldCat === newCat)
      {
        return
      }
      let trimmed = newCat.trim()

      if (this.calendarTabName === oldCat)
      {
        this.calendarTabName = trimmed
      }

      this.renameTabInternal(oldCat, trimmed)
      this.saveData()
    },

    renameTabInternal(oldName, newName)
    {
      if (!oldName || !newName || oldName === newName)
      {
        return
      }
      let trimmed = newName.trim()
      if (!trimmed)
      {
        return
      }

      let idx = this.noteCategories.indexOf(oldName)
      if (idx !== -1)
      {
        this.noteCategories.splice(idx, 1, trimmed)
      }
      else if (!this.noteCategories.includes(trimmed))
      {
        this.noteCategories.push(trimmed)
      }

      if (this.calendarTabName === oldName)
      {
        this.calendarTabName = trimmed
      }

      let now = Date.now()
      if (!this.categoryMeta)
      {
        this.categoryMeta = {}
      }
      let meta = this.categoryMeta[oldName] || { id: now, updatedAt: now }
      meta.updatedAt = now
      this.categoryMeta[trimmed] = meta
      if (oldName !== trimmed)
      {
        delete this.categoryMeta[oldName]
      }

      this.notes.forEach(n =>
      {
        if (n.category === oldName)
        {
          n.category = trimmed
          n.updatedAt = now
        }
      })

      if (this.activeCategory === oldName)
      {
        this.activeCategory = trimmed
      }

      this._dirtyNotes = true
    },

    deleteTabClick()
    {
      let t = this.contextTab || this.activeCategory
      if (this.noteCategories.length > 1)
      {
        this.noteCategories = this.noteCategories.filter(x => x !== t)
        let now = Date.now()
        this.notes = this.notes.filter(note =>
        {
          if (note.category === t)
          {
            note.updatedAt = now
            this.recycleBin.push(note)
            return false
          }
          return true
        })
        if (this.activeCategory === t)
        {
          this.activeCategory = this.noteCategories[0]
        }
        this.saveData()
      }
      this.closeAllMenus()
    },

    puffCompleted()
    {
      let cat = this.contextTab || this.activeCategory
      let targets = this.notes.filter(n => n.category === cat && n.completed)
      if (!targets.length)
      {
        this.showToast('Nothing to puff')
        this.closeAllMenus()
        return
      }
      let now = Date.now()
      targets.forEach(n => { n.updatedAt = now })
      this.notes = this.notes.filter(n => !(n.category === cat && n.completed))
      this.recycleBin.push(...targets)
      playSound('scratch', this.uiSounds)
      this.showToast(`Puffed ${targets.length} note${targets.length === 1 ? '' : 's'}`)
      this.saveData()
      this.closeAllMenus()
    },

    // --- import merge ---
    mergeNotes(imported)
    {
      if (!Array.isArray(imported))
      {
        return
      }
      let now = Date.now()
      imported.forEach((n, idx) =>
      {
        if (!n || typeof n.text !== 'string')
        {
          return
        }
        let cat = n.category || 'Main'
        if (!this.noteCategories.includes(cat))
        {
          this.noteCategories.push(cat)
        }
        if (!this.categoryMeta)
        {
          this.categoryMeta = {}
        }
        if (!this.categoryMeta[cat])
        {
          this.categoryMeta[cat] = { id: now + idx, updatedAt: now }
        }

        let noteId = (typeof n.id === 'number' && !isNaN(n.id)) ? n.id : null
        let existing = null
        if (noteId)
        {
          existing = this.notes.find(x => x.id === noteId)
        }
        if (!existing)
        {
          existing = this.notes.find(x => x.text === n.text && x.category === cat)
        }

        let itemUpdatedAt = (typeof n.updatedAt === 'number' && !isNaN(n.updatedAt)) ? n.updatedAt : now
        let itemPinned = typeof n.pinned === 'boolean' ? n.pinned : false
        let itemCompleted = Boolean(n.completed)

        if (existing)
        {
          if (itemUpdatedAt >= (existing.updatedAt || 0))
          {
            existing.text = n.text
            existing.completed = itemCompleted
            existing.category = cat
            existing.pinned = itemPinned
            existing.updatedAt = itemUpdatedAt
          }
        }
        else
        {
          this.notes.push({
            id: noteId || (now + Math.floor(Math.random() * 100000) + idx),
            text: n.text,
            completed: itemCompleted,
            category: cat,
            pinned: itemPinned,
            updatedAt: itemUpdatedAt
          })
        }
      })
      this.saveData()
    }
  }
}