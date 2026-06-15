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

        const importBtn = document.getElementById('importBtn');
        const importFileInput = document.getElementById('importFileInput');
        const importModal = document.getElementById('importModal');
        const importModalClose = document.getElementById('importModalClose');
        const importProgressSection = document.getElementById('importProgressSection');
        const importResultSection = document.getElementById('importResultSection');
        const importErrorSection = document.getElementById('importErrorSection');
        const importProgressMessage = document.getElementById('importProgressMessage');
        const importProgressFill = document.getElementById('importProgressFill');
        const importProgressPercent = document.getElementById('importProgressPercent');
        const importResultIcon = document.getElementById('importResultIcon');
        const importResultTitle = document.getElementById('importResultTitle');
        const importResultMessage = document.getElementById('importResultMessage');
        const importResultDetails = document.getElementById('importResultDetails');
        const importResultWarnings = document.getElementById('importResultWarnings');
        const importConfirmBtn = document.getElementById('importConfirmBtn');
        const importCancelBtn = document.getElementById('importCancelBtn');
        const importErrorCloseBtn = document.getElementById('importErrorCloseBtn');
        const importErrorMessage = document.getElementById('importErrorMessage');

        const noteButtons = document.querySelectorAll('.note-btn');
        const octaveButtons = document.querySelectorAll('.octave-btn');
        const durationButtons = document.querySelectorAll('.duration-btn');

        let currentPitch = 1;
        let currentOctave = 0;
        let currentDuration = 1;

        let pendingImportResult = null;

        const scoreImporter = new ScoreImporter({
            defaultKey: keySelect.value,
            defaultTimeSignature: timeSignature.value,
            defaultTempo: parseInt(tempoInput.value),
            onProgress: (info) => {
                updateImportProgress(info.percent, info.message);
            }
        });

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

        function showImportModal() {
            importModal.style.display = 'flex';
            importProgressSection.style.display = 'block';
            importResultSection.style.display = 'none';
            importErrorSection.style.display = 'none';
            updateImportProgress(0, '准备导入...');
        }

        function hideImportModal() {
            importModal.style.display = 'none';
            pendingImportResult = null;
        }

        function updateImportProgress(percent, message) {
            percent = Math.max(0, Math.min(100, percent));
            importProgressFill.style.width = percent + '%';
            importProgressPercent.textContent = Math.round(percent) + '%';
            if (message) {
                importProgressMessage.textContent = message;
            }
        }

        function showImportResult(result) {
            pendingImportResult = result;
            importProgressSection.style.display = 'none';
            importResultSection.style.display = 'block';
            importErrorSection.style.display = 'none';

            const hasNotes = result.metadata.stats && result.metadata.stats.noteCount > 0;
            const hasWarnings = result.metadata.warnings && result.metadata.warnings.length > 0;

            if (hasNotes && !hasWarnings) {
                importResultIcon.textContent = '✓';
                importResultIcon.className = 'result-icon';
                importResultTitle.textContent = '导入成功';
            } else if (hasNotes && hasWarnings) {
                importResultIcon.textContent = '!';
                importResultIcon.className = 'result-icon warning-icon';
                importResultTitle.textContent = '导入完成（有警告）';
            } else {
                importResultIcon.textContent = 'i';
                importResultIcon.className = 'result-icon warning-icon';
                importResultTitle.textContent = '导入完成（无音符）';
            }

            const fileName = result.metadata.fileName || '未知文件';
            const fileType = result.metadata.fileType || '未知格式';
            const noteCount = result.metadata.stats ? result.metadata.stats.noteCount : result.notes.filter(n => n.pitch !== 0).length;
            const restCount = result.metadata.stats ? result.metadata.stats.restCount : result.notes.filter(n => n.pitch === 0).length;
            const barCount = result.barLines.length;
            const totalDuration = result.metadata.stats ? result.metadata.stats.totalDuration : result.notes.reduce((s, n) => s + n.duration, 0);

            importResultMessage.textContent = `文件 "${fileName}" 已成功解析。`;

            let detailsHtml = '';
            detailsHtml += `<div class="detail-row"><span class="detail-label">文件格式</span><span class="detail-value">${fileType}</span></div>`;
            detailsHtml += `<div class="detail-row"><span class="detail-label">文件大小</span><span class="detail-value">${formatFileSize(result.metadata.fileSize || 0)}</span></div>`;
            detailsHtml += `<div class="detail-row"><span class="detail-label">音高/音调</span><span class="detail-value">${result.metadata.key}调</span></div>`;
            detailsHtml += `<div class="detail-row"><span class="detail-label">拍号</span><span class="detail-value">${result.metadata.timeSignature}</span></div>`;
            detailsHtml += `<div class="detail-row"><span class="detail-label">速度</span><span class="detail-value">${result.metadata.tempo} BPM</span></div>`;
            detailsHtml += `<div class="detail-row"><span class="detail-label">音符数量</span><span class="detail-value">${noteCount} 个</span></div>`;
            if (restCount > 0) {
                detailsHtml += `<div class="detail-row"><span class="detail-label">休止符</span><span class="detail-value">${restCount} 个</span></div>`;
            }
            detailsHtml += `<div class="detail-row"><span class="detail-label">小节线</span><span class="detail-value">${barCount} 条</span></div>`;
            detailsHtml += `<div class="detail-row"><span class="detail-label">总时长</span><span class="detail-value">${totalDuration.toFixed(1)} 拍 (${(totalDuration / result.metadata.tempo * 60).toFixed(1)} 秒)</span></div>`;
            importResultDetails.innerHTML = detailsHtml;

            if (hasWarnings) {
                const warnings = result.metadata.warnings.slice(0, 20);
                const hasMore = result.metadata.warnings.length > warnings.length;
                let warningsHtml = `<div class="warnings-header">⚠️ 注意事项 (${result.metadata.warnings.length}条)</div>`;
                warningsHtml += `<div class="warnings-list">`;
                warnings.forEach(w => {
                    warningsHtml += `<div class="warning-item">• ${escapeHtml(w)}</div>`;
                });
                if (hasMore) {
                    warningsHtml += `<div class="warning-item">... 还有 ${result.metadata.warnings.length - warnings.length} 条提示未显示</div>`;
                }
                warningsHtml += `</div>`;
                importResultWarnings.innerHTML = warningsHtml;
                importResultWarnings.style.display = 'block';
            } else {
                importResultWarnings.style.display = 'none';
            }

            importConfirmBtn.disabled = !hasNotes;
            if (!hasNotes) {
                importConfirmBtn.textContent = '无可导入内容';
            } else {
                const overwriteMsg = noteEditor.getNotes().length > 0 ? '（将覆盖现有内容）' : '';
                importConfirmBtn.textContent = `确认导入 ${overwriteMsg}`;
            }
        }

        function showImportError(error) {
            importProgressSection.style.display = 'none';
            importResultSection.style.display = 'none';
            importErrorSection.style.display = 'block';

            const errorMsg = error && error.message ? error.message : '未知错误';
            const detailedMsg = error.userFriendly
                ? errorMsg
                : `解析过程中发生错误：\n\n${errorMsg}\n\n可能的原因：\n1. 文件已损坏或格式不正确\n2. 文件不是有效的MIDI或MusicXML文件\n3. 文件版本过新或使用了不支持的特性\n\n建议：\n• 尝试用其他软件重新导出文件\n• 使用MusicXML格式（推荐）以获得更好的效果\n• 如果是MIDI文件，确保是标准的Type 0或Type 1格式`;

            importErrorMessage.textContent = detailedMsg;
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function applyImportResult(result) {
            if (!result) return;

            const hasNotes = result.notes && result.notes.filter(n => n.pitch !== 0).length > 0;
            if (!hasNotes) {
                alert('导入结果中没有有效的音符，无法导入。');
                return;
            }

            if (noteEditor.getNotes().length > 0) {
                if (!confirm('当前已有音符内容，导入将覆盖所有现有数据。是否继续？')) {
                    return;
                }
            }

            if (result.metadata.timeSignature) {
                const validSigs = ['2/4', '3/4', '4/4', '6/8'];
                if (validSigs.includes(result.metadata.timeSignature)) {
                    timeSignature.value = result.metadata.timeSignature;
                    scoreRenderer.setTimeSignature(result.metadata.timeSignature);
                    midiExporter.setTimeSignature(result.metadata.timeSignature);
                } else {
                    console.log('不支持的拍号:', result.metadata.timeSignature, '，保持当前设置');
                }
            }

            if (result.metadata.key) {
                const validKeys = NoteUtils.getValidKeys();
                if (validKeys.includes(result.metadata.key)) {
                    keySelect.value = result.metadata.key;
                    scoreRenderer.setKey(result.metadata.key);
                    synthesizer.setKey(result.metadata.key);
                    midiExporter.setKey(result.metadata.key);
                }
            }

            if (result.metadata.tempo) {
                const tempo = Math.max(40, Math.min(240, result.metadata.tempo));
                tempoInput.value = tempo;
                scoreRenderer.setTempo(tempo);
                synthesizer.setTempo(tempo);
                midiExporter.setTempo(tempo);
            }

            noteEditor.clearAll();

            result.notes.forEach((note, idx) => {
                const newNote = {
                    id: note.id || NoteUtils.generateNoteId(),
                    pitch: NoteUtils.isValidPitch(note.pitch) ? note.pitch : 1,
                    octave: NoteUtils.isValidOctave(note.octave) ? note.octave : 0,
                    duration: note.duration || 1,
                    dotted: note.dotted || false,
                    tie: note.tie || false
                };
                noteEditor.notes.push(newNote);
            });

            noteEditor.barLines = (result.barLines || []).map(bl => ({
                id: bl.id || NoteUtils.generateBarLineId(),
                position: bl.position || 0,
                type: bl.type || 'single'
            }));

            noteEditor._syncToRenderer();
            noteEditor._emit('notesChanged', noteEditor.notes);
            noteEditor._emit('barLinesChanged', noteEditor.barLines);

            updateNoteList();
            hideImportModal();

            setTimeout(() => {
                const noteCount = result.notes.filter(n => n.pitch !== 0).length;
                alert(`成功导入 ${noteCount} 个音符！\n\n${result.metadata.key}调 | ${result.metadata.timeSignature} | ${result.metadata.tempo} BPM`);
            }, 50);
        }

        importBtn.addEventListener('click', () => {
            importFileInput.value = '';
            importFileInput.click();
        });

        importFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            showImportModal();

            try {
                await new Promise(resolve => setTimeout(resolve, 100));

                const result = await scoreImporter.importFromFile(file);
                showImportResult(result);
            } catch (err) {
                console.error('导入失败:', err);
                showImportError(err);
            }
        });

        importModalClose.addEventListener('click', hideImportModal);
        importCancelBtn.addEventListener('click', hideImportModal);
        importErrorCloseBtn.addEventListener('click', hideImportModal);

        importModal.addEventListener('click', (e) => {
            if (e.target === importModal) {
                hideImportModal();
            }
        });

        importConfirmBtn.addEventListener('click', () => {
            applyImportResult(pendingImportResult);
        });

        document.addEventListener('keydown', (e) => {
            if (importModal.style.display === 'flex') {
                if (e.key === 'Escape') {
                    hideImportModal();
                }
            }
        });

        const scoreContainer = document.getElementById('scoreContainer');
        let dragCounter = 0;

        function handleDragEnter(e) {
            e.preventDefault();
            e.stopPropagation();
            dragCounter++;
            if (e.dataTransfer && e.dataTransfer.items && Array.from(e.dataTransfer.items).some(i => i.kind === 'file')) {
                scoreContainer.classList.add('drag-over');
            }
        }

        function handleDragLeave(e) {
            e.preventDefault();
            e.stopPropagation();
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                scoreContainer.classList.remove('drag-over');
            }
        }

        function handleDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        async function handleDrop(e) {
            e.preventDefault();
            e.stopPropagation();
            dragCounter = 0;
            scoreContainer.classList.remove('drag-over');

            if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) {
                return;
            }

            const file = e.dataTransfer.files[0];
            if (!file) return;

            const fileName = file.name.toLowerCase();
            const isValid = /\.(mid|midi|xml|musicxml|mxl)$/.test(fileName);
            if (!isValid) {
                alert('不支持的文件格式！\n\n支持的格式：MIDI (.mid/.midi)、MusicXML (.xml/.musicxml/.mxl)');
                return;
            }

            showImportModal();

            try {
                await new Promise(resolve => setTimeout(resolve, 100));
                const result = await scoreImporter.importFromFile(file);
                showImportResult(result);
            } catch (err) {
                console.error('拖放导入失败:', err);
                showImportError(err);
            }
        }

        scoreContainer.addEventListener('dragenter', handleDragEnter);
        scoreContainer.addEventListener('dragleave', handleDragLeave);
        scoreContainer.addEventListener('dragover', handleDragOver);
        scoreContainer.addEventListener('drop', handleDrop);

        document.addEventListener('dragenter', (e) => {
            if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
                e.preventDefault();
            }
        });
        document.addEventListener('dragover', (e) => {
            if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
                e.preventDefault();
            }
        });
        document.addEventListener('drop', (e) => {
            if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
                e.preventDefault();
            }
        });

        window.addEventListener('error', (e) => {
            console.error('全局错误:', e.message, e.filename, e.lineno);
            if (importModal.style.display === 'flex') {
                showImportError(new Error('处理过程中发生意外错误: ' + e.message));
            }
        });

        window.addEventListener('unhandledrejection', (e) => {
            console.error('未处理的Promise拒绝:', e.reason);
            if (importModal.style.display === 'flex') {
                showImportError(new Error('异步处理失败: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))));
            }
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
