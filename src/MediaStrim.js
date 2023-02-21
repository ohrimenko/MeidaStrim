
'use strict';

function MediaStrim(video, sources) {
    var $this = this;
    
    this.media = video;
    this.sources = sources;
    
    this.sources.sort(function (a, b) {
        if (a.width < b.width) {
            return 1;
        }
        if (a.width > b.width) {
            return -1;
        }
        
        return 0;
    });
    
    this.initSkey();
    
    window.addEventListener('resize', function () {
        $this.initSkey();
    });
    
    this.currentTime = 0;
    this.timeLoadNext = 0;
    
    this.isInit = false;
    
    this.countInitMediaSource = 0;
    
    this.xhrs = {};
    this.xhrskey = 0;
    
    this.xhrfetchs = {};
    this.xhrfetchskey = 0;
    
    this.preLoadRanges = [];
    this.dataRanges = {};
    
    this.initMediaSource();
}

MediaStrim.startMediaSource = true; // Создавать MediaSource при создании объекта
MediaStrim.ajaxType = "fetch"; // тип ajax запросов fetch or xhr
MediaStrim.partTimeInterval = 1; // Групируем входной манифест по 1 секунде
MediaStrim.loadTimeInterval = 15; // Подгружаем по 15 секунд.
MediaStrim.loadTimeWaiting = 5; // Подгружаем по 1 секунде первые 5 секунд.
MediaStrim.partRange = 3; // Режем на три части подгрузкуу буфера первые 5 секунд если входный манифест содержит данные с частотой более секунды.
MediaStrim.loadSeekTime = 2000; // Запускаем виде через две секунды после перемотки если перемотка видео не завершена и не изменяется.
MediaStrim.stopOtherVideo = true; // При воспроизведении видео останавливаем другие.
MediaStrim.preLoadTime = 0.8; // Храним в кеше 1 секунду видео для еффекта мгновенного воспроизведения видео при нажатии на воспроизведения.
MediaStrim.urlPreLoad = ""; // Ссылка для подгруки кеша буфера одним запросом для всех видео сразу.

MediaStrim.TimerId = null;
MediaStrim.mediStreams = {};

MediaStrim.userAgent = "";
MediaStrim.userBrowser = "";

if (window.navigator && window.navigator.userAgent) {
    MediaStrim.userAgent = window.navigator.userAgent.toLowerCase();
}

if (/firefox/.test(MediaStrim.userAgent)) {
    MediaStrim.userBrowser = "firefox";
} else if (/chrome/.test(MediaStrim.userAgent)) {
    MediaStrim.userBrowser = "chrome";
} else if (/safari/.test(MediaStrim.userAgent)) {
    MediaStrim.userBrowser = "safari";
} else if (/opera/.test(MediaStrim.userAgent)) {
    MediaStrim.userBrowser = "opera";
} else if((/mozilla/.test(MediaStrim.userAgent) && !/firefox/.test(MediaStrim.userAgent) && !/chrome/.test(MediaStrim.userAgent) && !/safari/.test(MediaStrim.userAgent) && !/opera/.test(MediaStrim.userAgent)) || /msie/.test(MediaStrim.userAgent)) {
    MediaStrim.userBrowser = "ie";
}

if (MediaStrim.userBrowser == "firefox") {
    // Firefox has a problem with the seeked event. It doesn't always work.
    // This parameter helps solve this problem by intentionally firing this event.
    MediaStrim.loadSeekTime = 500;
}

MediaStrim.TimerInterval = function () {
    if (MediaStrim.TimerId) {
        clearInterval(MediaStrim.TimerId);
    }
    
    MediaStrim.TimerId = setInterval(function () {
        for (var i in MediaStrim.mediStreams) {
            if (MediaStrim.mediStreams[i].isPlay && MediaStrim.mediStreams[i].currentSegment < MediaStrim.mediStreams[i].segments.length) {
                MediaStrim.mediStreams[i].timerCb();
            }
        }
    }, 100);
};

MediaStrim.TimerInterval();

MediaStrim.prototype.initSkey = function() {
    this.minSKey = 0;
    this.maxSKey = 0;
    
    for (var i in this.sources) {
        this.sources[this.minSKey]['default'] = false;
        this.maxSKey = i;
    }
    
    for (var i in this.sources) {
        this.minSKey = i;
        
        if (this.sources[i].manifest.width < this.media.clientWidth) {
            break;
        }
    }
    
    this.sources[this.minSKey]['default'] = true;
    this.sKey = this.minSKey;
};

