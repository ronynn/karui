class AboutScreen extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
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

        button { width: 100%; padding: calc(12px * var(--ui-scale)); background: var(--accent); color: var(--accent-txt); cursor: pointer; border: none; font-weight: bold; text-transform: uppercase; }
        button:active { filter: brightness(0.8); }

        .about-text { font-size: calc(14px * var(--ui-scale)); line-height: 1.5; color: var(--text); opacity: 0.9; }
        .about-text code { color: var(--accent); }
        .about-text a { color: gray; }

        .heading-large { font-size: calc(16px * var(--ui-scale)); margin: 15px 0 10px; font-weight: normal; color: var(--text); text-transform: uppercase; letter-spacing: 1px; }

        .note-item { display: flex; justify-content: space-between; align-items: center; padding: calc(14px * var(--ui-scale)) calc(10px * var(--ui-scale)); background: var(--bg); position: relative; border-bottom: 1px dashed rgba(255,255,255,0.08); font-size: calc(16px * var(--ui-scale)); }
      </style>

      <div class="box">
        <span class="box-title">Box 4: About Karui</span>
        <div class="about-text">
          <h2>Karui</h2>
          - A privacy friendly, lightweight, bloat-free open source todo list app with retro aesthetics made by ronynn.<br/>
          - Use <code>///</code> to add a new tab, <code>\\\\\\\\</code> to remove current tab. Long press any tab to rename or delete it or add a new tab. Tap <code>:</code> to copy, edit or delete notes.<br/>
          - The Apollo mission operated on a computer with around 4KB of RAM! Karui's philosophy is to reach for the moon outgrowing limitations.<br/>
          - Check out the <a href="https://github.com/ronynn/karui" target="_blank">github repository</a> for source code and any issues.
        </div>
      </div>

      <div class="box">
        <span class="box-title">Box 5: Data & Recycle Bin</span>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          <button id="btn-export" style="background:var(--surface); color:var(--text); border:2px solid var(--border); font-size:calc(14px * var(--ui-scale));">Export JSON</button>
          <button id="btn-import" style="background:var(--surface); color:var(--text); border:2px solid var(--border); font-size:calc(14px * var(--ui-scale));">Import JSON</button>
          <input type="file" id="import-file" style="display:none">
        </div>
        <h3 class="heading-large">Recycle Bin</h3>
        <div id="trash-list"></div>
        <button id="btn-clear-trash" style="margin-top:15px; background:var(--bg); color:var(--text); border:2px solid var(--border);">Clear Recycle Bin</button>
      </div>
    `;

    this.shadowRoot.getElementById('btn-export').onclick = () => this.exportData();
    this.shadowRoot.getElementById('btn-import').onclick = () => this.triggerImport();
    this.shadowRoot.getElementById('import-file').onchange = e => this.importData(e);
    this.shadowRoot.getElementById('btn-clear-trash').onclick = () => this.clearTrash();

    this.renderTrash();
  }

  renderTrash() {
    const trash = this.shadowRoot.getElementById('trash-list');
    if (!trash) return;
    trash.innerHTML = '';
    recycleBin.forEach((n, idx) => {
      const d = document.createElement('div');
      d.className = 'note-item';
      d.style.padding = '8px 0';
      d.innerHTML = `<span>${n.text}</span><span class="restore-btn" style="color:var(--gray); padding: 0 5px; flex-shrink: 0; cursor: pointer;">√r</span>`;
      d.querySelector('.restore-btn').onclick = () => this.restoreNote(idx);
      trash.appendChild(d);
    });
  }

  restoreNote(index) {
    let n = recycleBin.splice(index, 1)[0];
    if (n) {
      notes.push(n);
      this.renderTrash();
      const noteCmp = document.getElementById('note-cmp');
      if (noteCmp && noteCmp.render) noteCmp.render();
      saveData();
    }
  }

  clearTrash() {
    recycleBin = [];
    this.renderTrash();
    saveData();
  }

  exportData() {
    let fileData = JSON.stringify(notes);
    if (window.Android && window.Android.saveFile) {
      window.Android.saveFile("notes.json", fileData, "application/json");
    } else {
      const blob = new Blob([fileData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "notes.json";
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  triggerImport() {
    if (window.Android && window.Android.importJsonFile) {
      window.Android.importJsonFile();
    } else {
      this.shadowRoot.getElementById('import-file').click();
    }
  }

  importData(e) {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        let imported = JSON.parse(ev.target.result);
        if (Array.isArray(imported)) {
          imported.forEach(n => {
            if (n.category && !noteCategories.includes(n.category)) noteCategories.push(n.category);
            if (!notes.some(x => x.id === n.id)) notes.push(n);
          });
          saveData();
          const noteCmp = document.getElementById('note-cmp');
          if (noteCmp && noteCmp.render) noteCmp.render();
          this.renderTrash();
        }
      } catch(err) {
        alert("Import failed.");
      }
    };
    r.readAsText(f);
    e.target.value = '';
  }
}

customElements.define('about-screen', AboutScreen);