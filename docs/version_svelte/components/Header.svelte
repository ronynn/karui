<script>
  import { createEventDispatcher } from 'svelte';
  export let tabs = [];
  export let activeTab = "";
  const dispatch = createEventDispatcher();

  function selectTab(tab) {
    dispatch("activateTab", tab);
  }
</script>

<style>
  .top-bar {
    display: flex;
    overflow-x: auto;
    white-space: nowrap;
    border-bottom: 2px solid var(--border);
    padding: 0.5rem 1rem;
    margin-bottom: 1rem;
  }
  .top-bar span {
    display: inline-block;
    padding: 0.5rem 1rem;
    cursor: pointer;
    margin-right: 0.5rem;
  }
  .active-tab {
    color: var(--button);
    font-weight: bold;
    border-bottom: 2px solid var(--button);
  }
  .inactive-tab {
    color: gray;
  }
</style>

<div class="top-bar">
  {#each tabs as tab}
    <span class={activeTab === tab ? "active-tab" : "inactive-tab"} on:click={() => selectTab(tab)}>
      {tab}
    </span>
  {/each}
</div>