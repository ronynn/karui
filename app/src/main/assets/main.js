function app() {
	return {
    // Screen management
    activeTab: "Home",
        tabs: ["Home", "Settings"],
        slideDirection: "left",
        slideClass: "",
        // Note category management (persisted in local storage)
        noteCategories: JSON.parse(localStorage.getItem("noteCategories")) || [
            "Main"
        ],
        activeCategory: "Main",
        // Input & data
        inputText: "",
        notes: JSON.parse(localStorage.getItem("notes")) || [],
        recycleBin: JSON.parse(localStorage.getItem("recycleBin")) || [],
        // Theme and Font
        themes: [
            "default",
            "gruvbox",
            "monokai",
            "dracula",
            "nord",
            "solarized",
            "catppuccin",
            "tokyo-night",
            "everforest"
        ],
        fonts: ["default", "monospace"],
        currentTheme: localStorage.getItem("theme") || "default",
        currentFont: localStorage.getItem("font") || "default",
        // Drag and drop
        draggingNoteId: null,
        // Import modal
        showImportModal: false,
        importText: "",
        importError: "",

        init() {
            this.applyTheme();
            this.applyFont();
        },
        applyTheme() {
            document.documentElement.setAttribute(
                "data-theme",
                this.currentTheme
            );
            localStorage.setItem("theme", this.currentTheme);
        },
        setTheme(theme) {
            if (theme === "dynamic") {
                if (window.Android) {
                    Android.getDynamicColors();
                }
            } else {
                this.currentTheme = theme;
                document.documentElement.setAttribute(
                    "data-theme",
                    this.currentTheme
                );
                localStorage.setItem("theme", this.currentTheme);
            }
        },
        applyFont() {
            document.body.style.fontFamily =
                this.currentFont === "monospace" ? "monospace" : "";
            localStorage.setItem("font", this.currentFont);
        },
        setFont(font) {
            this.currentFont = font;
            this.applyFont();
        },
        activateTab(tab) {
            let currentIndex = this.tabs.indexOf(this.activeTab);
            let newIndex = this.tabs.indexOf(tab);
            this.slideDirection = newIndex > currentIndex ? "left" : "right";
            this.slideClass =
                this.slideDirection === "left" ? "slide-left" : "slide-right";
            this.activeTab = tab;
            setTimeout(() => {
                this.slideClass = "";
            }, 500);
        },
        // Filter notes by active category
        get filteredNotes() {
            return this.notes.filter(
                note => note.category === this.activeCategory
            );
        },
        get remainingCount() {
            return this.filteredNotes.filter(note => !note.completed).length;
        },
        get completedCount() {
            return this.filteredNotes.filter(note => note.completed).length;
        },
        // Handle input commands and adding notes
        handleInput() {
            const text = this.inputText.trim();
            if (!text) return;
            if (text.startsWith("///")) {
                const newTab = text.slice(3).trim();
                if (newTab && !this.noteCategories.includes(newTab)) {
                    this.noteCategories.push(newTab);
                    this.saveData();
                }
            } else if (text.startsWith("\\\\\\")) {
                const tabName = text.slice(3).trim();
                const idx = this.noteCategories.indexOf(tabName);
                if (idx > -1 && tabName !== "Main") {
                    this.noteCategories.splice(idx, 1);
                    // Move notes in that category to recycle bin
                    this.notes = this.notes.filter(note => {
                        if (note.category === tabName) {
                            this.recycleBin.push(note);
                            return false;
                        }
                        return true;
                    });
                    this.saveData();
                    if (this.activeCategory === tabName) {
                        this.activeCategory = "Main";
                    }
                } else {
                    this.addNote(text);
                }
            } else {
                this.addNote(text);
            }
            this.inputText = "";
        },
        addNote(text) {
            const newNote = {
                id: Date.now(),
                text: text,
                completed: false,
                category: this.activeCategory
            };
            this.notes.unshift(newNote);
            this.saveData();
        },
        toggleComplete(note) {
            note.completed = !note.completed;
            this.saveData();
        },
        deleteNote(note) {
            this.notes = this.notes.filter(n => n.id !== note.id);
            this.recycleBin.push(note);
            this.saveData();
        },
        // Drag and drop functions:
        dragStart(note, event) {
            this.draggingNoteId = note.id;
            event.target.classList.add("dragging");
        },
        dragEnd(event) {
            event.target.classList.remove("dragging");
            this.draggingNoteId = null;
        },
        dropNote(event) {
            const targetEl = event.target.closest("li");
            if (!targetEl) return;
            let children = Array.from(this.$refs.notesList.children);
            let targetIndex = children.indexOf(targetEl);
            if (this.draggingNoteId === null || targetIndex === -1) return;
            let filtered = this.filteredNotes;
            let draggedIndex = filtered.findIndex(
                n => n.id === this.draggingNoteId
            );
            if (draggedIndex === -1) return;
            let draggedNote = filtered.splice(draggedIndex, 1)[0];
            filtered.splice(targetIndex, 0, draggedNote);
            let otherNotes = this.notes.filter(
                n => n.category !== this.activeCategory
            );
            this.notes = filtered.concat(otherNotes);
            this.saveData();
        },
        saveData() {
            localStorage.setItem("notes", JSON.stringify(this.notes));
            localStorage.setItem("recycleBin", JSON.stringify(this.recycleBin));
            localStorage.setItem(
                "noteCategories",
                JSON.stringify(this.noteCategories)
            );
        },

        restoreNote(index) {
            const note = this.recycleBin.splice(index, 1)[0];
            this.notes.push(note);
            this.saveData();
        },
        // Export notes: save as JSON or TXT
        exportNotes(format) {
            let fileName = format === "json" ? "notes.json" : "notes.txt";
            let fileType =
                format === "json" ? "application/json" : "text/plain";
            let fileData =
                format === "json"
                    ? JSON.stringify(this.notes)
                    : this.notes.map(note => note.text).join("\n");

            if (window.Android && window.Android.saveFile) {
                Android.saveFile(fileName, fileData, fileType);
            } else {
                const blob = new Blob([fileData], {
                    type: fileType
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fileName;
                a.click();
            }
        },

        importJsonFile() {
            if (window.Android && window.Android.importJsonFile) {
                Android.importJsonFile();
            } else {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "application/json";
                input.onchange = e => {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = () => {
                        try {
                            const importedNotes = JSON.parse(reader.result);
                            this.notes = importedNotes;
                            this.saveData();
                        } catch (err) {
                            alert("Import failed.");
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            }
        },

        setAndroidColors(color1, color2, color3) {
            // Map the Android dynamic colors into your theme's CSS custom properties
            document.documentElement.style.setProperty("--bg", color1);
            document.documentElement.style.setProperty("--text", color2);
            document.documentElement.style.setProperty("--border", color3);
            document.documentElement.style.setProperty("--button", color2);
            document.documentElement.style.setProperty(
                "--button-hover",
                color3
            );
            document.documentElement.style.setProperty("--input-bg", color1);
            document.documentElement.style.setProperty(
                "--input-border",
                color3
            );
            document.documentElement.style.setProperty("--input-text", color2);
            // Mark this theme as dynamic so your theme picker reflects it
            document.documentElement.setAttribute("data-theme", "dynamic");
        },
        openImportModal() {
            this.showImportModal = true;
        },
        closeImportModal() {
            this.showImportModal = false;
            this.importText = "";
            this.importError = "";
        },
        pasteImport() {
            try {
                const importedNotes = JSON.parse(this.importText);
                this.notes = importedNotes;
                this.saveData();
                this.closeImportModal();
            } catch (err) {
                this.importError = "Invalid JSON format.";
            }
        }
    };
}

