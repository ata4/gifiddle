'use strict';

function GifFile() {
    this.hdr = null;
    this.loopCount = -1;
    this.comments = [];
    this.frames = [];
};

GifFile.prototype.load = function(blob, callback) {
    
    var gce;
    var that = this;
    var parser = new GifParser();

    parser.handleHeader = function(block) {
        that.hdr = block;
    };
    parser.handleGCExt = function(block) {
        gce = block;
    };
    parser.handleComExt = function(block) {
        // convert line breaks
        var comment = block.comment;
        comment = comment.replace("\r\n", "\n");
        comment = comment.replace("\r", "\n");
        that.comments.push(comment);
    };
    parser.handlePTExt = function(block) {
        that.frames.push(new GifFrame(that.hdr, null, block, gce));
        gce = null;
    };
    parser.handleImg = function(block) {
        that.frames.push(new GifFrame(that.hdr, block, null, gce));
        gce = null;
    };
    parser.handleAppExt = {
        NETSCAPE: function(block) {
            if (block.subBlockID === 1) {
                that.loopCount = block.loopCount;
            }
        }
    };
    parser.handleEOF = function(block) {
        callback && callback();
    };

    var reader = new FileReader();
    
    reader.addEventListener('load', function(event) {
        parser.parse(event.target.result);
    });

    reader.readAsArrayBuffer(blob);
};

