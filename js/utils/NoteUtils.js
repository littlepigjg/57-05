const NoteUtils = (function() {
    'use strict';

    const NOTE_SEMITONE_MAP = {
        1: 0,
        2: 2,
        3: 4,
        4: 5,
        5: 7,
        6: 9,
        7: 11
    };

    const KEY_SEMITONE_OFFSET = {
        'C': 0,
        'D': 2,
        'E': 4,
        'F': 5,
        'G': 7,
        'A': 9,
        'B': 11
    };

    const NOTE_DISPLAY_MAP = ['1', '2', '3', '4', '5', '6', '7'];

    function getActualDuration(baseDuration, dotted) {
        return dotted ? baseDuration * 1.5 : baseDuration;
    }

    function getBaseDuration(actualDuration, dotted) {
        return dotted ? actualDuration / 1.5 : actualDuration;
    }

    function recalculateDuration(note, newDotted) {
        const baseDuration = getBaseDuration(note.duration, note.dotted);
        return getActualDuration(baseDuration, newDotted);
    }

    function getMidiNoteNumber(pitch, octave, key) {
        if (pitch === 0) return -1;

        const baseSemitone = NOTE_SEMITONE_MAP[pitch] || 0;
        const keyOffset = KEY_SEMITONE_OFFSET[key] || 0;
        const octaveOffset = (octave || 0) * 12;

        const C4_MIDI = 60;
        return C4_MIDI + keyOffset + baseSemitone + octaveOffset;
    }

    function getFrequency(pitch, octave, key) {
        const midiNote = getMidiNoteNumber(pitch, octave, key);
        if (midiNote < 0) return 0;

        const A4 = 440;
        const A4_MIDI = 69;
        const semitonesFromA4 = midiNote - A4_MIDI;

        return A4 * Math.pow(2, semitonesFromA4 / 12);
    }

    function getNoteDisplay(pitch) {
        if (pitch === 0) return '—';
        return NOTE_DISPLAY_MAP[pitch - 1] || '1';
    }

    function getDurationFlags(duration) {
        if (duration >= 1) return 0;
        if (duration >= 0.5) return 1;
        if (duration >= 0.25) return 2;
        return 3;
    }

    function getDurationLabel(duration) {
        if (duration >= 4) return '全音符';
        if (duration >= 2) return '二分';
        if (duration >= 1) return '';
        if (duration >= 0.5) return '八分';
        if (duration >= 0.25) return '十六分';
        return '短';
    }

    function getOctaveLabel(octave) {
        switch (octave) {
            case -1: return '低';
            case 1: return '高';
            default: return '中';
        }
    }

    function getBeatDuration(tempo) {
        return 60 / tempo;
    }

    function getNoteDurationSeconds(note, tempo) {
        return note.duration * getBeatDuration(tempo);
    }

    function isValidPitch(pitch) {
        return pitch === 0 || (pitch >= 1 && pitch <= 7);
    }

    function isValidOctave(octave) {
        return octave >= -2 && octave <= 2;
    }

    function isValidDuration(duration) {
        return duration > 0 && duration <= 8;
    }

    function generateNoteId() {
        return 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }

    function generateBarLineId() {
        return 'bl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }

    function cloneNote(note) {
        return {
            id: note.id,
            pitch: note.pitch,
            octave: note.octave,
            duration: note.duration,
            dotted: note.dotted,
            tie: note.tie
        };
    }

    function cloneNotesArray(notes) {
        return notes.map(n => cloneNote(n));
    }

    function isDottedConsistent(note) {
        if (!note.dotted) return true;
        const baseDuration = note.duration / 1.5;
        const standardBaseDurations = [4, 2, 1, 0.5, 0.25, 0.125, 0.0625];
        for (const std of standardBaseDurations) {
            if (Math.abs(baseDuration - std) < 0.0001) {
                return true;
            }
        }
        return false;
    }

    function normalizeDotted(note) {
        const normalized = cloneNote(note);
        if (normalized.dotted && !isDottedConsistent(normalized)) {
            normalized.dotted = false;
        }
        return normalized;
    }

    function resolveDurationToStandard(duration) {
        const standardDurations = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.1875, 0.125, 0.09375, 0.0625];
        const epsilon = 0.0001;

        let bestMatch = null;
        let bestDiff = Infinity;

        for (const std of standardDurations) {
            const diff = Math.abs(duration - std);
            if (diff < epsilon && diff < bestDiff) {
                bestMatch = std;
                bestDiff = diff;
            }
        }

        if (bestMatch !== null) {
            const dotted = [3, 1.5, 0.75, 0.375, 0.1875, 0.09375].includes(bestMatch);
            const base = dotted ? bestMatch / 1.5 : bestMatch;
            return { baseDuration: base, dotted: dotted, matched: true, matchedDuration: bestMatch };
        }

        return { baseDuration: duration, dotted: false, matched: false, matchedDuration: duration };
    }

    function createTruncatedNote(note, remainingBeats) {
        const truncated = cloneNote(note);
        truncated.duration = remainingBeats;
        truncated.tie = false;

        const resolved = resolveDurationToStandard(remainingBeats);
        if (resolved.matched) {
            truncated.dotted = resolved.dotted;
            truncated.duration = resolved.matchedDuration;
        } else {
            truncated.dotted = false;
        }

        return truncated;
    }

    function notesEqual(a, b) {
        return a && b &&
            a.pitch === b.pitch &&
            a.octave === b.octave &&
            Math.abs(a.duration - b.duration) < 0.001 &&
            a.dotted === b.dotted &&
            a.tie === b.tie;
    }

    function isTieContinuation(prevNote, currNote) {
        return prevNote && currNote &&
            prevNote.tie &&
            prevNote.pitch === currNote.pitch &&
            prevNote.octave === currNote.octave;
    }

    function getTotalDuration(notes) {
        return notes.reduce((sum, n) => sum + n.duration, 0);
    }

    function getValidKeys() {
        return Object.keys(KEY_SEMITONE_OFFSET);
    }

    return {
        NOTE_SEMITONE_MAP,
        KEY_SEMITONE_OFFSET,
        getActualDuration,
        getBaseDuration,
        recalculateDuration,
        getMidiNoteNumber,
        getFrequency,
        getNoteDisplay,
        getDurationFlags,
        getDurationLabel,
        getOctaveLabel,
        getBeatDuration,
        getNoteDurationSeconds,
        isValidPitch,
        isValidOctave,
        isValidDuration,
        generateNoteId,
        generateBarLineId,
        cloneNote,
        cloneNotesArray,
        isDottedConsistent,
        normalizeDotted,
        resolveDurationToStandard,
        createTruncatedNote,
        notesEqual,
        isTieContinuation,
        getTotalDuration,
        getValidKeys
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NoteUtils;
}
