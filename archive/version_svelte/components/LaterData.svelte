<script>
  // Props passed in from the parent component:
  export let recycleBin = [];               // Array of deleted note objects {id, text, ...}
  export let exportNotes;                   // Function to export notes; expects a format ("json" or "txt")
  export let importJsonFile;                // Function to trigger the native file picker for importing JSON
  export let clearRecycleBin;               // Function to clear the recycle bin
  export let restoreNote;                   // Function to restore a deleted note; could be passed an index or note id

  // Local state for the manual import modal:
  let showImportModal = false;
  let importText = "";
  let importError = "";

  function openImportModal() {
    showImportModal = true;
    importText = "";
    importError = "";
  }

  function closeImportModal() {
    showImportModal = false;
    importText = "";
    importError = "";
  }

  function pasteImport() {
    try {
      const importedNotes = JSON.parse(importText);
      // Dispatch an event to update notes in the parent;
      // Alternatively, you might call a function passed via props.
      dispatchEvent(new CustomEvent("importNotes", { detail: importedNotes }));
      closeImportModal();
    } catch (err) {
      importError = "Invalid JSON format.";
    }
  }
</script>

<style>
  /* You can rely on global styles (milligram.css) for .box, etc.
     Additional styles for the modal: */
  .modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>

<!-- Box 5: Deleted Items -->
<div class="box">
  <label>Box 5: Deleted Items</label>
  <div>
    <!-- Clear recycle bin control -->
    <span style="float: right; cursor: pointer;" on:click={clearRecycleBin}>√d</span>
  </div>
  <h2>Recycle Bin</h2>
  <ul>
    {#each recycleBin as note, index (note.id)}
      <li>
        <span>{note.text}</span>
        <span style="cursor: pointer; margin-left: 1rem;" on:click={() => restoreNote(index)}>√r</span>
      </li>
    {/each}
  </ul>
</div>

<!-- Box 6: Import/Export -->
<div class="box">
  <label>Box 6: Import/Export</label>
  <h2>Export Notes</h2>
  <div style="margin-bottom: 1rem;">
    <button on:click={() => exportNotes("json")}>Save as JSON</button>
    <button on:click={() => exportNotes("txt")}>Save as TXT</button>
  </div>
  <h2>Import Notes</h2>
  <div style="margin-bottom: 1rem;">
    <button on:click={importJsonFile}>Import JSON</button>
    <button on:click={openImportModal}>Paste JSON</button>
  </div>
</div>

<!-- Import Modal (shown when openImportModal is true) -->
{#if showImportModal}
  <div class="modal">
    <div class="box" style="max-width: 300px;">
      <label>Paste JSON</label>
      <textarea bind:value={importText} rows="5" style="width: 100%;"></textarea>
      <div style="margin-top: 1rem;">
        <button on:click={pasteImport}>Import</button>
        <button on:click={closeImportModal}>Cancel</button>
      </div>
      {#if importError}
        <p style="color: red;">{importError}</p>
      {/if}
    </div>
  </div>
{/if}