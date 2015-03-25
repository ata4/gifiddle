$(function() {
    var gifLab = new GifLab();
    
    // init modules
    new GifLabMenu(gifLab);
    new GifLabControls(gifLab);
    
    // auto-load image in parameters
    var url = document.URL;
    var urlFragIndex = url.indexOf('#');
    if (urlFragIndex !== -1) {
        var gifUrl = url.substring(urlFragIndex + 1);
        if (gifUrl.length > 0) {
            gifLab.loadUrl(gifUrl);
        }
    }
});

function GifLab() {
    
    // set of hosts that have a wildcard ACAO header
    var corsHosts = {
        'imgur.com': true,
        'tumblr.com': true
    };

    var domViewport = $('#viewport');
    domViewport.hide();
    
    var domLoader = $('#loader');
    domLoader.hide();

    //Handles menu drop down
    $('.form-menu').click(function (e) {
        e.stopPropagation();
    });
    
    function preLoad() {
        domLoader.show();
        domViewport.hide();
    }
    
    function postLoad() {
        domLoader.hide();
        domViewport.show();
    }
    
    var player = null;
    
    return {
        events: new Events(),
        loadGif: function(gifFile) {
            if (player) {
                player.stop();
                player.clear();
                player = null;
            }

            player = new GifPlayer(domViewport[0]);
            this.events.emit('initPlayer', player);
            player.events.on('ready', postLoad);
            player.load(gifFile);
        },
        loadFile: function(file) {
            preLoad();
            
            var gifFile = new GifFile();
            gifFile.load(file, function() {
                this.loadGif(gifFile);
            }.bind(this));
        },
        loadUrl: function(url) {
            preLoad();
            
            // get hostname
            var parser = document.createElement('a');
            parser.href = url;
            
            var hostname = parser.hostname;
            
            // strip subdomain
            hostname = hostname.split('.').slice(-2).join('.');
            
            // many sites don't provide a wildcard ACAO header, so use a CORS proxy
            if (!corsHosts[hostname]) {
                url = 'https://cors-anywhere.herokuapp.com/' + url;
            }

            // Note: jQuery's .ajax() doesn't support binary files well, therefore
            // a direct XHR level 2 object is used instead
            var xhr = new XMLHttpRequest();

            xhr.onload = function (evt) {
                if (xhr.status === 200) {
                    this.loadFile(xhr.response);
                } else {
                    // handle error
                }
            }.bind(this);

            xhr.onerror = function(evt) {
                console.error(evt);
            };

            xhr.open('GET', url, true);
            xhr.responseType = 'blob';
            xhr.send();
        }
    };
}

