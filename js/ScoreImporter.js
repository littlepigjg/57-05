class ScoreImporter {
    constructor(options = {}) {
        this.midiImporter = new MidiImporter(options);
        this.musicXmlImporter = new MusicXmlImporter(options);
        this.onProgress = options.onProgress || null;
        this.currentFile = null;
    }

    async importFromFile(file) {
        this.currentFile = file;

        if (!file) {
            throw this._createError('未选择文件', 'NO_FILE');
        }

        this._reportProgress(5, '正在检查文件...');

        const fileType = this._detectFileType(file);
        if (fileType === 'unknown') {
            this._reportProgress(10, '无法确定文件类型，尝试自动检测...');
        }

        this._reportProgress(15, `开始解析 ${file.name}...`);

        let result = null;
        let lastError = null;

        const importers = this._getImportersForType(fileType, file);

        for (let i = 0; i < importers.length; i++) {
            const { name, importer, tryFn } = importers[i];
            try {
                this._reportProgress(20 + i * 10, `尝试使用 ${name} 解析器...`);
                result = await tryFn.call(importer, file);
                if (result && result.notes && result.notes.length >= 0) {
                    if (result.notes.length === 0 && i < importers.length - 1) {
                        this._reportProgress(30 + i * 10, `${name} 解析器未找到音符，尝试其他解析器...`);
                        continue;
                    }
                    this._reportProgress(70, `${name} 解析成功！`);
                    result.metadata.fileType = name;
                    result.metadata.fileName = file.name;
                    result.metadata.fileSize = file.size;
                    break;
                }
            } catch (e) {
                lastError = e;
                console.warn(`[ScoreImporter] ${name} 解析失败:`, e.message);
                if (i === importers.length - 1 && !result) {
                    this._addWarning(result, `${name} 解析失败: ${e.message}`);
                }
            }
        }

        if (!result) {
            const err = lastError || new Error('所有解析器都失败了');
            throw this._createError(
                `文件解析失败：${err.message}\n\n` +
                `支持的格式：MIDI (.mid/.midi), MusicXML (.xml/.musicxml/.mxl)\n\n` +
                `请确保文件格式正确，或尝试使用其他软件重新导出。`,
                'PARSE_FAILED',
                { fileName: file.name }
            );
        }

        this._reportProgress(80, '正在转换数据格式...');

        result = this._finalizeResult(result, file);

        this._reportProgress(100, `导入完成！共 ${result.notes.length} 个音符`);

        return result;
    }

    _getImportersForType(type, file) {
        const name = file.name.toLowerCase();

        if (type === 'midi' || name.match(/\.(mid|midi)$/)) {
            return [
                { name: 'MIDI', importer: this.midiImporter, tryFn: this.midiImporter.importFromFile },
                { name: 'MusicXML', importer: this.musicXmlImporter, tryFn: this.musicXmlImporter.importFromFile }
            ];
        }

        if (type === 'musicxml' || name.match(/\.(xml|musicxml|mxl)$/)) {
            return [
                { name: 'MusicXML', importer: this.musicXmlImporter, tryFn: this.musicXmlImporter.importFromFile },
                { name: 'MIDI', importer: this.midiImporter, tryFn: this.midiImporter.importFromFile }
            ];
        }

        return [
            { name: 'MIDI', importer: this.midiImporter, tryFn: this.midiImporter.importFromFile },
            { name: 'MusicXML', importer: this.musicXmlImporter, tryFn: this.musicXmlImporter.importFromFile }
        ];
    }

    _detectFileType(file) {
        const name = file.name.toLowerCase();

        if (name.match(/\.(mid|midi)$/)) {
            return 'midi';
        }
        if (name.match(/\.(xml|musicxml|mxl)$/)) {
            return 'musicxml';
        }

        return 'unknown';
    }

    _finalizeResult(result, file) {
        result = result || { notes: [], barLines: [], metadata: {} };
        result.notes = result.notes || [];
        result.barLines = result.barLines || [];
        result.metadata = result.metadata || {};
        result.metadata.warnings = result.metadata.warnings || [];
        result.metadata.errors = result.metadata.errors || [];
        result.metadata.stats = {
            noteCount: result.notes.filter(n => n.pitch !== 0).length,
            restCount: result.notes.filter(n => n.pitch === 0).length,
            barCount: result.barLines.length,
            totalDuration: result.notes.reduce((sum, n) => sum + n.duration, 0)
        };

        if (result.notes.length > 2000) {
            this._addWarning(result, `音符数量较多 (${result.notes.length})，可能会影响性能。建议简化乐谱。`);
        }

        if (result.metadata.stats.noteCount === 0 && result.metadata.stats.restCount === 0) {
            this._addWarning(result, '导入的乐谱中没有音符，请检查文件内容。');
        }

        result.metadata.trackCount = result.metadata.trackCount || 1;

        return result;
    }

    _reportProgress(percent, message) {
        if (this.onProgress) {
            try {
                this.onProgress({ percent, message });
            } catch (e) {
                console.warn('Progress callback error:', e);
            }
        }
    }

    _addWarning(result, msg) {
        if (result && result.metadata) {
            if (!result.metadata.warnings) {
                result.metadata.warnings = [];
            }
            result.metadata.warnings.push(msg);
        }
        console.warn('[ScoreImporter 警告]', msg);
    }

    _createError(message, code, details = {}) {
        const err = new Error(message);
        err.code = code;
        err.details = details;
        err.userFriendly = true;
        return err;
    }

    static getSupportedFormats() {
        return [
            {
                name: 'MIDI',
                extensions: ['.mid', '.midi'],
                description: '标准MIDI文件，适合从DAW、打谱软件导出'
            },
            {
                name: 'MusicXML',
                extensions: ['.xml', '.musicxml', '.mxl'],
                description: 'MusicXML开放乐谱格式，支持完整的乐谱信息（推荐）'
            }
        ];
    }

    static getAcceptAttribute() {
        const formats = ScoreImporter.getSupportedFormats();
        return formats.map(f => f.extensions.map(e => e).join(',')).join(',');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScoreImporter;
}
