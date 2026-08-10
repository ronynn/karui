class NoteScreen extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.touchTimer = null;
    this.dragTarget = null;
    this.contextTab = null;
    this.dragImg = null;
    this.dragType = null;
    this.lastTrashTap = 0;
    this.hoveredTab = null;
    this.activeNoteMenuId = null;
  }

  connectedCallback() {
    this.render();
    this.setupDragAndDrop();
  }

  closeAllMenus() {
    this.shadowRoot.getElementById('context-menu').style.display = 'none';
    this.shadowRoot.getElementById('note-dropdown').style.display = 'none';
  }

  focusInput() {
    const inp = this.shadowRoot.getElementById('note-in');
    if (this.shadowRoot.activeElement === inp) {
      inp.blur();
    } else {
      inp.focus();
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; border-radius: 0; -webkit-tap-highlight-color: transparent; }
        
        .box { border: 2px solid var(--border); padding: calc(25px * var(--ui-scale)) calc(15px * var(--ui-scale)) calc(15px * var(--ui-scale)); position: relative; background: var(--bg); margin-bottom: calc(25px * var(--ui-scale)); }
        .box-title { position: absolute; top: -1px; transform: translateY(-50%); left: 10px; background: var(--bg); padding: 0 6px; font-size: calc(12px * var(--ui-scale)); color: var(--accent); font-weight: bold; line-height: 1; }

        input { width: 100%; padding: calc(12px * var(--ui-scale)); background: var(--surface); color: var(--text); border: 2px solid var(--border); font-size: calc(16px * var(--ui-scale)); outline: none; transition: border-color 0.2s; }
        input[type="text"]:focus { border-color: var(--accent); }

        .tabs-container { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; margin-bottom: 10px; scrollbar-width: none; }
        .tab { padding: calc(8px * var(--ui-scale)) calc(16px * var(--ui-scale)); background: var(--bg); color: var(--gray); border: 2px solid var(--border); white-space: nowrap; cursor: pointer; transition: opacity 0.2s; font-size: calc(14px * var(--ui-scale)); }
        .tab.active { background: var(--border); color: var(--bg); font-weight: bold; }

        .note-item { display: flex; justify-content: space-between; align-items: center; padding: calc(14px * var(--ui-scale)) calc(10px * var(--ui-scale)); background: var(--bg); cursor: pointer; transition: transform 0.15s ease, background 0.15s ease, opacity 0.15s ease; position: relative; border-bottom: 1px dashed rgba(255,255,255,0.08); font-size: calc(16px * var(--ui-scale)); }
        .note-item span:first-of-type { flex: 1; position: relative; min-width: 0; white-space: normal; word-break: break-word; overflow: visible; padding-right: 10px; display: inline-block; }
        .note-item.done span:first-of-type { opacity: 0.55; transition: opacity 0.3s; }
        .note-item.done span:first-of-type::after { content: ''; position: absolute; left: 0; top: 50%; width: 100%; height: 2px; background: var(--accent); transform-origin: left center; animation: scratch-anim 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        @keyframes scratch-anim { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }

        .ghost { opacity: 0.25; border: 2px dashed var(--accent) !important; background: var(--surface) !important; }
        .drag-image { position: fixed; z-index: 9999; pointer-events: none; background: var(--surface); border: 2px solid var(--accent); padding: calc(12px * var(--ui-scale)); transform: scale(1.03) rotate(-1deg); box-shadow: 6px 6px 0 rgba(0,0,0,0.6); color: var(--text); display: flex; align-items: center; width: calc(100vw - 70px); white-space: normal; word-break: break-word; overflow-wrap: break-word; font-size: calc(16px * var(--ui-scale)); }

        .menu { position: fixed; background: var(--surface); border: 2px solid var(--border); padding: 12px; z-index: 300; display: none; box-shadow: 6px 6px 0 rgba(0,0,0,0.6); }
        .menu button { margin-bottom: 6px; background: var(--bg); color: var(--text); border: 2px solid var(--border); width: 100%; padding: calc(8px * var(--ui-scale)); font-size: calc(14px * var(--ui-scale)); cursor: pointer; text-transform: uppercase; font-weight: bold; }
        .menu button:last-child { margin-bottom: 0; }

        #context-menu { top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80vw; max-width: 320px; }
        .menu-title { font-size: calc(14px * var(--ui-scale)); font-weight: bold; color: var(--accent); text-align: center; padding-bottom: 8px; margin-bottom: 10px; border-bottom: 1px dashed var(--border); text-transform: uppercase; word-break: break-all; }
      </style>

      <div class="box">
        <span class="box-title">Box 1: Notes Input</span>
        <input type="text" id="note-in" placeholder="Type note or command">
        <div style="margin-top:10px; font-size:calc(14px * var(--ui-scale)); color: var(--gray);" id="stats">Remaining: 0 &nbsp;&nbsp; Completed: 0</div>
      </div>
      <div class="box">
        <span class="box-title">Box 2: Notes List</span>
        <div class="tabs-container" id="tabs-bar"></div>
        <div id="notes-list"></div>
      </div>

      <div id="context-menu" class="menu">
        <div id="menu-tab-title" class="menu-title">Tab Name</div>
        <button id="btn-mv-l">Move Left</button>
        <button id="btn-mv-r">Move Right</button>
        <button id="btn-rename">Rename</button>
        <button id="btn-delete-tab">Delete</button>
        <button id="btn-add-tab">Add Tab</button>
      </div>

      <div id="note-dropdown" class="menu">
        <button id="btn-copy-note">Copy</button>
        <button id="btn-edit-note">Edit</button>
        <button id="btn-delete-note">Delete</button>
      </div>
    `;

    this.shadowRoot.getElementById('note-in').onkeydown = e => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        let v = e.target.value.trim();
        if (v.startsWith('///')) {
          let t = v.slice(3).trim();
          if (t) this.addTab(t);
        } else if (v.startsWith('\\\\\\')) {
          this.deleteTabClick();
        } else {
          playSound('add');
          let n = { id: Date.now(), text: v, completed: false, category: activeCategory };
          if (addNoteBottom) notes.push(n);
          else notes.unshift(n);
        }
        e.target.value = '';
        this.renderTabs();
        this.renderNotes();
        saveData();
      }
    };

    this.shadowRoot.getElementById('btn-mv-l').onclick = () => this.moveTab(-1);
    this.shadowRoot.getElementById('btn-mv-r').onclick = () => this.moveTab(1);
    this.shadowRoot.getElementById('btn-rename').onclick = () => {
      openPrompt('Rename Tab', this.contextTab, val => { if(val) this.renameTab(val); });
    };
    this.shadowRoot.getElementById('btn-delete-tab').onclick = () => this.deleteTabClick();
    this.shadowRoot.getElementById('btn-add-tab').onclick = () => {
      openPrompt('New Tab', '', val => { if(val) this.addTab(val); });
    };

    this.shadowRoot.getElementById('btn-copy-note').onclick = () => this.actionCopyNote();
    this.shadowRoot.getElementById('btn-edit-note').onclick = () => this.actionEditNote();
    this.shadowRoot.getElementById('btn-delete-note').onclick = () => this.actionDeleteNote();

    this.shadowRoot.addEventListener('click', e => {
      if (!e.target.closest('.menu')) {
        this.closeAllMenus();
      }
    });

    this.renderTabs();
    this.renderNotes();
  }

  renderTabs() {
    this.closeAllMenus();
    const bar = this.shadowRoot.getElementById('tabs-bar');
    if (!bar) return;
    bar.innerHTML = '';
    noteCategories.forEach(t => {
      const d = document.createElement('div');
      d.className = `tab ${activeCategory === t ? 'active' : ''}`;
      
      let tabLabel = t;
      if (t.includes('%')) {
        let catNotes = notes.filter(n => n.category === t);
        let tot = catNotes.length;
        let comp = catNotes.filter(n => n.completed).length;
        let pct = tot > 0 ? Math.round((comp / tot) * 100) : 0;
        tabLabel = t.replace('%', `${pct}%`);
      }
      
      d.textContent = tabLabel;
      d.dataset.tab = t;
      d.onclick = () => {
        this.closeAllMenus();
        activeCategory = t;
        if (!keepKeyboard && this.shadowRoot.activeElement) this.shadowRoot.activeElement.blur();
        this.renderTabs();
        this.renderNotes();
      };
      this.bindLongPress(d, 'tab');
      bar.appendChild(d);
    });
  }

  updateStats() {
    let rem = 0, comp = 0;
    let currentCatNotes = notes.filter(n => n.category === activeCategory);
    currentCatNotes.forEach(n => n.completed ? comp++ : rem++);
    let statsTxt = `Remaining: ${rem} \u00A0\u00A0 Completed: ${comp}`;
    if (activeCategory.includes('%')) {
      let total = rem + comp;
      let pct = total > 0 ? Math.round((comp / total) * 100) : 0;
      statsTxt += ` \u00A0\u00A0 (${pct}%)`;
    }
    const statsEl = this.shadowRoot.getElementById('stats');
    if (statsEl) statsEl.textContent = statsTxt;
  }

  renderNotes() {
    this.closeAllMenus();
    const list = this.shadowRoot.getElementById('notes-list');
    if (!list) return;
    list.innerHTML = '';
    
    let currentCatNotes = notes.filter(n => n.category === activeCategory);
    if (sortAlphabetical) {
      currentCatNotes.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
    }

    currentCatNotes.forEach(n => {
      const d = document.createElement('div');
      d.className = `note-item ${n.completed ? 'done' : ''}`;
      d.dataset.id = n.id;
      d.innerHTML = `<span>${n.text}</span>
                     <span class="menu-trigger" style="color:var(--gray); padding: 0 10px; font-weight: bold; cursor: pointer; flex-shrink: 0;">:</span>`;
      
      const menuTrigger = d.querySelector('.menu-trigger');
      menuTrigger.onclick = (e) => this.openNoteMenu(e, n.id);

      d.onclick = (e) => {
        if (e.target.classList.contains('menu-trigger')) return;
        n.completed = !n.completed;
        if (n.completed) {
          playSound('scratch');
          if (celebrationMode && typeof confetti === 'function') {
            confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
          }
        }
        if (navigator.vibrate) navigator.vibrate(30);
        
        let txt = n.text.trim();
        if (/^https?:\/\//i.test(txt) || /^www\./i.test(txt)) {
          window.location.href = txt.startsWith('http') ? txt : 'https://' + txt;
        }
        
        d.classList.toggle('done', n.completed);
        this.updateStats();
        this.renderTabs();
        saveData();
      };
      this.bindLongPress(d, 'note');
      list.appendChild(d);
    });

    this.updateStats();
  }

  openNoteMenu(e, id) {
    e.stopPropagation();
    this.closeAllMenus();
    this.activeNoteMenuId = id;
    const menu = this.shadowRoot.getElementById('note-dropdown');
    menu.style.display = 'block';
    menu.style.left = Math.min(e.clientX, window.innerWidth - 120) + 'px';
    menu.style.top = e.clientY + 'px';
  }

  actionCopyNote() {
    if (!this.activeNoteMenuId) return;
    let n = notes.find(x => x.id === this.activeNoteMenuId);
    if (n) {
      navigator.clipboard.writeText(n.text);
      if (navigator.vibrate) navigator.vibrate(15);
      showToast('Note copied');
    }
    this.closeAllMenus();
  }

  actionEditNote() {
    if (!this.activeNoteMenuId) return;
    let n = notes.find(x => x.id === this.activeNoteMenuId);
    if (n) {
      openPrompt('Edit Note', n.text, val => {
        if (val) {
          n.text = val;
          this.renderTabs();
          this.renderNotes();
          saveData();
        }
      });
    }
    this.closeAllMenus();
  }

  actionDeleteNote() {
    if (!this.activeNoteMenuId) return;
    let id = this.activeNoteMenuId;
    if (doubleTapDelete) {
      let now = Date.now();
      if (now - this.lastTrashTap < 300) {
        this.executeTrash(id);
        showToast('Note deleted');
        this.closeAllMenus();
      } else {
        if (navigator.vibrate) navigator.vibrate(15);
        showToast('Tap delete again to confirm');
      }
      this.lastTrashTap = now;
    } else {
      this.executeTrash(id);
      showToast('Note deleted');
      this.closeAllMenus();
    }
  }

  executeTrash(id) {
    let idx = notes.findIndex(x => x.id === id);
    if (idx > -1) {
      let n = notes.splice(idx, 1)[0];
      recycleBin.push(n);
      this.renderTabs();
      this.renderNotes();
      const aboutCmp = document.getElementById('about-cmp');
      if (aboutCmp && aboutCmp.render) aboutCmp.render();
      saveData();
    }
  }

  renameTab(n) {
    if (n && !noteCategories.includes(n)) {
      notes.forEach(x => { if(x.category === this.contextTab) x.category = n; });
      recycleBin.forEach(x => { if(x.category === this.contextTab) x.category = n; });
      noteCategories[noteCategories.indexOf(this.contextTab)] = n;
      activeCategory = n;
      this.renderTabs();
      this.renderNotes();
      saveData();
    }
  }

  addTab(n) {
    if (n && !noteCategories.includes(n)) {
      playSound('tab');
      noteCategories.push(n);
      activeCategory = n;
      this.renderTabs();
      this.renderNotes();
      saveData();
    }
  }

  deleteTabClick() {
    let t = this.contextTab || activeCategory;
    if (noteCategories.length > 1) {
      noteCategories = noteCategories.filter(x => x !== t);
      notes = notes.filter(note => {
        if (note.category === t) { recycleBin.push(note); return false; }
        return true;
      });
      if (activeCategory === t) activeCategory = noteCategories[0];
      this.renderTabs();
      this.renderNotes();
      const aboutCmp = document.getElementById('about-cmp');
      if (aboutCmp && aboutCmp.render) aboutCmp.render();
      saveData();
    }
  }

  moveTab(dir) {
    let idx = noteCategories.indexOf(this.contextTab);
    if (idx < 0) return;
    let nIdx = idx + dir;
    if (nIdx >= 0 && nIdx < noteCategories.length) {
      let t = noteCategories[idx];
      noteCategories[idx] = noteCategories[nIdx];
      noteCategories[nIdx] = t;
      this.renderTabs();
      saveData();
    }
    this.closeAllMenus();
  }

  showMenu() { 
    this.closeAllMenus();
    const m = this.shadowRoot.getElementById('context-menu');
    m.style.display = 'block';
    this.shadowRoot.getElementById('menu-tab-title').textContent = this.contextTab;
    let idx = noteCategories.indexOf(this.contextTab);
    this.shadowRoot.getElementById('btn-mv-l').style.display = idx > 0 ? 'block' : 'none';
    this.shadowRoot.getElementById('btn-mv-r').style.display = idx < noteCategories.length - 1 ? 'block' : 'none';
  }

  bindLongPress(el, type) {
    el.addEventListener('touchstart', e => {
      this.touchTimer = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(60);
        this.dragType = type;
        this.dragTarget = el;
        if (type === 'tab') { this.contextTab = el.dataset.tab; this.showMenu(); return; }
        el.classList.add('ghost');
        this.dragImg = el.cloneNode(true);
        this.dragImg.className = 'drag-image';
        document.body.appendChild(this.dragImg);
        this.moveDragImg(e.touches[0].clientX, e.touches[0].clientY);
      }, 250);
    }, {passive:true});
    el.addEventListener('touchend', () => this.cleanDrag());
    el.addEventListener('touchmove', e => {
      if(!this.dragImg) {
        clearTimeout(this.touchTimer);
      } else {
        if(this.dragType === 'note') e.preventDefault();
        this.moveDragImg(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, {passive:false});
  }

  moveDragImg(x, y) {
    if(this.dragImg) {
      this.dragImg.style.left = (x - 20) + 'px';
      this.dragImg.style.top = (y - 20) + 'px';
    }
  }

  cleanDrag() {
    clearTimeout(this.touchTimer);
    this.shadowRoot.querySelectorAll('.tab').forEach(t => t.style.opacity = '1');
    
    if (this.dragTarget && this.dragType === 'note') {
      if (this.hoveredTab) {
        let tCat = this.hoveredTab.dataset.tab;
        let nId = parseInt(this.dragTarget.dataset.id);
        let n = notes.find(x => x.id === nId);
        if (n && n.category !== tCat) { n.category = tCat; }
        this.dragTarget.remove();
      } else {
        const ids = [...this.shadowRoot.getElementById('notes-list').querySelectorAll('.note-item')].map(x => parseInt(x.dataset.id));
        let currentCatNotes = ids.map(id => notes.find(x => x.id === id)).filter(Boolean);
        let otherCatNotes = notes.filter(x => x.category !== activeCategory);
        notes = [...currentCatNotes, ...otherCatNotes];
      }
      saveData();
      this.renderTabs();
      if (this.hoveredTab) this.renderNotes();
    }

    if (this.dragTarget) this.dragTarget.classList.remove('ghost');
    if (this.dragImg) { this.dragImg.remove(); this.dragImg = null; }
    this.dragTarget = null;
    this.dragType = null;
    this.hoveredTab = null;
  }

  setupDragAndDrop() {
    this.shadowRoot.addEventListener('touchmove', e => {
      if (!this.dragTarget || !this.dragImg || this.dragType !== 'note') return;
      e.preventDefault();
      const touch = e.touches[0];
      
      let elPoint = this.shadowRoot.elementFromPoint(touch.clientX, touch.clientY);
      this.hoveredTab = elPoint ? elPoint.closest('.tab') : null;
      this.shadowRoot.querySelectorAll('.tab').forEach(t => t.style.opacity = '1');
      
      if (this.hoveredTab) {
        this.hoveredTab.style.opacity = '0.5';
      } else {
        const items = [...this.shadowRoot.getElementById('notes-list').querySelectorAll('.note-item:not(.ghost)')];
        const next = items.find(item => touch.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2);
        if (next) this.shadowRoot.getElementById('notes-list').insertBefore(this.dragTarget, next);
        else this.shadowRoot.getElementById('notes-list').appendChild(this.dragTarget);
      }
    }, {passive:false});
  }
}

customElements.define('note-screen', NoteScreen);