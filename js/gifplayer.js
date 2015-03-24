'use strict';

function GifPlayer(canvas) {
    
    var gif = null;
    var canvas2d = canvas.getContext('2d');
    var frameIndexCurr = 0;
    var frameIndexPrev = 1;
    var framePrev = null;
    var loopCount = 0;
    var interval = null;
    var timeout = null;
    var playing = false;
    var ready = false;
    var renderRaw = false;
    var renderBGColor = false;
    var strictDelays = false;
    
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
            var frameCount = this.getFrameCount();
            
            // don't try to animate static GIFs
            if (frameCount <= 1) {
                return;
            }

            // don't play if it's aready playing
            if (playing) {
                return;
            }
            
            var fixDelay = function(delay) {
                // override zero delays if enabled
                if (delay === 0 && !strictDelays) {
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
            };
            
            var constantDelay = this.getFrame(0).getDelayTime();

            // check if the delay is the same for all frames
            for (var i = 1; i < frameCount; i++) {
                if (this.getFrame(i).getDelayTime() !== constantDelay) {
                    // delays are not constant
                    constantDelay = -1;
                    break;
                }
            }
            
            if (constantDelay !== -1) {
                constantDelay = fixDelay(constantDelay);
            }
            
            loopCount = 0;

            var playNext = function playNext() {
                this.setNext();
                
                // check if the current frame is the last one
                if (frameIndexCurr === this.getFrameCount() - 1) {
                    loopCount++;
                    
                    // pause if there's no loop count
                    if (gif.loopCount === -1) {
                        this.pause();
                        return false;
                    }
                    
                    // pause if the loop count has been reached
                    if (gif.loopCount > 0 && loopCount >= gif.loopCount) {
                        this.pause();
                        return false;
                    }
                }
                
                return true;
            }.bind(this);
            
            playing = true;

            var playLoop = function() {                
                if (constantDelay === 0) {
                    // all frames have zero delay, so simply render the last frame
                    this.setLast();
                    
                    // this GIF can't be played
                    playing = false;
                } else if (constantDelay > 0) {
                    // play in inverval with constant delay
                    interval = setInterval(function() {
                        if (!playNext()) {
                            return;
                        }
                    }, constantDelay);
                } else {
                    // play with variable delays
                    var delay = fixDelay(this.getFrame().getDelayTime());
                    
                    // render zero delay frames instantly
                    while (delay === 0) {
                        if (!playNext()) {
                            return;
                        }
                        delay = fixDelay(this.getFrame().getDelayTime());
                    }
                    
                    // play next frame with delay
                    timeout = setTimeout(function() {
                        if (!playNext()) {
                            return;
                        }
                        playLoop();
                    }.bind(this), delay);
                }
            }.bind(this);
            
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

            if (interval) {
                clearInterval(interval);
                interval = null;
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