MediaStrim.prototype.initMediaSource = function() {
    if (!this.media.getAttribute("id")) {
        this.media.setAttribute("id", MediaStrim.randomString(20));
    }
    
    this.countInitMediaSource++;
    
    if (this.countInitMediaSource > 100) {
        return;
    }
    
    var $this = this;
    
    for (var i in this.xhrs) {
        if (this.xhrs[i].xhr) {
            this.xhrs[i].xhr.abort();
        }
    }
    
    for (var i in this.xhrfetchs) {
        if (this.xhrfetchs[i]) {
            this.xhrfetchs[i].ctr.abort();
        }
    }
    
    this.xhrs = {};
    
    this.xhrfetchs = {};
    
    if (this.mediaSource) {
        if (this.mediaSource.readyState === 'open') {
            this.sourceBuffer.abort();
            this.mediaSource.endOfStream();
        }
        
        if (typeof this.sourceBuffer == "object") {
            try {
                this.mediaSource.removeSourceBuffer(this.sourceBuffer);
            } catch (error) {
                console.error(error);
            }
        }
    }
    
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.sKey = 0;
    this.sKeyInit = null;
    this.segments = [];
    this.loads = {};
    this.iload = 0;
    this.chunks = {};
    this.currentSegment = 0;
    this.lMimeCodec = null;
    this.canplay = false;
    this.isFetchInit = false;
    this.isPlay = false;
    this.timeLoadNext = 0;
    this.lastCurrentTime = 0;
    this.lastPlayTime = 0;
    this.msNoPlay = 0;
    this.isSeekSet = false;  
    this.timeWaiting = 0;  
    this.seek = false;
    this.timeSeeking = 0;
    this.countFetch = 0;
    
    if (this.media && this.sources.length > 0) {
        this.media.objMediaStrim = this;
        
        for (var i in this.sources) {
            if (this.sources[i]['default']) {
                this.sKey = i;
            }
        }
        
        if (!this.sources[this.sKey]) {
            for (var i in this.sources) {
                this.sKey = i;
                break;
            }
        }
        
        var lasttimecode = 0;
        var segment = [
            false,
            [],
            0,
        ];
        
        if (this.sources[this.sKey]) {
            for (var i in this.sources[this.sKey]['manifest']['media']) {
                if (
                    i > 0 && 
                    this.sources[this.sKey]['manifest']['media'][parseFloat(i)+1] && 
                    parseFloat(this.sources[this.sKey]['manifest']['media'][parseFloat(i)+1][2]) - lasttimecode > MediaStrim.partTimeInterval
                ) {
                    this.segments.push(segment);
                    segment = [
                        false,
                        [],
                        0,
                    ];
                    
                    lasttimecode = parseFloat(this.sources[this.sKey]['manifest']['media'][i][2]);
                    segment[2] = lasttimecode;
                }
                
                segment[1].push(i);   
            }
            
            this.segments.push(segment);
        }
        
        //console.log(this.segments);
        
        if ('MediaSource' in window) {
            if (MediaSource.isTypeSupported(this.getMimeCodec())) {
                if (this.currentTime > 0) {
                    this.isSeekSet = true; 
                }    
                
                if (MediaStrim.startMediaSource) {
                    $this.ctrlMediaSource();
                }
                
                this.media.addEventListener('click', function(e) {
                    $this.ctrlMediaSource(function () {
                        if (!$this.isFetchInit) {
                            setTimeout(function () {
                                $this.media.play();
                            }, 10);
                        }
                    });
                });
                
                this.media.addEventListener('play', function(e) {
                    if (MediaStrim.stopOtherVideo) {
                        for (var i in MediaStrim.mediStreams) {
                            if (MediaStrim.mediStreams[i] === $this) {
                                continue;
                            }
                        
                            MediaStrim.mediStreams[i].stop(true);
                        }
                    }
                    
                    if (!$this.mediaSource) {
                        $this.ctrlMediaSource(function () {
                            $this.fetchNextRange(); 
                            
                            $this.isPlay = true;
                            
                            $this.fetchInit();
                            
                            $this.play();
                        });
                    } else {
                        $this.isPlay = true;
            
                        $this.fetchInit();
            
                        $this.play();
                    }
                });
            } else {
                console.error('Unsupported MIME type or codec: ', this.getMimeCodec());
                
                this.media.src = this.sources[this.sKey]['url'];
            }
        } else {
            console.error('MediaSource: undefined');
            
            this.media.src = this.sources[this.sKey]['url'];
        }
    }
    
    MediaStrim.mediStreams[this.media.getAttribute("id")] = this;
    
    var currentSegment = this.currentSegment;
    
    if (this.sources[this.sKey]['manifest']['media'].length > 0 && this.segments[currentSegment]) {
        var ranges = [];
        
        var range = this.fetchNextRange(currentSegment, false, true);
        
        if (range && range.length > 0) {
            this.preLoadRanges.push(range);
            
            if (this.currentTime > 0) {
                for (var i in this.segments) {
                    if (parseFloat(this.segments[i][2]) > parseFloat(this.currentTime)) {
                        break;
                    }
                    currentSegment = i;
                }
            }
            
            if (this.getTimePreLoadRanges() < MediaStrim.preLoadTime || this.currentTime > 0) {
                for (var i = 0; i < 50; i++) {
                    currentSegment++;
                    
                    var range = this.fetchNextRange(currentSegment, true, true);    
                    
                    if (range && range.length > 0) {
                        this.preLoadRanges.push(range);
                    } else {
                        break;
                    }             
                    
                    if (this.getTimePreLoadRanges() >= MediaStrim.preLoadTime) {
                        break;
                    }
                }
            }
        }
    }
    
    this.countFetch = 0;
    
    //console.log(this.preLoadRanges);
};

MediaStrim.prototype.getTimePreLoadRanges = function() {
    var time = 0;
    
    for (var i in this.preLoadRanges) {
        for (var j in this.preLoadRanges[i]) {
            time = parseFloat(time) + (parseFloat(this.preLoadRanges[i][j]['timeInterval'][1]) - parseFloat(this.preLoadRanges[i][j]['timeInterval'][0]));
        }
    }
    
    return time;
};

MediaStrim.preLoad = function(cb) {
    if (MediaStrim.urlPreLoad) {
        var items = [];
        
        for (var m in MediaStrim.mediStreams) {
            for (var i in MediaStrim.mediStreams[m].preLoadRanges) {
                for (var j in MediaStrim.mediStreams[m].preLoadRanges[i]) {
                    MediaStrim.mediStreams[m].dataRanges[MediaStrim.mediStreams[m].preLoadRanges[i][j]['start']+"-"+MediaStrim.mediStreams[m].preLoadRanges[i][j]['end']] = {
                        status: "pending",
                        data: null,
                        segment: MediaStrim.mediStreams[m].preLoadRanges[i][j]                        
                    };
                    
                    items.push({
                        key: m,
                        url: MediaStrim.mediStreams[m].preLoadRanges[i][j].url,
                        range: [
                            MediaStrim.mediStreams[m].preLoadRanges[i][j]['start'],
                            MediaStrim.mediStreams[m].preLoadRanges[i][j]['end']
                        ],
                    });
                }
            }
        }
        
        //console.log("items", items);
        
        if (items.length) {
            if (MediaStrim.ajaxType == 'fetch' && 'fetch' in window) {
                fetch(MediaStrim.urlPreLoad, {
                    method: 'POST',
                    headers: {
                        'Content-type': 'application/x-www-form-urlencoded'
                    },
                    body: MediaStrim.httpBuildQuery({items: items}),
                }).then((response) => {
                        if (response.status >= 200 && response.status < 300) {
                            return response.arrayBuffer();
                        } else {
                            let error = new Error(response.statusText);
                            error.response = response;
                            throw error;
                        }
                }).then((response) => {
                    if (response) {
                        MediaStrim.responsePreLoad(items, response);
                    }
                    
                    if (cb) {
                        cb();
                    }
                }).catch((e) => {
                    if (cb) {
                        cb();
                    }
                });
            } else {
                var xhrLoad = new XMLHttpRequest;
                                
                xhrLoad.open('post', MediaStrim.urlPreLoad, true);
                xhrLoad.responseType = 'arraybuffer';
                xhrLoad.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
                xhrLoad.addEventListener('load', function () {
                    if (xhrLoad.response) {
                        MediaStrim.responsePreLoad(items, xhrLoad.response);
                    }
                    
                    if (cb) {
                        cb();
                    }
                });
                xhrLoad.addEventListener('error', function () {
                    if (cb) {
                        cb();
                    }
                });
                xhrLoad.addEventListener('abort', function () {
                    if (cb) {
                        cb();
                    }
                });
                
                xhrLoad.send(MediaStrim.httpBuildQuery({items: items}));
            }
        } else {
            if (cb) {
                cb();
            }
        }
        
        return;
    }
    
    for (var i in MediaStrim.mediStreams) {
        if (MediaStrim.mediStreams[i].preLoadComplete) {
            continue;
        }
        
        if (MediaStrim.mediStreams[i].preLoad(function () {
            MediaStrim.preLoad(cb);
        })) {
            return;
        }
    }
    
    if (cb) {
        cb();
    }
};

