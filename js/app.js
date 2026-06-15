(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        const canvas = document.getElementById('scoreCanvas');
        const noteList = document.getElementById('noteList');
        const progressFill = document.getElementById('progressFill');
        const timeDisplay = document.getElementById('timeDisplay');

        const keySelect = document.getElementById('keySelect');
        const timeSignature = document.getElementById('timeSignature');
        const tempoInput = document.getElementById('tempoInput');
        const dottedCheck = document.getElementById('dottedCheck');
        const tieCheck = document.getElementById('tieCheck');

        const playBtn = document.getElementById('playBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const stopBtn = document.getElementById('stopBtn');

        const addBarLineBtn = document.getElementById('addBarLineBtn');
        const addRestBtn = document.getElementById('addRestBtn');
        const deleteBtn = document.getElementById('deleteBtn');
        const clearBtn = document.getElementById('clearBtn');

        const exportImageBtn = document.getElementById('exportImageBtn');
        const exportMidiBtn = document.getElementById('exportMidiBtn');

        const noteButtons = document.querySelectorAll('.note-btn');
        const octaveButtons = document.querySelectorAll('.octave-btn');
        const durationButtons = document.querySelectorAll('.duration-btn');

        let currentPitch = 1;
        let currentOctave = 0;
        let currentDuration = 1;

        const scoreRenderer = new ScoreRenderer(canvas, {
            key: keySelect.value,
            timeSignature: timeSignature.value,
            tempo: parseInt(tempoInput.value)
        });

        const noteEditor = new NoteEditor(scoreRenderer);

        const synthesizer = new AudioSynthesizer({
            key: keySelect.value,
            tempo: parseInt(tempoInput.value),
            waveType: 'sine'
        });

        const playbackController = new PlaybackController(synthesizer, {
            scoreRenderer: scoreRenderer,
            noteEditor: noteEditor,
            onProgress: (info) => {
                progressFill.style.width = info.progress + '%';
                timeDisplay.textContent = `${info.formattedCurrent} / ${info.formattedTotal}`;
            },
            onStateChange: (state) => {
                playBtn.disabled = state === 'playing';
                pauseBtn.disabled = state !== 'playing';
            },
            onComplete: () => {
                progressFill.style.width = '0%';
            }
        });

        const midiExporter = new MidiExporter({
            key: keySelect.value,
            tempo: parseInt(tempoInput.value),
            timeSignature: timeSignature.value
        });

        const imageExporter = new ImageExporter(scoreRenderer);

        updateNoteList();

        function setActiveButton(buttons, value, attr) {
            buttons.forEach(btn => {
                if (parseFloat(btn.dataset[attr]) === parseFloat(value)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        function updateNoteList() {
            const notes = noteEditor.getNotes();
            noteList.innerHTML = '';

            if (notes.length === 0) {
                noteList.innerHTML = '<div style="color:#999;font-size:12px;text-align:center;padding:20px;">暂无音符</div>';
                return;
            }

            notes.forEach((note, idx) => {
                const item = document.createElement('div');
                item.className = 'note-item';
                if (note.id === noteEditor.selectedNoteId) {
                    item.classList.add('selected');
                }

                const baseDuration = NoteUtils.getBaseDuration(note.duration, note.dotted);
                const durationLabel = NoteUtils.getDurationLabel(note.duration);
                const octaveLabel = NoteUtils.getOctaveLabel(note.octave);

                let pitchText = note.pitch === 0 ? '休止符' :
                    octaveLabel + NoteUtils.getNoteDisplay(note.pitch);
                if (note.pitch > 0 && note.dotted) pitchText += '·';
                if (note.tie) pitchText += ' ⌒';

                const durationText = baseDuration >= 1
                    ? `${baseDuration}拍${note.dotted ? ' (附点)' : ''}`
                    : `${baseDuration === 0.5 ? '1/2' : baseDuration === 0.25 ? '1/4' : baseDuration}拍${note.dotted ? ' (附点)' : ''}`;

                const actualDurationText = `实际: ${note.duration.toFixed(2)}拍`;

                item.innerHTML = `
                    <span class="note-info">${idx + 1}. ${pitchText} ${durationLabel ? '<small>(' + durationLabel + ')</small>' : ''}</span>
                    <span class="note-duration" title="${actualDurationText}">${durationText}</span>
                `;

                item.addEventListener('click', () => {
                    noteEditor.setSelectedNote(note.id);
                    if (synthesizer.isInitialized && note.pitch > 0) {
                        synthesizer.playNotePreview(note);
                    }
                    updateNoteList();
                });

                noteList.appendChild(item);
            });
        }

        noteButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                currentPitch = parseInt(btn.dataset.pitch);
                setActiveButton(noteButtons, currentPitch, 'pitch');
                noteEditor.setTool('pitch', currentPitch);
            });
        });

        octaveButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                octaveButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentOctave = parseInt(btn.dataset.octave);
                noteEditor.setTool('octave', currentOctave);
            });
        });

        durationButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                currentDuration = parseFloat(btn.dataset.duration);
                setActiveButton(durationButtons, currentDuration, 'duration');
                noteEditor.setTool('duration', currentDuration);
            });
        });

        dottedCheck.addEventListener('change', () => {
            noteEditor.setTool('dotted', dottedCheck.checked);
        });

        tieCheck.addEventListener('change', () => {
            noteEditor.setTool('tie', tieCheck.checked);
        });

        keySelect.addEventListener('change', () => {
            scoreRenderer.setKey(keySelect.value);
            synthesizer.setKey(keySelect.value);
            midiExporter.setKey(keySelect.value);
        });

        timeSignature.addEventListener('change', () => {
            scoreRenderer.setTimeSignature(timeSignature.value);
            midiExporter.setTimeSignature(timeSignature.value);
        });

        tempoInput.addEventListener('change', () => {
            const tempo = Math.max(40, Math.min(240, parseInt(tempoInput.value) || 120));
            tempoInput.value = tempo;
            scoreRenderer.setTempo(tempo);
            synthesizer.setTempo(tempo);
            midiExporter.setTempo(tempo);
        });

        playBtn.addEventListener('click', async () => {
            if (!synthesizer.isInitialized) {
                try {
                    await synthesizer.init();
                } catch (e) {
                    alert('音频系统初始化失败: ' + e.message);
                    return;
                }
            }
            playbackController.play();
        });

        pauseBtn.addEventListener('click', () => {
            playbackController.pause();
        });

        stopBtn.addEventListener('click', () => {
            playbackController.stop();
        });

        addBarLineBtn.addEventListener('click', () => {
            noteEditor.addBarLine();
        });

        addRestBtn.addEventListener('click', () => {
            noteEditor.addRest();
            updateNoteList();
        });

        deleteBtn.addEventListener('click', () => {
            if (noteEditor.selectedNoteId) {
                noteEditor.deleteSelectedNote();
            } else if (noteEditor.selectedBarLineId) {
                noteEditor.deleteSelectedBarLine();
            }
            updateNoteList();
        });

        clearBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有音符吗？')) {
                noteEditor.clearAll();
                updateNoteList();
            }
        });

        exportImageBtn.addEventListener('click', () => {
            imageExporter.download('简谱导出_' + new Date().toLocaleDateString() + '.png', {
                format: 'image/png',
                scale: 2,
                quality: 0.95
            })
            .then(() => {
                alert('图片已下载！');
            })
            .catch(err => {
                console.error('导出图片失败:', err);
                alert('导出图片失败: ' + err.message);
            });
        });

        exportMidiBtn.addEventListener('click', () => {
            const notes = noteEditor.getNotes();
            if (notes.length === 0) {
                alert('没有可导出的音符！');
                return;
            }
            midiExporter.download(notes, '简谱导出_' + new Date().toLocaleDateString() + '.mid');
            alert('MIDI文件已下载！');
        });

        noteEditor.on('notesChanged', () => {
            updateNoteList();
        });

        noteEditor.on('noteAdded', (note) => {
            updateNoteList();
            if (synthesizer.isInitialized && note.pitch > 0) {
                synthesizer.playNotePreview(note);
            }
        });

        noteEditor.on('noteDeleted', () => {
            updateNoteList();
        });

        noteEditor.on('selectionChanged', () => {
            updateNoteList();
        });

        setActiveButton(noteButtons, currentPitch, 'pitch');
        setActiveButton(durationButtons, currentDuration, 'duration');

        noteEditor.setTool('pitch', currentPitch);
        noteEditor.setTool('octave', currentOctave);
        noteEditor.setTool('duration', currentDuration);

        setTimeout(() => {
            scoreRenderer.render();
        }, 100);
    });
})();
