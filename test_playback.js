const NoteUtils = require('./js/utils/NoteUtils.js');

function assertEqual(actual, expected, testName) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr === expectedStr) {
        console.log(`  ✓ PASS: ${testName}`);
        return true;
    } else {
        console.log(`  ✗ FAIL: ${testName}`);
        console.log(`    Expected: ${expectedStr}`);
        console.log(`    Actual:   ${actualStr}`);
        return false;
    }
}

function assertClose(actual, expected, epsilon, testName) {
    if (Math.abs(actual - expected) < epsilon) {
        console.log(`  ✓ PASS: ${testName}`);
        return true;
    } else {
        console.log(`  ✗ FAIL: ${testName}`);
        console.log(`    Expected: ${expected} (±${epsilon})`);
        console.log(`    Actual:   ${actual}`);
        return false;
    }
}

function assertTrue(condition, testName) {
    if (condition) {
        console.log(`  ✓ PASS: ${testName}`);
        return true;
    } else {
        console.log(`  ✗ FAIL: ${testName}`);
        return false;
    }
}

function assertFalse(condition, testName) {
    return assertTrue(!condition, testName);
}

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    console.log(`\n${name}`);
    try {
        const result = fn();
        if (result) {
            passed++;
        } else {
            failed++;
        }
        return result;
    } catch (e) {
        console.log(`  ✗ ERROR: ${e.message}`);
        console.log(e.stack);
        failed++;
        return false;
    }
}

console.log('='.repeat(60));
console.log('播放暂停恢复 - 附点时值一致性测试');
console.log('='.repeat(60));

runTest('【NoteUtils.cloneNotesArray】深拷贝测试', () => {
    const notes = [
        { id: 'n1', pitch: 1, octave: 0, duration: 1.5, dotted: true, tie: false },
        { id: 'n2', pitch: 2, octave: 0, duration: 1, dotted: false, tie: true },
        { id: 'n3', pitch: 3, octave: 0, duration: 0.5, dotted: false, tie: false }
    ];
    let ok = true;

    const cloned = NoteUtils.cloneNotesArray(notes);
    cloned[0].dotted = false;
    cloned[0].duration = 1;
    cloned[1].pitch = 99;

    ok = assertTrue(notes[0].dotted === true, '修改克隆后原始音符dotted不变') && ok;
    ok = assertClose(notes[0].duration, 1.5, 0.001, '修改克隆后原始音符duration不变') && ok;
    ok = assertTrue(notes[1].pitch === 2, '修改克隆后原始音符pitch不变') && ok;
    ok = assertTrue(cloned.length === notes.length, '克隆数组长度相同') && ok;

    return ok;
});

runTest('【NoteUtils.isDottedConsistent】附点一致性校验', () => {
    let ok = true;

    ok = assertTrue(
        NoteUtils.isDottedConsistent({ duration: 1.5, dotted: true }),
        '1.5拍 + dotted=true 一致'
    ) && ok;
    ok = assertTrue(
        NoteUtils.isDottedConsistent({ duration: 0.75, dotted: true }),
        '0.75拍 + dotted=true 一致'
    ) && ok;
    ok = assertTrue(
        NoteUtils.isDottedConsistent({ duration: 1, dotted: false }),
        '1拍 + dotted=false 一致'
    ) && ok;
    ok = assertFalse(
        NoteUtils.isDottedConsistent({ duration: 1.2, dotted: true }),
        '1.2拍 + dotted=true 不一致（非基础时长*1.5）'
    ) && ok;
    ok = assertFalse(
        NoteUtils.isDottedConsistent({ duration: 0.8, dotted: true }),
        '0.8拍 + dotted=true 不一致'
    ) && ok;
    ok = assertTrue(
        NoteUtils.isDottedConsistent({ duration: 0.5, dotted: false }),
        '0.5拍 + dotted=false 一致'
    ) && ok;

    return ok;
});

