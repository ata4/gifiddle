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
            
            // many sites don't provide a wildcard ACAO header, so use a CORS proxy
            //url = 'https://cors-anywhere.herokuapp.com/' + url;

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

    var domToolbarMenu = $('#toolbar-menu');
    var domFileLink = domToolbarMenu.find('.file-link');
    var domCheckboxRenderRaw = domToolbarMenu.find('#checkbox-render-raw');
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
    
    var domModal = $('#modal-url');
    var domButtonUrl = domModal.find('#button-url');
    var domInputUrl = domModal.find('#input-url');
    
    domButtonUrl.on('click', function() {
        gifLab.loadUrl(domInputUrl.val());
    });

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