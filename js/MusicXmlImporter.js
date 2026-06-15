class MusicXmlImporter {
    constructor(options = {}) {
        this.defaultKey = options.defaultKey || 'C';
        this.defaultTimeSignature = options.defaultTimeSignature || '4/4';
        this.defaultTempo = options.defaultTempo || 120;
        this.warnings = [];
        this.errors = [];
    }

    _addWarning(msg) {
        this.warnings.push(msg);
        console.warn('[MusicXML导入警告]', msg);
    }

    _addError(msg) {
        this.errors.push(msg);
        console.error('[MusicXML导入错误]', msg);
    }

    async importFromFile(file) {
        this.warnings = [];
        this.errors = [];

        if (!file) {
            throw new Error('未选择文件');
        }

        const validExtensions = ['.xml', '.musicxml', '.mxl'];
        const fileName = file.name.toLowerCase();
        const hasValidExt = validExtensions.some(ext => fileName.endsWith(ext));
        if (!hasValidExt) {
            this._addWarning(`文件扩展名 "${file.name}" 不是标准的MusicXML扩展名，将尝试解析`);
        }

        if (file.size === 0) {
            throw new Error('文件为空，无法解析');
        }

        if (file.size > 10 * 1024 * 1024) {
            throw new Error(`文件过大 (${(file.size / 1024 / 1024).toFixed(2)}MB)，请选择小于10MB的文件`);
        }

        let text;
        try {
            if (fileName.endsWith('.mxl')) {
                text = await this._extractCompressedMxl(file);
            } else {
                text = await file.text();
            }
        } catch (e) {
            throw new Error('读取文件失败: ' + e.message);
        }

        return this.importFromString(text);
    }

    async _extractCompressedMxl(file) {
        try {
            const JSZip = window.JSZip;
            if (!JSZip) {
                throw new Error('缺少JSZip库以解析压缩的MXL文件。请使用非压缩的MusicXML文件（.xml或.musicxml），或引入JSZip库。');
            }

            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);

            let containerXml = null;
            try {
                containerXml = await zip.file('META-INF/container.xml').async('string');
            } catch (e) {
                // ignore
            }

            if (containerXml) {
                const parser = new DOMParser();
                const containerDoc = parser.parseFromString(containerXml, 'application/xml');
                const rootFile = containerDoc.querySelector('rootfile');
                if (rootFile) {
                    const filePath = rootFile.getAttribute('full-path');
                    const musicXmlFile = zip.file(filePath);
                    if (musicXmlFile) {
                        return await musicXmlFile.async('string');
                    }
                }
            }

            const xmlFiles = [];
            zip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir && /\.xml$/i.test(relativePath) && !/META-INF/i.test(relativePath)) {
                    xmlFiles.push(relativePath);
                }
            });

            if (xmlFiles.length === 0) {
                throw new Error('压缩包中未找到MusicXML文件');
            }

            const targetFile = xmlFiles.sort((a, b) => {
                const aScore = /score/i.test(a) ? 1 : 0;
                const bScore = /score/i.test(b) ? 1 : 0;
                return bScore - aScore || a.length - b.length;
            })[0];

            this._addWarning(`从压缩包中提取文件: ${targetFile}`);
            return await zip.file(targetFile).async('string');
        } catch (e) {
            if (e.message && e.message.includes('缺少JSZip')) {
                throw e;
            }
            throw new Error('解析压缩MXL文件失败: ' + e.message + '。建议使用非压缩的MusicXML格式。');
        }
    }

    importFromString(xmlString) {
        this.warnings = [];
        this.errors = [];

        if (!xmlString || !xmlString.trim()) {
            throw new Error('文件内容为空');
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, 'application/xml');

        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            this._addWarning('XML解析检测到错误，尝试继续解析');
        }

        const scorePartwise = doc.querySelector('score-partwise');
        const scoreTimewise = doc.querySelector('score-timewise');

        let result;
        if (scorePartwise) {
            result = this._parsePartwise(scorePartwise);
        } else if (scoreTimewise) {
            result = this._parseTimewise(scoreTimewise);
        } else {
            const root = doc.documentElement;
            if (root && (root.tagName.includes('score') || root.querySelector('part, measure'))) {
                this._addWarning('未检测到标准的score-partwise或score-timewise根元素，尝试兼容模式解析');
                result = this._parsePartwise(root);
            } else {
                throw new Error('不是有效的MusicXML文件：缺少score-partwise或score-timewise根元素');
            }
        }

        result.metadata.warnings = [...this.warnings];
        result.metadata.errors = [...this.errors];

        return result;
    }

    _parsePartwise(root) {
        const result = this._createEmptyResult();
        const partList = root.querySelector('part-list');

        const parts = root.querySelectorAll(':scope > part');
        if (parts.length === 0) {
            throw new Error('MusicXML文件中未找到声部(part)');
        }

        const partInfo = this._extractPartInfo(partList);
        result.metadata.trackNames = partInfo.map(p => p.name).filter(n => n);

        let notes = [];
        let barLines = [];

        let bestPart = null;
        let bestScore = -1;

        parts.forEach((part, partIndex) => {
            const measures = part.querySelectorAll(':scope > measure');
            const noteCount = part.querySelectorAll('note').length;
            const isPercussion = part.querySelectorAll('staff-details[line-count="5"] ~ percu').length > 0;
            const score = noteCount * (isPercussion ? 0.1 : 1);

            if (score > bestScore) {
                bestScore = score;
                bestPart = { part, measures, partIndex, isPercussion };
            }
        });

        if (!bestPart) {
            this._addWarning('未找到包含音符的声部');
            return result;
        }

        if (bestPart.isPercussion) {
            this._addWarning('检测到打击乐声部，音高可能不准确');
        }

        const partNotes = [];
        let currentDivisions = 1;
        let currentBeats = 4;
        let currentBeatType = 4;
        let currentFifths = 0;
        let currentMode = 'major';
        let currentTempo = this.defaultTempo;
        let accumulatedDuration = 0;

        bestPart.measures.forEach((measure, measureIndex) => {
            const measureNumber = measure.getAttribute('number') || (measureIndex + 1);

            const attributes = measure.querySelector(':scope > attributes');
            if (attributes) {
                const divisionsEl = attributes.querySelector(':scope > divisions');
                if (divisionsEl) {
                    const divisions = parseInt(divisionsEl.textContent);
                    if (divisions > 0) {
                        currentDivisions = divisions;
                    }
                }

                const time = attributes.querySelector(':scope > time');
                if (time) {
                    const beatsEl = time.querySelector(':scope > beats');
                    const beatTypeEl = time.querySelector(':scope > beat-type');
                    if (beatsEl && beatTypeEl) {
                        const b = parseInt(beatsEl.textContent);
                        const bt = parseInt(beatTypeEl.textContent);
                        if (b > 0 && bt > 0) {
                            currentBeats = b;
                            currentBeatType = bt;
                            result.metadata.timeSignature = `${currentBeats}/${currentBeatType}`;
                        }
                    }
                }

                const key = attributes.querySelector(':scope > key');
                if (key) {
                    const fifthsEl = key.querySelector(':scope > fifths');
                    const modeEl = key.querySelector(':scope > mode');
                    if (fifthsEl) {
                        currentFifths = parseInt(fifthsEl.textContent) || 0;
                        currentMode = modeEl ? modeEl.textContent.trim().toLowerCase() : 'major';
                        result.metadata.key = this._fifthsToKey(currentFifths, currentMode);
                    }
                }
            }

            const direction = measure.querySelector(':scope > direction > direction-type > metronome');
            if (direction) {
                const perMinute = direction.querySelector(':scope > per-minute');
                if (perMinute) {
                    const tempo = parseInt(perMinute.textContent);
                    if (tempo > 0 && tempo < 1000) {
                        currentTempo = tempo;
                        result.metadata.tempo = Math.max(40, Math.min(240, tempo));
                    }
                }
            }

            const measureChildren = Array.from(measure.children);
            let measureAccumulated = 0;
            let isFirstNoteInMeasure = true;

            for (const child of measureChildren) {
                if (child.tagName === 'note') {
                    const noteResult = this._parseNote(child, currentDivisions, currentBeatType, result.metadata.key, measureNumber);
                    if (noteResult) {
                        if (noteResult.isRest && isFirstNoteInMeasure) {
                        }
                        isFirstNoteInMeasure = false;
                        partNotes.push({
                            ...noteResult,
                            _accumulatedStart: accumulatedDuration + measureAccumulated,
                            _measureNumber: measureNumber
                        });
                        measureAccumulated += noteResult.duration;
                    }
                } else if (child.tagName === 'backup') {
                    const durationEl = child.querySelector(':scope > duration');
                    if (durationEl) {
                        const backupDivisions = parseInt(durationEl.textContent) || 0;
                        const backupBeats = (backupDivisions / currentDivisions) * (4 / currentBeatType);
                        measureAccumulated = Math.max(0, measureAccumulated - backupBeats);
                    }
                } else if (child.tagName === 'forward') {
                    const durationEl = child.querySelector(':scope > duration');
                    if (durationEl) {
                        const forwardDivisions = parseInt(durationEl.textContent) || 0;
                        const forwardBeats = (forwardDivisions / currentDivisions) * (4 / currentBeatType);
                        measureAccumulated += forwardBeats;
                    }
                }
            }

            accumulatedDuration += measureAccumulated;

            if (measureIndex > 0) {
                barLines.push({
                    id: NoteUtils.generateBarLineId(),
                    position: accumulatedDuration - measureAccumulated,
                    type: 'single'
                });
            }
        });

        if (accumulatedDuration > 0) {
            barLines.push({
                id: NoteUtils.generateBarLineId(),
                position: accumulatedDuration,
                type: 'double'
            });
        }

        result.notes = partNotes.map(n => ({
            id: n.id || NoteUtils.generateNoteId(),
            pitch: n.pitch,
            octave: n.octave,
            duration: n.duration,
            baseDuration: n.baseDuration,
            dotted: n.dotted,
            tie: n.tie
        }));

        result.barLines = barLines;
        result.metadata.key = this._normalizeKey(result.metadata.key);

        return result;
    }

    _parseTimewise(root) {
        this._addWarning('score-timewise格式支持有限，已尝试按partwise格式解析');

        const measures = root.querySelectorAll(':scope > measure');
        if (measures.length === 0) {
            throw new Error('MusicXML文件中未找到小节(measure)');
        }

        const partsMap = new Map();

        measures.forEach((measure, measureIndex) => {
            const measureNumber = measure.getAttribute('number') || (measureIndex + 1);
            const measureParts = measure.querySelectorAll(':scope > part');

            measureParts.forEach(part => {
                const partId = part.getAttribute('id') || 'default';
                if (!partsMap.has(partId)) {
                    partsMap.set(partId, []);
                }
                const partDoc = document.createElement('part');
                partDoc.setAttribute('id', partId);
                const measureClone = document.createElement('measure');
                measureClone.setAttribute('number', measureNumber);

                const attributes = measure.querySelector(':scope > attributes');
                if (attributes) {
                    measureClone.appendChild(attributes.cloneNode(true));
                }

                Array.from(part.children).forEach(child => {
                    measureClone.appendChild(child.cloneNode(true));
                });

                partDoc.appendChild(measureClone);
                partsMap.get(partId).push(partDoc);
            });
        });

        const virtualDoc = document.createElement('div');
        const virtualRoot = document.createElement('score-partwise');
        virtualDoc.appendChild(virtualRoot);

        let partIdCounter = 0;
        partsMap.forEach((measures, partId) => {
            const partEl = document.createElement('part');
            partEl.setAttribute('id', partId || ('P' + (++partIdCounter)));
            measures.sort((a, b) => {
                const numA = parseInt(a.querySelector('measure')?.getAttribute('number') || '0');
                const numB = parseInt(b.querySelector('measure')?.getAttribute('number') || '0');
                return numA - numB;
            });
            measures.forEach(partDoc => {
                const measure = partDoc.querySelector('measure');
                if (measure) {
                    partEl.appendChild(measure.cloneNode(true));
                }
            });
            virtualRoot.appendChild(partEl);
        });

        return this._parsePartwise(virtualRoot);
    }

    _extractPartInfo(partList) {
        const result = [];
        if (!partList) return result;

        const scoreParts = partList.querySelectorAll(':scope > score-part');
        scoreParts.forEach(sp => {
            const id = sp.getAttribute('id') || '';
            const nameEl = sp.querySelector(':scope > part-name');
            const name = nameEl ? nameEl.textContent.trim() : '';
            result.push({ id, name });
        });

        return result;
    }

    _parseNote(noteEl, divisions, beatType, key, measureNumber) {
        const durationEl = noteEl.querySelector(':scope > duration');
        if (!durationEl) {
            this._addWarning(`小节 ${measureNumber}: 忽略缺少duration的音符`);
            return null;
        }

        const noteDivisions = parseInt(durationEl.textContent);
        if (isNaN(noteDivisions) || noteDivisions <= 0) {
            return null;
        }

        const beatUnitRatio = 4 / beatType;
        let durationBeats = (noteDivisions / divisions) * beatUnitRatio;

        const grace = noteEl.querySelector(':scope > grace');
        if (grace) {
            return null;
        }

        const pitchEl = noteEl.querySelector(':scope > pitch');
        const restEl = noteEl.querySelector(':scope > rest');
        const unpitchedEl = noteEl.querySelector(':scope > unpitched');

        let pitchInfo = null;

        if (restEl) {
            pitchInfo = { pitch: 0, octave: 0, isRest: true };
        } else if (pitchEl) {
            const stepEl = pitchEl.querySelector(':scope > step');
            const octaveEl = pitchEl.querySelector(':scope > octave');
            const alterEl = pitchEl.querySelector(':scope > alter');

            if (!stepEl || !octaveEl) {
                this._addWarning(`小节 ${measureNumber}: 音符缺少step或octave，忽略`);
                return null;
            }

            const step = stepEl.textContent.trim().toUpperCase();
            const midiOctave = parseInt(octaveEl.textContent);
            const alter = alterEl ? parseInt(alterEl.textContent) : 0;

            if (!['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(step)) {
                this._addWarning(`小节 ${measureNumber}: 无效的音名 ${step}`);
                return null;
            }

            pitchInfo = this._musicXmlStepToJianpu(step, midiOctave, alter, key);
        } else if (unpitchedEl) {
            pitchInfo = { pitch: 0, octave: 0, isRest: true };
        } else {
            return null;
        }

        const resolved = NoteUtils.resolveDurationToStandard(durationBeats);
        let baseDuration = resolved.matched ? resolved.baseDuration : durationBeats;
        let dotted = resolved.matched ? resolved.dotted : false;

        const dots = noteEl.querySelectorAll(':scope > dot');
        if (dots.length > 0) {
            let multiplier = 1;
            for (let i = 1; i <= dots.length; i++) {
                multiplier += 1 / Math.pow(2, i);
            }
            if (dots.length === 1) {
                dotted = true;
                baseDuration = durationBeats / 1.5;
            } else {
                dotted = false;
                baseDuration = durationBeats;
                this._addWarning(`小节 ${measureNumber}: 复附点音符可能显示不准确`);
            }
        }

        if (durationBeats < 0.0625) {
            this._addWarning(`小节 ${measureNumber}: 时值过短的音符已忽略 (${durationBeats.toFixed(4)}拍)`);
            return null;
        }

        let tie = false;
        const tieStart = noteEl.querySelector(':scope > tie[type="start"], :scope > tied[type="start"]');
        if (tieStart) {
            tie = true;
        }

        if (pitchInfo.pitch !== 0) {
            if (!NoteUtils.isValidPitch(pitchInfo.pitch)) {
                const clamped = pitchInfo.pitch > 7 ? 7 : 1;
                if (clamped === 1 && pitchInfo.octave < 2) {
                    pitchInfo.octave += 1;
                }
                this._addWarning(`小节 ${measureNumber}: 音符超出简谱音域，已调整`);
                pitchInfo.pitch = clamped;
            }
            if (!NoteUtils.isValidOctave(pitchInfo.octave)) {
                pitchInfo.octave = Math.max(-2, Math.min(2, pitchInfo.octave));
                this._addWarning(`小节 ${measureNumber}: 八度超出范围，已调整`);
            }
        }

        return {
            id: NoteUtils.generateNoteId(),
            pitch: pitchInfo.pitch,
            octave: pitchInfo.octave,
            duration: NoteUtils.getActualDuration(baseDuration, dotted),
            baseDuration: baseDuration,
            dotted: dotted,
            tie: tie,
            isRest: pitchInfo.isRest || false
        };
    }

    _musicXmlStepToJianpu(step, midiOctave, alter, key) {
        const stepSemitoneMap = {
            'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
        };

        const keyOffsets = NoteUtils.KEY_SEMITONE_OFFSET;
        const keyOffset = keyOffsets[key] || 0;

        const stepSemitone = stepSemitoneMap[step] || 0;
        const absoluteMidi = midiOctave * 12 + stepSemitone + (alter || 0);

        const C4_MIDI = 60;
        const relativeMidi = absoluteMidi - C4_MIDI - keyOffset;

        let jianpuOctave = Math.floor(relativeMidi / 12);
        let semitone = ((relativeMidi % 12) + 12) % 12;

        const semitoneToPitch = {
            0: { pitch: 1 },
            1: { pitch: 1 },
            2: { pitch: 2 },
            3: { pitch: 2 },
            4: { pitch: 3 },
            5: { pitch: 4 },
            6: { pitch: 4 },
            7: { pitch: 5 },
            8: { pitch: 5 },
            9: { pitch: 6 },
            10: { pitch: 6 },
            11: { pitch: 7 }
        };

        const info = semitoneToPitch[semitone];

        if (alter > 0 && step === 'B' && info.pitch === 7) {
            jianpuOctave += 1;
            return { pitch: 1, octave: jianpuOctave };
        }
        if (alter < 0 && step === 'C' && info.pitch === 1) {
            jianpuOctave -= 1;
            return { pitch: 7, octave: jianpuOctave };
        }

        return { pitch: info.pitch, octave: jianpuOctave };
    }

    _fifthsToKey(fifths, mode) {
        const isMinor = mode === 'minor';

        const majorKeys = {
            '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F',
            '0': 'C',
            '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#'
        };

        const keyName = majorKeys[fifths] || 'C';
        return keyName;
    }

    _normalizeKey(keyName) {
        if (!keyName) return this.defaultKey;

        const mapping = {
            'C': 'C', 'D': 'D', 'E': 'E', 'F': 'F', 'G': 'G', 'A': 'A', 'B': 'B',
            'Cb': 'B', 'Gb': 'F', 'Db': 'D', 'Ab': 'A', 'Eb': 'E', 'Bb': 'B',
            'C#': 'C', 'F#': 'F', 'G#': 'G', 'D#': 'D', 'A#': 'A', 'B#': 'C',
            'E#': 'F'
        };

        const normalized = mapping[keyName] ||
            (keyName.length > 0 && mapping[keyName[0]]) ||
            this.defaultKey;

        const validKeys = NoteUtils.getValidKeys();
        if (!validKeys.includes(normalized)) {
            this._addWarning(`不支持的调式 ${keyName}，已转换为C调`);
            return 'C';
        }

        return normalized;
    }

    _createEmptyResult() {
        return {
            notes: [],
            barLines: [],
            metadata: {
                key: this.defaultKey,
                timeSignature: this.defaultTimeSignature,
                tempo: this.defaultTempo,
                trackCount: 0,
                trackNames: [],
                warnings: [],
                errors: []
            }
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MusicXmlImporter;
}
