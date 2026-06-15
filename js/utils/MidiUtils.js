const MidiUtils = (function() {
    'use strict';

    function writeVariableLength(value) {
        const buffer = [];
        let v = value;

        buffer.push(v & 0x7F);
        v >>= 7;

        while (v > 0) {
            buffer.push(0x80 | (v & 0x7F));
            v >>= 7;
        }

        return buffer.reverse();
    }

    function writeInt16(value) {
        return [
            (value >> 8) & 0xFF,
            value & 0xFF
        ];
    }

    function writeInt32(value) {
        return [
            (value >> 24) & 0xFF,
            (value >> 16) & 0xFF,
            (value >> 8) & 0xFF,
            value & 0xFF
        ];
    }

    function writeString(str) {
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
            bytes.push(str.charCodeAt(i) & 0xFF);
        }
        return bytes;
    }

    function readVariableLength(data, offset) {
        let value = 0;
        let byte;
        let count = 0;

        do {
            if (count >= 4) break;
            byte = data[offset + count];
            value = (value << 7) | (byte & 0x7F);
            count++;
        } while (byte & 0x80);

        return { value, length: count };
    }

    function readInt16(data, offset) {
        return (data[offset] << 8) | data[offset + 1];
    }

    function readInt32(data, offset) {
        return (data[offset] << 24) |
               (data[offset + 1] << 16) |
               (data[offset + 2] << 8) |
               data[offset + 3];
    }

    function ticksToSeconds(ticks, tempo, ticksPerQuarterNote) {
        const microsecondsPerQuarterNote = tempo;
        const secondsPerTick = microsecondsPerQuarterNote / (ticksPerQuarterNote * 1000000);
        return ticks * secondsPerTick;
    }

    function secondsToTicks(seconds, tempo, ticksPerQuarterNote) {
        const microsecondsPerQuarterNote = tempo;
        const ticksPerSecond = (ticksPerQuarterNote * 1000000) / microsecondsPerQuarterNote;
        return Math.round(seconds * ticksPerSecond);
    }

    function buildHeaderChunk(numTracks, ticksPerQuarterNote = 480) {
        const header = [];
        const format = numTracks > 1 ? 1 : 0;

        header.push(...writeString('MThd'));
        header.push(...writeInt32(6));
        header.push(...writeInt16(format));
        header.push(...writeInt16(numTracks));
        header.push(...writeInt16(ticksPerQuarterNote));

        return header;
    }

    function buildTrackChunk(trackData) {
        const chunk = [];
        chunk.push(...writeString('MTrk'));
        chunk.push(...writeInt32(trackData.length));
        chunk.push(...trackData);
        return chunk;
    }

    function buildTempoMetaEvent(tempo, deltaTime = 0) {
        const microsecondsPerQuarterNote = Math.round(60000000 / tempo);
        const event = [];
        event.push(...writeVariableLength(deltaTime));
        event.push(0xFF, 0x51, 0x03);
        event.push(
            (microsecondsPerQuarterNote >> 16) & 0xFF,
            (microsecondsPerQuarterNote >> 8) & 0xFF,
            microsecondsPerQuarterNote & 0xFF
        );
        return event;
    }

    function buildTimeSignatureMetaEvent(numerator, denominator, deltaTime = 0) {
        const denominatorExp = Math.log2(denominator);
        const event = [];
        event.push(...writeVariableLength(deltaTime));
        event.push(0xFF, 0x58, 0x04);
        event.push(numerator, denominatorExp, 24, 8);
        return event;
    }

    function buildKeySignatureMetaEvent(key, isMinor = false, deltaTime = 0) {
        const keyMap = {
            'C': 0, 'D': 2, 'E': 4, 'F': -1, 'G': 1, 'A': 3, 'B': 5
        };
        const sf = keyMap[key] || 0;
        const mi = isMinor ? 1 : 0;

        const event = [];
        event.push(...writeVariableLength(deltaTime));
        event.push(0xFF, 0x59, 0x02);
        event.push(sf >= 0 ? sf : 0x100 + sf, mi);
        return event;
    }

    function buildTrackNameMetaEvent(name, deltaTime = 0) {
        const event = [];
        event.push(...writeVariableLength(deltaTime));
        event.push(0xFF, 0x03);
        const nameBytes = writeString(name);
        event.push(nameBytes.length, ...nameBytes);
        return event;
    }

    function buildEndOfTrackMetaEvent(deltaTime = 0) {
        const event = [];
        event.push(...writeVariableLength(deltaTime));
        event.push(0xFF, 0x2F, 0x00);
        return event;
    }

    function buildNoteOnEvent(midiNote, velocity, deltaTime = 0, channel = 0) {
        const event = [];
        event.push(...writeVariableLength(deltaTime));
        event.push(0x90 | (channel & 0x0F));
        event.push(midiNote & 0x7F, velocity & 0x7F);
        return event;
    }

    function buildNoteOffEvent(midiNote, velocity = 0, deltaTime = 0, channel = 0) {
        const event = [];
        event.push(...writeVariableLength(deltaTime));
        event.push(0x80 | (channel & 0x0F));
        event.push(midiNote & 0x7F, velocity & 0x7F);
        return event;
    }

    function buildProgramChangeEvent(program, deltaTime = 0, channel = 0) {
        const event = [];
        event.push(...writeVariableLength(deltaTime));
        event.push(0xC0 | (channel & 0x0F));
        event.push(program & 0x7F);
        return event;
    }

    function buildControlChangeEvent(controller, value, deltaTime = 0, channel = 0) {
        const event = [];
        event.push(...writeVariableLength(deltaTime));
        event.push(0xB0 | (channel & 0x0F));
        event.push(controller & 0x7F, value & 0x7F);
        return event;
    }

    function combineEvents(...events) {
        return Array.prototype.concat.apply([], events);
    }

    function midiNoteToFrequency(midiNote) {
        const A4 = 440;
        const A4_MIDI = 69;
        return A4 * Math.pow(2, (midiNote - A4_MIDI) / 12);
    }

    function frequencyToMidiNote(frequency) {
        const A4 = 440;
        const A4_MIDI = 69;
        return Math.round(12 * Math.log2(frequency / A4) + A4_MIDI);
    }

    function getKeySharps(key) {
        const keyMap = {
            'C': 0, 'D': 2, 'E': 4, 'F': -1, 'G': 1, 'A': 3, 'B': 5
        };
        return keyMap[key] || 0;
    }

    return {
        writeVariableLength,
        writeInt16,
        writeInt32,
        writeString,
        readVariableLength,
        readInt16,
        readInt32,
        ticksToSeconds,
        secondsToTicks,
        buildHeaderChunk,
        buildTrackChunk,
        buildTempoMetaEvent,
        buildTimeSignatureMetaEvent,
        buildKeySignatureMetaEvent,
        buildTrackNameMetaEvent,
        buildEndOfTrackMetaEvent,
        buildNoteOnEvent,
        buildNoteOffEvent,
        buildProgramChangeEvent,
        buildControlChangeEvent,
        combineEvents,
        midiNoteToFrequency,
        frequencyToMidiNote,
        getKeySharps
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MidiUtils;
}