function GifLabMenu(gifLab) {

    // global elements
    var domToolbar = $('#toolbar');
    var domToolbarMenu = domToolbar.find('#toolbar-menu');
    var domToolbarExtras = domToolbar.find('#toolbar-extras');
    
    // open file link
    (function() {
        var domFileLink = domToolbarMenu.find('.file-link');
        var domFileInput = $('<input type="file">');
        
        domFileInput.on('change', function(event) {
            var file = event.target.files[0];
            if (!file) {
                return;
            }

            gifLab.loadFile(file);
        });

        domFileLink.on('click', function(event) {
            domFileInput.trigger('click');
        });
    })();
    
    // open url link and modal
    (function() {
        var domModalUrl = $('#modal-url');
        var domButtonUrl = domModalUrl.find('#button-url');
        var domInputUrl = domModalUrl.find('#input-url');
        
        domButtonUrl.on('click', function() {
            gifLab.loadUrl(domInputUrl.val());
        });
    })();
    
    // options
    (function() {
        var domCheckboxRenderRaw = domToolbarMenu.find('#checkbox-render-raw');

        gifLab.events.on('initPlayer', function(gifPlayer) {
            domCheckboxRenderRaw.off();
            domCheckboxRenderRaw.on('change', function(event) {
                if (gifPlayer.isReady()) {
                    gifPlayer.setRenderRaw(event.target.checked);
                }
            });

            gifPlayer.events.on('ready', function() {
                gifPlayer.setRenderRaw(domCheckboxRenderRaw.prop('checked'));
            });
        });
    })();
    
    // comments modal
    (function() {
        var domModalComment = $('#modal-comment');
        var domCommentBox = domModalComment.find('.comment-box');
        var domCommentButtonPrevious = domModalComment.find('.pager-previous');
        var domCommentButtonNext = domModalComment.find('.pager-next');
        var domCommentLink = domToolbarExtras.find('.comment-link');
        var domCommentBadge = domCommentLink.find('.badge');

        var commentArray = [];
        var commentIndex = 0;

        domCommentLink.hide();

        domCommentButtonPrevious.on('click', function() {
            commentIndex--;
            update();
        });

        domCommentButtonNext.on('click', function() {
            commentIndex++;
            update();
        });
        
        function update() {
            if (commentArray.length <= 1) {
                commentIndex = 0;
                domCommentButtonPrevious.hide();
                domCommentButtonNext.hide();
            } else if (commentIndex >= commentArray.length - 1) {
                commentIndex = commentArray.length - 1;
                domCommentButtonPrevious.show();
                domCommentButtonNext.hide();
            } else if (commentIndex <= 0) {
                commentIndex = 0;
                domCommentButtonPrevious.hide();
                domCommentButtonNext.show();
            } else {
                domCommentButtonPrevious.show();
                domCommentButtonNext.show();
            }

            if (commentArray.length > 0) {
                domCommentBox.text(commentArray[commentIndex]);
            } else {
                domCommentBox.text('');
            }
        }
        
        gifLab.events.on('initPlayer', function(gifPlayer) {
            gifPlayer.events.on('ready', function(gifFile) {
                commentArray = gifFile.comments;
                commentIndex = 0;

                if (commentArray.length === 0) {
                    domCommentLink.fadeOut();
                } else {
                    domCommentLink.fadeIn();
                }

                domCommentBadge.text(commentArray.length);

                update();
            });
        });
    })();
}

function GifLabControls(gifLab) {

    var domControls = $('#toolbar-controls');
    var domButtons = domControls.find('button[data-command]');

    var domIconPlay = domButtons.find('.icon-play');
    var domIconPause = domButtons.find('.icon-pause');

    var domSliderContainer = domControls.find('.slider-container');
    var domSlider = domSliderContainer.find('.slider');

    var domSliderValueContainer = domControls.find('.slider-value-container');
    var domSliderValue = domSliderValueContainer.find('.slider-value');

    function updateIcon(playing) {
        if (playing) {
            domIconPlay.hide();
            domIconPause.show();
        } else {
            domIconPlay.show();
            domIconPause.hide();
        }
    }

    function updateTooltip(frameIndex) {
        domSliderValue.html(frameIndex);
    }

    // hide controls on default
    domControls.hide();

    // start in "paused" state
    updateIcon(false);

    gifLab.events.on('initPlayer', function(gifPlayer) {

        updateIcon(false);

        // player events
        gifPlayer.events.on('play', function() {
            updateIcon(true);
        });

        gifPlayer.events.on('pause', function() {
            updateIcon(false);
        });

        gifPlayer.events.on('update', function(frameIndex, frameIndexPrev) {
            domSlider.val(frameIndex);
            updateTooltip(frameIndex);
        });

        gifPlayer.events.on('ready', function() {
            var frameCount = gifPlayer.getFrameCount();

            if (frameCount > 1) {
                domControls.fadeIn();
                gifPlayer.play();
            } else {
                domControls.fadeOut();
            }

            // update slider range and value
            domSlider.prop('min', 0);
            domSlider.prop('max', frameCount - 1);
            domSlider.val(0);

            updateTooltip(0);
        });

        // DOM events
        domButtons.off();
        domButtons.on('click', function(event) {
            var cmd = event.target.dataset.command;

            // pause playback when pressing one of the frame control buttons
            if (cmd !== 'toggle') {
                gifPlayer.pause();
            }

            // run function based on the button ID name
            gifPlayer[cmd] && gifPlayer[cmd]();
        });

        domSlider.off();
        domSlider.on('input', function(event) {
            gifPlayer.pause();
            gifPlayer.setFrameIndex(parseInt(event.target.value));
            updateTooltip(event.target.value);
        });
    });
}