$(function() {
    var gifLab = new GifLab();
    
    // init modules
    new GifLabMenu(gifLab);
    new GifLabInfo(gifLab);
    new GifLabControls(gifLab);
    new GifLabUserInput(gifLab);
    new GifLabDragAndDrop(gifLab);
    new GifLabAutoplay(gifLab);
    
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
    
    var title = $('title').text();
    
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
                if (ex instanceof GifError) {
                    this.loader.showError('GIF error: ' + ex.message);
                    console.error(ex);
                } else {
                    // not our business
                    throw ex;
                }
            }
        },
        loadBlob: function(blob) {
            this.loader.showLoad();
            
            document.title = title + ': ' + blob.name;

            var reader = new FileReader();
            reader.addEventListener('load', function(event) {
                this.loadBuffer(event.target.result);
            }.bind(this));
            reader.readAsArrayBuffer(blob);
        },
        loadUrl: function(url) {
            if (url.length === 0) {
                return;
            }
            
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
            
            var filenameIndex = parser.pathname.lastIndexOf('/');
            
            if (filenameIndex > -1) {
                var filename = parser.pathname.substring(filenameIndex + 1);
                document.title = title + ': ' + filename;
            } else {
                document.title = title;
            }
            
            window.location.hash = '';
            
            // Note: jQuery's .ajax() doesn't support binary files well, therefore
            // a direct XHR level 2 object is used instead
            var xhr = new XMLHttpRequest();
            
            xhr.onloadstart = function() {
                this.loader.showLoad();
            }.bind(this);

            xhr.onload = function () {
                // only allow 'OK'
                if (xhr.status === 200) {
                    window.location.hash = url;
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
        var domForm = domModal.find('#modal-url-form');
        var domInput = domModal.find('#modal-url-input');
        
        domForm.validator().on('submit', function(event) {
            if (!event.isDefaultPrevented()) {
                gifLab.loadUrl(domInput.val());
                domModal.modal('hide');
            }
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

function GifLabUserInput(gifLab) {
    
    var domUserInput = $('#user-input');
    var domCountdown = domUserInput.find('.countdown');
    var countdownTimer = null;
    var countdown;
    
    domUserInput.hide();
    
    gifLab.events.on('initPlayer', function(gifPlayer) {
        domCountdown.empty();
        
        domUserInput.fadeOut();
        domUserInput.off();
        domUserInput.on('click', function() {
            gifPlayer.pause();
            if (gifPlayer.isLastFrame()) {
                gifPlayer.setFirst();
            } else {
                gifPlayer.setNext();
                gifPlayer.play();                
            }
        });
        
        function updateCountdown() {
            domCountdown.text('(' + countdown + ')');
            
            countdown--;
            if (countdown > 0) {
                countdownTimer = setTimeout(updateCountdown, 1000);
            }
        }
        
        function stopCountdown() {
            if (countdownTimer) {
                clearTimeout(countdownTimer);
                countdownTimer = null;
            }
        }
        
        gifPlayer.events.on('userInputStart', function(delay) {
            if (delay === 0 || delay > 100) {
                domCountdown.empty();
                domUserInput.show();
                
                if (delay > 100) {
                    countdown = Math.ceil(delay / 100);
                    updateCountdown();
                }
            }
        });

        gifPlayer.events.on('userInputEnd', function() {
            domUserInput.hide();
            
            stopCountdown();
        });
    });
}

function GifLabAutoplay(gifLab) {
    gifLab.events.on('initPlayer', function(gifPlayer) {
        gifPlayer.events.on('ready', function() {
            var frameCount = gifPlayer.getFrameCount();
            if (frameCount > 1) {
                gifPlayer.play();
            }
        });
    });
}

function GifLabDragAndDrop(gifLab) {

    var domDocument = $(document);
    
    domDocument.on('dragover', function(evt) {
        evt.stopPropagation();
        evt.preventDefault();
    });

    domDocument.on('drop', function(evt) {
        evt.stopPropagation();
        evt.preventDefault();

        var file = evt.originalEvent.dataTransfer.files[0];
        if (!file) {
            return;
        }

        gifLab.loadBlob(file);
    });
}

function GifLabInfo(gifLab) {
    
    var domSidebar = $('#info-sidebar');
    var domHdrPanel = domSidebar.find('#info-panel-hdr');
    var domGcePanel = domSidebar.find('#info-panel-gce');
    var domImgPanel = domSidebar.find('#info-panel-img');
    var domPtePanel = domSidebar.find('#info-panel-pte');
    
    var hdrTable = new Table(domHdrPanel.find('table'));
    var gceTable = new Table(domGcePanel.find('table'));
    var imgTable = new Table(domImgPanel.find('table'));
    var pteTable = new Table(domPtePanel.find('table'));
    
    domHdrPanel.hide();
    domGcePanel.hide();
    domImgPanel.hide();
    domPtePanel.hide();
    
    var domCheckboxShowInfoRaw = $('#checkbox-show-info');
    
    domCheckboxShowInfoRaw.on('change', function(event) {
        if (event.target.checked) {
            domSidebar.fadeIn();
            if (framePrev !== null) {
                updateFrame(framePrev, frameIndexPrev);
                framePrev = null;
                frameIndexPrev = null;
            }
        } else {
            domSidebar.fadeOut();
        }
    });
    
    if (domCheckboxShowInfoRaw.prop('checked')) {
        domSidebar.show();
    } else {
        domSidebar.hide();
    }
    
    var formatter = {
        byteSize: function(bytes, si) {
            var thresh = si ? 1000 : 1024;
            if(bytes < thresh) return bytes + ' B';
            var units = si ? ['kB','MB','GB','TB','PB','EB','ZB','YB'] : ['KiB','MiB','GiB','TiB','PiB','EiB','ZiB','YiB'];
            var u = -1;
            do {
                bytes /= thresh;
                ++u;
            } while(bytes >= thresh);
            return bytes.toFixed(1) + ' ' + units[u];
        },
        delayTime: function(delay) {
            var str = delay + ' (';
            delay *= 10;
            if (delay >= 1000) {
                str += (delay / 1000).toFixed(2) + ' s';
            } else {
                str += delay + ' ms';
            }
            str += ')';
            return str;
        },
        disposalMethod: function(disposal) {
            var str = disposal + ' (';
            var names = ['unspecified', 'none', 'background', 'previous'];
            if (names[disposal]) {
                str += names[disposal];
            } else {
                str += 'undefined';
            }
            str += ')';
            return str;
        },
        boolean: function(v) {
            return v ? 'yes' : 'no';
        },
        aspectRatio: function(aspectRatio) {
            var str = aspectRatio;
            if (aspectRatio !== 0) {
                str += ' (';
                str += ((aspectRatio + 15) / 64).toFixed(2);
                str += ')';
            }
            return str;
        },
        colorRes: function(colorRes) {
            var str = colorRes;
            if (colorRes > 0) {
                str += ' (';
                str += colorRes - 1;
                str += ' bpp)';
            }
            return str;
        }  
    };
    
    function buildColorTable(ct, ctFlag, sortFlag) {
        if (!ctFlag) {
            return 'n/a';
        }
        
        var domColorTable = $('<div>');
        domColorTable.addClass('color-table');

        for (var i = 0; i < ct.length; i++) {
            var color = ct[i];
            var domColor = $('<div>');
            domColor.css('background-color', 'rgb(' + color.join() + ')');
            domColor.attr('title', i + ': ' + color.join());
            domColorTable.append(domColor);
        }
        
        var domText = $('<p>');
        
        domText.append(ct.length);
        
        // never seen this one being set in any file, but well... why not?
        if (sortFlag) {
            domText.append(' sorted');
        }
        
        domText.append(' colors');
        
        var domContainer = $('<div>');
        domContainer.append(domText);
        domContainer.append(domColorTable);
        return domContainer;
    }
    
    function updateHeader(gifFile) {
        var hdr = gifFile.hdr;
        
        domHdrPanel.show();
        
        hdrTable.empty();
        
        hdrTable.row('Version', hdr.ver);
        hdrTable.row('Screen size', hdr.width + 'x' + hdr.height);
        hdrTable.row('Global color table', buildColorTable(hdr.gct, hdr.gctFlag, hdr.gctSortFlag));
        hdrTable.row('Color resolution', formatter.colorRes(hdr.colorRes));
        hdrTable.row('Background color', hdr.bgColor);
        hdrTable.row('Pixel aspect ratio', formatter.aspectRatio(hdr.pixelAspectRatio));

        if (gifFile.loopCount !== -1) {
            hdrTable.row('Loop count', gifFile.loopCount);
        }
    }
    
    var framePrev;
    var frameIndexPrev;
    var domColorTables;
    
    function updateFrame(frame, frameIndex) {
        framePrev = frame;
        frameIndexPrev = frameIndex;
        
        // don't produce overhead when the sidebar is hidden
        if (!domSidebar.is(':visible')) {
            return;
        }

        imgTable.empty();
        
        var img = frame.img;
        if (img) {
            domImgPanel.show();
            
            imgTable.row('Index', frameIndex);
            imgTable.row('Size', img.width + 'x' + img.height);
            imgTable.row('Position', img.topPos + 'x' + img.leftPos);
            imgTable.row('Interlaced', formatter.boolean(img.interlaced));
            
            imgTable.row();
            imgTable.col('Local color table');
            
            // generating a HTML color table is pretty expensive, better cache
            // it for every frame
            if (!domColorTables[frameIndex]) {
                domColorTables[frameIndex] = buildColorTable(img.lct, img.lctFlag, img.lctSortFlag);
            }

            imgTable.col(domColorTables[frameIndex]);
            
            imgTable.row('Compressed size', formatter.byteSize(img.lzwSize));
            imgTable.row('Uncompressed size', formatter.byteSize(img.pixelsSize));
            imgTable.row('Compression ratio', (img.pixelsSize / img.lzwSize).toFixed(2));
            imgTable.row('LZW min. code size', img.lzwMinCodeSize);
        } else {
            domImgPanel.hide();
        }
        
        pteTable.empty();

        var pte = frame.pte;
        if (pte) {
            domPtePanel.show();
            
            pteTable.row('Index', frameIndex);
            pteTable.row('Size', pte.width + 'x' + pte.height);
            pteTable.row('Position', pte.topPos + 'x' + pte.leftPos);
            pteTable.row('Character cell size', pte.charCellWidth + 'x' + pte.charCellHeight);
            pteTable.row('Foreground color', pte.fgColor);
            pteTable.row('Background color', pte.bgColor);
        } else {
            domPtePanel.hide();
        }
        
        gceTable.empty();

        var gce = frame.gce;
        if (gce) {
            domGcePanel.show();

            gceTable.row('Delay', formatter.delayTime(gce.delayTime));
            gceTable.row('Disposal method', formatter.disposalMethod(gce.disposalMethod));
            gceTable.row('Transparent', formatter.boolean(gce.transparencyFlag));
            gceTable.row('Wait for user input', formatter.boolean(gce.userInput));
        } else {
            domGcePanel.hide();
        }
    }
    
    gifLab.events.on('initPlayer', function(gifPlayer) {
        
        framePrev = null;
        domColorTables = [];
        
        gifPlayer.events.on('ready', function(gifFile) {
            updateHeader(gifFile);
        });
        
        gifPlayer.events.on('update', function() {
            updateFrame(gifPlayer.getFrame(), gifPlayer.getFrameIndex());
        });
    });
}

function Table(domTable) {
    
    var domTbody = domTable.find('tbody');
    
    if (domTbody.length === 0) {
        domTbody = $('<tbody>');
        domTable.append(domTbody);
    }
    
    var domTr;
    
    return {
        row: function() {
            domTr = $('<tr>');
            domTbody.append(domTr);
            
            for (var i = 0; i < arguments.length; i++) {
                this.col(arguments[i]);
            }
            
            return domTr;
        },
        col: function(content) {
            if (!domTr) {
                this.row();
            }
            var domTd = $('<td>');
            if (typeof content === 'string') {
                domTd.text(content);
            } else {
                domTd.append(content);
            }
            domTr.append(domTd);
            return domTd;
        },
        empty: function() {
            domTbody.empty();
        }
    };
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