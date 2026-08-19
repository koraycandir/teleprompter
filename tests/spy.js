/* Loaded BEFORE the app's own script. Instruments the browser APIs the app uses
   so the driver can assert on what the app actually asked for, not just on what
   the UI looks like. Must never change behaviour — every hook passes through. */
(function () {
  var S = (window.__spy = {
    gum: [], gumErrors: [], mimeQueries: [], mr: [], blobs: [], downloads: [],
    enumerate: 0, wakeLock: 0, fullscreen: 0
  });

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    var realGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (c) {
      S.gum.push(JSON.parse(JSON.stringify(c || {})));
      return realGum(c).catch(function (e) { S.gumErrors.push(String(e && e.name)); throw e; });
    };
  }
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    var realEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = function () { S.enumerate++; return realEnum(); };
  }

  var RealMR = window.MediaRecorder;
  if (RealMR) {
    var Spy = function (stream, opts) {
      var inst = new RealMR(stream, opts);
      var rec = {
        opts: opts ? JSON.parse(JSON.stringify(opts)) : null,
        timeslice: null, events: [], chunkCount: 0, chunkBytes: 0,
        videoTracks: stream ? stream.getVideoTracks().length : 0,
        audioTracks: stream ? stream.getAudioTracks().length : 0,
        inst: inst
      };
      S.mr.push(rec);
      var rStart = inst.start.bind(inst);
      inst.start = function (ts) { rec.timeslice = ts === undefined ? null : ts; rec.events.push('start'); return rStart(ts); };
      var rStop = inst.stop.bind(inst);
      inst.stop = function () { rec.events.push('stop:' + inst.state); return rStop(); };
      inst.addEventListener('dataavailable', function (e) {
        rec.chunkCount++; if (e.data) rec.chunkBytes += e.data.size;
      });
      inst.addEventListener('error', function (e) { rec.events.push('error:' + (e && e.name)); });
      inst.addEventListener('stop', function () { rec.events.push('stopped'); });
      return inst; // returning an object from a constructor hands the app the real instance
    };
    Spy.isTypeSupported = function (t) {
      var r = RealMR.isTypeSupported(t);
      S.mimeQueries.push({ type: t, supported: r });
      return r;
    };
    window.MediaRecorder = Spy;
  }

  var realCOU = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (o) {
    if (o instanceof Blob) S.blobs.push({ size: o.size, type: o.type });
    return realCOU(o);
  };
  var realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download')) S.downloads.push({ name: this.getAttribute('download') });
    return realClick.apply(this, arguments);
  };

  if (navigator.wakeLock && navigator.wakeLock.request) {
    var realWL = navigator.wakeLock.request.bind(navigator.wakeLock);
    navigator.wakeLock.request = function (t) { S.wakeLock++; return realWL(t); };
  }
  var realFS = Element.prototype.requestFullscreen;
  if (realFS) {
    Element.prototype.requestFullscreen = function () { S.fullscreen++; return realFS.apply(this, arguments); };
  }
})();
