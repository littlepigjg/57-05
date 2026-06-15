class ImageExporter {
    constructor(scoreRenderer) {
        this.scoreRenderer = scoreRenderer;
    }

    exportToDataURL(format = 'image/png') {
        const canvas = this.scoreRenderer.getCanvas();
        return canvas.toDataURL(format);
    }

    exportToBlob(format = 'image/png', quality = 0.95) {
        return new Promise((resolve, reject) => {
            const canvas = this.scoreRenderer.getCanvas();
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('图片导出失败'));
                    }
                },
                format,
                quality
            );
        });
    }

    exportToHighResDataURL(scale = 2, format = 'image/png') {
        const canvas = this.scoreRenderer.getCanvas();
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;

        const highResCanvas = document.createElement('canvas');
        highResCanvas.width = originalWidth * scale;
        highResCanvas.height = originalHeight * scale;

        const ctx = highResCanvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(canvas, 0, 0, originalWidth / (window.devicePixelRatio || 1), originalHeight / (window.devicePixelRatio || 1));

        return highResCanvas.toDataURL(format);
    }

    async download(filename, options = {}) {
        const format = options.format || 'image/png';
        const scale = options.scale || 2;
        const quality = options.quality || 0.95;

        let blob;
        try {
            blob = await this.exportToHighResBlob(scale, format, quality);
        } catch (e) {
            blob = await this.exportToBlob(format, quality);
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        let ext = 'png';
        if (format === 'image/jpeg') ext = 'jpg';
        else if (format === 'image/webp') ext = 'webp';

        a.download = filename || `简谱导出_${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    exportToHighResBlob(scale = 2, format = 'image/png', quality = 0.95) {
        return new Promise((resolve, reject) => {
            const canvas = this.scoreRenderer.getCanvas();
            const originalWidth = canvas.width;
            const originalHeight = canvas.height;

            const highResCanvas = document.createElement('canvas');
            highResCanvas.width = originalWidth * scale;
            highResCanvas.height = originalHeight * scale;

            const ctx = highResCanvas.getContext('2d');
            ctx.scale(scale * (window.devicePixelRatio || 1), scale * (window.devicePixelRatio || 1));
            ctx.drawImage(
                canvas,
                0, 0,
                originalWidth / (window.devicePixelRatio || 1),
                originalHeight / (window.devicePixelRatio || 1)
            );

            highResCanvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('高清图片导出失败'));
                    }
                },
                format,
                quality
            );
        });
    }

    exportToFullImageDataURL() {
        const canvas = this.scoreRenderer.getCanvas();
        const ctx = canvas.getContext('2d');

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width + 80;
        tempCanvas.height = canvas.height + 80;

        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        tempCtx.drawImage(
            canvas,
            40, 40,
            canvas.width / (window.devicePixelRatio || 1),
            canvas.height / (window.devicePixelRatio || 1)
        );

        tempCtx.strokeStyle = '#cccccc';
        tempCtx.lineWidth = 2;
        tempCtx.strokeRect(20, 20, tempCanvas.width - 40, tempCanvas.height - 40);

        return tempCanvas.toDataURL('image/png');
    }

    async downloadFullImage(filename) {
        const dataUrl = this.exportToFullImageDataURL();
        const blob = await (await fetch(dataUrl)).blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `简谱完整导出_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    copyToClipboard() {
        return new Promise((resolve, reject) => {
            this.exportToBlob('image/png')
                .then(blob => {
                    if (navigator.clipboard && window.ClipboardItem) {
                        const item = new ClipboardItem({ 'image/png': blob });
                        navigator.clipboard.write([item])
                            .then(resolve)
                            .catch(err => {
                                const dataUrl = this.exportToDataURL('image/png');
                                const textarea = document.createElement('textarea');
                                textarea.value = dataUrl;
                                document.body.appendChild(textarea);
                                textarea.select();
                                document.execCommand('copy');
                                document.body.removeChild(textarea);
                                reject(new Error('系统剪贴板不支持图片复制，已复制为DataURL'));
                            });
                    } else {
                        const dataUrl = this.exportToDataURL('image/png');
                        const textarea = document.createElement('textarea');
                        textarea.value = dataUrl;
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        reject(new Error('系统剪贴板不支持图片复制，已复制为DataURL'));
                    }
                })
                .catch(reject);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageExporter;
}