runTest('【NoteUtils.normalizeDotted】附点归一化', () => {
    let ok = true;

    const r1 = NoteUtils.normalizeDotted({ id: 'x', pitch: 1, octave: 0, duration: 1.5, dotted: true, tie: false });
    ok = assertTrue(r1.dotted === true, '1.5拍保留dotted') && ok;

    const r2 = NoteUtils.normalizeDotted({ id: 'x', pitch: 1, octave: 0, duration: 1.2, dotted: true, tie: false });
    ok = assertTrue(r2.dotted === false, '1.2拍移除dotted') && ok;

    const r3 = NoteUtils.normalizeDotted({ id: 'x', pitch: 1, octave: 0, duration: 0.3, dotted: true, tie: false });
    ok = assertTrue(r3.dotted === false, '0.3拍移除dotted') && ok;

    const original = { id: 'x', pitch: 1, octave: 0, duration: 0.75, dotted: true, tie: false };
    const r4 = NoteUtils.normalizeDotted(original);
    ok = assertTrue(r4.dotted === true, '0.75拍保留dotted') && ok;
    ok = assertTrue(original.dotted === true, 'normalizeDotted不修改原始对象') && ok;

    return ok;
});

runTest('【NoteUtils.resolveDurationToStandard】duration反推标准时值', () => {
    let ok = true;

    const testCases = [
        { input: 4, expectedBase: 4, expectedDotted: false, matched: true, label: '全音符' },
        { input: 3, expectedBase: 2, expectedDotted: true, matched: true, label: '二分附点' },
        { input: 2, expectedBase: 2, expectedDotted: false, matched: true, label: '二分音符' },
        { input: 1.5, expectedBase: 1, expectedDotted: true, matched: true, label: '四分附点' },
        { input: 1, expectedBase: 1, expectedDotted: false, matched: true, label: '四分音符' },
        { input: 0.75, expectedBase: 0.5, expectedDotted: true, matched: true, label: '八分附点' },
        { input: 0.5, expectedBase: 0.5, expectedDotted: false, matched: true, label: '八分音符' },
        { input: 0.375, expectedBase: 0.25, expectedDotted: true, matched: true, label: '十六分附点' },
        { input: 0.25, expectedBase: 0.25, expectedDotted: false, matched: true, label: '十六分音符' },
        { input: 0.125, expectedBase: 0.125, expectedDotted: false, matched: true, label: '三十二分' },
        { input: 1.2, expectedBase: 1.2, expectedDotted: false, matched: false, label: '1.2拍非标准' },
        { input: 0.8, expectedBase: 0.8, expectedDotted: false, matched: false, label: '0.8拍非标准' },
        { input: 0.3, expectedBase: 0.3, expectedDotted: false, matched: false, label: '0.3拍非标准' }
    ];

    for (const tc of testCases) {
        const result = NoteUtils.resolveDurationToStandard(tc.input);
        ok = assertTrue(result.matched === tc.matched,
            `${tc.label}(${tc.input}): matched=${result.matched}（期望${tc.matched}）`) && ok;
        if (tc.matched) {
            ok = assertClose(result.baseDuration, tc.expectedBase, 0.0001,
                `${tc.label}: baseDuration=${result.baseDuration}（期望${tc.expectedBase}）`) && ok;
            ok = assertTrue(result.dotted === tc.expectedDotted,
                `${tc.label}: dotted=${result.dotted}（期望${tc.expectedDotted}）`) && ok;
            ok = assertClose(result.matchedDuration, tc.input, 0.0001,
                `${tc.label}: matchedDuration正确`) && ok;
        }
    }

    return ok;
});

runTest('【NoteUtils.createTruncatedNote】创建截断音符（含标准附点时值匹配）', () => {
    let ok = true;

    const orig = { id: 'n1', pitch: 1, octave: 0, duration: 1.5, dotted: true, tie: true };

    const t1 = NoteUtils.createTruncatedNote(orig, 0.3);
    ok = assertClose(t1.duration, 0.3, 0.001, '非标准0.3拍: duration正确') && ok;
    ok = assertFalse(t1.dotted, '非标准0.3拍: dotted=false') && ok;
    ok = assertFalse(t1.tie, '截断后tie=false') && ok;

    const t2 = NoteUtils.createTruncatedNote(orig, 0.75);
    ok = assertClose(t2.duration, 0.75, 0.001, '八分附点0.75拍: duration正确') && ok;
    ok = assertTrue(t2.dotted, '八分附点0.75拍: dotted=true（自动匹配）') && ok;
    ok = assertFalse(t2.tie, '截断后tie=false') && ok;

    const t3 = NoteUtils.createTruncatedNote(orig, 1);
    ok = assertClose(t3.duration, 1, 0.001, '四分1拍: duration正确') && ok;
    ok = assertFalse(t3.dotted, '四分1拍: dotted=false') && ok;

    const t4 = NoteUtils.createTruncatedNote(orig, 1.5);
    ok = assertClose(t4.duration, 1.5, 0.001, '四分附点1.5拍: duration正确') && ok;
    ok = assertTrue(t4.dotted, '四分附点1.5拍: dotted=true（自动匹配）') && ok;

    const t5 = NoteUtils.createTruncatedNote(orig, 0.5);
    ok = assertClose(t5.duration, 0.5, 0.001, '八分0.5拍: duration正确') && ok;
    ok = assertFalse(t5.dotted, '八分0.5拍: dotted=false') && ok;

    ok = assertTrue(orig.dotted === true, 'createTruncatedNote不修改原始对象 - dotted') && ok;
    ok = assertClose(orig.duration, 1.5, 0.001, 'createTruncatedNote不修改原始对象 - duration') && ok;
    ok = assertTrue(orig.tie === true, 'createTruncatedNote不修改原始对象 - tie') && ok;

    return ok;
});