MediaStrim.responsePreLoad = function(items, response) {
    response = new Uint8Array(response);
    
    var length = 0;
    
    for (var i in items) {
        length += parseInt(items[i]["range"][1]) - parseInt(items[i]["range"][0]) + 1;
    }
        
    //console.log("responsePreLoad/items:", items.length, "/length:", length, "/response:", response.length);
    
    if (length == response.length) {
        for (var i in items) {
            var $this = MediaStrim.mediStreams[items[i]['key']];
            
            $this.dataRanges[items[i]['range'][0]+"-"+items[i]['range'][1]].status = "success";
            $this.dataRanges[items[i]['range'][0]+"-"+items[i]['range'][1]].data = response.slice(parseInt(items[i]["range"][0]), parseInt(items[i]["range"][1]) + 1);
        
            //console.log("Range Length:",$this.dataRanges[items[i]['range'][0]+"-"+items[i]['range'][1]].data.length);
            
            //console.log($this.dataRanges[items[i]['range'][0]+"-"+items[i]['range'][1]]);
            
            if ($this.mediaSource && $this.dataRanges[items[i]['range'][0]+"-"+items[i]['range'][1]].segment) {
                $this.fetchRange(
                    [$this.dataRanges[items[i]['range'][0]+"-"+items[i]['range'][1]].segment],
                    function (iSegment, mimeCodec, chunk) {
                        $this.addChuck(iSegment, mimeCodec, chunk);
                    }, function (status) {
                    }, 
                    true
                );
            }
        }
    }
};

MediaStrim.prototype.preLoad = function(cb) {
    var $this = this;
    
    this.preLoad;
    
    for (var i in this.preLoadRanges) {
        for (var j in this.preLoadRanges[i]) {
            var keyInterval = this.preLoadRanges[i][j]['start']+"-"+this.preLoadRanges[i][j]['end'];
            
            if (!this.dataRanges[keyInterval]) {
                this.dataRanges[keyInterval] = {
                    status: "new",
                    data: null,
                    segment: this.preLoadRanges[i][j],
                };
            }
                        
            if (this.dataRanges[keyInterval].status == "new") {
                this.dataRanges[keyInterval].status = "pending";
                
                if (MediaStrim.ajaxType == 'fetch' && 'fetch' in window) {
                    this.xhrfetchskey++;
        
                    var xhrfetchskey = this.xhrfetchskey;
            
                    this.xhrfetchs[xhrfetchskey] = {
                        ctr: new AbortController()
                    };
            
                    fetch(this.preLoadRanges[i][j].url+(this.preLoadRanges[i][j].url.indexOf("?")>0?"&":"?")+'bytes='+this.preLoadRanges[i][j].start+'-'+this.preLoadRanges[i][j].end, {
                        method: 'GET',
           	            headers: {
           	                'Range': 'bytes=' + this.preLoadRanges[i][j].start + '-' + this.preLoadRanges[i][j].end,
                        },
                        signal: this.xhrfetchs[xhrfetchskey].ctr.signal,
                    }).then((response) => {
                        if (response.status >= 200 && response.status < 300) {
                            return response.arrayBuffer();
                        } else {
                            let error = new Error(response.statusText);
                            error.response = response;
                            throw error;
                        }
                    }).then((response) => {
                        $this.dataRanges[keyInterval].status = "load";
                    
                        if (response) {
                            $this.dataRanges[keyInterval].status = "success";
                            $this.dataRanges[keyInterval].data = response;
                        }
                    
                        if ($this.xhrfetchs[xhrfetchskey]) {
                            delete $this.xhrfetchs[xhrfetchskey];
                        }
                        $this.preLoad(cb);
                    }).catch((e) => {
                        if ($this.xhrfetchs[xhrfetchskey]) {
                            delete $this.xhrfetchs[xhrfetchskey];
                        }
                        $this.preLoad(cb);
                    });
                } else {
                    this.xhrskey++;
                    var xhrskey = this.xhrskey;
                
                    var xhrLoad = new XMLHttpRequest;
                
                    this.xhrs[xhrskey] = {
                        xhr: xhrLoad
                    };
                    
                    xhrLoad.open('get', this.preLoadRanges[i][j].url+(this.preLoadRanges[i][j].url.indexOf("?")>0?"&":"?")+'bytes='+this.preLoadRanges[i][j].start+'-'+this.preLoadRanges[i][j].end, true);
                    xhrLoad.responseType = 'arraybuffer';
                    xhrLoad.setRequestHeader('Range', 'bytes=' + this.preLoadRanges[i][j].start + '-' + this.preLoadRanges[i][j].end);
                    xhrLoad.addEventListener('load', function () {
                        $this.dataRanges[keyInterval].status = "load";
                    
                        if (xhrLoad.response) {
                            $this.dataRanges[keyInterval].status = "success";
                            $this.dataRanges[keyInterval].data = xhrLoad.response;
                        }
                    
                        if ($this.xhrs[xhrskey]) {
                            delete $this.xhrs[xhrskey];
                        }
                        $this.preLoad(cb);
                    });
                    xhrLoad.addEventListener('error', function () {
                        $this.dataRanges[keyInterval].status = "error";
                        if ($this.xhrs[xhrskey]) {
                            delete $this.xhrs[xhrskey];
                        }
                        $this.preLoad(cb);
                    });
                    xhrLoad.addEventListener('abort', function () {
                        $this.dataRanges[keyInterval].status = "abort";
                        if ($this.xhrs[xhrskey]) {
                            delete $this.xhrs[xhrskey];
                        }
                        $this.preLoad(cb);
                    });
            
                    xhrLoad.send();
                }
                
                return true;
            }
        }
    }
    
    this.preLoadComplete = true;
    
    if (cb) {
        cb();
    }
    
    return false;
};

