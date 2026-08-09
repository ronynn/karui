class UsageSettings extends HTMLElement {
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

        input, select, button { width: 100%; padding: calc(12px * var(--ui-scale)); background: var(--surface); color: var(--text); border: 2px solid var(--border); font-size: calc(16px * var(--ui-scale)); outline: none; transition: border-color 0.2s; }
        input[type="text"]:focus { border-color: var(--accent); }

        .toggle-container { display: flex; align-items: center; justify-content: space-between; padding: calc(10px * var(--ui-scale)) 0; border-bottom: 1px dashed var(--border); font-size: calc(14px * var(--ui-scale)); }
        .toggle-container:last-of-type { border-bottom: none; }

        .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--surface); border: 2px solid var(--border); transition: 0.2s ease; }
        .slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 4px; bottom: 4px; background-color: var(--gray); transition: 0.2s ease; }
        .switch input:checked + .slider { background-color: var(--accent); }
        .switch input:checked + .slider:before { transform: translateX(18px); background-color: var(--accent-txt); }
        .switch input:disabled + .slider { opacity: 0.4; cursor: not-allowed; }

        .grid-btns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .theme-btn { padding: calc(10px * var(--ui-scale)) calc(4px * var(--ui-scale)); background: var(--surface); color: var(--gray); border: 2px solid var(--border); text-transform: uppercase; font-size: calc(11px * var(--ui-scale)); font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; text-align: center; cursor: pointer; }
        .theme-btn.active { background: var(--accent); color: var(--accent-txt); }

        .ui-size-ctrl { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 10px; }
        .ui-size-ctrl button { padding: 8px 0; text-align: center; font-size: 14px; background: var(--surface); color: var(--text); border: 2px solid var(--border); cursor: pointer; }
        .ui-size-ctrl button.active { background: var(--accent); color: var(--accent-txt); font-weight: bold; }
      </style>

      <div class="box">
        <span class="box-title">Box 3: Visuals & Usage</span>
        <h3 style="font-size: calc(14px * var(--ui-scale)); text-transform: uppercase; margin-bottom: 8px;">Themes</h3>
        <div class="grid-btns" id="theme-btns">
          <button class="theme-btn" data-theme="gruvbox">GRUVBOX</button>
          <button class="theme-btn" data-theme="dracula">DRACULA</button>
          <button class="theme-btn" data-theme="monokai">MONOKAI</button>
          <button class="theme-btn" data-theme="nord">NORD</button>
          <button class="theme-btn" data-theme="purple">PURPLE</button>
          <button class="theme-btn" data-theme="amoled">AMOLED</button>
          <button class="theme-btn" data-theme="cupcake">CUPCAKE</button>
          <button class="theme-btn" data-theme="catppuccin">CATPPUCCIN</button>
          <button class="theme-btn" data-theme="catppuccin-frappe">FRAPPE</button>
          <button class="theme-btn" data-theme="everforest">EVERFOREST</button>
          <button class="theme-btn" data-theme="everforest-light">EV-LIGHT</button>
          <button class="theme-btn" data-theme="tokyo-night">TOKYO</button>
        </div>

        <h3 style="font-size: calc(14px * var(--ui-scale)); text-transform: uppercase; margin: 15px 0 8px;">Fonts</h3>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="theme-btn" style="width:auto; flex:1;" id="font-sys">SYSTEM</button>
          <button class="theme-btn" style="width:auto; flex:1;" id="font-mono">MONO</button>
          <button class="theme-btn" style="width:auto; flex:1;" id="font-serif">SERIF</button>
          <button class="theme-btn" style="width:auto; flex:1; border-style: dashed;" id="font-custom">+ CUSTOM</button>
          <input type="file" id="font-file" accept=".ttf,.otf" style="display:none">
        </div>

        <h3 style="font-size: calc(14px * var(--ui-scale)); text-transform: uppercase; margin: 15px 0 8px;">UI Size</h3>
        <div class="ui-size-ctrl" id="ui-size-btns">
          <button data-size="0.85">S</button>
          <button data-size="1">M</button>
          <button data-size="1.15">L</button>
          <button data-size="1.3">XL</button>
        </div>

        <div style="margin-top: 20px; border-top: 1px dashed var(--border); padding-top: 10px;">
          <div class="toggle-container">
            <span>Button ripples</span>
            <label class="switch">
              <input type="checkbox" id="ripples-toggle">
              <span class="slider"></span>
            </label>
          </div>
          <div class="toggle-container">
            <span>Floating Quick Input Button (&gt;_)</span>
            <label class="switch">
              <input type="checkbox" id="fab-toggle">
              <span class="slider"></span>
            </label>
          </div>
          <div class="toggle-container">
            <span>Celebration mode</span>
            <label class="switch">
              <input type="checkbox" id="celebration-toggle">
              <span class="slider"></span>
            </label>
          </div>
          <div class="toggle-container">
            <span>Keep keyboard when switching tabs</span>
            <label class="switch">
              <input type="checkbox" id="keep-keyboard-toggle">
              <span class="slider"></span>
            </label>
          </div>
          <div class="toggle-container">
            <span>UI Sounds</span>
            <label class="switch">
              <input type="checkbox" id="ui-sounds-toggle">
              <span class="slider"></span>
            </label>
          </div>
          <div class="toggle-container">
            <span>Sort notes alphabetically</span>
            <label class="switch">
              <input type="checkbox" id="sort-alpha-toggle">
              <span class="slider"></span>
            </label>
          </div>
          <div class="toggle-container">
            <span>Double Tap Delete To Delete</span>
            <label class="switch">
              <input type="checkbox" id="dt-toggle">
              <span class="slider"></span>
            </label>
          </div>
          <div class="toggle-container">
            <span>Add Notes To Bottom</span>
            <label class="switch">
              <input type="checkbox" id="add-btm-toggle">
              <span class="slider"></span>
            </label>
          </div>
          <div class="toggle-container">
            <span>Disable Screenshots</span>
            <label class="switch">
              <input type="checkbox" id="disable-screenshots-toggle">
              <span class="slider"></span>
            </label>
          </div>
          <div class="toggle-container">
            <span>Enable Quick Note</span>
            <label class="switch">
              <input type="checkbox" id="notification-toggle">
              <span class="slider"></span>
            </label>
          </div>
          <div style="margin-top: 15px;">
            <label for="inbox-tab-name" style="font-size: calc(14px * var(--ui-scale)); font-weight: bold; display: block; margin-bottom: 6px;">Target Tab Name:</label>
            <input type="text" id="inbox-tab-name" value="Inbox">
          </div>
        </div>
      </div>
    `;

    this.shadowRoot.querySelectorAll('#theme-btns button').forEach(btn => {
      btn.onclick = () => setTheme(btn.dataset.theme);
    });

    this.shadowRoot.getElementById('font-sys').onclick = () => setFont('system-ui');
    this.shadowRoot.getElementById('font-mono').onclick = () => setFont('monospace');
    this.shadowRoot.getElementById('font-serif').onclick = () => setFont('serif');
    this.shadowRoot.getElementById('font-custom').onclick = () => this.shadowRoot.getElementById('font-file').click();
    
    this.shadowRoot.getElementById('font-file').onchange = e => this.loadCustomFont(e);

    this.shadowRoot.querySelectorAll('#ui-size-btns button').forEach(btn => {
      btn.onclick = () => setUiSize(parseFloat(btn.dataset.size));
    });

    this.initToggles();
    this.updateThemeBtns();
    this.updateUiScaleBtns();
  }

  initToggles() {
    const bindToggle = (id, initialVal, fn) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) {
        el.checked = initialVal;
        el.onchange = e => fn(e.target.checked);
      }
    };

    bindToggle('dt-toggle', doubleTapDelete, v => { doubleTapDelete = v; saveData(); });
    bindToggle('celebration-toggle', celebrationMode, v => { celebrationMode = v; saveData(); });
    bindToggle('keep-keyboard-toggle', keepKeyboard, v => { keepKeyboard = v; saveData(); });
    bindToggle('ui-sounds-toggle', uiSounds, v => { uiSounds = v; saveData(); });
    
    bindToggle('ripples-toggle', buttonRipples, v => {
      buttonRipples = v;
      if (!v) document.querySelectorAll('.ripple-span').forEach(el => el.remove());
      saveData();
    });

    bindToggle('fab-toggle', showFab, v => {
      showFab = v;
      document.getElementById('fab-btn').style.display = (v && currentScreenIdx === 0) ? 'flex' : 'none';
      saveData();
    });

    bindToggle('sort-alpha-toggle', sortAlphabetical, v => {
      sortAlphabetical = v;
      this.shadowRoot.getElementById('add-btm-toggle').disabled = v;
      saveData();
      const noteCmp = document.getElementById('note-cmp');
      if (noteCmp && noteCmp.renderNotes) noteCmp.renderNotes();
    });

    bindToggle('add-btm-toggle', addNoteBottom, v => { addNoteBottom = v; saveData(); });
    
    this.shadowRoot.getElementById('add-btm-toggle').disabled = sortAlphabetical;

    bindToggle('disable-screenshots-toggle', localStorage.getItem('disableScreenshots') === 'true', v => {
      if (window.Android && window.Android.toggleScreenshots) window.Android.toggleScreenshots(v);
      localStorage.setItem('disableScreenshots', v);
    });

    bindToggle('notification-toggle', localStorage.getItem('notificationEnabled') === 'true', v => {
      localStorage.setItem("notificationEnabled", v);
      if (window.Android) window.Android.toggleNotification(v);
    });

    const inboxInp = this.shadowRoot.getElementById('inbox-tab-name');
    inboxInp.value = localStorage.getItem("inboxTabName") || "Inbox";
    inboxInp.onchange = e => {
      let name = e.target.value.trim() || "Inbox";
      localStorage.setItem("inboxTabName", name);
      ensureTabExists(name);
      if (window.Android) window.Android.setInboxTabName(name);
    };
  }

  updateThemeBtns() {
    this.shadowRoot.querySelectorAll('#theme-btns .theme-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === currentTheme);
    });
  }

  updateUiScaleBtns() {
    this.shadowRoot.querySelectorAll('#ui-size-btns button').forEach(b => {
      b.classList.toggle('active', Math.abs(parseFloat(b.dataset.size) - uiScale) < 0.05);
    });
  }

  loadCustomFont(e) {
    const f = e.target.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = ev => {
      customFontData = ev.target.result;
      injectCustomFont(customFontData);
      setFont('CustomFont');
      saveData();
    };
    r.readAsDataURL(f);
  }
}

customElements.define('usage-settings', UsageSettings);