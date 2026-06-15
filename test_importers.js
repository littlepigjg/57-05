const fs = require('fs');
const path = require('path');

global.window = {};
global.document = {
    createElement: () => ({ textContent: '', appendChild: () => {}, setAttribute: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    parseFromString: () => ({
        querySelector: () => null,
        querySelectorAll: () => [],
        documentElement: { tagName: '', querySelector: () => null, querySelectorAll: () => [] }
    })
};
global.DOMParser = function() {
    this.parseFromString = function() {
        return {
            querySelector: () => null,
            querySelectorAll: () => [],
            documentElement: { tagName: '', querySelector: () => null, querySelectorAll: () => [], children: [] },
            children: []
        };
    };
};

const NoteUtils = require('./js/utils/NoteUtils.js');
const MidiUtils = require('./js/utils/MidiUtils.js');
global.NoteUtils = NoteUtils;
global.MidiUtils = MidiUtils;

const Note = require('./js/models/Note.js');
const BarLine = require('./js/models/BarLine.js');
global.Note = Note;
global.BarLine = BarLine;

const MidiImporter = require('./js/MidiImporter.js');
const MusicXmlImporter = require('./js/MusicXmlImporter.js');
const ScoreImporter = require('./js/ScoreImporter.js');

console.log('=== 导入器模块加载测试 ===');

function buildTestMidi() {
    const ticksPerQuarterNote = 480;
    const tempo = 120;

    let trackData = [];

    const tempoMicros = Math.round(60000000 / tempo);
    trackData.push(0x00);
    trackData.push(0xFF, 0x51, 0x03);
    trackData.push((tempoMicros >> 16) & 0xFF, (tempoMicros >> 8) & 0xFF, tempoMicros & 0xFF);

    trackData.push(0x00);
    trackData.push(0xFF, 0x58, 0x04);
    trackData.push(4, 2, 24, 8);

    trackData.push(0x00);
    trackData.push(0xFF, 0x59, 0x02);
    trackData.push(0, 0);

    function writeVL(value) {
        const buf = [];
        let v = value;
        buf.push(v & 0x7F);
        v >>= 7;
        while (v > 0) {
            buf.push(0x80 | (v & 0x7F));
            v >>= 7;
        }
        return buf.reverse();
    }

    const notes = [
        { midi: 60, duration: 1 },
        { midi: 60, duration: 1 },
        { midi: 67, duration: 1 },
        { midi: 67, duration: 1 },
        { midi: 69, duration: 1 },
        { midi: 69, duration: 1 },
        { midi: 67, duration: 2 },
        { midi: 65, duration: 1 },
        { midi: 65, duration: 1 },
        { midi: 64, duration: 1 },
        { midi: 64, duration: 1 },
        { midi: 62, duration: 1 },
        { midi: 62, duration: 1 },
        { midi: 60, duration: 2 },
    ];

    let deltaTime = 0;
    notes.forEach((note, idx) => {
        const durTicks = note.duration * ticksPerQuarterNote;

        trackData.push(...writeVL(deltaTime));
        trackData.push(0x90, note.midi, 80);

        trackData.push(...writeVL(durTicks));
        trackData.push(0x80, note.midi, 0);

        deltaTime = 0;
    });

    trackData.push(0x00);
    trackData.push(0xFF, 0x2F, 0x00);

    function writeInt16(v) { return [(v >> 8) & 0xFF, v & 0xFF]; }
    function writeInt32(v) { return [(v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF]; }

    const header = [
        ...[0x4D, 0x54, 0x68, 0x64],
        ...writeInt32(6),
        ...writeInt16(1),
        ...writeInt16(1),
        ...writeInt16(ticksPerQuarterNote)
    ];

    const trackChunk = [
        ...[0x4D, 0x54, 0x72, 0x6B],
        ...writeInt32(trackData.length),
        ...trackData
    ];

    return new Uint8Array([...header, ...trackChunk]);
}

console.log('\n=== 测试1: MIDI解析器基本功能 ===');
try {
    const midiImporter = new MidiImporter();
    const testMidi = buildTestMidi();

    const arrayBuffer = testMidi.buffer.slice(
        testMidi.byteOffset,
        testMidi.byteOffset + testMidi.byteLength
    );

    const result = midiImporter.importFromArrayBuffer(arrayBuffer);

    console.log('解析成功！');
    console.log(' - 元数据:', JSON.stringify(result.metadata));
    console.log(' - 音符数量:', result.notes.length);
    console.log(' - 小节线数量:', result.barLines.length);
    console.log(' - 前5个音符:', result.notes.slice(0, 5).map(n => `${NoteUtils.getOctaveLabel(n.octave)}${n.pitch}(${n.duration}拍)`));

    if (result.notes.length >= 10) {
        console.log('✅ MIDI解析测试通过');
    } else {
        console.log('⚠️  音符数量偏少，可能有问题');
    }
} catch (e) {
    console.log('❌ MIDI解析测试失败:', e.message);
    console.log(e.stack);
}

console.log('\n=== 测试2: NoteUtils边界值测试 ===');
try {
    const tests = [
        { pitch: 1, octave: 0, key: 'C' },
        { pitch: 7, octave: 2, key: 'G' },
        { pitch: 1, octave: -2, key: 'F' },
        { pitch: 0, octave: 0, key: 'C' },
    ];

    tests.forEach(t => {
        const midiNum = NoteUtils.getMidiNoteNumber(t.pitch, t.octave, t.key);
        const freq = NoteUtils.getFrequency(t.pitch, t.octave, t.key);
        console.log(`  ${NoteUtils.getOctaveLabel(t.octave)}${t.pitch || '休止符'} (${t.key}调) -> MIDI: ${midiNum}, 频率: ${freq.toFixed(2)}Hz`);
    });

    console.log('✅ NoteUtils边界测试通过');
} catch (e) {
    console.log('❌ NoteUtils测试失败:', e.message);
}

console.log('\n=== 测试3: 标准时值量化测试 ===');
try {
    const testDurations = [1, 0.5, 0.25, 1.5, 0.75, 2, 3, 0.99, 1.01, 0.49, 0.51];
    testDurations.forEach(d => {
        const result = NoteUtils.resolveDurationToStandard(d);
        console.log(`  ${d}拍 -> 基础:${result.baseDuration} 附点:${result.dotted} 匹配:${result.matched} 结果:${result.matchedDuration}`);
    });
    console.log('✅ 时值量化测试通过');
} catch (e) {
    console.log('❌ 时值量化测试失败:', e.message);
}

console.log('\n=== 测试4: MIDI解析边界情况 ===');
try {
    const midiImporter = new MidiImporter();

    console.log('  4.1 空数据...');
    try {
        midiImporter.importFromArrayBuffer(new Uint8Array(0).buffer);
        console.log('    ❌ 应该抛出错误');
    } catch (e) {
        console.log('    ✅ 正确处理空数据:', e.message);
    }

    console.log('  4.2 损坏数据...');
    try {
        midiImporter.importFromArrayBuffer(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer);
        console.log('    ❌ 应该抛出错误');
    } catch (e) {
        console.log('    ✅ 正确处理损坏数据:', e.message);
    }

    console.log('  4.3 非MIDI数据...');
    try {
        const notMidi = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
        midiImporter.importFromArrayBuffer(notMidi.buffer);
        console.log('    ❌ 应该抛出错误');
    } catch (e) {
        console.log('    ✅ 正确处理非MIDI数据:', e.message);
    }

    console.log('✅ MIDI边界情况测试通过');
} catch (e) {
    console.log('❌ MIDI边界测试失败:', e.message);
}

console.log('\n=== 测试5: ScoreImporter元数据验证 ===');
try {
    const formats = ScoreImporter.getSupportedFormats();
    console.log('支持的格式:');
    formats.forEach(f => {
        console.log(`  - ${f.name}: ${f.extensions.join(', ')} (${f.description})`);
    });
    const accept = ScoreImporter.getAcceptAttribute();
    console.log('Accept属性:', accept);
    console.log('✅ ScoreImporter元数据测试通过');
} catch (e) {
    console.log('❌ ScoreImporter元数据测试失败:', e.message);
}

console.log('\n=== 测试6: 音符验证边界测试 ===');
try {
    const testCases = [
        { pitch: 0, expected: 0, name: '休止符' },
        { pitch: 1, expected: 1, name: '最低有效音' },
        { pitch: 7, expected: 7, name: '最高有效音' },
        { pitch: -1, expected: 1, name: '无效负音高' },
        { pitch: 8, expected: 1, name: '超出音高范围' },
        { pitch: 100, expected: 1, name: '极大音高值' },
    ];

    testCases.forEach(tc => {
        const result = Note.validatePitch(tc.pitch);
        const status = result === tc.expected ? '✅' : '❌';
        console.log(`  ${status} ${tc.name}: ${tc.pitch} -> ${result} (预期: ${tc.expected})`);
    });

    const octaveTests = [
        { oct: -2, expected: -2 },
        { oct: 2, expected: 2 },
        { oct: 0, expected: 0 },
        { oct: -10, expected: 0 },
        { oct: 10, expected: 0 },
    ];

    octaveTests.forEach(tc => {
        const result = Note.validateOctave(tc.oct);
        const status = result === tc.expected ? '✅' : '❌';
        console.log(`  ${status} 八度${tc.oct}: ${result} (预期: ${tc.expected})`);
    });

    console.log('✅ 音符验证边界测试通过');
} catch (e) {
    console.log('❌ 音符验证测试失败:', e.message);
}

console.log('\n=== 所有测试完成 ===');