MediaStrim.prototype.start = function(load) {
    this.ctrlMediaSource();
    
    if (load) {
        this.checkBuffer(); 
    }
};

MediaStrim.prototype.ctrlMediaSource = function(cb) {
    if (!this.mediaSource) {
        this.newMediaSource(cb);        
    } else {
        if (cb) {
            cb();
        }
    }
};

MediaStrim.prototype.newMediaSource = function(cb) {
    var $this = this;
    
    this.mediaSource = new MediaSource;
                       
    this.media.src = URL.createObjectURL(this.mediaSource);
    this.mediaSource.addEventListener('sourceopen', function (_) {
        $this.sourceOpen(_);
        
        if (cb) {
            cb();
        }
    });
};

MediaStrim.prototype.sKeyPlus = function() {
    //alert(this.minSKey+"/"+this.maxSKey+"/"+this.sKey);
    
    if (this.sKey < this.maxSKey) {
        this.sKey++;
    }
};

MediaStrim.prototype.sKeyMinus = function() {
    if (this.sKey > this.minSKey) {
        this.sKey--;
    }
};

MediaStrim.prototype.reinit = function(cb) {
    var $this = this;
    
    this.setStartCurrentTime = true;
    
    this.initMediaSource();
    
    this.ctrlMediaSource(cb);
    
    console.log("reinit");
    
    setTimeout(function () {
        $this.play();
    }, 10);
    
};

MediaStrim.prototype.getMimeCodec = function() {
    if (this.sources[this.sKey]) {
        return this.sources[this.sKey]['manifest']['type'];
    }
    
    return "";
}

MediaStrim.prototype.sourceOpen = function(_) {
    var $this = this;
    
    this.sourceBuffer = this.mediaSource.addSourceBuffer(this.getMimeCodec());
    
    this.lMimeCodec = this.getMimeCodec();
    
    this.sourceBuffer.mode = "sequence";
    
    if (this.currentTime > 0) {
        this.media.currentTime = this.currentTime;
    }
    
    this.init();
};

MediaStrim.prototype.init = function() {
    var $this = this;
    
    if (!this.isInit && this.sources[this.sKey]) {
        this.media.addEventListener('canplay', function () {
            $this.canplay = true;
        });
        this.media.addEventListener('seeking', function(e) {
            $this.seeking(e);              
        });
        this.media.addEventListener('seeked', function(e) {
            $this.seeked(e);
        });
        this.media.addEventListener('error', function(e) {
            //$this.reinit();
        });
        this.media.addEventListener('pause', function(e) {
            $this.isPlay = false;
            
            $this.msNoPlay = 0;
            
            $this.fetchInit();
        });
        
        this.isInit = true;
    }
};

MediaStrim.prototype.timerCb = function() {
    if (this.seek || this.media.seeking) {
        return;
    }
    
    this.load();
    
    this.playControl();
};

MediaStrim.prototype.playControl = function(action, msNoPlay) {
    var time = Date.now();
    
    if (!msNoPlay) {
        msNoPlay = 2000;
    }
    
    if (this.lastCurrentTime != this.media.currentTime) {
        this.lastCurrentTime = this.media.currentTime;
        this.lastPlayTime = time;
        
        this.msNoPlay = 0;
    } else {
        this.msNoPlay = time - this.lastPlayTime;
    }
        
    if (this.isPlay && this.canplay && !this.isRePlay) {
        if (this.msNoPlay > msNoPlay) {
            for (var i in this.loads) {
                return;
            }
            
            //console.log("msNoPlay: ", msNoPlay);
            
            this.rePlay(action, msNoPlay);
        }
    }
};

MediaStrim.prototype.rePlay = function(action, msNoPlay) {
    var $this = this;
    
    if (!msNoPlay) {
        msNoPlay = 2000;
    }
    
    if (this.isPlay && this.msNoPlay > msNoPlay) {
        switch (action) {
            case "checkBuffer1":
                this.checkBuffer();
                
                setTimeout(function () {
                    $this.rePlay("checkBuffer2");
                }, 250);
                
                break;
            case "checkBuffer2":
                this.checkBuffer();
                
                setTimeout(function () {
                    $this.rePlay("checkBuffer3");
                }, 250);
                
                break;
            case "checkBuffer3":
                this.checkBuffer();
                
                setTimeout(function () {
                    $this.rePlay("reinit");
                }, 250);
                
                break;
            case "reinit":
                if ($this.msNoPlay > 3000) {
                    for (var i in $this.loads) {
                        return;
                    }
                }
                
                this.reinit(function () {
                    setTimeout(function () {
                        $this.isRePlay = false;
                        $this.media.play();
                        
                        setTimeout(function () {
                            $this.playControl();
                        }, 100);
                    }, 10);
                });
                
                break;
            default:
                this.isRePlay = true;
            
                //$this.rePlay("reinit");
                //return;
                
                this.checkBuffer();
                
                this.media.pause();
                this.media.play();
                
                //console.log("reinit: ", msNoPlay);
                
                setTimeout(function () {
                    $this.rePlay("reinit");
                }, 250);
            
                break;
        }
    } else {
        $this.isRePlay = false;
        this.msNoPlay = 0;                
    }
};

MediaStrim.prototype.fetchInit = function() {
    var $this = this;
    
    if (!this.isFetchInit && this.sources[this.sKey]) {
        //this.fetchNextRange();
        
        this.media.addEventListener('timeupdate', function(_) {
            if ($this.canplay) {
                $this.currentTime = $this.media.currentTime;
            }
            
            if (!$this.media.seeking) {
                $this.checkBuffer(_);
            }
        });
        
        this.media.addEventListener('waiting', function(_) {
            //console.log("waiting");
                
            $this.checkBuffer(_);
            $this.sKeyPlus();
                
            //$this.timeWaiting = $this.media.currentTime;                
        });
        
        this.isFetchInit = true;
    }
};

