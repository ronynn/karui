<script>
  import { onMount } from 'svelte';
  import Header from './components/Header.svelte';
  import MainScreen from './components/MainScreen.svelte';
  import Theme from './components/Theme.svelte';
  import LaterData from './components/LaterData.svelte';

  
  import './assets/normalize.css';
  import './assets/milligram.css';
  
  // Global state
  let activeTab = "Main";
  let tabs = ["Main", "Settings"];
  let slideClass = "";
  
  // Data for MainScreen
  let noteCategories = JSON.parse(localStorage.getItem("noteCategories")) || ["Main"];
  let activeCategory = "Main";
  let inputText = "";
  let notes = JSON.parse(localStorage.getItem("notes")) || [];
  let recycleBin = JSON.parse(localStorage.getItem("recycleBin")) || [];
  
  // Settings
  let themes = ["default", "gruvbox", "monokai", "dracula", "nord", "solarized", "catppuccin", "tokyo-night", "everforest", "dynamic"];
  let fonts = ["default", "monospace"];
  let currentTheme = localStorage.getItem("theme") || "default";
  let currentFont = localStorage.getItem("font") || "default";

  // Computed values
  $: filteredNotes = notes.filter(note => note.category === activeCategory);
  $: remainingCount = filteredNotes.filter(note => !note.completed).length;
  $: completedCount = filteredNotes.filter(note => note.completed).length;

  function saveData() {
    localStorage.setItem("notes", JSON.stringify(notes));
    localStorage.setItem("noteCategories", JSON.stringify(noteCategories));
    localStorage.setItem("recycleBin", JSON.stringify(recycleBin));
    localStorage.setItem("theme", currentTheme);
    localStorage.setItem("font", currentFont);
  }

  // Screen switching with slide animation
  function activateTabHandler(tab) {
    let currentIndex = tabs.indexOf(activeTab);
    let newIndex = tabs.indexOf(tab);
    const slideDirection = newIndex > currentIndex ? "slide-left" : "slide-right";
    slideClass = slideDirection;
    activeTab = tab;
    setTimeout(() => { slideClass = ""; }, 500);
  }

  // Input processing (Box 1)
  function handleInput() {
    const text = inputText.trim();
    if (!text) return;
    if (text.startsWith("///")) {
      const newTab = text.slice(3).trim();
      if (newTab && !noteCategories.includes(newTab)) {
        noteCategories = [...noteCategories, newTab];
        saveData();
      }
    } else if (text.startsWith("\\\\\\") ) {
      const tabName = text.slice(3).trim();
      if (tabName !== "Main") {
        const idx = noteCategories.indexOf(tabName);
        if (idx > -1) {
          noteCategories = noteCategories.filter(cat => cat !== tabName);
          notes = notes.filter(note => {
            if (note.category === tabName) {
              recycleBin = [...recycleBin, note];
              return false;
            }
            return true;
          });
          saveData();
          if (activeCategory === tabName) {
            activeCategory = "Main";
          }
        } else {
          addNote(text);
        }
      } else {
        addNote(text);
      }
    } else {
      addNote(text);
    }
    inputText = "";
  }

  function addNote(text) {
    const newNote = { id: Date.now(), text, completed: false, category: activeCategory };
    notes = [newNote, ...notes];
    saveData();
  }

  function toggleComplete(noteId) {
    notes = notes.map(note => note.id === noteId ? { ...note, completed: !note.completed } : note);
    saveData();
  }

  function deleteNote(noteId) {
    const noteToDelete = notes.find(note => note.id === noteId);
    notes = notes.filter(note => note.id !== noteId);
    if (noteToDelete) {
      recycleBin = [...recycleBin, noteToDelete];
    }
    saveData();
  }

  // Drag & drop functions
  let draggingNoteId = null;
  function dragStart(noteId, event) {
    draggingNoteId = noteId;
    event.currentTarget.classList.add("dragging");
  }
  function dragEnd(event) {
    event.currentTarget.classList.remove("dragging");
    draggingNoteId = null;
  }
  function dropNote(event) {
    const targetIndex = +event.currentTarget.dataset.index;
    if (draggingNoteId === null || isNaN(targetIndex)) return;
    let filtered = [...filteredNotes];
    const draggedIndex = filtered.findIndex(note => note.id === draggingNoteId);
    if (draggedIndex === -1) return;
    const [draggedNote] = filtered.splice(draggedIndex, 1);
    filtered.splice(targetIndex, 0, draggedNote);
    const otherNotes = notes.filter(note => note.category !== activeCategory);
    notes = [...filtered, ...otherNotes];
    saveData();
  }

  // Theme and Font functions
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("theme", currentTheme);
  }
  function setTheme(theme) {
    currentTheme = theme;
    applyTheme();
  }
  function applyFont() {
    document.body.style.fontFamily = currentFont === "monospace" ? "monospace" : "";
    localStorage.setItem("font", currentFont);
  }
  function setFont(font) {
    currentFont = font;
    applyFont();
  }

  // Export/Import functions
  function exportNotes(format) {
    if (format === "json") {
      const dataStr = JSON.stringify(notes);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "notes.json";
      a.click();
    } else if (format === "txt") {
      const dataStr = notes.map(note => note.text).join("\n");
      const blob = new Blob([dataStr], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "notes.txt";
      a.click();
    }
  }

  function importJsonFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = e => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const importedNotes = JSON.parse(reader.result);
          notes = importedNotes;
          saveData();
        } catch (err) {
          alert("Import failed.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function clearRecycleBin() {
    recycleBin = [];
    localStorage.removeItem("recycleBin");
  }
  function restoreNote(index) {
    const note = recycleBin.splice(index, 1)[0];
    notes = [...notes, note];
    saveData();
  }

  onMount(() => {
    applyTheme();
    applyFont();
  });
</script>

<style>
  .slide-left {
    animation: slideLeft 0.5s forwards;
  }
  .slide-right {
    animation: slideRight 0.5s forwards;
  }
  @keyframes slideLeft {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideRight {
    from { transform: translateX(-100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
</style>

<Header {tabs} {activeTab} on:activateTab={(e) => activateTabHandler(e.detail)} />

<div class={slideClass}>
  {#if activeTab === "Main"}
    <MainScreen
      {noteCategories}
      {activeCategory}
      bind:inputText
      {filteredNotes}
      {remainingCount}
      {completedCount}
      on:setActiveCategory={(e) => activeCategory = e.detail}
      on:handleInput={handleInput}
      on:toggleComplete={(e) => toggleComplete(e.detail)}
      on:deleteNote={(e) => deleteNote(e.detail)}
      on:dragStart={(e) => dragStart(e.detail.noteId, e.detail.event)}
      on:dragEnd={(e) => dragEnd(e.detail.event)}
      on:dropNote={(e) => dropNote(e.detail.event)}
    />
  {:else if activeTab === "Settings"}
    <div>
      <Theme
        {themes}
        {fonts}
        {currentTheme}
        {currentFont}
        {setTheme}
        {setFont}
      />
      <LaterData
        {recycleBin}
        exportNotes={exportNotes}
        importJsonFile={importJsonFile}
        clearRecycleBin={clearRecycleBin}
        restoreNote={restoreNote}
      />
    </div>
  {/if}
</div>