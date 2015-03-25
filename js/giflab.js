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
    
    function GifLabLoader() {

        var domViewport = $('#viewport');
        var domLoaderIcon = $('#loader-icon');
        var domLoaderAlert = $('#loader-alert');
        var domLoaderAlertMessage = domLoaderAlert.find('.alert-message');
        
        domViewport.hide();
        domLoaderIcon.hide();
        domLoaderAlert.hide();

        return {
            showLoad: function() {
                domLoaderIcon.show();
                domViewport.hide();
                domLoaderAlert.hide();
            },
            showError: function(message) {
                domLoaderIcon.hide();
                domViewport.hide();
                domLoaderAlertMessage.text(message);
                domLoaderAlert.fadeIn();
            },
            showCanvas: function() {
                domLoaderIcon.hide();
                domViewport.show();
                domLoaderAlert.slideUp();
            }
        };
    }
    
    // set of hosts that have a wildcard ACAO header
    var corsHosts = {
        'imgur.com': true,
        'tumblr.com': true
    };

    var domViewport = $('#viewport');
    
    var player = null;
    
    return {
        events: new Events(),
        loader: new GifLabLoader(),
        loadGif: function(gifFile) {
            if (player) {
                player.stop();
                player.clear();
                player = null;
            }

            player = new GifPlayer(domViewport[0]);
            this.events.emit('initPlayer', player);
            player.events.on('ready', function() {
                this.loader.showCanvas();
            }.bind(this));

            player.load(gifFile);
        },
        loadBuffer: function(buffer) {
            try {
                var gifFile = new GifFile();
                gifFile.load(buffer, function () {
                    this.loadGif(gifFile);
                }.bind(this));
            } catch (ex) {
                this.loader.showError('GIF error: ' + ex.message);
            }
        },
        loadBlob: function(blob) {
            this.loader.showLoad();

            var reader = new FileReader();
            reader.addEventListener('load', function(event) {
                this.loadBuffer(event.target.result);
            }.bind(this));
            reader.readAsArrayBuffer(blob);
        },
        loadUrl: function(url) {
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
            
            xhr.onloadstart = function() {
                this.loader.showLoad();
            }.bind(this);

            xhr.onload = function () {
                // only allow 'OK'
                if (xhr.status === 200) {
                    this.loadBuffer(xhr.response);
                } else {
                    this.loader.showError('Unable to download GIF: ' + new HttpStatus(xhr.status));
                }
            }.bind(this);
            
            xhr.ontimeout = function() {
                this.loader.showError('Unable to download GIF: Connection timed out');
            }.bind(this);

            xhr.onerror = function() {
                this.loader.showError('Unable to download GIF: Connection failed');
            }.bind(this);
            
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.send();
        }
    };
}

function GifLabMenu(gifLab) {

    // global elements
    var domToolbar = $('#toolbar');
    var domToolbarMenu = domToolbar.find('#toolbar-menu');
    var domToolbarExtras = domToolbar.find('#toolbar-extras');
    
    // prevent persistent dropdowns from disappearing on click
    $('.dropdown-persistent').click(function(e) {
        e.stopPropagation();
    });
    
    // open file link
    (function() {
        var domFileLink = domToolbarMenu.find('.file-link');
        var domFileInput = $('<input type="file">');
        
        domFileInput.on('change', function(event) {
            var file = event.target.files[0];
            if (!file) {
                return;
            }

            gifLab.loadBlob(file);
        });

        domFileLink.on('click', function(event) {
            domFileInput.trigger('click');
        });
    })();
    
    // open url link and modal
    (function() {
        var domModal = $('#modal-url');
        var domButton = domModal.find('#button-url');
        var domInput = domModal.find('#input-url');
        
        domButton.on('click', function() {
            gifLab.loadUrl(domInput.val());
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
    
    // comments link and modal
    (function() {
        var domLink = domToolbarExtras.find('.comment-link');
        var domCommentBox = domLink.find('.comment-box');
        var domButtonPrevious = domLink.find('.pager-previous');
        var domButtonNext = domLink.find('.pager-next');
        var domBadge = domLink.find('.badge');

        var commentArray = [];
        var commentIndex = 0;

        domLink.hide();

        domButtonPrevious.on('click', function() {
            commentIndex--;
            update();
        });

        domButtonNext.on('click', function() {
            commentIndex++;
            update();
        });
        
        function update() {
            if (commentArray.length <= 1) {
                commentIndex = 0;
                domButtonPrevious.hide();
                domButtonNext.hide();
            } else if (commentIndex >= commentArray.length - 1) {
                commentIndex = commentArray.length - 1;
                domButtonPrevious.show();
                domButtonNext.hide();
            } else if (commentIndex <= 0) {
                commentIndex = 0;
                domButtonPrevious.hide();
                domButtonNext.show();
            } else {
                domButtonPrevious.show();
                domButtonNext.show();
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

                // hide comments link if there are no comments
                if (commentArray.length === 0) {
                    domLink.fadeOut();
                } else {
                    domLink.fadeIn();
                }

                // update comment count badge
                domBadge.text(commentArray.length);

                // update modal buttons
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

function HttpStatus(code) {
    this.code = code;
}

HttpStatus.prototype.statusCodes = {
    '200': 'OK',
    '201': 'Created',
    '202': 'Accepted',
    '203': 'Non-Authoritative Information',
    '204': 'No Content',
    '205': 'Reset Content',
    '206': 'Partial Content',
    '300': 'Multiple Choices',
    '301': 'Moved Permanently',
    '302': 'Found',
    '303': 'See Other',
    '304': 'Not Modified',
    '305': 'Use Proxy',
    '306': 'Unused',
    '307': 'Temporary Redirect',
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '402': 'Payment Required',
    '403': 'Forbidden',
    '404': 'Not Found',
    '405': 'Method Not Allowed',
    '406': 'Not Acceptable',
    '407': 'Proxy Authentication Required',
    '408': 'Request Timeout',
    '409': 'Conflict',
    '410': 'Gone',
    '411': 'Length Required',
    '412': 'Precondition Required',
    '413': 'Request Entry Too Large',
    '414': 'Request-URI Too Long',
    '415': 'Unsupported Media Type',
    '416': 'Requested Range Not Satisfiable',
    '417': 'Expectation Failed',
    '418': 'I\'m a teapot',
    '500': 'Internal Server Error',
    '501': 'Not Implemented',
    '502': 'Bad Gateway',
    '503': 'Service Unavailable',
    '504': 'Gateway Timeout',
    '505': 'HTTP Version Not Supported'
};

HttpStatus.prototype.toString = function() {
    return this.code + ' ' + this.statusCodes[this.code];
};