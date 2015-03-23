'use strict';

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