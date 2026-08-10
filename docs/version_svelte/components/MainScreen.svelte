<script>
  import { createEventDispatcher } from 'svelte';
  export let noteCategories = [];
  export let activeCategory = "";
  export let inputText = "";
  export let filteredNotes = [];
  export let remainingCount = 0;
  export let completedCount = 0;
  const dispatch = createEventDispatcher();

  function onInputKeydown(e) {
    if (e.key === "Enter") {
      dispatch("handleInput");
    }
  }

  function selectCategory(category) {
    dispatch("setActiveCategory", category);
  }

  function toggle(noteId) {
    dispatch("toggleComplete", noteId);
  }
  function deleteNote(noteId) {
    dispatch("deleteNote", noteId);
  }
  function dragStart(noteId, e) {
    dispatch("dragStart", { noteId, event: e });
  }
  function dragEnd(e) {
    dispatch("dragEnd", { event: e });
  }
  function drop(e) {
    dispatch("dropNote", { event: e });
  }
</script>

<style>
/**  .box {
    max-width: 400px;
    margin: 1rem auto;
    padding: 1rem;
    border: 2px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
  } */
  .category-tabs {
    overflow-x: auto;
    white-space: nowrap;
    margin-bottom: 1rem;
  }
  .category-tabs span {
    display: inline-block;
    padding: 0.5rem 1rem;
    cursor: pointer;
    border: 1px solid var(--border);
    margin-right: 0.5rem;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    position: relative;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border);
    cursor: grab;
  }
  li.completed {
    text-decoration: line-through;
    color: gray;
    opacity: 0.7;
  }
  .delete-text {
    position: absolute;
    right: 0;
    top: 0;
    padding: 0.5rem;
    cursor: pointer;
  }
</style>

<!-- Box 1: Input & Stats -->
<div class="box">
  <label>Box 1</label>
  <input
    type="text"
    placeholder="Type note or command"
    bind:value={inputText}
    on:keydown={onInputKeydown}
  />
  <div style="margin-top: 1rem;">
    <span>Remaining: {remainingCount}</span>
    <span style="margin-left: 1rem;">Completed: {completedCount}</span>
  </div>
</div>

<!-- Box 2: Category Tabs & Draggable Notes -->
<div class="box">
  <label>Box 2</label>
  <!-- Category Tabs -->
  <div class="category-tabs">
    {#each noteCategories as category}
      <span class={activeCategory === category ? "active-tab" : "inactive-tab"} on:click={() => selectCategory(category)}>
        {category}
      </span>
    {/each}
  </div>
  <!-- Draggable Note List -->
  <ul>
    {#each filteredNotes as note, index (note.id)}
      <li
        draggable="true"
        data-index={index}
        on:dragstart={(e) => dragStart(note.id, e)}
        on:dragend={dragEnd}
        on:drop={drop}
      >
        <span 
        on:click={() => toggle(note.id)} 
        on:touchend={() => toggle(note.id)}>{note.text}</span>
        <span class="delete-text" on:click={() => deleteNote(note.id)}>√d</span>
      </li>
    {/each}
  </ul>
</div>