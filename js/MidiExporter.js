class MidiExporter {
    constructor(options = {}) {
        this.key = options.key || 'G';
        this.tempo = options.tempo || 120;
        this.timeSignature = options.timeSignature || '4/4';
        this.ticksPerQuarterNote = 480;
    }

    setKey(key) {
        this.key = key;
    }

    setTempo(tempo) {
        this.tempo = tempo;
    }

    setTimeSignature(sig) {
        this.timeSignature = sig;
    }

    _getMidiNoteNumber(pitch, octave) {
        return NoteUtils.getMidiNoteNumber(pitch, octave, this.key);
    }

    _buildHeaderChunk(numTracks) {
        return MidiUtils.buildHeaderChunk(numTracks, this.ticksPerQuarterNote);
    }

    _buildTempoTrack() {
        const [numerator, denominator] = this.timeSignature.split('/').map(n => parseInt(n));

        const tempoEvent = MidiUtils.buildTempoMetaEvent(this.tempo);
        const timeSigEvent = MidiUtils.buildTimeSignatureMetaEvent(numerator, denominator);
        const keySigEvent = MidiUtils.buildKeySignatureMetaEvent(this.key, false);
        const trackNameEvent = MidiUtils.buildTrackNameMetaEvent('Tempo Track');
        const endEvent = MidiUtils.buildEndOfTrackMetaEvent();

        const trackData = MidiUtils.combineEvents(
            tempoEvent,
            timeSigEvent,
            keySigEvent,
            trackNameEvent,
            endEvent
        );

        return MidiUtils.buildTrackChunk(trackData);
    }

    _buildNoteTrack(notes) {
        const events = [];
        let totalTicks = 0;

        events.push(...MidiUtils.buildTrackNameMetaEvent('简谱旋律'));
        events.push(...MidiUtils.buildControlChangeEvent(0, 0, 0, 0));
        events.push(...MidiUtils.buildProgramChangeEvent(0, 0, 0));

        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            const durationTicks = Math.round(note.duration * this.ticksPerQuarterNote);

            if (note.pitch === 0) {
                totalTicks += durationTicks;
                continue;
            }

            const midiNote = this._getMidiNoteNumber(note.pitch, note.octave);
            if (midiNote < 0 || midiNote > 127) continue;

            const velocity = note.tie ? 1 : 80;

            events.push(...MidiUtils.buildNoteOnEvent(midiNote, velocity, totalTicks));
            totalTicks = 0;

            events.push(...MidiUtils.buildNoteOffEvent(midiNote, 0, durationTicks));
        }

        if (totalTicks > 0) {
            events.push(...MidiUtils.buildNoteOnEvent(60, 0, totalTicks));
        }

        events.push(...MidiUtils.buildEndOfTrackMetaEvent());

        return MidiUtils.buildTrackChunk(events);
    }

    export(notes) {
        const midiNotes = notes || [];

        const headerChunk = this._buildHeaderChunk(2);
        const tempoTrack = this._buildTempoTrack();
        const noteTrack = this._buildNoteTrack(midiNotes);

        const midiData = [
            ...headerChunk,
            ...tempoTrack,
            ...noteTrack
        ];

        return new Uint8Array(midiData);
    }

    exportToBlob(notes) {
        const data = this.export(notes);
        return new Blob([data], { type: 'audio/midi' });
    }

    download(notes, filename) {
        const blob = this.exportToBlob(notes);
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename || '简谱导出_' + Date.now() + '.mid';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MidiExporter;
}
