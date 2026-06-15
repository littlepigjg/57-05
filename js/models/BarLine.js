class BarLine {
    constructor(options = {}) {
        this.id = options.id || BarLine.generateId();
        this.position = options.position || 0;
        this.type = options.type || 'single';
    }

    setPosition(position) {
        this.position = Math.max(0, position);
    }

    setType(type) {
        if (BarLine.VALID_TYPES.includes(type)) {
            this.type = type;
        }
    }

    isDouble() {
        return this.type === 'double';
    }

    isRepeatStart() {
        return this.type === 'repeat-start';
    }

    isRepeatEnd() {
        return this.type === 'repeat-end';
    }

    clone() {
        return new BarLine({
            id: this.id,
            position: this.position,
            type: this.type
        });
    }

    equals(other) {
        if (!other) return false;
        return Math.abs(this.position - other.position) < 0.001 &&
               this.type === other.type;
    }

    toJSON() {
        return {
            id: this.id,
            position: this.position,
            type: this.type
        };
    }

    static fromJSON(json) {
        return new BarLine({
            id: json.id,
            position: json.position,
            type: json.type
        });
    }

    static create(position, type = 'single') {
        return new BarLine({ position, type });
    }

    static generateId() {
        return NoteUtils.generateBarLineId();
    }
}

BarLine.VALID_TYPES = ['single', 'double', 'repeat-start', 'repeat-end'];
BarLine.DEFAULT_TYPE = 'single';

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BarLine;
}
