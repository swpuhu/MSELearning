let video = document.createElement('video');
video.controls = true;
document.body.appendChild(video);
video.width = 640;
video.height = 360;

function ajax(url, method = 'GET', type) {
    return new Promise((resolve, reject) => {
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === xhr.DONE) {
                if (xhr.status <= 304 && xhr.status >= 200) {
                    resolve(xhr.response);
                }
            }
        }
        xhr.open(method, url);
        if (type) {
            xhr.responseType = type;
        }
        xhr.send();
    });
}

let currentByteLength = 0;
ajax('http://localhost:3001/assets/video1/video1.dash').then(data => {
    let config = {};
    config.baseURL = 'http://localhost:3001/assets/video1/';
    let domParser = new DOMParser();
    let dom = domParser.parseFromString(data, 'text/xml');
    let root = dom.querySelector('MPD');
    config.type = root.getAttribute('type');
    config.duration = 49 * 60 + 5.4;
    
    let representation = root.querySelector('Representation');
    let mimeType = representation.getAttribute('mimeType');
    let codecs = representation.getAttribute('codecs');
    let id = representation.getAttribute('id');
    config.mimeType = mimeType;
    config.codecs = codecs;
    config.id = id;
    config.maxBufferSize = 50 * 1024 * 1024;
    config.maxBufferTime = 60;

    let segmentTemplate = representation.querySelector('SegmentTemplate');
    let timescale = segmentTemplate.getAttribute('timescale');
    let initFile = segmentTemplate.getAttribute('initialization');
    let media = segmentTemplate.getAttribute('media');
    let timeline = segmentTemplate.querySelector('SegmentTimeline');
    let startNumber = segmentTemplate.getAttribute('startNumber');
    // startNumber = 100;
    let maxChunk = 0;
    for (let i = 0; i < timeline.children.length; i++) {
        let item = timeline.children[i];
        let r = item.getAttribute('r');
        let chunk = 1;
        if (r) {
            chunk += +r;
        }
        maxChunk += chunk;
    }
    let template = {
        timescale, initFile, media, maxChunk, startNumber,
        occupiedChar: 0,
        occupiedNums: 5
    };
    config.template = template;
    
    console.log(config);

    let mediaSource = new MediaSource();
    window.mediaSource = mediaSource;
    let url = URL.createObjectURL(mediaSource);
    video.src = url;
    mediaSource.onsourceopen = function () {
        URL.revokeObjectURL(url);
        let type = config.mimeType + ';codecs=' + config.codecs;
        let sourceBuffer = mediaSource.addSourceBuffer(type);
        if (MediaSource.isTypeSupported(type)) {
            sourceBuffer.onupdateend = function (e) {
                nextSegment(config, sourceBuffer);
            }
            initVideo(config, sourceBuffer);
            
            mediaSource.duration = config.duration;
            
        }
    }

    video.onseeking = function () {
        console.log('seeking');
    }

    video.onseeked = function () {
        console.log('seeked');
    }
});


/**
 * 
 * @param {Object} config 
 * @param {SourceBuffer} sourceBuffer 
 */
function initVideo(config, sourceBuffer) {
    let template = config.template;
    let initFile = template.initFile.replace('$RepresentationID$', config.id);
    ajax(config.baseURL + initFile, 'GET', 'arraybuffer').then(res => {
        sourceBuffer.appendBuffer(res);
    })
}

function nextSegment(config, sourceBuffer) {
    let chunk = config.template.media.replace('$RepresentationID$', config.id).replace(/\$Number%.*\$/, function ($0) {
        let currentChunk = config.template.startNumber.toString();
        while (currentChunk.length < config.template.occupiedNums) {
            currentChunk = config.template.occupiedChar + currentChunk;
        }
        return currentChunk;
    });
    ajax(config.baseURL + chunk, 'GET', 'arraybuffer').then(res => {
        config.template.startNumber++;
        currentByteLength += res.byteLength;
        if (sourceBuffer.buffered.length === 0 || sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1) - sourceBuffer.buffered.start(sourceBuffer.buffered.length - 1) < config.maxBufferTime) {
            sourceBuffer.appendBuffer(res);
        }
        // if (currentByteLength < config.maxBufferSize) {
        //     sourceBuffer.appendBuffer(res);
        // }
    })
}