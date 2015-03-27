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
                        
            var that = this;
            
            loopCount = 0;
            
            function fixDelay(delay) {
                // Set a fixed delay of 200 ms for GIF87a files to emulate old
                // decoders running on old hardware, which is what most ancient
                // animated GIFs are designed for.
                if (gif.hdr.ver === '87a' && delay === -1) {
                    return 20;
                }
                
                // GIFs with loop extensions and no frame delays is somewhat
                // undefined behavior, but most browsers change delays shorter
                // than 20 ms to 100 ms to avoid high CPU usage or even infinite
                // loops.
                if (gif.loopCount !== -1 && delay <= 2) {
                    return 10;
                }
                
                return delay;
            }
            
            function playNext() {
                that.setNext();
                
                // check if the current frame is the last one
                if (that.isLastFrame()) {
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
            
            // analyze the delay of all frames for some special cases
            var globalDelay = -1;
            var frameCount = this.getFrameCount();
            for (var i = 0; i < frameCount; i++) {
                var frame = this.getFrame(i);
                var gce = frame.gce;
                var frameDelay = gce ? gce.delayTime : -1;
                var frameUserInput = gce ? gce.userInput : false;
                
                // frames with user input need to be handled by playLoop()
                // further below
                if (frameUserInput) {
                    globalDelay = -2;
                    break;
                }
 
                if (i === 0) {
                    // first frame, set reference delay
                    globalDelay = frameDelay;
                } else {
                    if (frameDelay !== globalDelay) {
                        // frame has a different delay, invalidate global delay
                        globalDelay = -2;
                        break;
                    }
                }
            }
            
            // check if there's a global delay set for all frames
            if (globalDelay !== -2) {
                globalDelay = fixDelay(globalDelay);
                if (globalDelay === 0) {
                    // there's no point in playing the animation, simply display
                    // the last frame instead of spamming update events
                    this.setLast();
                    return;
                }
            }

            playing = true;
            
            function playLoop() {
                do {
                    var frame = that.getFrame();
                    var gce = frame.gce;
                    var delay = gce ? gce.delayTime : -1;
                    
                    // cancel previous user input
                    if (userInput) {
                        that.events.emit('userInputEnd');
                    }
                    
                    userInput = gce ? gce.userInput : false;
                    
                    // does the next frame require user input?
                    if (userInput) {
                        that.events.emit('userInputStart', delay);
                        
                        // pause when waiting for user input infinitely
                        if (delay === 0) {
                            return;
                        }
                    }
                    
                    // override delay where required
                    delay = fixDelay(delay);
                    
                    if (delay > 0) {
                        // play next frame with delay
                        timeout = setTimeout(function () {
                            if (playNext()) {
                                playLoop();
                            }
                        }, delay * 10);
                    } else {
                        // play next frame immediately
                        if (!playNext()) {
                            return;
                        }
                    }
                } while (delay <= 0);
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
                userInput = false;
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
