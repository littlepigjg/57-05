class MidiImporter {
    constructor(options = {}) {
        this.defaultKey = options.defaultKey || 'C';
        this.defaultTimeSignature = options.defaultTimeSignature || '4/4';
        this.defaultTempo = options.defaultTempo || 120;
        this.quantization = options.quantization || 0.1;
        this.warnings = [];
        this.errors = [];
    }

    _addWarning(msg) {
        this.warnings.push(msg);
        console.warn('[MIDI导入警告]', msg);
    }

    _addError(msg) {
        this.errors.push(msg);
        console.error('[MIDI导入错误]', msg);
    }

    async importFromFile(file) {
        this.warnings = [];
        this.errors = [];

        if (!file) {
            throw new Error('未选择文件');
        }

        const validExtensions = ['.mid', '.midi'];
        const fileName = file.name.toLowerCase();
        const hasValidExt = validExtensions.some(ext => fileName.endsWith(ext));
        if (!hasValidExt) {
            this._addWarning(`文件扩展名 "${file.name}" 不是标准的MIDI扩展名 (.mid/.midi)，将尝试解析`);
        }

        if (file.size === 0) {
            throw new Error('文件为空，无法解析');
        }

        if (file.size > 10 * 1024 * 1024) {
            throw new Error(`文件过大 (${(file.size / 1024 / 1024).toFixed(2)}MB)，请选择小于10MB的文件`);
        }

        let arrayBuffer;
        try {
            arrayBuffer = await file.arrayBuffer();
        } catch (e) {
            throw new Error('读取文件失败: ' + e.message);
        }

        return this.importFromArrayBuffer(arrayBuffer);
    }

    importFromArrayBuffer(arrayBuffer) {
        this.warnings = [];
        this.errors = [];

        const data = new Uint8Array(arrayBuffer);

        if (data.length < 14) {
            throw new Error('文件太小，不是有效的MIDI文件');
        }

        const header = this._parseHeader(data);
        if (!header) {
            throw new Error('无法识别的MIDI文件格式：缺少MThd头部');
        }

        const tracks = this._parseTracks(data, header);
        return this._convertToScore(tracks, header);
    }

    _parseHeader(data) {
        const signature = String.fromCharCode(data[0], data[1], data[2], data[3]);
        if (signature !== 'MThd') {
            return null;
        }

        const headerLength = MidiUtils.readInt32(data, 4);
        if (headerLength < 6) {
            this._addWarning('MIDI头部长度异常，尝试继续解析');
        }

        const format = MidiUtils.readInt16(data, 8);
        const numTracks = MidiUtils.readInt16(data, 10);
        const division = MidiUtils.readInt16(data, 12);

        if (format < 0 || format > 2) {
            this._addWarning(`未知的MIDI格式: ${format}，将按格式1处理`);
        }

        let ticksPerQuarterNote;
        if (division & 0x8000) {
            const framesPerSecond = ((division >> 8) & 0x7F);
            const ticksPerFrame = division & 0xFF;
            const fpsMap = { 24: 24, 25: 25, 29: 30, 30: 30 };
            const fps = fpsMap[framesPerSecond] || 25;
            ticksPerQuarterNote = Math.round((fps * ticksPerFrame) / 2);
            this._addWarning(`MIDI使用SMPTE时间格式，已转换为每四分音符 ${ticksPerQuarterNote} ticks`);
        } else {
            ticksPerQuarterNote = division;
        }

        if (ticksPerQuarterNote <= 0 || ticksPerQuarterNote > 10000) {
            this._addWarning(`异常的ticksPerQuarterNote值: ${ticksPerQuarterNote}，使用默认值480`);
            ticksPerQuarterNote = 480;
        }

        return {
            format,
            numTracks,
            ticksPerQuarterNote,
            headerEnd: 8 + Math.max(headerLength, 6)
        };
    }

    _parseTracks(data, header) {
        const tracks = [];
        let offset = header.headerEnd;
        const maxTracks = Math.min(header.numTracks, 64);

        for (let i = 0; i < maxTracks; i++) {
            if (offset + 8 > data.length) {
                this._addWarning(`预期 ${header.numTracks} 个轨道，但只找到 ${i} 个`);
                break;
            }

            const signature = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
            const chunkLength = MidiUtils.readInt32(data, offset + 4);

            if (signature !== 'MTrk') {
                this._addWarning(`轨道 ${i}: 预期MTrk标记，找到"${signature}"，跳过`);
                offset += 8 + chunkLength;
                continue;
            }

            const trackData = data.slice(offset + 8, offset + 8 + chunkLength);
            const track = this._parseTrackEvents(trackData, i, header.ticksPerQuarterNote);
            tracks.push(track);
            offset += 8 + chunkLength;
        }

        return tracks;
    }

    _parseTrackEvents(trackData, trackIndex, ticksPerQuarterNote) {
        const events = [];
        let offset = 0;
        let runningStatus = null;
        let currentTick = 0;
        let safetyCounter = 0;
        const maxEvents = 100000;

        while (offset < trackData.length && safetyCounter < maxEvents) {
            safetyCounter++;

            const deltaResult = MidiUtils.readVariableLength(trackData, offset);
            const deltaTime = deltaResult.value;
            offset += deltaResult.length;
            currentTick += deltaTime;

            if (offset >= trackData.length) {
                break;
            }

            let statusByte = trackData[offset];

            if ((statusByte & 0x80) === 0) {
                if (runningStatus !== null) {
                    statusByte = runningStatus;
                } else {
                    this._addWarning(`轨道 ${trackIndex}: 在偏移 ${offset} 处缺少状态字节，跳过`);
                    offset++;
                    continue;
                }
            } else {
                runningStatus = statusByte;
                offset++;
            }

            const eventType = statusByte & 0xF0;
            const channel = statusByte & 0x0F;

            let event = {
                tick: currentTick,
                deltaTime,
                status: statusByte,
                channel,
                trackIndex
            };

            try {
                switch (eventType) {
                    case 0x80:
                        event.type = 'noteOff';
                        event.noteNumber = trackData[offset++] & 0x7F;
                        event.velocity = trackData[offset++] & 0x7F;
                        break;

                    case 0x90:
                        event.noteNumber = trackData[offset++] & 0x7F;
                        event.velocity = trackData[offset++] & 0x7F;
                        event.type = event.velocity === 0 ? 'noteOff' : 'noteOn';
                        break;

                    case 0xA0:
                        event.type = 'keyPressure';
                        event.noteNumber = trackData[offset++] & 0x7F;
                        event.pressure = trackData[offset++] & 0x7F;
                        break;

                    case 0xB0:
                        event.type = 'controlChange';
                        event.controller = trackData[offset++] & 0x7F;
                        event.value = trackData[offset++] & 0x7F;
                        break;

                    case 0xC0:
                        event.type = 'programChange';
                        event.program = trackData[offset++] & 0x7F;
                        break;

                    case 0xD0:
                        event.type = 'channelPressure';
                        event.pressure = trackData[offset++] & 0x7F;
                        break;

                    case 0xE0:
                        event.type = 'pitchBend';
                        const lsb = trackData[offset++] & 0x7F;
                        const msb = trackData[offset++] & 0x7F;
                        event.value = (msb << 7) | lsb;
                        break;

                    case 0xF0:
                        if (statusByte === 0xFF) {
                            event.type = 'meta';
                            event.metaType = trackData[offset++];
                            const lengthResult = MidiUtils.readVariableLength(trackData, offset);
                            event.metaLength = lengthResult.value;
                            offset += lengthResult.length;
                            event.metaData = trackData.slice(offset, offset + event.metaLength);
                            offset += event.metaLength;
                            this._parseMetaEvent(event);
                        } else if (statusByte === 0xF0 || statusByte === 0xF7) {
                            event.type = statusByte === 0xF0 ? 'sysEx' : 'sysExEscape';
                            const lengthResult = MidiUtils.readVariableLength(trackData, offset);
                            offset += lengthResult.length + lengthResult.value;
                        } else {
                            offset++;
                        }
                        break;

                    default:
                        this._addWarning(`轨道 ${trackIndex}: 未知事件类型 0x${eventType.toString(16)}`);
                        offset++;
                }
            } catch (e) {
                this._addWarning(`轨道 ${trackIndex}: 解析事件失败: ${e.message}`);
                break;
            }

            events.push(event);
        }

        if (safetyCounter >= maxEvents) {
            this._addWarning(`轨道 ${trackIndex}: 事件数量超过限制，已截断`);
        }

        return {
            index: trackIndex,
            events,
            durationTicks: currentTick
        };
    }

    _parseMetaEvent(event) {
        switch (event.metaType) {
            case 0x00:
                event.metaName = 'sequenceNumber';
                if (event.metaLength >= 2) {
                    event.sequenceNumber = (event.metaData[0] << 8) | event.metaData[1];
                }
                break;
            case 0x01:
                event.metaName = 'text';
                event.text = this._decodeText(event.metaData);
                break;
            case 0x02:
                event.metaName = 'copyright';
                event.text = this._decodeText(event.metaData);
                break;
            case 0x03:
                event.metaName = 'trackName';
                event.text = this._decodeText(event.metaData);
                break;
            case 0x04:
                event.metaName = 'instrumentName';
                event.text = this._decodeText(event.metaData);
                break;
            case 0x05:
                event.metaName = 'lyric';
                event.text = this._decodeText(event.metaData);
                break;
            case 0x06:
                event.metaName = 'marker';
                event.text = this._decodeText(event.metaData);
                break;
            case 0x07:
                event.metaName = 'cuePoint';
                event.text = this._decodeText(event.metaData);
                break;
            case 0x20:
                event.metaName = 'channelPrefix';
                break;
            case 0x2F:
                event.metaName = 'endOfTrack';
                break;
            case 0x51:
                event.metaName = 'tempo';
                if (event.metaLength >= 3) {
                    event.tempoMicros = (event.metaData[0] << 16) | (event.metaData[1] << 8) | event.metaData[2];
                    event.tempoBpm = Math.round(60000000 / event.tempoMicros);
                }
                break;
            case 0x54:
                event.metaName = 'smpteOffset';
                break;
            case 0x58:
                event.metaName = 'timeSignature';
                if (event.metaLength >= 4) {
                    event.numerator = event.metaData[0];
                    event.denominator = Math.pow(2, event.metaData[1]);
                    event.clocksPerClick = event.metaData[2];
                    event.notated32nds = event.metaData[3];
                    event.timeSignatureStr = `${event.numerator}/${event.denominator}`;
                }
                break;
            case 0x59:
                event.metaName = 'keySignature';
                if (event.metaLength >= 2) {
                    const sf = event.metaData[0] > 127 ? event.metaData[0] - 256 : event.metaData[0];
                    event.isMinor = event.metaData[1] !== 0;
                    event.keySharpsFlats = sf;
                    event.keyName = this._sharpsFlatsToKey(sf, event.isMinor);
                }
                break;
            case 0x7F:
                event.metaName = 'sequencerSpecific';
                break;
            default:
                event.metaName = 'unknown';
        }
    }

    _decodeText(bytes) {
        try {
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const text = decoder.decode(bytes);
            return text.replace(/\u0000/g, '').trim();
        } catch (e) {
            return Array.from(bytes).map(b => String.fromCharCode(b)).join('').replace(/\u0000/g, '').trim();
        }
    }

    _sharpsFlatsToKey(sf, isMinor) {
        const majorKeys = {
            '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F',
            '0': 'C',
            '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#'
        };
        const minorKeys = {
            '-7': 'Abm', '-6': 'Ebm', '-5': 'Bbm', '-4': 'Fm', '-3': 'Cm', '-2': 'Gm', '-1': 'Dm',
            '0': 'Am',
            '1': 'Em', '2': 'Bm', '3': 'F#m', '4': 'C#m', '5': 'G#m', '6': 'D#m', '7': 'A#m'
        };
        const key = isMinor ? minorKeys[sf] : majorKeys[sf];
        return key || 'C';
    }

    _convertToScore(tracks, header) {
        const result = {
            notes: [],
            barLines: [],
            metadata: {
                key: this.defaultKey,
                timeSignature: this.defaultTimeSignature,
                tempo: this.defaultTempo,
                trackCount: tracks.length,
                trackNames: [],
                warnings: [...this.warnings],
                errors: [...this.errors]
            }
        };

        let tempoBpm = this.defaultTempo;
        let timeSig = this.defaultTimeSignature;
        let beatsPerBar = 4;
        let beatUnit = 4;
        let keyName = this.defaultKey;

        let earliestTempo = Infinity;
        let earliestTimeSig = Infinity;
        let earliestKeySig = Infinity;

        for (const track of tracks) {
            for (const event of track.events) {
                if (event.type === 'meta') {
                    if (event.metaName === 'tempo' && event.tempoBpm && event.tick < earliestTempo) {
                        earliestTempo = event.tick;
                        tempoBpm = event.tempoBpm;
                    }
                    if (event.metaName === 'timeSignature' && event.tick < earliestTimeSig) {
                        earliestTimeSig = event.tick;
                        timeSig = event.timeSignatureStr;
                        beatsPerBar = event.numerator;
                        beatUnit = event.denominator;
                    }
                    if (event.metaName === 'keySignature' && event.keyName && event.tick < earliestKeySig) {
                        earliestKeySig = event.tick;
                        keyName = event.keyName;
                    }
                    if (event.metaName === 'trackName' && event.text) {
                        if (!result.metadata.trackNames.includes(event.text)) {
                            result.metadata.trackNames.push(event.text);
                        }
                    }
                }
            }
        }

        result.metadata.key = this._normalizeKey(keyName);
        result.metadata.timeSignature = timeSig;
        result.metadata.tempo = Math.max(40, Math.min(240, tempoBpm || this.defaultTempo));

        const noteTracks = this._selectNoteTracks(tracks);

        if (noteTracks.length === 0) {
            this._addWarning('未找到包含音符的轨道，将返回空乐谱');
            return result;
        }

        const notesPerTrack = noteTracks.map(track =>
            this._extractNotesFromTrack(track, header.ticksPerQuarterNote, beatsPerBar, beatUnit)
        );

        let allNotes = [];
        notesPerTrack.forEach(notes => {
            allNotes = allNotes.concat(notes);
        });

        allNotes.sort((a, b) => a.startTick - b.startTick || a.noteNumber - b.noteNumber);

        if (allNotes.length === 0) {
            this._addWarning('MIDI文件中未检测到音符事件');
            return result;
        }

        result.notes = this._quantizeAndConvertNotes(
            allNotes,
            header.ticksPerQuarterNote,
            beatsPerBar,
            beatUnit,
            result.metadata.key
        );

        const totalDuration = result.notes.reduce((sum, n) => sum + n.duration, 0);
        result.barLines = this._generateBarLines(totalDuration, beatsPerBar);

        return result;
    }

    _selectNoteTracks(tracks) {
        const scoredTracks = tracks.map(track => {
            let noteOnCount = 0;
            let hasPercussion = false;
            let program = -1;

            for (const event of track.events) {
                if (event.type === 'noteOn') {
                    noteOnCount++;
                    if (event.channel === 9 || event.channel === 10) {
                        hasPercussion = true;
                    }
                }
                if (event.type === 'programChange' && program === -1) {
                    program = event.program;
                }
            }

            return {
                track,
                noteOnCount,
                hasPercussion,
                program,
                score: noteOnCount * (hasPercussion ? 0.1 : 1)
            };
        }).filter(t => t.noteOnCount > 0);

        scoredTracks.sort((a, b) => b.score - a.score);

        if (scoredTracks.length === 0) {
            return [];
        }

        const best = scoredTracks[0];
        const selected = [best.track];

        for (let i = 1; i < scoredTracks.length; i++) {
            const t = scoredTracks[i];
            if (t.score > best.score * 0.3 && !t.hasPercussion) {
                selected.push(t.track);
                if (selected.length >= 2) break;
            }
        }

        if (selected.length > 1) {
            this._addWarning(`检测到多声部音乐，将合并 ${selected.length} 个轨道（可能会重叠）`);
        }

        if (best.hasPercussion && selected.length === 1) {
            this._addWarning('导入的是打击乐轨道，音高可能不准确');
        }

        return selected;
    }

    _extractNotesFromTrack(track, ticksPerQuarterNote, beatsPerBar, beatUnit) {
        const activeNotes = new Map();
        const notes = [];

        for (const event of track.events) {
            if (event.type === 'noteOn') {
                if (event.noteNumber < 0 || event.noteNumber > 127) {
                    continue;
                }
                const key = `${event.channel}_${event.noteNumber}`;
                if (activeNotes.has(key)) {
                    const prev = activeNotes.get(key);
                    if (event.tick > prev.startTick) {
                        prev.endTick = event.tick;
                        notes.push(prev);
                    }
                }
                activeNotes.set(key, {
                    startTick: event.tick,
                    noteNumber: event.noteNumber,
                    velocity: event.velocity,
                    channel: event.channel,
                    endTick: null
                });
            } else if (event.type === 'noteOff') {
                const key = `${event.channel}_${event.noteNumber}`;
                if (activeNotes.has(key)) {
                    const note = activeNotes.get(key);
                    note.endTick = event.tick;
                    if (note.endTick > note.startTick) {
                        notes.push(note);
                    }
                    activeNotes.delete(key);
                }
            }
        }

        for (const note of activeNotes.values()) {
            const estimatedEnd = note.startTick + ticksPerQuarterNote;
            this._addWarning(`音符 ${this._midiNoteName(note.noteNumber)} 未正常结束，使用估计时值`);
            note.endTick = estimatedEnd;
            notes.push(note);
        }

        return notes;
    }

    _quantizeAndConvertNotes(notes, ticksPerQuarterNote, beatsPerBar, beatUnit, key) {
        const beatUnitRatio = 4 / beatUnit;

        const tickEpsilon = ticksPerQuarterNote * this.quantization;
        const standardBeats = [0.0625, 0.09375, 0.125, 0.1875, 0.25, 0.375, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

        const converted = [];
        const minDuration = 0.0625;

        for (const note of notes) {
            let durationBeats = ((note.endTick - note.startTick) / ticksPerQuarterNote) * beatUnitRatio;

            if (durationBeats < minDuration) {
                continue;
            }

            let bestMatch = standardBeats[0];
            let bestDiff = Infinity;
            for (const std of standardBeats) {
                const diff = Math.abs(durationBeats - std);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestMatch = std;
                }
            }

            if (bestDiff / bestMatch > 0.3) {
                const rounded = Math.round(durationBeats * 16) / 16;
                if (rounded >= minDuration) {
                    bestMatch = rounded;
                }
            }

            durationBeats = bestMatch;

            const pitchInfo = this._midiNoteToPitch(note.noteNumber, key);
            if (!pitchInfo) {
                continue;
            }

            const resolved = NoteUtils.resolveDurationToStandard(durationBeats);
            const baseDuration = resolved.matched ? resolved.baseDuration : durationBeats;
            const dotted = resolved.matched ? resolved.dotted : false;

            const convertedNote = {
                id: NoteUtils.generateNoteId(),
                pitch: pitchInfo.pitch,
                octave: pitchInfo.octave,
                duration: NoteUtils.getActualDuration(baseDuration, dotted),
                baseDuration: baseDuration,
                dotted: dotted,
                tie: false
            };

            if (!NoteUtils.isValidPitch(convertedNote.pitch)) {
                convertedNote.pitch = convertedNote.pitch > 7 ? 7 : 1;
                this._addWarning(`音符 ${this._midiNoteName(note.noteNumber)} 超出简谱范围，已调整到最近音`);
            }
            if (!NoteUtils.isValidOctave(convertedNote.octave)) {
                convertedNote.octave = Math.max(-2, Math.min(2, convertedNote.octave));
                this._addWarning(`音符 ${this._midiNoteName(note.noteNumber)} 八度超出范围，已调整`);
            }

            converted.push(convertedNote);
        }

        return converted;
    }

    _midiNoteToPitch(midiNote, key) {
        const keyOffsets = NoteUtils.KEY_SEMITONE_OFFSET;
        const keyOffset = keyOffsets[key] || 0;

        const C4_MIDI = 60;
        const relativeMidi = midiNote - C4_MIDI - keyOffset;

        let octave = Math.floor(relativeMidi / 12);
        const semitone = ((relativeMidi % 12) + 12) % 12;

        const semitoneToPitch = {
            0: { pitch: 1, adjust: 0 },
            1: { pitch: 1, adjust: 1 },
            2: { pitch: 2, adjust: 0 },
            3: { pitch: 2, adjust: 1 },
            4: { pitch: 3, adjust: 0 },
            5: { pitch: 4, adjust: 0 },
            6: { pitch: 4, adjust: 1 },
            7: { pitch: 5, adjust: 0 },
            8: { pitch: 5, adjust: 1 },
            9: { pitch: 6, adjust: 0 },
            10: { pitch: 6, adjust: 1 },
            11: { pitch: 7, adjust: 0 }
        };

        const info = semitoneToPitch[semitone];

        if (info.adjust !== 0) {
            if (info.adjust === 1) {
                if (info.pitch < 7) {
                    return { pitch: info.pitch, octave: octave, _accidental: 'sharp' };
                } else {
                    return { pitch: 1, octave: octave + 1, _accidental: 'sharp' };
                }
            }
        }

        return { pitch: info.pitch, octave: octave };
    }

    _normalizeKey(keyName) {
        if (!keyName) return this.defaultKey;

        const mapping = {
            'C': 'C', 'D': 'D', 'E': 'E', 'F': 'F', 'G': 'G', 'A': 'A', 'B': 'B',
            'Cm': 'C', 'Dm': 'D', 'Em': 'E', 'Fm': 'F', 'Gm': 'G', 'Am': 'A', 'Bm': 'B',
            'Cb': 'B', 'Gb': 'F#', 'Db': 'C#', 'Ab': 'G', 'Eb': 'D#', 'Bb': 'A#',
            'C#': 'C#', 'F#': 'F#', 'G#': 'G', 'D#': 'D#', 'A#': 'A#', 'B#': 'C',
            'E#': 'F'
        };

        const normalized = mapping[keyName] ||
            mapping[keyName.replace('m', '')] ||
            (keyName.length > 0 ? keyName[0] : this.defaultKey);

        const validKeys = NoteUtils.getValidKeys();
        if (!validKeys.includes(normalized)) {
            this._addWarning(`不支持的调式 ${keyName}，已转换为C调`);
            return 'C';
        }

        return normalized;
    }

    _generateBarLines(totalDuration, beatsPerBar) {
        const barLines = [];
        if (beatsPerBar <= 0) beatsPerBar = 4;

        let position = beatsPerBar;
        const maxBars = 200;
        let count = 0;

        while (position < totalDuration && count < maxBars) {
            barLines.push({
                id: NoteUtils.generateBarLineId(),
                position: position,
                type: 'single'
            });
            position += beatsPerBar;
            count++;
        }

        if (totalDuration > 0) {
            barLines.push({
                id: NoteUtils.generateBarLineId(),
                position: totalDuration,
                type: 'double'
            });
        }

        return barLines;
    }

    _midiNoteName(noteNumber) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(noteNumber / 12) - 1;
        return names[noteNumber % 12] + octave;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MidiImporter;
}