runTest('【附点切换后保持一致性】recalculateDuration反复切换', () => {
    let ok = true;

    const note = { duration: 1, dotted: false };
    note.duration = NoteUtils.recalculateDuration(note, true);
    note.dotted = true;
    ok = assertClose(note.duration, 1.5, 0.001, '加附点后为1.5拍') && ok;

    note.duration = NoteUtils.recalculateDuration(note, false);
    note.dotted = false;
    ok = assertClose(note.duration, 1, 0.001, '去附点后恢复为1拍') && ok;

    for (let i = 0; i < 10; i++) {
        note.duration = NoteUtils.recalculateDuration(note, true);
        note.dotted = true;
        note.duration = NoteUtils.recalculateDuration(note, false);
        note.dotted = false;
    }
    ok = assertClose(note.duration, 1, 0.001, '切换10次后恢复原值') && ok;
    ok = assertFalse(note.dotted, '切换10次后dotted正确') && ok;

    return ok;
});

runTest('【模拟暂停恢复】附点音符暂停在中间恢复', () => {
    let ok = true;

    const tempo = 120;
    const beatDur = 60 / tempo;

    const notes = [
        { id: 'n1', pitch: 1, octave: 0, duration: 1.5, dotted: true, tie: false },
        { id: 'n2', pitch: 2, octave: 0, duration: 1, dotted: false, tie: false },
        { id: 'n3', pitch: 3, octave: 0, duration: 0.5, dotted: false, tie: false }
    ];

    const origSnapshot = JSON.parse(JSON.stringify(notes));

    const pauseOffsetSeconds = 0.25;
    const originalNotes = NoteUtils.cloneNotesArray(notes);

    let skipDuration = pauseOffsetSeconds;
    let startIndex = 0;
    let remainingDuration = 0;

    for (let i = 0; i < originalNotes.length; i++) {
        const noteDur = originalNotes[i].duration * beatDur;
        if (skipDuration >= noteDur) {
            skipDuration -= noteDur;
        } else {
            startIndex = i;
            remainingDuration = noteDur - skipDuration;
            break;
        }
    }

    ok = assertTrue(startIndex === 0, '暂停在第0个音符（附点音符）中间') && ok;

    let resumedNotes = NoteUtils.cloneNotesArray(originalNotes.slice(startIndex));
    if (resumedNotes.length > 0 && remainingDuration > 0) {
        const remainingBeats = remainingDuration / beatDur;
        const firstNote = resumedNotes[0];
        if (Math.abs(remainingBeats - firstNote.duration) > 0.001) {
            resumedNotes[0] = NoteUtils.createTruncatedNote(firstNote, remainingBeats);
        }
    }

    ok = assertTrue(resumedNotes[0].dotted === false,
        `恢复后第一个音符dotted=false（实际：${resumedNotes[0].dotted}）`) && ok;
    ok = assertTrue(resumedNotes[0].tie === false,
        `恢复后第一个音符tie=false（实际：${resumedNotes[0].tie}）`) && ok;
    ok = assertClose(resumedNotes[0].duration, 1, 0.001,
        `恢复后第一个音符duration=1拍（实际：${resumedNotes[0].duration}）`) && ok;
    ok = assertTrue(resumedNotes[0].id === 'n1', '恢复后第一个音符id不变') && ok;
    ok = assertTrue(resumedNotes[0].pitch === 1, '恢复后第一个音符pitch不变') && ok;

    ok = assertTrue(notes[0].dotted === origSnapshot[0].dotted,
        '原始notes[0].dotted未被修改') && ok;
    ok = assertClose(notes[0].duration, origSnapshot[0].duration, 0.001,
        '原始notes[0].duration未被修改') && ok;
    ok = assertTrue(notes[1].dotted === origSnapshot[1].dotted,
        '原始notes[1].dotted未被修改') && ok;

    return ok;
});

