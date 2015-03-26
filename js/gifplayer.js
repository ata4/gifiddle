'use strict';

function GifPlayer(canvas) {
    
    var gif = null;
    var canvas2d = canvas.getContext('2d');
    var frameIndexCurr = 0;
    var frameIndexPrev = 1;
    var framePrev = null;
    var loopCount = 0;
    var timeout = null;
    var playing = false;
    var ready = false;
    var userInput = false;
    
    var renderRaw = false;
    var renderBGColor = false;
    var strict = false;
    
    function render(frameIndex) {
        var frame = instance.getFrame(frameIndex);
        if (!frame) {
            throw new Error("Invalid frame index: " + frameIndex);
        }

        // restore previous area
        if (!renderRaw && framePrev) {
            framePrev.repair(canvas2d);
        }
        
        // clear canvas before rendering the background
        if (frameIndex === 0) {
            instance.clear();
            
            // draw background color if enabled
            if (renderBGColor && gif.hdr.gctFlag) {
                var bgColor = gif.hdr.gct[gif.hdr.bgColor];
                canvas2d.fillStyle = 'rgb(' + bgColor.join() + ')';
                canvas2d.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
        
        // render new frame
        frame.blit(canvas2d);

        framePrev = frame;
    }
        
    var instance = {
        events: new Events(),
        load: function(gifFile) {
            gif = gifFile;
            canvas.width = gif.hdr.width;
            canvas.height = gif.hdr.height;
            
            this.clear();
            this.setFirst();
            
            ready = true;
            this.events.emit('ready', gif);
        },
        play: function() {
            // don't try to animate static GIFs
            if (this.getFrameCount() <= 1) {
                return;
            }

            // don't play if it's aready playing
            if (playing) {
                return;
            }
            
            // GIF87a: "There is no pause between images. Each is processed
            // immediately as seen by the decoder."
            if (gif.hdr.ver === '87a' && strict) {
                this.setLast();
                return;
            }
            
            var that = this;
            
            loopCount = 0;
            
            function fixDelay(delay) {
                // override zero delays if enabled
                if (!strict && delay === 0) {
                    if (gif.hdr.ver === '89a') {
                        // 10 FPS, default behavior in most browsers
                        delay = 10;
                    } else {
                        // 5 FPS, best frame rate for most ancient animations
                        delay = 20;
                    }
                }
                
                // convert to milliseconds
                return delay * 10;
            }
            
            function playNext() {
                that.setNext();
                
                // check if the current frame is the last one
                if (that.getFrameIndex() === that.getFrameCount() - 1) {
                    loopCount++;
                    
                    // pause if there's no loop count
                    if (gif.loopCount === -1) {
                        that.pause();
                        return false;
                    }
                    
                    // pause if the loop count has been reached
                    if (gif.loopCount > 0 && loopCount >= gif.loopCount) {
                        that.pause();
                        return false;
                    }
                }
                
                return true;
            }
            
            function playNextLoop() {
                if (playNext()) {
                    playLoop();
                }
            }
            
            playing = true;
            
            function playLoop() {
                do {
                    var frame = that.getFrame();
                    var gce = frame.gce;
                    var delay = fixDelay(gce ? gce.delayTime : 0);
                    
                    if (userInput) {
                        that.events.emit('userInputEnd');
                    }
                    
                    userInput = gce ? gce.userInput : false;
                    
                    if (userInput) {
                        that.events.emit('userInputStart', delay);
                        
                        // pause when waiting for user input infinitely
                        if (delay === 0) {
                            return;
                        }
                    }
                    
                    if (delay > 0) {
                        // play next frame with delay
                        timeout = setTimeout(playNextLoop, delay);
                    } else {
                        // play next frame immediately
                        if (!playNext()) {
                            return;
                        }
                    }
                } while(delay === 0);
            }
            
            playLoop();
            
            if (playing) {
                this.events.emit('play');
            }
        },
        pause: function() {
            if (!playing) {
                return;
            }

            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }

            if (userInput) {
                this.events.emit('userInputEnd');
            }
            
            playing = false;
            
            this.events.emit('pause');
        },
        stop: function() {
            if (!playing) {
                return;
            }

            this.pause();
            frameIndexCurr = 0;
        },
        toggle: function() {
            if (this.isPlaying()) {
                this.pause();
            } else {
                this.play();
            }
        },
        isPlaying: function() {
            return playing;
        },
        isReady: function() {
            return ready;
        },
        setNext: function() {
            this.setFrameIndex(frameIndexCurr + 1);
        },
        setPrevious: function() {
            this.setFrameIndex(frameIndexCurr - 1);
        },
        setFirst: function() {
            this.setFrameIndex(0);
        },
        setLast: function() {
            this.setFrameIndex(this.getFrameCount() - 1);
        },
        isLastFrame: function() {
            return this.getFrameIndex() === this.getFrameCount() - 1;
        },
        setFrameIndex: function(frameIndex) {
            var frameCount = this.getFrameCount();
            
            while (frameIndex < 0) {
                frameIndex += frameCount;
            }

            while (frameIndex >= frameCount) {
                frameIndex -= frameCount;
            }

            frameIndexCurr = frameIndex;

            this.update();
        },
        getFrameIndex: function() {
            return frameIndexCurr;
        },
        getFrameCount: function() {
            return gif.frames.length;
        },
        getFrame: function(frameIndex) {
            if (arguments.length === 1) {
                return gif.frames[frameIndex];
            } else {
                return gif.frames[frameIndexCurr];
            }
        },
        setRenderRaw: function(_renderRaw) {
            if (renderRaw === _renderRaw) {
                return;
            }
            
            renderRaw = _renderRaw;
            
            var frameIndex = frameIndexCurr;
            this.setFrameIndex(0);
            this.setFrameIndex(frameIndex);
        },
        isRenderRaw: function() {
            return renderRaw;
        },
        update: function() {
            // don't update if the indices are unchanged
            if (frameIndexCurr === frameIndexPrev) {
                return;
            }

            this.events.emit('update', frameIndexCurr, frameIndexPrev);

            // check if frames need to be replayed 
            var frameStart;
            var frameEnd;

            if (renderRaw) {
                this.clear();
                frameStart = frameEnd = frameIndexCurr;
            } else {
                if (frameIndexCurr < frameIndexPrev) {
                    // next frame is behind the current, clear screen and re-render
                    // all frames from start to the current position
                    frameStart = 0;
                    frameEnd = frameIndexCurr;
                } else {
                    // next frame comes after the current
                    frameStart = frameIndexPrev + 1;
                    frameEnd = frameIndexCurr;
                }
            }

            for (var i = frameStart; i <= frameEnd; i++) {
                render(i);
            }

            frameIndexPrev = frameIndexCurr;
        },
        clear: function() {
            canvas2d.clearRect(0, 0, canvas.width, canvas.height);            
            framePrev = null;
        }
    };
    
    return instance;
};
