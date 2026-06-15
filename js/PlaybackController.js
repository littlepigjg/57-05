class PlaybackController {
    constructor(synthesizer, options = {}) {
        this.synthesizer = synthesizer;
        this.scoreRenderer = options.scoreRenderer || null;
        this.noteEditor = options.noteEditor || null;

        this.state = 'stopped';
        this.currentNoteIndex = -1;
        this.currentPlayback = null;
        this.playbackStartTime = 0;
        this.pauseOffset = 0;
        this.totalDuration = 0;
        this.progressTimer = null;

        this.onNoteStart = options.onNoteStart || null;
        this.onNoteEnd = options.onNoteEnd || null;
        this.onComplete = options.onComplete || null;
        this.onProgress = options.onProgress || null;
        this.onStateChange = options.onStateChange || null;
        this.onHighlight = options.onHighlight || null;
    }

    _setState(newState) {
        this.state = newState;
        if (this.onStateChange) {
            this.onStateChange(newState);
        }
    }

    _formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    _startProgressTimer() {
        if (this.progressTimer) {
            clearInterval(this.progressTimer);
        }

        this.progressTimer = setInterval(() => {
            if (this.state !== 'playing') return;

            const elapsed = (Date.now() - this.playbackStartTime) / 1000 + this.pauseOffset;
            const progress = this.totalDuration > 0 ? Math.min(100, (elapsed / this.totalDuration) * 100) : 0;

            if (this.onProgress) {
                this.onProgress({
                    progress: progress,
                    currentTime: elapsed,
                    totalTime: this.totalDuration,
                    formattedCurrent: this._formatTime(elapsed),
                    formattedTotal: this._formatTime(this.totalDuration)
                });
            }
        }, 50);
    }

    _stopProgressTimer() {
        if (this.progressTimer) {
            clearInterval(this.progressTimer);
            this.progressTimer = null;
        }
    }

    async play(notes) {
        if (this.state === 'playing') return;

        if (!this.synthesizer.isInitialized) {
            await this.synthesizer.init();
        }

        let playNotes = notes || (this.noteEditor ? this.noteEditor.getNotes() : []);
        playNotes = NoteUtils.cloneNotesArray(playNotes);
        if (!playNotes || playNotes.length === 0) {
            return;
        }

        if (this.state === 'paused') {
            this.resume();
            return;
        }

        this.totalDuration = this.synthesizer.getBeatDuration() *
            playNotes.reduce((sum, n) => sum + n.duration, 0);

        const handleNoteStart = (noteId, index) => {
            this.currentNoteIndex = index;
            if (this.onNoteStart) this.onNoteStart(noteId, index);
            if (this.onHighlight) this.onHighlight(noteId);
            if (this.scoreRenderer) {
                this.scoreRenderer.setHighlightNote(noteId);
            }
        };

        const handleNoteEnd = (noteId, index) => {
            if (this.onNoteEnd) this.onNoteEnd(noteId, index);
        };

        const handleComplete = () => {
            this.stop();
            if (this.onComplete) this.onComplete();
        };

        this.currentPlayback = this.synthesizer.playSequence(playNotes, {
            onNoteStart: handleNoteStart,
            onNoteEnd: handleNoteEnd,
            onComplete: handleComplete
        });

        this.playbackStartTime = Date.now();
        this.pauseOffset = 0;
        this._setState('playing');
        this._startProgressTimer();
    }

    pause() {
        if (this.state !== 'playing') return;

        if (this.currentPlayback) {
            this.currentPlayback.stop();
        }

        this.synthesizer.stopAll();
        this.pauseOffset += (Date.now() - this.playbackStartTime) / 1000;
        this._setState('paused');
        this._stopProgressTimer();
    }

    resume() {
        if (this.state !== 'paused') return;

        const originalNotes = this.noteEditor ? this.noteEditor.getNotes() : [];
        if (originalNotes.length === 0) return;

        let resumedNotes = [];
        let remainingDuration = 0;
        let skipDuration = this.pauseOffset;
        let startIndex = 0;

        const beatDur = this.synthesizer.getBeatDuration();
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

        if (startIndex < originalNotes.length) {
            resumedNotes = NoteUtils.cloneNotesArray(originalNotes.slice(startIndex));
            if (resumedNotes.length > 0 && remainingDuration > 0) {
                const remainingBeats = remainingDuration / beatDur;
                const firstNote = resumedNotes[0];
                const fullBeats = NoteUtils.getBaseDuration(firstNote.duration, firstNote.dotted);
                
                if (Math.abs(remainingBeats - firstNote.duration) > 0.001) {
                    resumedNotes[0] = NoteUtils.createTruncatedNote(firstNote, remainingBeats);
                }
            }
        }

        if (resumedNotes.length === 0) {
            this.stop();
            return;
        }

        const handleNoteStart = (noteId, index) => {
            const actualIndex = startIndex + index;
            this.currentNoteIndex = actualIndex;
            if (this.onNoteStart) this.onNoteStart(noteId, actualIndex);
            if (this.onHighlight) this.onHighlight(noteId);
            if (this.scoreRenderer) {
                this.scoreRenderer.setHighlightNote(noteId);
            }
        };

        const handleNoteEnd = (noteId, index) => {
            const actualIndex = startIndex + index;
            if (this.onNoteEnd) this.onNoteEnd(noteId, actualIndex);
        };

        const handleComplete = () => {
            this.stop();
            if (this.onComplete) this.onComplete();
        };

        this.currentPlayback = this.synthesizer.playSequence(resumedNotes, {
            onNoteStart: handleNoteStart,
            onNoteEnd: handleNoteEnd,
            onComplete: handleComplete
        });

        this.playbackStartTime = Date.now();
        this._setState('playing');
        this._startProgressTimer();
    }

    stop() {
        if (this.state === 'stopped') return;

        if (this.currentPlayback) {
            this.currentPlayback.stop();
        }

        this.synthesizer.stopAll();

        this.currentNoteIndex = -1;
        this.pauseOffset = 0;
        this.currentPlayback = null;

        if (this.scoreRenderer) {
            this.scoreRenderer.setHighlightNote(null);
        }

        this._setState('stopped');
        this._stopProgressTimer();

        if (this.onProgress) {
            this.onProgress({
                progress: 0,
                currentTime: 0,
                totalTime: this.totalDuration,
                formattedCurrent: '0:00',
                formattedTotal: this._formatTime(this.totalDuration || 0)
            });
        }
    }

    seek(progress) {
        const wasPlaying = this.state === 'playing';
        this.stop();

        if (this.noteEditor) {
            const totalBeats = this.noteEditor.getTotalDuration();
            this.pauseOffset = progress * totalBeats * this.synthesizer.getBeatDuration();

            if (this.onProgress) {
                this.onProgress({
                    progress: progress * 100,
                    currentTime: this.pauseOffset,
                    totalTime: this.totalDuration,
                    formattedCurrent: this._formatTime(this.pauseOffset),
                    formattedTotal: this._formatTime(this.totalDuration || 0)
                });
            }
        }

        this._setState('paused');

        if (wasPlaying) {
            this.resume();
        }
    }

    getState() {
        return this.state;
    }

    getCurrentNoteIndex() {
        return this.currentNoteIndex;
    }

    destroy() {
        this.stop();
        this.currentPlayback = null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlaybackController;
}