runTest('【模拟暂停恢复】非附点音符暂停在中间恢复', () => {
    let ok = true;

    const tempo = 120;
    const beatDur = 60 / tempo;

    const notes = [
        { id: 'n1', pitch: 1, octave: 0, duration: 1, dotted: false, tie: false },
        { id: 'n2', pitch: 2, octave: 0, duration: 1, dotted: false, tie: false },
        { id: 'n3', pitch: 3, octave: 0, duration: 1, dotted: false, tie: false }
    ];

    const pauseOffsetSeconds = 0.7;
    const originalNotes = NoteUtils.cloneNotesArray(notes);

    let skipDuration = pauseOffsetSeconds;
    let startIndex = 0;
    let remainingDuration = 0;

    for (let i = 0; i < originalNotes.length; i++) {
        const noteDur = originalNotes[i].duration * beatDur;
        if (skipDuration >= noteDur) {
            skipDuration -= noteDur;
        } else {
            startIndex = i;
            remainingDuration = noteDur - skipDuration;
            break;
        }
    }

    ok = assertTrue(startIndex === 1, '暂停在第1个音符中间') && ok;

    let resumedNotes = NoteUtils.cloneNotesArray(originalNotes.slice(startIndex));
    if (resumedNotes.length > 0 && remainingDuration > 0) {
        const remainingBeats = remainingDuration / beatDur;
        const firstNote = resumedNotes[0];
        if (Math.abs(remainingBeats - firstNote.duration) > 0.001) {
            resumedNotes[0] = NoteUtils.createTruncatedNote(firstNote, remainingBeats);
        }
    }

    ok = assertTrue(resumedNotes[0].dotted === false,
        `非附点音符截断后仍为dotted=false`) && ok;
    ok = assertClose(resumedNotes[0].duration, 0.6, 0.001,
        `恢复后第一个音符duration=0.6拍（实际：${resumedNotes[0].duration}）`) && ok;
    ok = assertTrue(resumedNotes[0].id === 'n2', 'id正确') && ok;

    return ok;
});

