class ScoreRenderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.notes = [];
        this.barLines = [];
        this.selectedNoteId = null;
        this.selectedBarLineId = null;
        this.highlightNoteId = null;
        this.key = options.key || 'G';
        this.timeSignature = options.timeSignature || '4/4';
        this.tempo = options.tempo || 120;

        this.config = {
            paddingTop: 60,
            paddingBottom: 40,
            paddingLeft: 50,
            paddingRight: 30,
            noteSpacing: 14,
            noteWidth: 28,
            staffLineY: 200,
            lineHeight: 10,
            staffLines: 5,
            fontSize: 28,
            fontSizeSmall: 14,
            color: {
                staff: '#999',
                note: '#333',
                selected: '#e53935',
                highlight: '#43a047',
                barLine: '#333',
                tie: '#666',
                text: '#666',
                background: '#fffef8'
            }
        };

        this._resizeCanvas();
        this._bindEvents();
        this._addDefaultBarLines();
    }

    _resizeCanvas() {
        const container = this.canvas.parentElement;
        const width = Math.max(container.clientWidth - 40, 800);
        const height = 500;
        this.canvas.width = width * (window.devicePixelRatio || 1);
        this.canvas.height = height * (window.devicePixelRatio || 1);
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        this.renderWidth = width;
        this.renderHeight = height;
    }

    _bindEvents() {
        const observer = new ResizeObserver(() => {
            this._resizeCanvas();
            this.render();
        });
        observer.observe(this.canvas.parentElement);
    }

    _addDefaultBarLines() {
        const beatsPerBar = parseInt(this.timeSignature.split('/')[0]);
        const defaultPositions = [1, 2, 3, 4, 5].map(i => i * beatsPerBar);
        defaultPositions.forEach((pos, idx) => {
            this.barLines.push({
                id: 'bar_' + Date.now() + '_' + idx,
                position: pos,
                type: 'single'
            });
        });
    }

    setData(notes, barLines) {
        this.notes = notes || [];
        this.barLines = barLines || [];
        this.render();
    }

    setKey(key) {
        this.key = key;
        this.render();
    }

    setTimeSignature(sig) {
        this.timeSignature = sig;
        this.render();
    }

    setTempo(tempo) {
        this.tempo = tempo;
    }

    setSelectedNote(id) {
        this.selectedNoteId = id;
        this.selectedBarLineId = null;
        this.render();
    }

    setHighlightNote(id) {
        this.highlightNoteId = id;
        this.render();
    }

    setSelectedBarLine(id) {
        this.selectedBarLineId = id;
        this.selectedNoteId = null;
        this.render();
    }

    clearSelection() {
        this.selectedNoteId = null;
        this.selectedBarLineId = null;
        this.render();
    }

    getNoteAt(x, y) {
        const positions = this._calculateNotePositions();
        for (let i = positions.length - 1; i >= 0; i--) {
            const p = positions[i];
            if (!p) continue;
            const halfW = this.config.noteWidth / 2 + 5;
            const halfH = this.config.fontSize / 2 + 10;
            if (x >= p.x - halfW && x <= p.x + halfW &&
                y >= p.y - halfH && y <= p.y + halfH) {
                return this.notes[i];
            }
        }
        return null;
    }

    getBarLineAt(x, y) {
        const positions = this._calculateBarLinePositions();
        for (let i = 0; i < positions.length; i++) {
            const p = positions[i];
            if (!p) continue;
            if (Math.abs(x - p.x) < 6 &&
                y >= this.config.paddingTop &&
                y <= this.config.paddingTop + this.config.staffLines * this.config.lineHeight + 40) {
                return this.barLines[i];
            }
        }
        return null;
    }

    getInsertPosition(x) {
        const positions = this._calculateNotePositions();
        let insertIndex = this.notes.length;
        for (let i = 0; i < positions.length; i++) {
            if (positions[i] && x < positions[i].x) {
                insertIndex = i;
                break;
            }
        }

        let durationSum = 0;
        for (let i = 0; i < insertIndex; i++) {
            if (this.notes[i]) {
                durationSum += this.notes[i].duration;
            }
        }
        const position = durationSum;

        return { index: insertIndex, position };
    }

    _calculateNotePositions() {
        const positions = [];
        const lineWidth = this.renderWidth - this.config.paddingLeft - this.config.paddingRight;
        const beatsPerRow = Math.floor(lineWidth / (this.config.noteWidth + this.config.noteSpacing));
        let currentX = this.config.paddingLeft;
        let rowY = this.config.paddingTop + 60;
        let durationInRow = 0;
        const beatsPerBar = parseInt(this.timeSignature.split('/')[0]);

        const notePositions = this.notes.map(() => 0);
        let cumulativeDuration = 0;
        this.notes.forEach((note, idx) => {
            notePositions[idx] = cumulativeDuration;
            cumulativeDuration += note.duration;
        });

        const sortedIndices = [...this.notes.keys()].sort((a, b) => {
            const aPos = notePositions[a] !== undefined ? notePositions[a] : 0;
            const bPos = notePositions[b] !== undefined ? notePositions[b] : 0;
            return aPos - bPos;
        });

        cumulativeDuration = 0;
        sortedIndices.forEach((originalIdx) => {
            const note = this.notes[originalIdx];
            const notePosition = notePositions[originalIdx];

            cumulativeDuration = notePosition;
            const barLinesBefore = this.barLines.filter(bl => bl.position <= cumulativeDuration).length;
            const barsBefore = Math.floor(cumulativeDuration / beatsPerBar);
            const visiblePosition = cumulativeDuration + barLinesBefore * 0.5;

            const row = Math.floor(visiblePosition / beatsPerRow);
            const col = visiblePosition - row * beatsPerRow;

            if (row > 0 && col === 0) {
                currentX = this.config.paddingLeft;
                rowY = this.config.paddingTop + 60 + row * 120;
                durationInRow = 0;
            }

            const x = currentX + this.config.noteWidth / 2;
            const y = rowY + this._getOctaveOffset(note.octave);

            positions[originalIdx] = { x, y, rowY };
            currentX += this.config.noteWidth + this.config.noteSpacing * note.duration;
            durationInRow += note.duration;
        });

        return positions;
    }

    _calculateBarLinePositions() {
        const positions = [];
        const lineWidth = this.renderWidth - this.config.paddingLeft - this.config.paddingRight;
        const beatsPerRow = Math.floor(lineWidth / (this.config.noteWidth + this.config.noteSpacing));
        const beatsPerBar = parseInt(this.timeSignature.split('/')[0]);

        this.barLines.forEach((bl) => {
            const barLinesBefore = this.barLines.filter(b => b.position < bl.position).length;
            const visiblePosition = bl.position + barLinesBefore * 0.5;

            const row = Math.floor(visiblePosition / beatsPerRow);
            const col = visiblePosition - row * beatsPerRow;

            const x = this.config.paddingLeft + col * (this.config.noteWidth + this.config.noteSpacing);
            const rowY = this.config.paddingTop + 60 + row * 120;

            positions.push({ x, rowY });
        });

        return positions;
    }

    _getOctaveOffset(octave) {
        return NoteUtils.getOctaveLabel(octave) === '低' ? 40 :
               NoteUtils.getOctaveLabel(octave) === '高' ? -40 : 0;
    }

    _getNoteDisplay(pitch, octave) {
        return NoteUtils.getNoteDisplay(pitch);
    }

    render() {
        const ctx = this.ctx;
        const cfg = this.config;
        ctx.clearRect(0, 0, this.renderWidth, this.renderHeight);

        ctx.fillStyle = cfg.color.background;
        ctx.fillRect(0, 0, this.renderWidth, this.renderHeight);

        this._drawHeader();
        this._drawStaff();
        this._drawBarLines();
        this._drawTies();
        this._drawNotes();
        this._drawSelection();
    }

    _drawHeader() {
        const ctx = this.ctx;
        const cfg = this.config;

        ctx.fillStyle = cfg.color.text;
        ctx.font = `bold 16px ${this._getFont()}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(`调: ${this.key}调`, cfg.paddingLeft, 25);

        ctx.fillText(`拍: ${this.timeSignature}`, cfg.paddingLeft + 120, 25);

        ctx.fillText(`速度: ${this.tempo} BPM`, cfg.paddingLeft + 240, 25);

        ctx.font = `14px ${this._getFont()}`;
        ctx.fillStyle = '#999';
        ctx.fillText('点击谱面添加音符', this.renderWidth - 200, 25);
    }

    _drawStaff() {
        const ctx = this.ctx;
        const cfg = this.config;

        const lineWidth = this.renderWidth - cfg.paddingLeft - cfg.paddingRight;
        const beatsPerRow = Math.floor(lineWidth / (cfg.noteWidth + cfg.noteSpacing));
        const beatsPerBar = parseInt(this.timeSignature.split('/')[0]);

        let totalBeats = NoteUtils.getTotalDuration(this.notes);
        const barCount = this.barLines.length + 1;
        totalBeats += barCount * 0.5;

        const rows = Math.max(1, Math.ceil(totalBeats / beatsPerRow));

        for (let row = 0; row < rows; row++) {
            const baseY = cfg.paddingTop + 60 + row * 120;

            for (let i = 0; i < cfg.staffLines; i++) {
                ctx.beginPath();
                ctx.strokeStyle = cfg.color.staff;
                ctx.lineWidth = i === 2 ? 1.5 : 0.8;
                ctx.moveTo(cfg.paddingLeft, baseY - 20 + i * cfg.lineHeight);
                ctx.lineTo(this.renderWidth - cfg.paddingRight, baseY - 20 + i * cfg.lineHeight);
                ctx.stroke();
            }

            ctx.beginPath();
            ctx.strokeStyle = cfg.color.barLine;
            ctx.lineWidth = 2;
            ctx.moveTo(cfg.paddingLeft, baseY - 25);
            ctx.lineTo(cfg.paddingLeft, baseY + cfg.lineHeight * (cfg.staffLines - 1) - 15);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(this.renderWidth - cfg.paddingRight, baseY - 25);
            ctx.lineTo(this.renderWidth - cfg.paddingRight, baseY + cfg.lineHeight * (cfg.staffLines - 1) - 15);
            ctx.stroke();
        }
    }

    _drawBarLines() {
        const ctx = this.ctx;
        const cfg = this.config;
        const positions = this._calculateBarLinePositions();

        this.barLines.forEach((bl, idx) => {
            const p = positions[idx];
            if (!p) return;

            ctx.beginPath();
            ctx.strokeStyle = this.selectedBarLineId === bl.id ? cfg.color.selected : cfg.color.barLine;
            ctx.lineWidth = this.selectedBarLineId === bl.id ? 3 : 1.5;
            ctx.moveTo(p.x, p.rowY - 25);
            ctx.lineTo(p.x, p.rowY + cfg.lineHeight * (cfg.staffLines - 1) - 15);
            ctx.stroke();
        });
    }

    _drawTies() {
        const ctx = this.ctx;
        const cfg = this.config;
        const positions = this._calculateNotePositions();

        for (let i = 0; i < this.notes.length - 1; i++) {
            const note = this.notes[i];
            const nextNote = this.notes[i + 1];
            if (note.tie && nextNote && note.pitch === nextNote.pitch && note.octave === nextNote.octave) {
                const p1 = positions[i];
                const p2 = positions[i + 1];
                if (p1 && p2) {
                    ctx.beginPath();
                    ctx.strokeStyle = cfg.color.tie;
                    ctx.lineWidth = 2;
                    const midX = (p1.x + p2.x) / 2;
                    const topY = Math.min(p1.y, p2.y) - cfg.fontSize / 2 - 15;
                    ctx.moveTo(p1.x + 10, p1.y - cfg.fontSize / 2 - 5);
                    ctx.quadraticCurveTo(midX, topY - 10, p2.x - 10, p2.y - cfg.fontSize / 2 - 5);
                    ctx.stroke();
                }
            }
        }
    }

    _drawNotes() {
        const ctx = this.ctx;
        const cfg = this.config;
        const positions = this._calculateNotePositions();

        this.notes.forEach((note, idx) => {
            const p = positions[idx];
            if (!p) return;

            const isRest = note.pitch === 0;
            const isSelected = this.selectedNoteId === note.id;
            const isHighlight = this.highlightNoteId === note.id;

            ctx.save();

            if (isHighlight) {
                ctx.shadowColor = cfg.color.highlight;
                ctx.shadowBlur = 15;
            }

            ctx.fillStyle = isSelected ? cfg.color.selected : (isHighlight ? cfg.color.highlight : cfg.color.note);
            ctx.font = `bold ${cfg.fontSize}px ${this._getFont()}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (isRest) {
                ctx.fillStyle = isSelected ? cfg.color.selected : cfg.color.text;
                ctx.font = `${cfg.fontSize}px serif`;
                ctx.fillText('—', p.x, p.y);
            } else {
                const display = this._getNoteDisplay(note.pitch, note.octave);
                ctx.fillText(display, p.x, p.y);
            }

            ctx.restore();

            if (note.octave === -1) {
                ctx.beginPath();
                ctx.strokeStyle = isSelected ? cfg.color.selected : cfg.color.note;
                ctx.lineWidth = 1.5;
                ctx.moveTo(p.x - 8, p.y + cfg.fontSize / 2 + 6);
                ctx.lineTo(p.x + 8, p.y + cfg.fontSize / 2 + 6);
                ctx.stroke();
            } else if (note.octave === 1) {
                ctx.beginPath();
                ctx.strokeStyle = isSelected ? cfg.color.selected : cfg.color.note;
                ctx.lineWidth = 1.5;
                ctx.moveTo(p.x - 8, p.y - cfg.fontSize / 2 - 6);
                ctx.lineTo(p.x + 8, p.y - cfg.fontSize / 2 - 6);
                ctx.stroke();
            }

            const durationFlags = this._getDurationFlags(note.duration);
            if (durationFlags > 0) {
                ctx.strokeStyle = isSelected ? cfg.color.selected : cfg.color.note;
                ctx.lineWidth = 1.5;
                for (let f = 0; f < durationFlags; f++) {
                    const flagY = p.y + cfg.fontSize / 2 + 12 + f * 6;
                    ctx.beginPath();
                    ctx.moveTo(p.x - 10, flagY);
                    ctx.lineTo(p.x + 10, flagY);
                    ctx.stroke();
                }
            }

            if (note.duration >= 2 && !isRest) {
                ctx.fillStyle = isSelected ? cfg.color.selected : cfg.color.note;
                const text = note.duration === 4 ? '全' : '二分';
                ctx.font = `10px ${this._getFont()}`;
                ctx.fillText(text, p.x, p.y + cfg.fontSize / 2 + 24);
            }

            if (note.dotted) {
                ctx.fillStyle = isSelected ? cfg.color.selected : cfg.color.note;
                ctx.beginPath();
                ctx.arc(p.x + 18, p.y + 5, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            if (note.tie) {
                ctx.fillStyle = isSelected ? cfg.color.selected : cfg.color.tie;
                ctx.font = `12px ${this._getFont()}`;
                ctx.fillText('⌒', p.x, p.y - cfg.fontSize / 2 - 20);
            }
        });
    }

    _drawSelection() {
    }

    _getDurationFlags(duration) {
        return NoteUtils.getDurationFlags(duration);
    }

    _getFont() {
        return '"Microsoft YaHei", "PingFang SC", sans-serif';
    }

    toImageDataURL() {
        return this.canvas.toDataURL('image/png');
    }

    getCanvas() {
        return this.canvas;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScoreRenderer;
}