MediaStrim.prototype.play = function (currentTime) {
    var $this = this;
    
    if (!this.mediaSource) {
        if (currentTime > 0) {
            this.setStartCurrentTime = true;
        }
        
        $this.ctrlMediaSource(function () {
            $this.fetchNextRange();
            $this.play(currentTime);
        });   
        return;  
    }   
    
    $this.isPlay = true;
    
    if (currentTime >= 0) {
        $this.media.currentTime = $this.currentTime = currentTime;
        
        $this.isSeekSet = true;     
    }
    
    if (!$this.isFetchInit) {
        $this.fetchInit();
    }
    
    if ($this.canplay) {
        if ($this.media.paused) {
            $this.media.play();
        }
    } else {
        setTimeout(function () {
            $this.play();
        }, 10);
    }
};

MediaStrim.prototype.stop = function (abort) {
    this.isPlay = false;
    
    this.msNoPlay = 0;
    
    if (!this.media.paused) {
        this.media.pause();
    }
    
    if (abort) {
        for (var i in this.xhrs) {
            if (this.xhrs[i].range) {
                continue;
            }
            
            if (this.xhrs[i].xhr) {
                this.xhrs[i].xhr.abort();
            }
            
            delete this.xhrs[i];
        }
        
        for (var i in this.xhrfetchs) {
            if (this.xhrfetchs[i].range) {
                continue;
            }
            
            if (this.xhrfetchs[i]) {
                this.xhrfetchs[i].ctr.abort();
            }
            
            delete this.xhrfetchs[i];
        }
        
        if (this.sourceBuffer && this.mediaSource.readyState == 'open') {
            //this.sourceBuffer.abort();
        }
    }
};

MediaStrim.prototype.getFileLength = function (url, cb) {
    var xhr = new XMLHttpRequest;
    xhr.open('head', url);
    xhr.onload = function () {
        cb(xhr.getResponseHeader('content-length'));
    };
    xhr.send();
};

MediaStrim.prototype.fetchNextRange = function (currentSegment, noinit, find) {
    if (!currentSegment) {
        currentSegment = this.currentSegment;
    }
    
    if (!find && (!this.segments[currentSegment] || this.segments[currentSegment][0])) {
        return;
    }
    
    var isRange = false;
    
    if (
        MediaStrim.userBrowser == "chrome" || 
        MediaStrim.userBrowser == "safari" || 
        MediaStrim.userBrowser == "opera"
    ) {
        isRange = true;
    }
    
    // Значительно стабильнее работает без грубой резки на части
    isRange = false;
    
    var countSegments = 0;
    
    var start = 0;
    var end = 0;
    
    var iSegment = parseInt(currentSegment);
    
    if (isRange) {
        isRange = false;
        
        for (var i in this.segments[currentSegment][1]) {
            end += parseFloat(this.sources[this.sKey]['manifest']['media'][this.segments[currentSegment][1][i]][2]);
        }
    
        do {
            iSegment++;
        
            start = end;
        
            if (!this.segments[iSegment]) {
                break;
            }
        
            end = 0;
        
            for (var i in this.segments[iSegment][1]) {
                end += parseFloat(this.sources[this.sKey]['manifest']['media'][this.segments[iSegment][1][i]][2]);
            }
            
            if (iSegment > 3) {
                break;
            }
        
            if (end - start > 3) {
                isRange = true;
            }
        } while (true);
    }
    
    //console.log("isRange: ", isRange);
    
    var time = Date.now();
    
    if (!find && this.lastTimeFetchNextRange && (time - this.lastTimeFetchNextRange > 3000)) {
        this.sKeyMinus();
    }
    
    if (!find) {
        this.lastTimeFetchNextRange = time;
    
        this.segments[currentSegment][0] = true;
    
        this.chunks[currentSegment] = null;
    }
    
    var segments = [];
    
    countSegments = 0;
    
    start = parseInt(this.sources[this.sKey]['manifest']['media'][this.segments[currentSegment][1][0]][0]);
    end = start;
    
    var timeInterval = [
        this.segments[currentSegment][2],
        this.segments[currentSegment][2]
    ];
    
    this.countFetch++;
    
    iSegment = parseInt(currentSegment);
    do {
        if (!this.segments[iSegment]) {
            break;
        }
        
        timeInterval[1] = this.segments[iSegment][2];
        
        if (this.segments[iSegment+1]) {
            if (parseFloat(this.segments[iSegment+1][2]) - parseFloat(this.segments[currentSegment][2]) > MediaStrim.loadTimeInterval) {
                break;
            }
            
            if (countSegments > 0 && !isRange && 
                parseFloat(this.segments[currentSegment][2]) - parseFloat(this.timeWaiting) < MediaStrim.loadTimeWaiting) {
                if (timeInterval[1] - timeInterval[0] >= this.countFetch) {
                    break;
                }
            }
            
            if (this.isSeekSet && countSegments > 0 && !isRange && 
                parseFloat(this.segments[currentSegment][2]) - parseFloat(this.currentTime) < MediaStrim.loadTimeWaiting) {
                if (timeInterval[1] - timeInterval[0] >= this.countFetch) {
                    break;
                }
            }
        }
        
        for (var i in this.segments[iSegment][1]) {
            end += parseInt(this.sources[this.sKey]['manifest']['media'][this.segments[iSegment][1][i]][1]);
        }
        
        if (this.setStartCurrentTime) {
            break;
        }
        
        countSegments++;
        
        iSegment++;
    } while (true);
    
    //console.log("countSegments: "+countSegments);
    
    end -= 1;
    
    var nowsegment;
    
    var keysegment = 0;
    
    if (this.sKeyInit != this.sKey && !noinit) {
        if (!find) {
            this.sKeyInit = this.sKey;
        }
        
        if (this.sources[this.sKey]['manifest']['init'][1] == start) {
            nowsegment = {
                segment: currentSegment,
                mimeCodec: this.getMimeCodec(),
                url: this.sources[this.sKey]['url'], 
                start: parseInt(this.sources[this.sKey]['manifest']['init'][0]), 
                end: end,
                countSegments: countSegments,
                timeInterval: timeInterval,
            };
        } else {
            keysegment = segments.push({
                key: keysegment,                                
                segment: currentSegment,
                mimeCodec: this.getMimeCodec(),
                url: this.sources[this.sKey]['url'], 
                start: parseInt(this.sources[this.sKey]['manifest']['init'][0]), 
                end: parseInt(this.sources[this.sKey]['manifest']['init'][1]) - 1,
                countSegments: countSegments,
                timeInterval: timeInterval,
            });
            
            nowsegment = {
                segment: currentSegment,
                mimeCodec: this.getMimeCodec(),
                url: this.sources[this.sKey]['url'], 
                start: start, 
                end: end,
                countSegments: countSegments,
                timeInterval: timeInterval,
            };
        }
    } else {
        nowsegment = {
            segment: currentSegment,
            mimeCodec: this.getMimeCodec(),
            url: this.sources[this.sKey]['url'], 
            start: start, 
            end: end,
            countSegments: countSegments,
            timeInterval: timeInterval,
        };
    }
    
    if (parseFloat(this.segments[currentSegment][2]) - parseFloat(this.timeWaiting) < MediaStrim.loadTimeWaiting && !this.setStartCurrentTime && isRange) {
        start = parseInt(nowsegment.start);
        
        var inext = parseInt(parseInt(nowsegment.end - nowsegment.start) / parseFloat(nowsegment.timeInterval[1] - nowsegment.timeInterval[0]));
        
        //inext = 100000; // load for 100 kb
        
        do {
            if ((start + inext < nowsegment.end && nowsegment.end - (start + inext + inext) > 50) && keysegment <= MediaStrim.partRange) {
                keysegment = segments.push({
                    key: keysegment,
                    segment: nowsegment.segment,
                    mimeCodec: nowsegment.mimeCodec,
                    url: nowsegment.url, 
                    start: start, 
                    end: start + inext - 1,
                    countSegments: nowsegment.countSegments,
                    timeInterval: nowsegment.timeInterval,
                    segmentRange: true,
                });
            } else {
                keysegment = segments.push({
                    key: keysegment,
                    segment: nowsegment.segment,
                    mimeCodec: nowsegment.mimeCodec,
                    url: nowsegment.url,
                    start: start,
                    end: nowsegment.end,
                    countSegments: nowsegment.countSegments,
                    timeInterval: nowsegment.timeInterval,
                    segmentRange: true,
                    segmentRangeLast: true,
                });
                
                break;
            }
            
            start = start + inext;
        } while(true);
    } else {
        nowsegment.key = keysegment;
        keysegment = segments.push(nowsegment);
    }
    
    if (!find) {
        this.setStartCurrentTime = false;
        
        this.addLoad(segments);
    
        this.load();
    }
    
    //console.log("keysegment: "+keysegment);
    
    return segments;
};

