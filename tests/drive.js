/* Loaded AFTER the app. Drives the real UI with real events and reports JSON. */
(function () {
  var R = [], errors = [], S = window.__spy;
  window.addEventListener('error', function (e) { errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function (e) {
    errors.push('rejection: ' + ((e.reason && e.reason.message) || e.reason));
  });

  function $(id) { return document.getElementById(id); }
  function ok(name, cond, detail) { R.push({ name: name, pass: !!cond, detail: String(detail === undefined ? '' : detail) }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function vis(el) { return el && !el.classList.contains('hidden'); }
  async function waitFor(fn, ms) {
    var t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(60); }
    return false;
  }
  function ty() {
    var m = /translateY\(([-0-9.]+)px\)/.exec($('content').style.transform || '');
    return m ? parseFloat(m[1]) : NaN;
  }
  function pointer(type, y, id) {
    $('content').dispatchEvent(new PointerEvent(type, {
      clientX: 200, clientY: y, pointerId: id === undefined ? 1 : id,
      bubbles: true, cancelable: true, isPrimary: id === undefined || id === 1
    }));
  }
  function key(k) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  }
  var lastMR = function () { return S.mr.length ? S.mr[S.mr.length - 1] : null; };

  async function run() {
    // ---------- boot ----------
    ok('boot: setup screen visible', vis($('setup')));
    ok('boot: stage hidden', !vis($('stage')));
    ok('boot: word count computed', /\d+ words/.test($('statWords').textContent), $('statWords').textContent);
    ok('boot: duration estimated', $('statTime').textContent.indexOf('≈') === 0, $('statTime').textContent);
    ok('boot: secure context (camera allowed)', window.isSecureContext === true);
    ok('boot: Record toggle enabled on https', $('recChk').disabled === false);
    ok('boot: MediaRecorder present', !!window.MediaRecorder);

    // ---------- camera ----------
    $('recChk').click();
    var camUp = await waitFor(function () { return vis($('camPrevWrap')) && $('camPrev').srcObject; }, 8000);
    ok('camera: preview appears after enabling Record', camUp);
    ok('camera: getUserMedia was called', S.gum.length > 0, JSON.stringify(S.gum[0] || {}));
    if (S.gum.length) {
      var c = S.gum[0];
      ok('camera: requests 1080p ideal', c.video && c.video.width && c.video.width.ideal === 1920 && c.video.height.ideal === 1080, JSON.stringify(c.video));
      ok('camera: audio echoCancellation on (PLAN gotcha)', !!(c.audio && c.audio.echoCancellation === true));
      ok('camera: audio noiseSuppression on (PLAN gotcha)', !!(c.audio && c.audio.noiseSuppression === true));
    }
    var st = $('camPrev').srcObject;
    ok('camera: stream has video track', st && st.getVideoTracks().length === 1);
    ok('camera: stream has audio track', st && st.getAudioTracks().length === 1);
    var optsAtReveal = $('camSel').options.length;
    var listed = await waitFor(function () { return $('camSel').options.length >= 1; }, 5000);
    ok('camera: device list populated', listed, $('camSel').options.length + ' option(s)');
    ok('camera: dropdown is not empty when the row first appears', optsAtReveal >= 1,
       optsAtReveal + ' at reveal, ' + $('camSel').options.length + ' shortly after');
    ok('camera: Roll button relabelled', /record/i.test($('startBtn').textContent), $('startBtn').textContent);
    var vt = st && st.getVideoTracks()[0];
    var s0 = (vt && vt.getSettings) ? vt.getSettings() : {};
    var expectMirror = s0.facingMode !== 'environment';
    ok('camera: preview mirror follows facingMode', $('camPrev').classList.contains('mirror') === expectMirror,
       'facingMode=' + s0.facingMode + ' mirrored=' + $('camPrev').classList.contains('mirror'));
    ok('camera: negotiated 1080p', s0.width === 1920 && s0.height === 1080, s0.width + 'x' + s0.height);
    ok('persist: tp.rec saved', localStorage.getItem('tp.rec') === '1');

    // ---------- roll ----------
    $('startBtn').click();
    await waitFor(function () { return vis($('stage')); }, 5000);
    ok('roll: stage opened', vis($('stage')) && !vis($('setup')));
    ok('roll: countdown shown', vis($('countdown')), $('cdNum').textContent);
    ok('roll: pip shown', vis($('pip')));
    ok('roll: fullscreen attempted', S.fullscreen > 0);
    $('stage').click();
    ok('roll: tap skips countdown', !vis($('countdown')));

    var recUp = await waitFor(function () { return vis($('recBadge')); }, 4000);
    ok('record: REC badge appears', recUp);
    ok('record: Stop button appears', vis($('stopBtn')));
    ok('record: pip shrinks while recording', $('pip').classList.contains('rec'));
    ok('record: badge is not the NOT RECORDING warning', !$('recBadge').classList.contains('warn'), $('recTime').textContent);

    var mr = lastMR();
    ok('record: MediaRecorder constructed', !!mr);
    if (mr) {
      ok('record: 8 Mbps requested', mr.opts && mr.opts.videoBitsPerSecond === 8000000, JSON.stringify(mr.opts));
      ok('record: timeslice 1000ms (survives a crash)', mr.timeslice === 1000, String(mr.timeslice));
      ok('record: state is recording', mr.inst.state === 'recording', mr.inst.state);
      ok('record: recording 1 video + 1 audio track', mr.videoTracks === 1 && mr.audioTracks === 1);
      ok('record: mime chosen', !!mr.inst.mimeType, mr.inst.mimeType);
    }
    ok('record: isTypeSupported fallback chain used (PLAN gotcha)', S.mimeQueries.length > 0,
       S.mimeQueries.map(function (q) { return q.type.split(';')[0] + '=' + q.supported; }).join(' '));

    // ---------- scrolling ----------
    var a = ty();
    await sleep(1400);
    var b = ty();
    ok('scroll: text advances while rolling', b < a - 20, a + ' -> ' + b);

    // ---------- THE key M4 behaviour ----------
    $('stage').click();
    var c1 = ty();
    await sleep(1100);
    var c2 = ty();
    ok('pause: tap freezes the scroll', Math.abs(c2 - c1) < 1, c1 + ' -> ' + c2);
    ok('pause: recording KEEPS running (ad-lib)', mr && mr.inst.state === 'recording', mr && mr.inst.state);
    ok('pause: REC badge still visible', vis($('recBadge')));
    ok('pause: toast says still recording', /still recording/i.test($('toast').textContent), $('toast').textContent);

    // regression: missing the HUD buttons used to silently resume the scroll
    document.querySelector('#hud .grow').click();
    await sleep(500);
    ok('hud: clicking HUD chrome does not resume the scroll', Math.abs(ty() - c2) < 1, 'still ' + ty());

    // regression: a tap with thumb drift under the slop must still toggle
    pointer('pointerdown', 500); pointer('pointermove', 510); pointer('pointerup', 510);
    $('stage').click();
    await sleep(400);
    var afterWobble = ty();
    await sleep(500);
    ok('tap: 10px thumb drift still counts as a tap, not a scrub', ty() < afterWobble - 10,
       afterWobble + ' -> ' + ty() + ' (resumed)');

    $('stage').click();
    await sleep(300);
    var t3 = ty();

    // regression: a second finger must not rewrite the drag origin and teleport
    pointer('pointerdown', 600, 1);
    pointer('pointerdown', 200, 2);
    pointer('pointermove', 590, 1);
    var jumped = Math.abs(ty() - t3);
    pointer('pointerup', 590, 1); pointer('pointerup', 200, 2);
    ok('multitouch: second finger cannot teleport the script', jumped < 60, 'moved ' + jumped.toFixed(0) + 'px');

    // regression: a dragged pip must be pulled back on screen after a fold/rotate
    $('pip').style.left = '9999px'; $('pip').style.top = '9999px';
    window.dispatchEvent(new Event('resize'));
    await sleep(120);
    ok('pip: re-clamped on viewport change', parseFloat($('pip').style.left) < window.innerWidth,
       'left=' + $('pip').style.left);

    $('stage').click();
    await sleep(900);
    ok('resume: scroll continues after second tap', ty() < c2 - 10, c2 + ' -> ' + ty());
    ok('record: elapsed badge is ticking', $('recTime').textContent !== '0:00', $('recTime').textContent);

    // ---------- drag to scrub ----------
    var d0 = ty();
    pointer('pointerdown', 600); pointer('pointermove', 560); pointer('pointermove', 400);
    var d1 = ty();
    pointer('pointerup', 400);
    ok('drag: swiping up scrubs forward', d1 < d0 - 150, d0 + ' -> ' + d1);
    await sleep(500);
    ok('drag: scrolling auto-resumes after scrub', ty() < d1, d1 + ' -> ' + ty());

    // ---------- keyboard / pedal ----------
    key(' ');
    var k1 = ty(); await sleep(600);
    ok('keys: space pauses', Math.abs(ty() - k1) < 1);
    key('Home');
    ok('keys: Home returns to top', ty() === 0, ty());
    key(' ');

    // ---------- speed control + slider sync ----------
    var sBefore = $('speedLabel').textContent;
    $('fastBtn').click();
    ok('speed: + button changes speed', $('speedLabel').textContent !== sBefore, sBefore + ' -> ' + $('speedLabel').textContent);
    ok('speed: change is persisted', localStorage.getItem('tp.speed') !== null, localStorage.getItem('tp.speed'));
    var liveSpeed = parseInt($('speedLabel').textContent, 10);
    ok('speed: setup slider stays in sync with live speed',
       parseInt($('speedRange').value, 10) === liveSpeed && parseInt($('speedOut').textContent, 10) === liveSpeed,
       'live=' + liveSpeed + ' slider=' + $('speedRange').value + ' out=' + $('speedOut').textContent);

    // ---------- size mid-read keeps place ----------
    await sleep(400);
    var beforePct = parseFloat($('progressFill').style.width) || 0;
    $('sizeUpBtn').click();
    var afterPct = parseFloat($('progressFill').style.width) || 0;
    ok('size: A+ keeps reading position', Math.abs(afterPct - beforePct) < 3,
       beforePct.toFixed(1) + '% -> ' + afterPct.toFixed(1) + '%');

    // ---------- stop & save ----------
    var blobsBefore = S.blobs.length;
    $('stopBtn').click();
    var saved = await waitFor(function () { return S.blobs.length > blobsBefore; }, 12000);
    ok('save: a file blob was produced', saved);
    if (saved) {
      var bl = S.blobs[S.blobs.length - 1];
      ok('save: blob is non-empty', bl.size > 10000, bl.size + ' bytes, ' + bl.type);
      var dl = S.downloads[S.downloads.length - 1];
      ok('save: download triggered', !!dl, dl && dl.name);
      ok('save: filename is take-YYYY-MM-DD-HHMMSS.(webm|mp4)',
         !!dl && /^take-\d{4}-\d{2}-\d{2}-\d{6}\.(webm|mp4)$/.test(dl.name), dl && dl.name);
      ok('save: extension matches recorded mime',
         !!dl && !!bl && ((bl.type.indexOf('mp4') >= 0) === /\.mp4$/.test(dl.name)), (bl && bl.type) + ' / ' + (dl && dl.name));
    }
    ok('stop: recorder inactive', mr && mr.inst.state === 'inactive', mr && mr.inst.state);
    ok('stop: chunks were flushed', mr && mr.chunkCount > 0, mr && (mr.chunkCount + ' chunks, ' + mr.chunkBytes + ' bytes'));
    ok('stop: returned to setup screen', vis($('setup')) && !vis($('stage')));
    ok('stop: REC badge hidden', !vis($('recBadge')));

    var stillLive = st && st.getVideoTracks()[0] && st.getVideoTracks()[0].readyState === 'live';
    ok('after: camera stays ready for another take', stillLive, st && st.getVideoTracks()[0] && st.getVideoTracks()[0].readyState);
    ok('after: script persisted', !!localStorage.getItem('tp.script'));
    ok('after: size persisted', localStorage.getItem('tp.size') !== null, 'size=' + localStorage.getItem('tp.size'));

    // ---------- second take ----------
    var mrCountBefore = S.mr.length;
    $('startBtn').click();
    await waitFor(function () { return vis($('stage')); }, 5000);
    $('stage').click();
    await waitFor(function () { return vis($('recBadge')); }, 4000);
    await sleep(1500);
    var mr2 = lastMR();
    ok('take2: a fresh recorder was created', S.mr.length === mrCountBefore + 1);
    ok('take2: second take records', mr2 && mr2.inst.state === 'recording', mr2 && mr2.inst.state);
    var blobs2 = S.blobs.length;
    $('stopBtn').click();
    var saved2 = await waitFor(function () { return S.blobs.length > blobs2; }, 12000);
    ok('take2: second file saved', saved2, saved2 ? S.blobs[S.blobs.length - 1].size + ' bytes' : '');
    ok('take2: no chunk bleed from take 1', !mr2 || (mr2.chunkBytes > 0 && mr2.chunkBytes !== (mr && mr.chunkBytes)), mr2 && mr2.chunkBytes);
    var names = S.downloads.map(function (d) { return d.name; });
    ok('take2: two takes in one minute get distinct filenames',
       names.length >= 2 && names[names.length - 1] !== names[names.length - 2], names.join(' , '));

    // ---------- exiting mid-take must still save ----------
    var blobs3 = S.blobs.length;
    $('startBtn').click();
    await waitFor(function () { return vis($('stage')); }, 5000);
    $('stage').click();
    await waitFor(function () { return vis($('recBadge')); }, 4000);
    await sleep(1200);
    $('exitBtn').click();
    var saved3 = await waitFor(function () { return S.blobs.length > blobs3; }, 12000);
    ok('exit: closing mid-take still saves the footage', saved3,
       saved3 ? S.blobs[S.blobs.length - 1].size + ' bytes' : 'FOOTAGE LOST');
    ok('exit: returned to setup', vis($('setup')) && !vis($('stage')));

    // ---------- DESTRUCTIVE: camera dies mid-take ----------
    var blobs4 = S.blobs.length;
    $('startBtn').click();
    await waitFor(function () { return vis($('stage')); }, 5000);
    $('stage').click();
    await waitFor(function () { return vis($('recBadge')); }, 4000);
    await sleep(1200);
    $('camPrev').srcObject.getVideoTracks()[0].dispatchEvent(new Event('ended'));
    var saved4 = await waitFor(function () { return S.blobs.length > blobs4; }, 12000);
    ok('camera-loss: partial take is saved, not lost', saved4,
       saved4 ? S.blobs[S.blobs.length - 1].size + ' bytes' : 'FOOTAGE LOST');
    await sleep(400);
    ok('camera-loss: badge switches to NOT RECORDING', /NOT RECORDING/.test($('recTime').textContent), $('recTime').textContent);
    ok('camera-loss: Stop button no longer claims a live take', !vis($('stopBtn')));
    var tickA = $('recTime').textContent;
    await sleep(1200);
    ok('camera-loss: elapsed timer stopped ticking', $('recTime').textContent === tickA, tickA);
    $('exitBtn').click();
    await sleep(300);

    // ---------- DESTRUCTIVE: Roll with Record armed but no live stream ----------
    $('camPrev').srcObject.getTracks().forEach(function (t) { t.stop(); });
    var blobs5 = S.blobs.length;
    $('startBtn').click();
    await waitFor(function () { return vis($('stage')); }, 5000);
    $('stage').click();
    await sleep(900);
    ok('no-stream: warns loudly instead of rolling silently',
       vis($('recBadge')) && /NOT RECORDING/.test($('recTime').textContent), $('recTime').textContent);
    ok('no-stream: no phantom recorder was created', S.blobs.length === blobs5);
    ok('no-stream: prompter still scrolls', ty() < -10, 'ty=' + ty());
    $('exitBtn').click();
    await sleep(200);

    // ---------- empty script ----------
    $('script').value = '';
    $('script').dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(700);
    ok('empty: shows 0 words', /^0 words/.test($('statWords').textContent), $('statWords').textContent);
    ok('empty: does not time the placeholder', $('statTime').textContent === '—', $('statTime').textContent);
  }

  function post() {
    ok('console: no uncaught JS errors', errors.length === 0, errors.join(' | '));
    fetch('/__result', {
      method: 'POST',
      body: JSON.stringify({
        results: R, errors: errors,
        spy: {
          gum: S.gum, gumErrors: S.gumErrors, mimeQueries: S.mimeQueries,
          blobs: S.blobs, downloads: S.downloads,
          recorders: S.mr.map(function (m) {
            return { opts: m.opts, mime: m.inst.mimeType, timeslice: m.timeslice,
                     events: m.events, chunks: m.chunkCount, bytes: m.chunkBytes, state: m.inst.state };
          }),
          wakeLock: S.wakeLock, fullscreen: S.fullscreen, enumerate: S.enumerate
        }
      })
    });
  }

  window.addEventListener('load', function () {
    setTimeout(function () {
      run().then(post, function (e) {
        R.push({ name: 'HARNESS CRASHED', pass: false, detail: (e && e.stack) || String(e) });
        post();
      });
    }, 300);
  });
})();