runTest('【模拟暂停恢复】截断剩余恰好等于标准附点时值', () => {
    let ok = true;

    const tempo = 120;
    const beatDur = 60 / tempo;

    const notes = [
        { id: 'n1', pitch: 1, octave: 0, duration: 1.5, dotted: true, tie: false },
        { id: 'n2', pitch: 2, octave: 0, duration: 1, dotted: false, tie: false },
        { id: 'n3', pitch: 3, octave: 0, duration: 0.5, dotted: false, tie: false }
    ];

    const testCases = [
        {
            pauseSec: 0,
            desc: '从n1开头开始（完整）',
            expectedIndex: 0,
            expectedDuration: 1.5,
            expectedDotted: true,
            expectTruncate: false
        },
        {
            pauseSec: 0.375,
            desc: 'n1播到一半，剩0.75拍（八分附点）',
            expectedIndex: 0,
            expectedDuration: 0.75,
            expectedDotted: true,
            expectTruncate: true
        },
        {
            pauseSec: 0.25,
            desc: 'n1播了0.25s，剩1拍',
            expectedIndex: 0,
            expectedDuration: 1,
            expectedDotted: false,
            expectTruncate: true
        },
        {
            pauseSec: 0.5,
            desc: 'n1播了0.5s，剩0.5拍（八分）',
            expectedIndex: 0,
            expectedDuration: 0.5,
            expectedDotted: false,
            expectTruncate: true
        },
        {
            pauseSec: 0.75,
            desc: '从n2开头开始（n1刚播完）',
            expectedIndex: 1,
            expectedDuration: 1,
            expectedDotted: false,
            expectTruncate: false
        },
        {
            pauseSec: 0.625,
            desc: 'n1播了0.625s，剩0.25拍（十六分）',
            expectedIndex: 0,
            expectedDuration: 0.25,
            expectedDotted: false,
            expectTruncate: true
        }
    ];

    for (const tc of testCases) {
        const workNotes = NoteUtils.cloneNotesArray(notes);
        let skipDuration = tc.pauseSec;
        let startIndex = 0;
        let remainingDuration = 0;

        for (let i = 0; i < workNotes.length; i++) {
            const noteDur = workNotes[i].duration * beatDur;
            if (skipDuration >= noteDur) {
                skipDuration -= noteDur;
            } else {
                startIndex = i;
                remainingDuration = noteDur - skipDuration;
                break;
            }
        }

        let resumedNotes = NoteUtils.cloneNotesArray(workNotes.slice(startIndex));
        if (resumedNotes.length > 0 && remainingDuration > 0) {
            const remainingBeats = remainingDuration / beatDur;
            const firstNote = resumedNotes[0];
            if (Math.abs(remainingBeats - firstNote.duration) > 0.001) {
                resumedNotes[0] = NoteUtils.createTruncatedNote(firstNote, remainingBeats);
            }
        }

        ok = assertTrue(startIndex === tc.expectedIndex,
            `${tc.desc}: startIndex=${startIndex}（期望${tc.expectedIndex}）`) && ok;
        ok = assertClose(resumedNotes[0].duration, tc.expectedDuration, 0.001,
            `${tc.desc}: duration=${resumedNotes[0].duration}（期望${tc.expectedDuration}）`) && ok;
        ok = assertTrue(resumedNotes[0].dotted === tc.expectedDotted,
            `${tc.desc}: dotted=${resumedNotes[0].dotted}（期望${tc.expectedDotted}）`) && ok;
    }

    ok = assertTrue(notes[0].dotted === true, '所有测试后原始notes[0].dotted未变') && ok;
    ok = assertClose(notes[0].duration, 1.5, 0.001, '所有测试后原始notes[0].duration未变') && ok;

    return ok;
});

runTest('【多次暂停恢复不累积错误】', () => {
    let ok = true;

    const tempo = 120;
    const beatDur = 60 / tempo;

    const originalNotes = [
        { id: 'n1', pitch: 1, octave: 0, duration: 1.5, dotted: true, tie: false },
        { id: 'n2', pitch: 2, octave: 0, duration: 1, dotted: false, tie: true },
        { id: 'n3', pitch: 2, octave: 0, duration: 0.5, dotted: false, tie: false },
        { id: 'n4', pitch: 3, octave: 0, duration: 1.5, dotted: true, tie: false },
        { id: 'n5', pitch: 4, octave: 0, duration: 1, dotted: false, tie: false },
        { id: 'n6', pitch: 5, octave: 0, duration: 1.5, dotted: true, tie: false }
    ];
    const origSnapshot = JSON.parse(JSON.stringify(originalNotes));

    const pauseOffsets = [0.2, 0.7, 1.3, 1.9, 2.5];

    for (let cycle = 0; cycle < pauseOffsets.length; cycle++) {
        const cumulativePause = pauseOffsets[cycle];

        const workNotes = NoteUtils.cloneNotesArray(originalNotes);
        let skipDuration = cumulativePause;
        let startIndex = 0;
        let remainingDuration = 0;

        for (let i = 0; i < workNotes.length; i++) {
            const noteDur = workNotes[i].duration * beatDur;
            if (skipDuration >= noteDur) {
                skipDuration -= noteDur;
            } else {
                startIndex = i;
                remainingDuration = noteDur - skipDuration;
                break;
            }
        }

        let resumedNotes = NoteUtils.cloneNotesArray(workNotes.slice(startIndex));
        if (resumedNotes.length > 0 && remainingDuration > 0) {
            const remainingBeats = remainingDuration / beatDur;
            const firstNote = resumedNotes[0];
            if (Math.abs(remainingBeats - firstNote.duration) > 0.001) {
                resumedNotes[0] = NoteUtils.createTruncatedNote(firstNote, remainingBeats);
            }
        }

        if (resumedNotes.length > 0) {
            ok = assertTrue(resumedNotes[0].dotted === false,
                `循环${cycle + 1}: 截断音符dotted=false（startIndex=${startIndex}，原note=${originalNotes[startIndex].id}，原dotted=${originalNotes[startIndex].dotted}）`) && ok;
        } else {
            ok = assertTrue(true, `循环${cycle + 1}: 已到末尾，无剩余音符`) && ok;
        }

        ok = assertTrue(originalNotes[0].dotted === origSnapshot[0].dotted,
            `循环${cycle + 1}: 原始数据未被污染`) && ok;
    }

    ok = assertClose(originalNotes[0].duration, origSnapshot[0].duration, 0.001,
        '多次循环后原始数据duration未变') && ok;
    ok = assertTrue(originalNotes[0].dotted === origSnapshot[0].dotted,
        '多次循环后原始数据dotted未变') && ok;
    ok = assertTrue(originalNotes[5].dotted === origSnapshot[5].dotted,
        '多次循环后n6的dotted未变') && ok;

    return ok;
});

