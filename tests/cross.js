/* Cross-engine QA: runs the app in Chromium (= Android Chrome) and WebKit (= Safari family).
 *
 *   node tests/cross.js
 *
 * Chromium gets a fake camera and runs a real record/save cycle.
 * WebKit has no fake camera on Linux, so it runs a capability probe: which APIs the
 * app depends on actually exist there. That is what catches iPhone breakage.
 *
 * Caveat printed in the output: Playwright's WebKit is not iOS Safari. It shares the
 * engine core, so missing-API findings are real, but iOS adds restrictions of its own.
 */
const { chromium, webkit } = require('/home/kcandir/.npm/_npx/705bc6b22212b352/node_modules/playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const APP = path.dirname(__dirname);
const PORT = 8399;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/__result') {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => { server.lastResult = body; res.writeHead(204); res.end(); });
    return;
  }
  let file = url === '/' ? '/index.html' : url;
  const full = path.join(APP, file);
  if (!full.startsWith(APP) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); res.end('nope'); return;
  }
  const ext = path.extname(full);
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json',
                  '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(full));
});

const PROBE = () => {
  const canvas = document.createElement('canvas');
  const mimes = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
  ];
  const a = document.createElement('a');
  const out = {
    ua: navigator.userAgent,
    secureContext: window.isSecureContext,
    getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    enumerateDevices: !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices),
    MediaRecorder: typeof window.MediaRecorder,
    isTypeSupported: !!(window.MediaRecorder && typeof MediaRecorder.isTypeSupported === 'function'),
    supportedMimes: {},
    canvasCaptureStream: typeof canvas.captureStream === 'function',
    MediaStreamCtor: typeof window.MediaStream === 'function',
    requestFullscreen: typeof document.documentElement.requestFullscreen === 'function',
    webkitEnterFullscreen: typeof document.createElement('video').webkitEnterFullscreen === 'function',
    wakeLock: !!(navigator.wakeLock && navigator.wakeLock.request),
    downloadAttr: 'download' in a,
    share: typeof navigator.share === 'function',
    canShare: typeof navigator.canShare === 'function',
    serviceWorker: 'serviceWorker' in navigator,
    pointerEvents: typeof window.PointerEvent === 'function',
    localStorage: (function () { try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); return true; } catch (e) { return false; } })(),
    permissionsQuery: !!(navigator.permissions && navigator.permissions.query),
    aspectRatioCSS: CSS.supports('aspect-ratio', '9/16'),
    safeAreaCSS: CSS.supports('padding', 'env(safe-area-inset-top)'),
    textWrapPretty: CSS.supports('text-wrap', 'pretty'),
    // app-level state
    appRecordDisabled: document.getElementById('recChk').disabled,
    appShowsBadUrl: !document.getElementById('badurl').classList.contains('hidden'),
    appJsErrors: window.__errs || []
  };
  if (window.MediaRecorder && typeof MediaRecorder.isTypeSupported === 'function') {
    mimes.forEach(m => { out.supportedMimes[m] = MediaRecorder.isTypeSupported(m); });
  }
  // Does a real finger-tap reach the toggle?
  const inp = document.getElementById('recChk');
  const r = inp.parentElement.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  out.switchHitTarget = hit ? hit.tagName + '.' + (hit.className || '') : 'NOTHING';
  const before = inp.checked;
  if (hit && !inp.disabled) hit.click();
  out.switchTogglesByTap = inp.checked !== before;
  if (inp.checked !== before) hit.click();
  return out;
};

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const base = `http://127.0.0.1:${PORT}`;
  const report = {};

  // ---------- WebKit: capability probe (optional — needs system libs) ----------
  try {
    const b = await webkit.launch();
    const ctx = await b.newContext({
      viewport: { width: 430, height: 932 },          // iPhone Pro Max class
      deviceScaleFactor: 3, isMobile: true, hasTouch: true
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.addInitScript(() => { window.__errs = []; window.addEventListener('error', e => window.__errs.push(e.message)); });
    await p.goto(base + '/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    report.webkit = await p.evaluate(PROBE);
    report.webkit.pageErrors = errs;
    await b.close();
  } catch (e) {
    report.webkit = null;
    report.webkitError = String(e.message).split('\n')[0];
  }

  // ---------- Chromium: capability probe + full recording run ----------
  {
    const b = await chromium.launch({
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
             '--autoplay-policy=no-user-gesture-required']
    });
    const ctx = await b.newContext({
      viewport: { width: 412, height: 915 },          // Fold outer-screen class
      deviceScaleFactor: 2.6, isMobile: true, hasTouch: true,
      permissions: ['camera', 'microphone']
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.addInitScript(() => { window.__errs = []; window.addEventListener('error', e => window.__errs.push(e.message)); });
    await p.goto(base + '/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    report.chromium = await p.evaluate(PROBE);
    report.chromium.pageErrors = errs;

    // Real record cycle with a genuine tap on the switch.
    const rec = await p.evaluate(async () => {
      const $ = id => document.getElementById(id);
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const tap = el => { const r = el.getBoundingClientRect();
        const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (h) h.click(); return h; };
      const out = {};
      const blobs = [];
      const realCOU = URL.createObjectURL.bind(URL);
      URL.createObjectURL = o => { if (o instanceof Blob) blobs.push({ size: o.size, type: o.type }); return realCOU(o); };
      const dls = [];
      const realClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.hasAttribute('download')) dls.push(this.getAttribute('download'));
        return realClick.apply(this, arguments);
      };

      if (!$('recChk').checked) tap($('recChk').parentElement);
      for (let i = 0; i < 100 && !$('camPrev').srcObject; i++) await sleep(100);
      out.gotStream = !!$('camPrev').srcObject;
      if (out.gotStream) {
        const s = $('camPrev').srcObject.getVideoTracks()[0].getSettings();
        out.streamSize = s.width + 'x' + s.height;
      }
      $('startBtn').click();
      await sleep(300);
      $('stage').click();                       // skip countdown
      for (let i = 0; i < 60 && $('recBadge').classList.contains('hidden'); i++) await sleep(100);
      out.recBadgeShown = !$('recBadge').classList.contains('hidden');
      out.recBadgeText = $('recTime').textContent;
      await sleep(2500);
      out.tickedTo = $('recTime').textContent;
      $('stopBtn').click();
      for (let i = 0; i < 150 && !blobs.length; i++) await sleep(100);
      out.blobs = blobs;
      out.downloads = dls;
      out.backOnSetup = !$('setup').classList.contains('hidden');
      return out;
    });
    report.chromiumRecording = rec;
    await b.close();
  }

  fs.writeFileSync(path.join(__dirname, '.artifacts', 'cross-report.json'), JSON.stringify(report, null, 2));

  // ---------- print ----------
  const mark = v => (v === true ? 'yes' : v === false ? 'NO' : String(v));
  const rows = [
    'secureContext', 'getUserMedia', 'MediaRecorder', 'isTypeSupported', 'canvasCaptureStream',
    'MediaStreamCtor', 'requestFullscreen', 'webkitEnterFullscreen', 'wakeLock', 'downloadAttr',
    'share', 'canShare', 'serviceWorker', 'pointerEvents', 'permissionsQuery', 'localStorage',
    'aspectRatioCSS', 'safeAreaCSS', 'textWrapPretty', 'switchTogglesByTap', 'appRecordDisabled'
  ];
  console.log('\n' + '='.repeat(78));
  console.log('CROSS-ENGINE QA   Chromium = Android Chrome   WebKit = Safari/iOS family');
  console.log('='.repeat(78));
  console.log('  ' + 'capability'.padEnd(26) + 'Chromium'.padEnd(16) + 'WebKit');
  console.log('  ' + '-'.repeat(70));
  rows.forEach(k => {
    const c = mark(report.chromium[k]);
    const w = report.webkit ? mark(report.webkit[k]) : 'n/a';
    const flag = (report.webkit && c !== w) ? '   <-- differs' : '';
    console.log('  ' + k.padEnd(26) + c.padEnd(16) + w + flag);
  });

  console.log('\n  RECORDING FORMATS');
  const allM = new Set([...Object.keys(report.chromium.supportedMimes),
    ...(report.webkit ? Object.keys(report.webkit.supportedMimes) : [])]);
  allM.forEach(m => {
    const w = report.webkit ? String(report.webkit.supportedMimes[m]) : 'n/a';
    console.log('  ' + m.padEnd(42) + String(report.chromium.supportedMimes[m]).padEnd(8) + w);
  });
  if (!report.webkit) console.log('\n  WebKit could not launch here: ' + report.webkitError +
    '\n  (missing system libs) — the iPhone column must be verified on the device.');

  console.log('\n  CHROMIUM LIVE RECORDING RUN');
  const r = report.chromiumRecording;
  console.log('    stream acquired : ' + r.gotStream + '  ' + (r.streamSize || ''));
  console.log('    REC badge shown : ' + r.recBadgeShown + '  (' + r.recBadgeText + ' -> ' + r.tickedTo + ')');
  console.log('    blobs produced  : ' + JSON.stringify(r.blobs));
  console.log('    downloads fired : ' + JSON.stringify(r.downloads));
  console.log('    returned to setup: ' + r.backOnSetup);

  const errs = [...((report.webkit && report.webkit.pageErrors) || []), ...(report.chromium.pageErrors || [])];
  console.log('\n  PAGE ERRORS: ' + (errs.length ? '\n    ' + errs.join('\n    ') : 'none'));
  console.log('\n  NOTE: Playwright WebKit is not iOS Safari. Missing-API results are real,');
  console.log('  but iOS adds restrictions (autoplay, downloads, standalone PWA) that only');
  console.log('  the actual iPhone can confirm.\n');

  server.close();
  process.exit(0);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
