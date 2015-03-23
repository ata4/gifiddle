'use strict';

function GifLoader() {
    var gce;
    
    return {
        loadFile: function(file, callback) {
            var reader = new FileReader();
            reader.onload = function (event) {
                this.loadBuffer(event.target.result, callback);
            }.bind(this);
            reader.readAsArrayBuffer(file);
        },
        loadBuffer: function(buffer, callback) {
            var data = null;
            var handler = {
                hdr: function(block) {
                    data = new GifData(block);
                },
                gce: function(block) {
                    gce = block;
                },
                com: function(block) {
                    data.addComment(block.comment);
                },
                pte: function(block) {
                    data.addFrame(null, block, gce);
                    gce = null;
                },
                img: function(block) {                
                    data.addFrame(block, null, gce);
                    gce = null;
                },
                app: {
                    NETSCAPE: function(block) {
                        if (block.subBlockID === 1) {
                            data.loopCount = block.loopCount;
                        }
                    }
                },
                eof: function(block) {
                    callback && callback(data);
                }
            };

            var parser = new GifParser();
            parser.parse(new Stream(buffer), handler);
        }
    };
};

function GifData(hdr) {
    this.hdr = hdr;
    this.loopCount = -1;
    this.comments = [];
    this.frames = [];
};

GifData.prototype = {
    addFrame: function(img, pte, gce) {
        this.frames.push(new GifFrame(this, img, pte, gce));
    },
    addComment: function(comment) {
        // convert line breaks
        comment = comment.replace("\r\n", "\n");
        comment = comment.replace("\r", "\n");
        this.comments.push(comment);
    }
};

function GifFrame(data, img, pte, gce) {
    if (!img && !pte) {
        throw new Error("No graphics data");
    }
    
    this.data = data;
    this.img = img;
    this.pte = pte;
    this.gce = gce;
    this.canvas = null;
    this.prevImageData = null;
    
    var block = this.img ? this.img : this.pte;
    this.width = block.width;
    this.height = block.height;
    this.top = block.topPos;
    this.left = block.leftPos;
    
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    var ctx = this.canvas.getContext('2d');

    var trans = -1;

    if (this.gce && this.gce.transparencyFlag) {
        trans = this.gce.transparencyIndex;
    }

    if (this.img) {
        var imageData = ctx.getImageData(0, 0, this.width, this.height);
        var numPixels = this.img.pixels.length;
        var colorTable;

        if (this.img && this.img.lctFlag) {
            colorTable = this.img.lct;
        } else if (this.data.hdr.gctFlag) {
            colorTable = this.data.hdr.gct;
        } else {
            throw new Error("No color table defined");
        }

        for (var i = 0; i < numPixels; i++) {
            // don't override transparent pixels
            if (this.img.pixels[i] === trans) {
                continue;
            }

            // imageData.data = [R,G,B,A,...]
            var color = colorTable[this.img.pixels[i]];
            imageData.data[i * 4 + 0] = color[0];
            imageData.data[i * 4 + 1] = color[1];
            imageData.data[i * 4 + 2] = color[2];
            imageData.data[i * 4 + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
        
        // Free pixel data buffer that is no longer used. Keep its size for
        // stats, though.
        img.pixelsSize = img.pixels.length;
        img.pixels = null;
    } else {
        // Plain text always uses the global color table, no matter what's
        // set in the GCE. This also means we can't continue without.
        var colorTable = this.data.hdr.gct;
        if (!colorTable) {
            throw new Error("No color table defined");
        }

        // render background
        if (this.pte.bgColor !== trans) {
            var bgColor = colorTable[this.pte.bgColor];

            ctx.fillStyle = 'rgb(' + bgColor.join() + ')';
            ctx.fillRect(0, 0, this.width, this.height);
        }

        // render text
        if (this.pte.fgColor !== trans) {
            var fgColor = colorTable[this.pte.fgColor];
            var cellWidth = this.pte.charCellWidth;
            var cellHeight = this.pte.charCellHeight;

            // "The selection of font and size is left to the discretion of
            // the decoder." Well, who needs consistency, anyway?
            var fontSize = (cellHeight * 0.8).toFixed(2) + 'pt'
            ctx.font = fontSize + ' "Lucida Console", Monaco, monospace';

            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgb(' + fgColor.join() + ')';

            // text positions, the current values and their limits, rounded
            // down to cell size
            var textTop = 0;
            var textTopMax = (Math.floor(this.height / cellHeight) * cellHeight);
            var textTopOffset = (cellHeight / 2);
            var textLeft = 0;
            var textLeftMax = (Math.floor(this.width / cellWidth) * cellWidth);
            var text = this.pte.plainText;

            for (var i = 0; i < text.length; i++) {
                var char = text.charCodeAt(i);

                // see 25e
                if (char < 0x20 || char > 0x7f) {
                    char = 0x20;
                }

                // for debugging
                //ctx.strokeRect(textLeft, textTop, cellWidth, cellHeight);

                // draw character
                ctx.fillText(String.fromCharCode(char), textLeft,
                    textTop + textTopOffset, cellWidth);

                // move to the right by one char
                textLeft += cellWidth;

                // continue at next line when the grid was hit
                if (textLeft >= textLeftMax) {
                    textLeft = 0;
                    textTop += cellHeight;

                    // cancel if the next line is outside the grid
                    if (textTop >= textTopMax) {
                        break;
                    }
                }
            }
        }
    }
};

GifFrame.prototype = {
    getDelayTime: function() {
        var delay = 0;
        
        // delay requires a graphics control extension block
        if (this.gce) {
            delay = this.gce.delayTime;
        }
        
        return delay;
    },
    blit: function(ctx) {
        // keep a copy of the original rectangle for later disposal
        if (this.gce && this.gce.disposalMethod === 3) {
            this.prevImageData = ctx.getImageData(this.left, this.top,
                this.width, this.height);
        }
        
        ctx.drawImage(this.canvas, this.left, this.top);
    },
    repair: function(ctx) {
        if (!this.gce) {
            return;
        }
        
        switch (this.gce.disposalMethod) {
            // restore background
            case 2:
                ctx.clearRect(this.left, this.top, this.width, this.height);
                break;
                
            // restore previous
            case 3:
                if (this.prevImageData) {
                    ctx.putImageData(this.prevImageData, this.left, this.top);
                }
                break;
        }       
    }
};
