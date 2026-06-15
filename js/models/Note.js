class Note {
    constructor(options = {}) {
        this.id = options.id || Note.generateId();
        this.pitch = Note.validatePitch(options.pitch) || 1;
        this.octave = Note.validateOctave(options.octave) || 0;
        this.baseDuration = Note.validateDuration(options.baseDuration || options.duration || 1);
        this.dotted = options.dotted || false;
        this.tie = options.tie || false;

        if (options.duration !== undefined && options.baseDuration === undefined) {
            this.baseDuration = options.duration;
            if (options.dotted) {
                this.baseDuration = options.duration / 1.5;
            }
        }
    }

    get duration() {
        return NoteUtils.getActualDuration(this.baseDuration, this.dotted);
    }

    set duration(value) {
        this.baseDuration = NoteUtils.getBaseDuration(value, this.dotted);
    }

    setDotted(dotted) {
        const oldDuration = this.duration;
        this.dotted = dotted;
        return this.duration !== oldDuration;
    }

    setBaseDuration(baseDuration) {
        const oldDuration = this.duration;
        this.baseDuration = Note.validateDuration(baseDuration);
        return this.duration !== oldDuration;
    }

    getFrequency(key) {
        return NoteUtils.getFrequency(this.pitch, this.octave, key);
    }

    getMidiNumber(key) {
        return NoteUtils.getMidiNoteNumber(this.pitch, this.octave, key);
    }

    getDisplay() {
        return NoteUtils.getNoteDisplay(this.pitch);
    }

    getDurationFlags() {
        return NoteUtils.getDurationFlags(this.duration);
    }

    getDurationLabel() {
        return NoteUtils.getDurationLabel(this.duration);
    }

    getOctaveLabel() {
        return NoteUtils.getOctaveLabel(this.octave);
    }

    getDurationSeconds(tempo) {
        return NoteUtils.getNoteDurationSeconds(this, tempo);
    }

    isRest() {
        return this.pitch === 0;
    }

    clone() {
        return new Note({
            id: this.id,
            pitch: this.pitch,
            octave: this.octave,
            baseDuration: this.baseDuration,
            dotted: this.dotted,
            tie: this.tie
        });
    }

    equals(other) {
        if (!other) return false;
        return this.pitch === other.pitch &&
               this.octave === other.octave &&
               Math.abs(this.baseDuration - other.baseDuration) < 0.001 &&
               this.dotted === other.dotted &&
               this.tie === other.tie;
    }

    toJSON() {
        return {
            id: this.id,
            pitch: this.pitch,
            octave: this.octave,
            duration: this.duration,
            baseDuration: this.baseDuration,
            dotted: this.dotted,
            tie: this.tie
        };
    }

    static fromJSON(json) {
        return new Note({
            id: json.id,
            pitch: json.pitch,
            octave: json.octave,
            baseDuration: json.baseDuration || json.duration,
            dotted: json.dotted,
            tie: json.tie
        });
    }

    static create(options = {}) {
        return new Note(options);
    }

    static createRest(duration = 1, dotted = false) {
        return new Note({
            pitch: 0,
            octave: 0,
            baseDuration: duration,
            dotted: dotted,
            tie: false
        });
    }

    static validatePitch(pitch) {
        if (pitch === 0) return 0;
        if (pitch >= 1 && pitch <= 7) return pitch;
        return 1;
    }

    static validateOctave(octave) {
        if (octave >= -2 && octave <= 2) return octave;
        return 0;
    }

    static validateDuration(duration) {
        if (duration > 0 && duration <= 8) return duration;
        return 1;
    }

    static generateId() {
        return NoteUtils.generateNoteId();
    }

    static isTieContinuation(prevNote, currNote) {
        return NoteUtils.isTieContinuation(prevNote, currNote);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Note;
}
