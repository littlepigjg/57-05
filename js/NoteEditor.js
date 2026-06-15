class NoteEditor {
    constructor(scoreRenderer) {
        this.scoreRenderer = scoreRenderer;
        this.notes = [];
        this.barLines = [];
        this.selectedNoteId = null;
        this.selectedBarLineId = null;

        this.currentTool = {
            pitch: 1,
            octave: 0,
            duration: 1,
            dotted: false,
            tie: false
        };

        this.listeners = {
            notesChanged: [],
            barLinesChanged: [],
            selectionChanged: [],
            noteAdded: [],
            noteDeleted: []
        };

        this._initSampleData();
        this._bindCanvasEvents();
        this._bindKeyboardEvents();
        this._syncToRenderer();
    }

    _initSampleData() {
        const createNote = (pitch, octave, duration, dotted = false, tie = false) => ({
            id: NoteUtils.generateNoteId(),
            pitch,
            octave,
            duration: NoteUtils.getActualDuration(duration, dotted),
            dotted,
            tie
        });

        this.notes = [
            createNote(5, 0, 1),
            createNote(3, 0, 1),
            createNote(5, 0, 1),
            createNote(6, 0, 1),
            createNote(5, 0, 1, false, true),
            createNote(5, 0, 1),
            createNote(3, 0, 1),
            createNote(2, 0, 1),
            createNote(1, 0, 1),
            createNote(2, 0, 1),
            createNote(3, 0, 1),
            createNote(5, 0, 2),
            createNote(6, 0, 1),
            createNote(5, 0, 1, false, true),
            createNote(5, 0, 0.5),
            createNote(3, 0, 0.5),
            createNote(2, 0, 1),
            createNote(1, -1, 1),
            createNote(2, 0, 1),
            createNote(1, 0, 2)
        ];

        this.barLines = [
            { id: NoteUtils.generateBarLineId(), position: 4, type: 'single' },
            { id: NoteUtils.generateBarLineId(), position: 8, type: 'single' },
            { id: NoteUtils.generateBarLineId(), position: 12, type: 'single' },
            { id: NoteUtils.generateBarLineId(), position: 16, type: 'double' }
        ];
    }

    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    _emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    _syncToRenderer() {
        this.scoreRenderer.setData(this.notes, this.barLines);
    }

    _bindCanvasEvents() {
        const canvas = this.scoreRenderer.canvas;
        let isDragging = false;
        let dragNoteId = null;
        let dragStartIndex = -1;

        const getCanvasPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
            const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
            return { x, y };
        };

        canvas.addEventListener('mousedown', (e) => {
            const pos = getCanvasPos(e);
            const clickedNote = this.scoreRenderer.getNoteAt(pos.x, pos.y);
            const clickedBarLine = this.scoreRenderer.getBarLineAt(pos.x, pos.y);

            if (clickedNote) {
                this.setSelectedNote(clickedNote.id);
                isDragging = true;
                dragNoteId = clickedNote.id;
                dragStartIndex = this.notes.findIndex(n => n.id === dragNoteId);
            } else if (clickedBarLine) {
                this.setSelectedBarLine(clickedBarLine.id);
            } else {
                const insertPos = this.scoreRenderer.getInsertPosition(pos.x);
                this.addNote(insertPos.index);
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isDragging || !dragNoteId) return;
            const pos = getCanvasPos(e);
            const currentIndex = this.notes.findIndex(n => n.id === dragNoteId);
            if (currentIndex < 0) return;

            const insertPos = this.scoreRenderer.getInsertPosition(pos.x);
            if (insertPos.index !== currentIndex && insertPos.index !== currentIndex + 1) {
                const [note] = this.notes.splice(currentIndex, 1);
                const newIndex = insertPos.index > currentIndex ? insertPos.index - 1 : insertPos.index;
                this.notes.splice(Math.max(0, newIndex), 0, note);
                this._syncToRenderer();
                this._emit('notesChanged', this.notes);
            }
        });

        canvas.addEventListener('mouseup', () => {
            isDragging = false;
            dragNoteId = null;
        });

        canvas.addEventListener('mouseleave', () => {
            isDragging = false;
            dragNoteId = null;
        });

        canvas.addEventListener('dblclick', (e) => {
            const pos = getCanvasPos(e);
            const clickedNote = this.scoreRenderer.getNoteAt(pos.x, pos.y);
            if (clickedNote) {
                this.setSelectedNote(clickedNote.id);
                this._emit('noteAdded', clickedNote);
            }
        });
    }

    _bindKeyboardEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedNoteId) {
                    this.deleteSelectedNote();
                    e.preventDefault();
                } else if (this.selectedBarLineId) {
                    this.deleteSelectedBarLine();
                    e.preventDefault();
                }
            }

            if (e.key >= '1' && e.key <= '7') {
                this.setTool('pitch', parseInt(e.key));
            }

            if (e.key === '.') {
                this.setTool('dotted', !this.currentTool.dotted);
            }

            if (e.key === 'Escape') {
                this.clearSelection();
            }
        });
    }

    setTool(prop, value) {
        this.currentTool[prop] = value;
    }

    getTool() {
        return { ...this.currentTool };
    }

    addNote(index) {
        const tool = this.currentTool;
        const actualDuration = NoteUtils.getActualDuration(tool.duration, tool.dotted);

        const newNote = {
            id: NoteUtils.generateNoteId(),
            pitch: tool.pitch,
            octave: tool.octave,
            duration: actualDuration,
            dotted: tool.dotted,
            tie: tool.tie
        };

        if (index === undefined || index >= this.notes.length) {
            this.notes.push(newNote);
        } else {
            this.notes.splice(Math.max(0, index), 0, newNote);
        }

        this.selectedNoteId = newNote.id;
        this.selectedBarLineId = null;
        this._syncToRenderer();
        this.scoreRenderer.setSelectedNote(newNote.id);
        this._emit('notesChanged', this.notes);
        this._emit('noteAdded', newNote);
        this._emit('selectionChanged', { type: 'note', id: newNote.id });

        return newNote;
    }

    addRest(index) {
        const tool = this.currentTool;
        const actualDuration = NoteUtils.getActualDuration(tool.duration, tool.dotted);

        const newNote = {
            id: NoteUtils.generateNoteId(),
            pitch: 0,
            octave: 0,
            duration: actualDuration,
            dotted: tool.dotted,
            tie: false
        };

        if (index === undefined || index >= this.notes.length) {
            this.notes.push(newNote);
        } else {
            this.notes.splice(Math.max(0, index), 0, newNote);
        }

        this.selectedNoteId = newNote.id;
        this.selectedBarLineId = null;
        this._syncToRenderer();
        this.scoreRenderer.setSelectedNote(newNote.id);
        this._emit('notesChanged', this.notes);
        this._emit('noteAdded', newNote);
        this._emit('selectionChanged', { type: 'note', id: newNote.id });

        return newNote;
    }

    addBarLine(position) {
        if (position === undefined) {
            position = NoteUtils.getTotalDuration(this.notes);
        }

        const exists = this.barLines.some(bl => Math.abs(bl.position - position) < 0.1);
        if (exists) return null;

        const newBarLine = {
            id: NoteUtils.generateBarLineId(),
            position: position,
            type: 'single'
        };

        this.barLines.push(newBarLine);
        this.barLines.sort((a, b) => a.position - b.position);

        this.selectedBarLineId = newBarLine.id;
        this.selectedNoteId = null;
        this._syncToRenderer();
        this.scoreRenderer.setSelectedBarLine(newBarLine.id);
        this._emit('barLinesChanged', this.barLines);
        this._emit('selectionChanged', { type: 'barline', id: newBarLine.id });

        return newBarLine;
    }

    deleteSelectedNote() {
        if (!this.selectedNoteId) return;

        const index = this.notes.findIndex(n => n.id === this.selectedNoteId);
        if (index >= 0) {
            const deleted = this.notes.splice(index, 1)[0];
            this.selectedNoteId = null;
            this._syncToRenderer();
            this.scoreRenderer.clearSelection();
            this._emit('notesChanged', this.notes);
            this._emit('noteDeleted', deleted);
            this._emit('selectionChanged', null);
        }
    }

    deleteSelectedBarLine() {
        if (!this.selectedBarLineId) return;

        const index = this.barLines.findIndex(bl => bl.id === this.selectedBarLineId);
        if (index >= 0) {
            this.barLines.splice(index, 1);
            this.selectedBarLineId = null;
            this._syncToRenderer();
            this.scoreRenderer.clearSelection();
            this._emit('barLinesChanged', this.barLines);
            this._emit('selectionChanged', null);
        }
    }

    deleteNote(id) {
        const index = this.notes.findIndex(n => n.id === id);
        if (index >= 0) {
            const wasSelected = this.selectedNoteId === id;
            const deleted = this.notes.splice(index, 1)[0];
            if (wasSelected) {
                this.selectedNoteId = null;
                this.scoreRenderer.clearSelection();
            }
            this._syncToRenderer();
            this._emit('notesChanged', this.notes);
            this._emit('noteDeleted', deleted);
            if (wasSelected) {
                this._emit('selectionChanged', null);
            }
        }
    }

    updateNote(id, updates) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        if (updates.dotted !== undefined && updates.duration === undefined) {
            const newDotted = updates.dotted;
            if (note.dotted !== newDotted) {
                note.duration = NoteUtils.recalculateDuration(note, newDotted);
            }
            note.dotted = newDotted;
        } else if (updates.duration !== undefined && updates.dotted === undefined) {
            if (note.dotted) {
                const baseDuration = updates.duration;
                note.duration = NoteUtils.getActualDuration(baseDuration, true);
            } else {
                note.duration = updates.duration;
            }
        } else if (updates.duration !== undefined && updates.dotted !== undefined) {
            note.duration = NoteUtils.getActualDuration(updates.duration, updates.dotted);
            note.dotted = updates.dotted;
        }

        if (updates.pitch !== undefined) {
            note.pitch = updates.pitch;
        }
        if (updates.octave !== undefined) {
            note.octave = updates.octave;
        }
        if (updates.tie !== undefined) {
            note.tie = updates.tie;
        }

        this._syncToRenderer();
        this._emit('notesChanged', this.notes);
    }

    setSelectedNote(id) {
        this.selectedNoteId = id;
        this.selectedBarLineId = null;
        this.scoreRenderer.setSelectedNote(id);
        this._emit('selectionChanged', { type: 'note', id });
    }

    setSelectedBarLine(id) {
        this.selectedBarLineId = id;
        this.selectedNoteId = null;
        this.scoreRenderer.setSelectedBarLine(id);
        this._emit('selectionChanged', { type: 'barline', id });
    }

    clearSelection() {
        this.selectedNoteId = null;
        this.selectedBarLineId = null;
        this.scoreRenderer.clearSelection();
        this._emit('selectionChanged', null);
    }

    getSelectedNote() {
        return this.notes.find(n => n.id === this.selectedNoteId) || null;
    }

    getNotes() {
        return [...this.notes];
    }

    getBarLines() {
        return [...this.barLines];
    }

    clearAll() {
        this.notes = [];
        this.barLines = [];
        this.selectedNoteId = null;
        this.selectedBarLineId = null;
        this._syncToRenderer();
        this.scoreRenderer.clearSelection();
        this._emit('notesChanged', this.notes);
        this._emit('barLinesChanged', this.barLines);
        this._emit('selectionChanged', null);
    }

    getTotalDuration() {
        return NoteUtils.getTotalDuration(this.notes);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NoteEditor;
}
