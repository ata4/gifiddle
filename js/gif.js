/*jshint bitwise: false*/

'use strict';

// GIF parser from https://github.com/shachaf/jsgif with some modifications and
// extensions.
// 
// Copyright (c) 2011 Shachaf Ben-Kiki
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
function Gif() {}

Gif.prototype = {
    handleBlock: function(block) {},
    parse: function(buffer) {
        var st = new GifStream(buffer);

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
                console.error("Unexpected block size " + size +
                    ", expected " + expected);
            }
        }

        // LZW decoder from https://github.com/deanm/omggif with some modifications
        // 
        // (c) Dean McNamee <dean@gmail.com>, 2013.
        //
        // Permission is hereby granted, free of charge, to any person obtaining a copy
        // of this software and associated documentation files (the "Software"), to
        // deal in the Software without restriction, including without limitation the
        // rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
        // sell copies of the Software, and to permit persons to whom the Software is
        // furnished to do so, subject to the following conditions:
        //
        // The above copyright notice and this permission notice shall be included in
        // all copies or substantial portions of the Software.
        //
        // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
        // IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
        // FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
        // AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
        // LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
        // FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
        // IN THE SOFTWARE.
        function lzwDecode(minCodeSize, input, output) {
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
                    var b = input.readUint8();
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
                var tp = op;  // Track pointer, writing backwards.

                if (chaseCode !== code) {  // The case of emitting {CODE-1} + k.
                    output[op++] = k;
                }

                chase = chaseCode;
                while (chaseLength--) {
                    chase = codeTable[chase];
                    output[--tp] = chase & 0xff;  // Write backwards.
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
            input.empty();

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

        function parseHeader(hdr) {
            hdr.sig = st.readString(3);
            hdr.ver = st.readString(3);

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
            }

            function parseComExt(block) {
                block.comment = st.readBlock().toString();
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
                block.plainText = st.readBlock().toString();
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
                }
                
                function parseXMPExt(block) {
                    block.xmp = st.readBlock(true).toString();
                    
                    // remove fixup table
                    if (block.xmp.length > 256) {
                        block.xmp = block.xmp.substring(0, block.xmp.length - 257);
                    }
                }

                function parseUnknownAppExt(block) {
                    block.appData = st.readBlock().toArray();
                }

                readBlockSize(11);
                block.identifier = st.readString(8);
                block.authCode = st.readString(3);
                switch (block.identifier) {
                    case 'NETSCAPE':
                        parseNetscapeExt(block);
                        break;
                        
                    case 'XMP Data':
                        parseXMPExt(block);
                        break;

                    default:
                        parseUnknownAppExt(block);
                        break;
                } 
            }

            function parseUnknownExt(block) {
                block.data = st.readBlock().toArray();
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
            img.lzwSize = lzwDecode(img.lzwMinCodeSize, st.readBlock(), img.pixels);

            if (img.interlaced) { // Move
                img.pixels = deinterlace(img.pixels, img.width);
            }
        }

        var hdr = {};
        hdr.type = 'hdr';
        parseHeader(hdr);
        this.handleBlock(hdr);

        main:
        while (true) {
            var block = {};
            block.sentinel = st.readUint8();

            switch (String.fromCharCode(block.sentinel)) { // For ease of matching
                case '!':
                    block.type = 'ext';
                    parseExt(block);
                    this.handleBlock(block);
                    break;

                case ',':
                    block.type = 'img';
                    parseImg(block);
                    this.handleBlock(block);
                    break;

                case ';':
                    block.type = 'eof';
                    this.handleBlock(block);
                    break main;

                default:
                    throw new Error('Unknown block: 0x' + block.sentinel.toString(16)); // TODO: Pad this with a 0.
            }
        }
    }
};

function GifStream(buffer) {

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

    function SubBlockStream(st, xmpMode) {

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
                    if (xmpMode) {
                        return size;
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
        },
        readBlock: function(xmpMode) {
            return new SubBlockStream(this, xmpMode);
        }
    };
}