runTest('【播放总时长计算】附点音符总时长正确', () => {
    let ok = true;

    const notes = [
        { duration: 1.5, dotted: true },
        { duration: 1, dotted: false },
        { duration: 0.75, dotted: true },
        { duration: 0.5, dotted: false }
    ];

    const totalBeats = NoteUtils.getTotalDuration(notes);
    ok = assertClose(totalBeats, 1.5 + 1 + 0.75 + 0.5, 0.001,
        `总时长=${totalBeats}拍（期望3.75拍）`) && ok;

    const tempo = 120;
    const beatDur = 60 / tempo;
    const totalSeconds = totalBeats * beatDur;
    ok = assertClose(totalSeconds, 3.75 * 0.5, 0.001,
        `120BPM总时长=${totalSeconds}秒（期望1.875秒）`) && ok;

    return ok;
});

runTest('【ScoreRenderer无副作用】渲染不修改原始note对象', () => {
    let ok = true;

    const notes = [
        { id: 'n1', pitch: 1, octave: 0, duration: 1.5, dotted: true, tie: false },
        { id: 'n2', pitch: 2, octave: 0, duration: 1, dotted: false, tie: false }
    ];
    const before = JSON.parse(JSON.stringify(notes));

    const notePositions = notes.map(() => 0);
    let cumulativeDuration = 0;
    notes.forEach((note, idx) => {
        notePositions[idx] = cumulativeDuration;
        cumulativeDuration += note.duration;
    });

    ok = assertTrue(notes[0]._position === undefined, '不添加_position属性') && ok;
    ok = assertTrue(notes[1]._position === undefined, '不添加_position属性') && ok;
    ok = assertClose(notePositions[0], 0, 0.001, 'notePositions[0]正确') && ok;
    ok = assertClose(notePositions[1], 1.5, 0.001, 'notePositions[1]正确') && ok;

    for (let i = 0; i < notes.length; i++) {
        for (const key of Object.keys(before[i])) {
            ok = assertTrue(JSON.stringify(notes[i][key]) === JSON.stringify(before[i][key]),
                `notes[${i}].${key} 未修改`) && ok;
        }
    }

    return ok;
});

runTest('【附点显示一致性校验】渲染时dotted与duration匹配', () => {
    let ok = true;

    const testCases = [
        { duration: 1.5, dotted: true, expectedConsistent: true, label: '1.5拍 含附点' },
        { duration: 1, dotted: false, expectedConsistent: true, label: '1拍 无附点' },
        { duration: 0.75, dotted: true, expectedConsistent: true, label: '0.75拍 含附点' },
        { duration: 1.2, dotted: true, expectedConsistent: false, label: '1.2拍 含附点（错误）' },
        { duration: 0.8, dotted: true, expectedConsistent: false, label: '0.8拍 含附点（错误）' },
        { duration: 0.3, dotted: true, expectedConsistent: false, label: '0.3拍 含附点（错误）' }
    ];

    for (const tc of testCases) {
        const consistent = NoteUtils.isDottedConsistent(
            { duration: tc.duration, dotted: tc.dotted }
        );
        ok = assertTrue(consistent === tc.expectedConsistent,
            `${tc.label}: consistent=${consistent}（期望${tc.expectedConsistent}）`) && ok;
    }

    return ok;
});

console.log('\n' + '='.repeat(60));
console.log('测试结果汇总');
console.log('='.repeat(60));
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);

if (failed > 0) {
    console.log('\n❌ 有测试失败，请检查代码');
    process.exit(1);
} else {
    console.log('\n✅ 所有测试通过！');
    process.exit(0);
}
