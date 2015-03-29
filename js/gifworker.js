'use strict';

importScripts('gif.js');

onmessage = function(evt) {
    var buffer = evt.data;
    var gif = new Gif();

    gif.handleBlock = function(block) {
        postMessage(block);
        if (block.type === 'eof') {
            close();
        }
    };
    gif.parse(buffer);
};