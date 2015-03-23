$(function() {
    var gifLab = new GifLab();
    
    // init modules
    new GifLabMenu(gifLab);
    new GifLabControls(gifLab);
});

function GifLab() {
    
    var domViewport = $('#viewport');
    
    return {
        events: new Events(),
        loadGif: function(file) {
            if (this.player) {
                this.player.stop();
                this.player.clear();
                this.player = null;
            }

            var loader = new GifLoader();
            loader.loadFile(file, function(data) {
                domViewport.show();

                var player = new GifPlayer(domViewport[0]);
                this.events.emit('initPlayer', player);
                player.load(data);
            }.bind(this));
        }
    };
}

function GifLabMenu(gifLab) {
    
    var domToolbarMenu = $('#tb-menu');
    var domFileLink = domToolbarMenu.find('.file-link');
    var domFileInput = $('<input type="file">');
    
    domFileInput.on('change', function(event) {
        var file = event.target.files[0];
        if (!file) {
            return;
        }

        gifLab.loadGif(file);
    });
    
    domFileLink.on('click', function(event) {
        domFileInput.trigger('click');
    });
}

function GifLabControls(gifLab) {
    
    var domControls = $('#tb-ctl');
    var domButtons = $('#tb-ctl-btns button[data-command]');
    
    var domIconPlay = domButtons.find('.icon-play');
    var domIconPause = domButtons.find('.icon-pause');
    
    var domSliderContainer = $('#tb-ctl-sldr');
    var domSlider = domSliderContainer.find('input[type="range"]');
    
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
        domSliderContainer.attr('data-hint', frameIndex);
    }
    
    // hide controls on default
    domControls.hide();
    
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