<script>
  // Props passed in from parent:
  export let themes = [];       // Array of theme names (e.g. "default", "gruvbox", etc.)
  export let fonts = [];        // Array of font options (e.g. "default", "monospace")
  export let currentTheme = ""; // The currently selected theme
  export let currentFont = "";  // The currently selected font
  export let setTheme;         // Function to set a new theme (e.g. setTheme("gruvbox"))
  export let setFont;          // Function to set a new font (e.g. setFont("monospace"))
</script>

<div class="box">
  <label>Box 3: Theme & Font</label>
  <div style="overflow-x: auto; white-space: nowrap;">
    {#each themes as theme}
      <button style="margin-right: 0.5rem;" on:click={() => setTheme(theme)}>
        {theme}
      </button>
    {/each}
  </div>
  <div style="overflow-x: auto; white-space: nowrap; margin-top: 1rem;">
    {#each fonts as font}
      <button style="margin-right: 0.5rem;" on:click={() => setFont(font)}>
        {font}
      </button>
    {/each}
  </div>
</div>

<div class="box">
  <label>Box 4: About</label>
  <p>
    Cozy Minimal To-Do is a lightweight, bloat‑free open source app. More customizations will be added.
    Use <code>///</code> to add a new tab, <code>\\\</code> to remove a tab, slide theme buttons and check all the themes.
    Check our <a href="https://github.com/yourrepo" target="_blank">GitHub Repo</a>.
    Report issues at our issue tracker. See the <a href="license.txt" target="_blank">license.txt</a> for details.
  </p>
</div>