MediaStrim.prototype.addLoad = function(segments) {
    this.iload++;
        
    var isRange = false;
    
    for (var i in segments) {
        segments[i]['keyload'] = this.iload;
        
        if (segments[i].segmentRange) {
            isRange = true;
        }
    }
    
    //console.log("addLoad: ", this.iload);
    
    this.loads[this.iload] = {
        key: this.iload,
        status: "created",
        count: 0,
        segments: segments,
        range: isRange,
    };
};

MediaStrim.prototype.load = function() {
    var iload = null;
    
    while(iload = this.getLoadKey()){
        this.loadByKey(iload);
    }
};

MediaStrim.prototype.getLoadKey = function() {
    for (var i in this.loads) {
        if (this.loads[i].segments.length == 0) {
            delete this.loads[i];
            continue;
        }
        
        if (this.loads[i].status == "pending") {
            break;
        }
        
        if (this.loads[i].status == "success") {
            delete this.loads[i];
        }
        
        if (this.loads[i].count > 5) {
            //this.reinit();
            
            //break;
        }
        
        this.loads[i].count++;
        
        return i;
    }
    
    return null;
};

MediaStrim.prototype.loadByKey = function(key) {
    var $this = this;
    
    this.loads[key].status = "pending";
    
    this.fetchRange(
        this.cloneSegments(this.loads[key].segments),
        function (iSegment, mimeCodec, chunk) {
            $this.addChuck(iSegment, mimeCodec, chunk);
        }, function (status) {
            if ($this.loads[key]) {
                $this.loads[key].status = status;
            
                if ($this.loads[key].status == "success") {
                    delete $this.loads[key];
                }
            }
        }
    );
};

MediaStrim.prototype.cloneSegments = function(segments) {
    var newsegments = [];
    
    for (var i in segments) {
        newsegments[i] = {};
        
        for (var j in segments[i]) {
            newsegments[i][j] = segments[i][j];
        }
    }
    
    return newsegments;
};

