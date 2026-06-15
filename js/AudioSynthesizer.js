class AudioSynthesizer {
    constructor(options = {}) {
        this.audioContext = null;
        this.masterGain = null;
        this.key = options.key || 'G';
        this.tempo = options.tempo || 120;
        this.volume = options.volume || 0.6;
        this.waveType = options.waveType || 'sine';

        this.isInitialized = false;
        this.activeOscillators = new Map();
    }

    async init() {
        if (this.isInitialized) return;

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioCtx();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.audioContext.destination);
            this.isInitialized = true;
        } catch (e) {
            throw new Error('无法初始化音频系统: ' + e.message);
        }
    }

    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            return this.audioContext.resume();
        }
        return Promise.resolve();
    }

    setKey(key) {
        if (this.keySemitoneOffset[key] !== undefined) {
            this.key = key;
        }
    }

    setTempo(tempo) {
        this.tempo = Math.max(40, Math.min(240, tempo));
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.value = this.volume;
        }
    }

    setWaveType(type) {
        const validTypes = ['sine', 'square', 'sawtooth', 'triangle'];
        if (validTypes.includes(type)) {
            this.waveType = type;
        }
    }

    _getFrequency(pitch, octave) {
        return NoteUtils.getFrequency(pitch, octave, this.key);
    }

    getBeatDuration() {
        return NoteUtils.getBeatDuration(this.tempo);
    }

    getNoteDuration(note) {
        return NoteUtils.getNoteDurationSeconds(note, this.tempo);
    }

    playNote(note, startTime, duration) {
        if (!this.isInitialized) {
            throw new Error('音频系统未初始化');
        }

        if (note.pitch === 0) {
            return { stop: () => {} };
        }

        const freq = this._getFrequency(note.pitch, note.octave);
        if (freq <= 0) {
            return { stop: () => {} };
        }

        const actualStartTime = startTime || this.audioContext.currentTime;
        const actualDuration = duration || this.getNoteDuration(note);

        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        osc.type = this.waveType;
        osc.frequency.value = freq;

        const attackTime = 0.02;
        const decayTime = 0.05;
        const sustainLevel = 0.7;
        const releaseTime = 0.15;
        const totalTime = actualStartTime + actualDuration;

        gainNode.gain.setValueAtTime(0, actualStartTime);
        gainNode.gain.linearRampToValueAtTime(1, actualStartTime + attackTime);
        gainNode.gain.linearRampToValueAtTime(
            sustainLevel,
            actualStartTime + attackTime + decayTime
        );
        gainNode.gain.setValueAtTime(
            sustainLevel,
            Math.max(actualStartTime + attackTime + decayTime, totalTime - releaseTime)
        );
        gainNode.gain.linearRampToValueAtTime(0, totalTime);

        osc.connect(gainNode);
        gainNode.connect(this.masterGain);

        osc.start(actualStartTime);
        osc.stop(totalTime + 0.05);

        const noteId = 'osc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        this.activeOscillators.set(noteId, { osc, gainNode });

        osc.onended = () => {
            this.activeOscillators.delete(noteId);
        };

        return {
            stop: () => {
                try {
                    const now = this.audioContext.currentTime;
                    gainNode.gain.cancelScheduledValues(now);
                    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                    gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
                    osc.stop(now + 0.1);
                } catch (e) {}
            }
        };
    }

    playNotePreview(note) {
        if (!this.isInitialized) {
            this.init().then(() => this.playNotePreview(note));
            return;
        }
        this.resume();

        const previewDuration = 0.4;
        this.playNote(note, this.audioContext.currentTime, previewDuration);
    }

    playSequence(notes, options = {}) {
        if (!this.isInitialized) {
            throw new Error('音频系统未初始化');
        }
        this.resume();

        const { onNoteStart, onNoteEnd, onComplete } = options;
        let currentTime = this.audioContext.currentTime + 0.1;
        let cumulativeTime = 0;
        const timeouts = [];

        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            const noteDuration = this.getNoteDuration(note);

            const isTied = note.tie && i > 0 &&
                notes[i - 1].pitch === note.pitch &&
                notes[i - 1].octave === note.octave;

            const startOffset = isTied ? 0.001 : 0;
            this.playNote(note, currentTime + startOffset, noteDuration - startOffset);

            const noteStartTime = cumulativeTime * 1000;
            const noteEndTime = (cumulativeTime + noteDuration) * 1000;
            const noteId = note.id;

            if (onNoteStart) {
                timeouts.push(setTimeout(() => onNoteStart(noteId, i), noteStartTime));
            }

            if (onNoteEnd) {
                timeouts.push(setTimeout(() => onNoteEnd(noteId, i), noteEndTime));
            }

            currentTime += noteDuration;
            cumulativeTime += noteDuration;
        }

        const totalTime = cumulativeTime * 1000;
        if (onComplete) {
            timeouts.push(setTimeout(() => onComplete(), totalTime + 200));
        }

        return {
            stop: () => {
                timeouts.forEach(t => clearTimeout(t));
                this.stopAll();
            },
            duration: cumulativeTime
        };
    }

    scheduleNote(note, scheduleTime) {
        return this.playNote(note, scheduleTime);
    }

    stopAll() {
        this.activeOscillators.forEach(({ osc, gainNode }, id) => {
            try {
                const now = this.audioContext.currentTime;
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
                osc.stop(now + 0.1);
            } catch (e) {}
        });
        this.activeOscillators.clear();
    }

    getCurrentTime() {
        if (!this.audioContext) return 0;
        return this.audioContext.currentTime;
    }

    destroy() {
        this.stopAll();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.isInitialized = false;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioSynthesizer;
}