function GifFrame(hdr, img, pte, gce) {
    if (!img && !pte) {
        throw new Error("No graphics data");
    }
    
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
        } else if (hdr.gctFlag) {
            colorTable = hdr.gct;
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
        var colorTable = hdr.gct;
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

function GifParser() {}

GifParser.prototype = {
    parse: function(buffer) {
        var st = new Stream(buffer);
        var that = this;

        // generic functions
        function bitsToNum(ba) {
            return ba.reduce(function (s, n) {
                return s * 2 + n;
            }, 0);
        }

        function byteToBitArr(bite) {
            var a = [];
            for (var i = 7; i >= 0; i--) {
                a.push(!!(bite & (1 << i)));
            }
            return a;
        }

        function readBlockSize(expected) {
            var size = st.readUint8();
            if (size !== expected) {
                console.error("Unexpected block size "
                        + size + ", expected " + expected);
            }
        }

        // LZW decoder from https://github.com/deanm/omggif with some modifications
        function lzwDecode(minCodeSize, output) {
            var bst = new BlockStream(st);

            var clearCode = 1 << minCodeSize;
            var eoiCode = clearCode + 1;
            var nextCode = eoiCode + 1;
            var prevCode = null;  // Track code-1.

            var curCodeSize = minCodeSize + 1;  // Number of bits per code.

            // NOTE: This shares the same name as the encoder, but has a different
            // meaning here.  Here this masks each code coming from the code stream.
            var codeMask = (1 << curCodeSize) - 1;
            var curShift = 0;
            var cur = 0;

            var op = 0;  // Output pointer.

            var lzwSize = 0;
            var codeTable = new Int32Array(4096);  // Can be signed, we only use 20 bits.

            while (true) {
                // Read up to two bytes, making sure we always 12-bits for max sized code.
                while (curShift < 16) {
                    var b = bst.readUint8();
                    if (b === -1) {
                        break;  // No more data to be read.
                    }

                    cur |= b << curShift;
                    curShift += 8;
                    lzwSize++;
                }

                // TODO(deanm): We should never really get here, we should have received
                // and EOI.
                if (curShift < curCodeSize) {
                    break;
                }

                var code = cur & codeMask;
                cur >>= curCodeSize;
                curShift -= curCodeSize;

                // TODO(deanm): Maybe should check that the first code was a clear code,
                // at least this is what you're supposed to do.  But actually our encoder
                // now doesn't emit a clear code first anyway.
                if (code === clearCode) {
                    // We don't actually have to clear the table.  This could be a good idea
                    // for greater error checking, but we don't really do any anyway.  We
                    // will just track it with next_code and overwrite old entries.

                    nextCode = eoiCode + 1;
                    curCodeSize = minCodeSize + 1;
                    codeMask = (1 << curCodeSize) - 1;

                    // Don't update prev_code ?
                    prevCode = null;
                    continue;
                }

                if (code === eoiCode) {
                    break;
                }

                // We have a similar situation as the decoder, where we want to store
                // variable length entries (code table entries), but we want to do in a
                // faster manner than an array of arrays.  The code below stores sort of a
                // linked list within the code table, and then "chases" through it to
                // construct the dictionary entries.  When a new entry is created, just the
                // last byte is stored, and the rest (prefix) of the entry is only
                // referenced by its table entry.  Then the code chases through the
                // prefixes until it reaches a single byte code.  We have to chase twice,
                // first to compute the length, and then to actually copy the data to the
                // output (backwards, since we know the length).  The alternative would be
                // storing something in an intermediate stack, but that doesn't make any
                // more sense.  I implemented an approach where it also stored the length
                // in the code table, although it's a bit tricky because you run out of
                // bits (12 + 12 + 8), but I didn't measure much improvements (the table
                // entries are generally not the long).  Even when I created benchmarks for
                // very long table entries the complexity did not seem worth it.
                // The code table stores the prefix entry in 12 bits and then the suffix
                // byte in 8 bits, so each entry is 20 bits.

                var chaseCode = code < nextCode ? code : prevCode;

                // Chase what we will output, either {CODE} or {CODE-1}.
                var chaseLength = 0;
                var chase = chaseCode;
                while (chase > clearCode) {
                    chase = codeTable[chase] >> 8;
                    chaseLength++;
                }

                var k = chase;

                // Already have the first byte from the chase, might as well write it fast.
                output[op++] = k;

                op += chaseLength;
                var b = op;  // Track pointer, writing backwards.

                if (chaseCode !== code) {  // The case of emitting {CODE-1} + k.
                    output[op++] = k;
                }

                chase = chaseCode;
                while (chaseLength--) {
                    chase = codeTable[chase];
                    output[--b] = chase & 0xff;  // Write backwards.
                    chase >>= 8;  // Pull down to the prefix code.
                }

                if (prevCode !== null && nextCode < 4096) {
                    codeTable[nextCode++] = prevCode << 8 | k;
                    // TODO(deanm): Figure out this clearing vs code growth logic better.  I
                    // have an feeling that it should just happen somewhere else, for now it
                    // is awkward between when we grow past the max and then hit a clear code.
                    // For now just check if we hit the max 12-bits (then a clear code should
                    // follow, also of course encoded in 12-bits).
                    if (nextCode >= codeMask + 1 && curCodeSize < 12) {
                        ++curCodeSize;
                        codeMask = codeMask << 1 | 1;
                    }
                }

                prevCode = code;
            }

            // report abnormal output pointer
            if (op < output.length) {
                console.error("GIF stream shorter than expected, missing " + (output.length - op) + " pixels");
            } else if (op > output.length) {
                console.error("GIF stream longer than expected, skipped " + (op - output.length) + " pixels");
            }

            // read remaining subblocks
            bst.empty();

            return lzwSize;
        }

        // parser functions
        function parseCT(entries) { // Each entry is 3 bytes, for RGB.
            var ct = [];
            for (var i = 0; i < entries; i++) {
                ct.push(st.readBytes(3));
            }
            return ct;
        }

        function parseHeader() {
            var hdr = {};
            hdr.sig = st.readString(3);
            hdr.ver = st.readString(3);

            // XXX: This should probably be handled more nicely.
            if (hdr.sig !== 'GIF') {
                throw new Error('Not a GIF file');
            }

            if (hdr.ver !== '87a' && hdr.ver !== '89a') {
                throw new Error('Unsupported GIF version');
            }

            hdr.width = st.readUint16();
            hdr.height = st.readUint16();

            var bits = byteToBitArr(st.readUint8());
            hdr.gctFlag = bits.shift();
            hdr.colorRes = bitsToNum(bits.splice(0, 3));
            hdr.gctSortFlag = bits.shift();
            hdr.gctSize = bitsToNum(bits.splice(0, 3));

            hdr.bgColor = st.readUint8();
            hdr.pixelAspectRatio = st.readUint8(); // if not 0, aspectRatio = (pixelAspectRatio + 15) / 64

            if (hdr.gctFlag) {
                hdr.gct = parseCT(1 << (hdr.gctSize + 1));
            }
            that.handleHeader && that.handleHeader(hdr);
        }

        function parseExt(block) {
            function parseGCExt(block) {
                readBlockSize(4);

                var bits = byteToBitArr(st.readUint8());
                block.reserved = bits.splice(0, 3); // Reserved; should be 000.
                block.disposalMethod = bitsToNum(bits.splice(0, 3));
                block.userInput = bits.shift();
                block.transparencyFlag = bits.shift();
                block.delayTime = st.readUint16();
                block.transparencyIndex = st.readUint8();

                st.readUint8(); // block terminator

                that.handleGCExt && that.handleGCExt(block);
            }

            function parseComExt(block) {
                block.comment = new BlockStream(st).toString();
                that.handleComExt && that.handleComExt(block);
            }

            function parsePTExt(block) {
                readBlockSize(12);

                block.leftPos = st.readUint16();
                block.topPos = st.readUint16();
                block.width = st.readUint16();
                block.height = st.readUint16();
                block.charCellWidth = st.readUint8();
                block.charCellHeight = st.readUint8();
                block.fgColor = st.readUint8();
                block.bgColor = st.readUint8();
                block.plainText = new BlockStream(st).toString();

                that.handlePTExt && that.handlePTExt(block);
            }

            function parseAppExt(block) {
                function parseNetscapeExt(block) {
                    readBlockSize(3);
                    block.subBlockID = st.readUint8();

                    switch (block.subBlockID) {
                        // loop extension
                        case 1:
                            block.loopCount = st.readUint16();
                            break;

                            // buffer extension (obsolete, but just in case)
                        case 2:
                            block.bufferSize = st.readUint32();
                            break;
                    }

                    st.readUint8(); // block terminator

                    that.handleAppExt && that.handleAppExt.NETSCAPE && that.handleAppExt.NETSCAPE(block);
                }

                function parseUnknownAppExt(block) {
                    block.appData = new BlockStream(st).toArray();
                    // FIXME: This won't work if a handler wants to match on any identifier.
                    that.handleAppExt && that.handleAppExt[block.identifier] && that.handleAppExt[block.identifier](block);
                }

                readBlockSize(11);
                block.identifier = st.readString(8);
                block.authCode = st.readString(3);
                switch (block.identifier) {
                    case 'NETSCAPE':
                        parseNetscapeExt(block);
                        break;

                    default:
                        parseUnknownAppExt(block);
                        break;
                }
            }

            function parseUnknownExt(block) {
                block.data = new BlockStream(st).toArray();
                that.handleUnknownExt && that.handleUnknownExt(block);
            }

            block.label = st.readUint8();
            switch (block.label) {
                case 0xF9:
                    block.extType = 'gce';
                    parseGCExt(block);
                    break;
                case 0xFE:
                    block.extType = 'com';
                    parseComExt(block);
                    break;
                case 0x01:
                    block.extType = 'pte';
                    parsePTExt(block);
                    break;
                case 0xFF:
                    block.extType = 'app';
                    parseAppExt(block);
                    break;
                default:
                    block.extType = 'unknown';
                    parseUnknownExt(block);
                    break;
            }
        }

        function parseImg(img) {
            function deinterlace(pixels, width) {
                var newPixels = new Uint8Array(pixels.length);
                var rows = pixels.length / width;

                function copyRow(toRow, fromRow) {
                    var offsetFrom = fromRow * width;
                    var sizeFrom = (fromRow + 1) * width;
                    var offsetTo = toRow * width;
                    newPixels.set(pixels.subarray(offsetFrom, sizeFrom), offsetTo);
                }

                // See appendix E.
                var offsets = [0, 4, 2, 1];
                var steps = [8, 8, 4, 2];

                var fromRow = 0;
                for (var pass = 0; pass < 4; pass++) {
                    for (var toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
                        copyRow(toRow, fromRow);
                        fromRow++;
                    }
                }

                return newPixels;
            }

            img.leftPos = st.readUint16();
            img.topPos = st.readUint16();
            img.width = st.readUint16();
            img.height = st.readUint16();

            var bits = byteToBitArr(st.readUint8());
            img.lctFlag = bits.shift();
            img.interlaced = bits.shift();
            img.lctSortFlag = bits.shift();
            img.reserved = bits.splice(0, 2);
            img.lctSize = bitsToNum(bits.splice(0, 3));

            if (img.lctFlag) {
                img.lct = parseCT(1 << (img.lctSize + 1));
            }

            img.lzwMinCodeSize = st.readUint8();

            img.pixels = new Uint8Array(img.width * img.height);
            img.lzwSize = lzwDecode(img.lzwMinCodeSize, img.pixels);

            if (img.interlaced) { // Move
                img.pixels = deinterlace(img.pixels, img.width);
            }

            that.handleImg && that.handleImg(img);
        }

        function parseBlocks() {
            parseHeader();

            do {
                var block = {};
                block.sentinel = st.readUint8();

                switch (String.fromCharCode(block.sentinel)) { // For ease of matching
                    case '!':
                        block.type = 'ext';
                        parseExt(block);
                        break;
                    case ',':
                        block.type = 'img';
                        parseImg(block);
                        break;
                    case ';':
                        block.type = 'eof';
                        that.handleEOF && that.handleEOF(block);
                        break;
                    default:
                        throw new Error('Unknown block: 0x' + block.sentinel.toString(16)); // TODO: Pad this with a 0.
                }
            } while (block.type !== 'eof');
        }

        parseBlocks();
    }
};

function Stream(buffer) {
    
    var data = new DataView(buffer);
    var pos = 0;
    
    function nextOffset(n) {
        if (pos >= data.byteLength) {
            throw new Error('Attempted to read past end of stream.');
        }

        var r = pos;
        pos += n;
        return r;
    }
    
    return {
        readUint8: function () {
            return data.getUint8(nextOffset(1));
        },
        readUint16: function () {
            return data.getUint16(nextOffset(2), true);
        },
        readUint32: function () {
            return data.getUint32(nextOffset(4), true);
        },
        readBytes: function (n) {
            var bytes = [];
            for (var i = 0; i < n; i++) {
                bytes.push(this.readUint8());
            }
            return bytes;
        },
        readString: function (n) {
            var s = '';
            for (var i = 0; i < n; i++) {
                s += String.fromCharCode(this.readUint8());
            }
            return s;
        }  
    };
}

function BlockStream(st) {
    
    var size = 0;
    var eof = false;
    
    return {
        readUint8: function() {
            if (eof) {
                return -1;
            }
            
            if (size === 0) {
                size = st.readUint8();
                if (size === 0) {
                    eof = true;
                    return -1;
                }
            }
            
            size--;
            
            return st.readUint8();
        },
        empty: function() {
            while (this.readUint8() !== -1);
        },
        toArray: function() {
            var data = [];
            var b;
            
            while ((b = this.readUint8()) !== -1) {
                data.push(b);
            }
            
            return data;
        },
        toString: function() {
            var data = '';
            var b;
            
            while ((b = this.readUint8()) !== -1) {
                data += String.fromCharCode(b);
            }
            
            return data;
        }
    };
}