MediaStrim.prototype.fetchRange = function(segments, cb_response, cb_status, cache) {
    var $this = this;
    
    var segment = null;
    
    if (segments.length > 0) {
        segment = segments.shift();
    }
    
    if (segment) {
        var keyInterval = segment['start']+"-"+segment['end'];
        
        if ($this.dataRanges[keyInterval] && $this.dataRanges[keyInterval].status == "success") {
            //console.log("Cache Range: ", keyInterval);
            
            var response = $this.dataRanges[keyInterval].data;
            
            if (segments.length > 0) {
                if (segment.segmentRange) {
                    $this.fetchResponse(segment, response, cb_response, cb_status, cache);
                        
                    $this.fetchRange(segments, function (iSegment, mimeCodec, chunk, cache) {
                        cb_response(iSegment, mimeCodec, chunk, cache);
                    }, cb_status);
                } else {
                    $this.fetchRange(segments, function (iSegment, mimeCodec, chunk) {
                        cb_response(iSegment, mimeCodec, $this.concatSegments([new Uint8Array(response), new Uint8Array(chunk)]), cache);
                    }, cb_status);
                }
            } else {
                $this.fetchResponse(segment, response, cb_response, cb_status, cache);
            }
            
            this.sKeyInit = this.sKey;
            
            return;
        } 
        
        if (cache) {
            return;
        }
        
        if (MediaStrim.ajaxType == 'fetch' && 'fetch' in window) {
            this.xhrfetchskey++;
        
            var key = this.xhrfetchskey;
            
            this.xhrfetchs[key] = {
                ctr: new AbortController(),
                range: segments.range ? true : false
            };
            
            fetch(segment.url+(segment.url.indexOf("?")>0?"&":"?")+'bytes='+segment.start+'-'+segment.end, {
                method: 'GET',
           	    headers: {
           	        'Range': 'bytes=' + segment.start + '-' + segment.end,
                },
                signal: this.xhrfetchs[key].ctr.signal,
            }).then((response) => {
                if (response.status >= 200 && response.status < 300) {
                    return response.arrayBuffer();
                } else {
                    let error = new Error(response.statusText);
                    error.response = response;
                    throw error;
                }
            }).then((response) => {
                if (segments.length > 0) {
                    if (segment.segmentRange) {
                        $this.fetchResponse(segment, response, cb_response, cb_status);
                        
                        $this.fetchRange(segments, function (iSegment, mimeCodec, chunk) {
                            cb_response(iSegment, mimeCodec, chunk);
                        }, cb_status);
                    } else {
                        $this.fetchRange(segments, function (iSegment, mimeCodec, chunk) {
                            cb_response(iSegment, mimeCodec, $this.concatSegments([new Uint8Array(response), new Uint8Array(chunk)]));
                        }, cb_status);
                    }
                } else {
                    $this.fetchResponse(segment, response, cb_response, cb_status);
                }
                
                if ($this.xhrfetchs[key]) {
                    delete $this.xhrfetchs[key];
                }
            }).catch((e) => {
                cb_status("error");
                if ($this.xhrfetchs[key]) {
                    delete $this.xhrfetchs[key];
                }
            });
        } else {
            this.xhrskey++;
        
            var key = this.xhrskey;
        
            var xhrLoad = new XMLHttpRequest;
            
            this.xhrs[key] = {
                xhr: xhrLoad,
                range: segments.range ? true : false
            };
            
            xhrLoad.open('get', segment.url+(segment.url.indexOf("?")>0?"&":"?")+'bytes='+segment.start+'-'+segment.end, true);
            xhrLoad.responseType = 'arraybuffer';
            xhrLoad.setRequestHeader('Range', 'bytes=' + segment.start + '-' + segment.end);
            xhrLoad.addEventListener('load', function () { 
                if (segments.length > 0) {
                    if (segment.segmentRange) {
                        $this.fetchResponse(segment, xhrLoad.response, cb_response, cb_status);
                        
                        $this.fetchRange(segments, function (iSegment, mimeCodec, chunk) {
                            cb_response(iSegment, mimeCodec, chunk);
                        }, cb_status);
                    } else {
                        $this.fetchRange(segments, function (iSegment, mimeCodec, chunk) {
                            cb_response(iSegment, mimeCodec, $this.concatSegments([new Uint8Array(xhrLoad.response), new Uint8Array(chunk)]));
                        }, cb_status);
                    }
                } else {
                    $this.fetchResponse(segment, xhrLoad.response, cb_response, cb_status);
                }
            
                if ($this.xhrs[key]) {
                    delete $this.xhrs[key];
                }
            });
            xhrLoad.addEventListener('error', function () {
                cb_status("error");
                if ($this.xhrs[key]) {
                    delete $this.xhrs[key];
                }
            });
            xhrLoad.addEventListener('abort', function () {
                cb_status("abort");
                if ($this.xhrs[key]) {
                    delete $this.xhrs[key];
                }
            });
            
            xhrLoad.send();
        }
    } else {
        cb_status("success");
    }
};

MediaStrim.prototype.fetchResponse = function(segment, response, cb_response, cb_status, cache) {
    cb_response(this.currentSegment, segment.mimeCodec, response);
    
    if (segment.segmentRange) {
        if (segment.keyload >= 0) {
            if (this.loads[segment.keyload]) {
                if (segment.key >= 0) {
                    if (this.loads[segment.keyload].segments[segment.key]) {
                        delete this.loads[segment.keyload].segments[segment.key];
                    }
                }
                
                if (this.loads[segment.keyload].segments.length == 0) {
                    cb_status("success");
                }
            }
        }
    } 
    
    if (!segment.segmentRange || segment.segmentRangeLast) {
        cb_status("success");
        
        for (var i = parseInt(this.currentSegment); i < parseInt(this.currentSegment) + parseInt(segment.countSegments); i++) {
            this.segments[i][0] = true;
        }
        
        this.currentSegment = parseInt(this.currentSegment) + parseInt(segment.countSegments);
    }
    
    if (this.currentSegment > 0) {
        if (parseFloat(this.segments[this.currentSegment][2]) - parseFloat(this.timeWaiting) < MediaStrim.loadTimeWaiting) {
            this.timeLoadNext = 0;
            this.isLoadTimeWaiting = true;
        } else if (this.isLoadTimeWaiting) {
            this.timeLoadNext = 0;
            this.isLoadTimeWaiting = false;
        } else {
            this.timeLoadNext = parseFloat(parseFloat(this.segments[parseInt(this.currentSegment)-1][2]) - 
                (parseFloat(segment.timeInterval[1]) - parseFloat(segment.timeInterval[0])) * 0.9);
        }
    } else {
        this.timeLoadNext = 0;
    }
    
    //console.log("timeLoadNext: "+this.timeLoadNext+"/"+this.media.currentTime+"/"+segment.timeInterval[0]+"/"+segment.timeInterval[1]);   
    
    if (!cache) {
        if (this.getLoadKey()) {
            this.load();
        } else if (this.timeLoadNext == 0 || this.media.currentTime >= this.timeLoadNext) {
            this.checkBuffer();
        }
    }
};

MediaStrim.prototype.concatSegments = function(arrays) {
    let result = [];
    for (let i = 0; i < arrays.length; i++) {
        for (let j = 0; j < arrays[i].length; j++) {
            result.push(arrays[i][j]);
        }
    }
    return new Uint8Array(result);
}

MediaStrim.prototype.appendSegment = function(mimeCodec, chunk) {
    var $this = this;
    
    if (this.lMimeCodec != mimeCodec) {
        this.lMimeCodec = mimeCodec;
        
        if (this.sourceBuffer) {
            this.sourceBuffer.changeType(mimeCodec);
        }     
    }
    
    try {
        this.sourceBuffer.appendBuffer(chunk);
        
        this.completeupdating(function () {
            setTimeout(function () {
                $this.playControl(null, 500);
            }, 1000);
        });
    } catch (error) {
        console.error(error);
    }
    
    if (!this.canplay) {
        if (this.sourceBuffer.updating) {
            this.completeupdating(function () {
                $this.canplay = true;
            });
        } else {
            this.canplay = true;
        }
    }
};

MediaStrim.prototype.completeupdating = function(cb) {
    var $this = this;
    
    if (this.sourceBuffer && this.sourceBuffer.updating) {
        setTimeout(function () {
           $this.completeupdating(cb); 
        }, 10);
        
        return;
    }
    
    cb();
};

MediaStrim.prototype.addChuck = function(iSegment, mimeCodec, chunk) {
    this.chunks[iSegment] = {
        mimeCodec: mimeCodec,
        chunk: chunk,
    };
    
    this.appendChucks();
};

MediaStrim.prototype.appendChucks = function(chunk) {
    var $this = this;
    
    for (var i in this.chunks) {
        if (!this.chunks[i]) {
            return;
        }
        
        if (!this.sourceBuffer || this.sourceBuffer.updating) {
            setTimeout(function () {
                $this.appendChucks();
            }, 10);
            return;
        }
        
        this.appendSegment(this.chunks[i].mimeCodec, this.chunks[i].chunk);
        delete this.chunks[i];
    }
};

MediaStrim.prototype.checkBuffer = function(_) {
    var $this = this;
    
    if (this.currentSegment >= this.sources[this.sKey]['manifest']['media'].length && this.haveAllSegments()) {
        //console.log('last segment', this.mediaSource.readyState);
        this.mediaSource.endOfStream();
    } else if (this.shouldFetchNextSegment()) {
        //console.log('time to fetch next chunk', this.media.currentTime);
        
        $this.fetchNextRange();
    }
};

MediaStrim.prototype.seeking = function(e) {
    var $this = this;
    
    this.timeSeeking = Date.now();
    this.seek = true;
    
    this.countFetch = 0;
        
    //console.log("seeking");
    if (this.mediaSource.readyState === 'open') {
        this.timeWaiting = this.media.currentTime;
        
        for (var i in this.xhrs) {
            if (this.xhrs[i].range) {
                continue;
            }
            
            if (this.xhrs[i].xhr) {
                this.xhrs[i].xhr.abort();
            }
            
            delete this.xhrs[i];
        }
        
        for (var i in this.xhrfetchs) {
            if (this.xhrfetchs[i].range) {
                continue;
            }
            
            if (this.xhrfetchs[i]) {
                this.xhrfetchs[i].ctr.abort();
            }
            
            delete this.xhrfetchs[i];
        }
        
        for (var i in this.loads) {
            if (!this.loads[i].range) {
                delete this.loads[i];
            }
        }
        
        this.chunks = {};
        
        if (this.sourceBuffer) {
            if (!this.sourceBuffer.updating) {
                this.sourceBuffer.remove(0, this.media.duration);
            }
            
            if (MediaStrim.userBrowser == "firefox") {
                
            } else {
                this.sourceBuffer.abort();
            }
        }
        
        
        for (var i in this.segments) {
            this.segments[i][0] = false;
        }
        
        var currentTime = this.currentTime;
        
        for (var i in this.segments) {
            if (parseFloat(this.segments[i][2]) > parseFloat(this.media.currentTime)) {
                break;
            }
            currentTime = parseFloat(this.segments[i][2]);
            this.currentSegment = i;
        }
        
        this.timeLoadNext = 0;
        
        //console.log("seeking: ", currentTime, "/", this.currentTime, "/", this.media.currentTime);
        
        if (MediaStrim.userBrowser == "firefox") {
            
        } else {
            this.sourceBuffer.timestampOffset = currentTime;
        }
    } else {
        console.log('seek but not open?');
        console.log(this.mediaSource.readyState);
    }
    
    if (this.isSeekSet) {
        this.isSeekSet = false;
        
        $this.seeked();
    } else {
        this.completeSeeking(function () {
            if ($this.seek) {
                $this.seeked();
            }
    });
    }
};

MediaStrim.prototype.completeSeeking = function(cb, recurse) {
    var $this = this;
    
    if (this.startCompleteSeeking && !recurse) {
        return;
    }
    
    this.startCompleteSeeking = true;
    
    if (Date.now() - this.timeSeeking < MediaStrim.loadSeekTime) {
        setTimeout(function () {
           $this.completeSeeking(cb, true); 
        }, 50);
        
        return;
    }
    
    cb();
    
    this.startCompleteSeeking = false;
};

MediaStrim.prototype.seeked = function(e) {
    var $this = this;
    
    this.seek = false;
    
    //console.log("seeked");
    
    if (this.mediaSource.readyState === 'open') {
        this.checkBuffer(e);
                
        this.play();
        
        //console.log("MediaSource readyState: ", this.mediaSource.readyState);
    } else {
        console.log('seek but not open?');
        console.log(this.mediaSource.readyState);
    }
};

MediaStrim.prototype.haveAllSegments = function() {
    for (var i in this.segments) {
        if (!this.segments[i][0]) {
            return false;
        }
    }
    
    return true;
};

MediaStrim.prototype.shouldFetchNextSegment = function() {
    if (this.currentSegment >= 0 && this.currentSegment < this.segments.length) {
        if (this.media.currentTime >= this.timeLoadNext) {
            return true;
        }   
    }
    
    return false;
};

MediaStrim.randomString = function(lenString) {  
    if (!lenString) {
        lenString = 7;
    }
    
    var characters = "ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
    
    var randomstring = '';  
  
    for (var i=0; i < lenString; i++) {  
        var rnum = Math.floor(Math.random() * characters.length);  
        randomstring += characters.substring(rnum, rnum+1);  
    }  
  
    return randomstring;  
};

MediaStrim.httpBuildQuery = function (obj, num_prefix, temp_key) {

    var output_string = []

    Object.keys(obj).forEach(function (val) {

        var key = val;

        num_prefix && !isNaN(key) ? key = num_prefix + key : ''

        var key = encodeURIComponent(key.replace(/[!'()*]/g, escape));
        temp_key ? key = temp_key + '[' + key + ']' : ''

        if (typeof obj[val] === 'object') {
            var query = MediaStrim.httpBuildQuery(obj[val], null, key)
            output_string.push(query)
        } else {
            var value = String(obj[val]);

            value = encodeURIComponent(value.replace(/[!'()*]/g, escape));

            output_string.push(key + '=' + value)
        }

    })

    return output_string.join('&')
}
