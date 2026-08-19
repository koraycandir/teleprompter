# Teleprompter + Recorder — Build Plan for Samsung Galaxy Z Fold 5

**What you're building:** one web app that shows your script scrolling AND records video of you at the same time, on the same phone. It runs in Chrome on your Fold and installs to your home screen like a normal app.

**Why a web app and not a "real" Android app:** a web page is allowed to use the camera, record video, and save the file — that covers everything you asked for. Building it as a web app means Claude Code can build and ship it with just a GitHub account, no Android Studio, no SDK, no sideloading. The tradeoff: recorded quality tops out around 1080p and the file may come out as .webm instead of .mp4 (details in Gotchas). If you later want 4K and perfect gallery integration, the upgrade path is a native Kotlin app with CameraX — same design, rebuilt in Android Studio. Don't start there.

---

## The one Z Fold 5 decision that matters

The Fold has three cameras you could film yourself with, and they are not equal:

- **Cover camera (10 MP)** — the selfie camera on the small outside screen. Decent quality. Text area is small but workable.
- **Inner under-display camera (4 MP)** — the invisible camera in the big inside screen. Huge, comfortable teleprompter — but the camera is genuinely soft and hazy. Fine for practice takes, weak for publishing.
- **Rear cameras (50 MP)** — best quality, but they face away from the inner screen, so you can't read while they film you (only Samsung's own camera app can mirror to the cover screen).

**So the app supports two modes and you pick per shoot:** phone folded, app on the cover screen, cover camera → best quality you can get from a self-serve web app. Phone open, app on the big screen, under-display camera → most comfortable reading, draft-tier image. The app just needs a camera picker; holding it right is on you. Bonus: half-fold the phone and stand it on a table (Flex mode) — it's its own tripod.

---

## Toolchain (everything you need)

- On your computer: **Claude Code**, **git**, a free **GitHub** account. That's it.
- Hosting: **GitHub Pages** (free). This matters because browsers only allow camera access on **HTTPS** pages — an html file opened from your Downloads folder can prompt-scroll but cannot record. GitHub Pages gives you the HTTPS URL.
- On the Fold: **Chrome** (first choice — best recording support) or Samsung Internet (test second). Open your GitHub Pages URL → menu → **Add to Home screen**.

---

## Starting point

`teleprompter.html` (in this folder) is a finished, working prompter: smooth scrolling, speed/size controls, tap-to-pause, mirror, countdown, eye-line marker, keep-screen-awake, pedal/keyboard keys. **Milestone 1 is already done.** Put it in the project folder and tell Claude Code to build on it, not from scratch.

---

## Milestones

### M1 — Prompter runs from the web ✅ mostly done
Create a repo, add `teleprompter.html` as `index.html`, enable GitHub Pages, open the URL on the Fold.
**Done when:** script scrolls smoothly on both the cover screen and the big inner screen, and "Add to Home screen" works.

### M2 — Camera preview + picker
Add `getUserMedia` video+audio. A camera dropdown built from `enumerateDevices` (labels appear after first permission grant), plus a front/rear quick toggle. Show a small draggable preview thumbnail over the prompter — not full screen.
**Done when:** on the Fold you can switch between cover camera, under-display camera, and rear camera, and see yourself in the thumbnail.

### M3 — Record, stop, save
`MediaRecorder` on the preview stream. Pick format at runtime with `MediaRecorder.isTypeSupported`, preferring `video/mp4` variants, falling back to `video/webm;codecs=vp9,opus`, then vp8. Request ~1080p (`width/height ideal` constraints) and set `videoBitsPerSecond` around 8,000,000. Stop → assemble Blob → auto-download named like `take-2026-08-11-1432.webm`. Show elapsed-time badge while recording.
**Done when:** a 60-second take records with clean audio and lands in the Fold's Downloads, playable in Samsung Gallery.

### M4 — The "Action!" flow
One Roll button = 3-2-1 countdown, then recording and scrolling start together. Tap screen = pause/resume the **scroll only** (recording keeps running, so you can ad-lib). Big Stop = end take + save. When recording starts, shrink or hide the self-preview — if you can see yourself you'll look at yourself, and eye contact dies. Persist script + settings in `localStorage` so nothing is lost between sessions. PWA manifest + service worker so it opens fullscreen from the home screen icon.
**Done when:** you can walk up, tap once, deliver the script, tap stop, and have the file — without touching anything else.

### M5 — Fold field test
Test matrix, on the actual phone: (1) folded, cover screen + cover cam, portrait — the Reels setup; (2) unfolded, inner screen + under-display cam; (3) half-folded on a table, Flex mode; (4) rotate to landscape in each; (5) both Chrome and Samsung Internet; (6) a full 3-minute take (file size, audio sync, phone heat). Fix what breaks. 
**Done when:** one full scripted take in your preferred setup looks and sounds good enough to post.

### V2 ideas — only after M5
Voice-follow scrolling (scroll tracks your speech via SpeechRecognition — genuinely hard, do last). Take list with in-app replay before saving. Flex-mode layout via the device-posture media query (video top half, controls bottom half). Resolution/bitrate settings.

---

## Gotchas (paste-worthy for Claude Code)

- Camera **requires HTTPS** (or localhost). file:// won't record. Deploy early, test on the real URL.
- Never assume mp4 support — always gate on `isTypeSupported` and fall back to webm. Webm plays fine on the phone and uploads fine to YouTube/Drive; some apps are picky about it.
- Under-display camera will list like any other device but looks soft — that's hardware, not a bug.
- Keep `wakeLock` active and re-request it on `visibilitychange`; a sleeping screen kills the take.
- Recording + screen-on gets warm on long takes; that's normal, but don't let the plan promise 30-minute recordings.
- Don't mirror the *recording* — mirror only the on-screen preview if desired. The mirror switch from M1 is for teleprompter glass and should stay off here.
- Ask for mic with default processing (`echoCancellation`, `noiseSuppression` on). Arm's-length built-in mic is fine; skip Bluetooth mics in v1 (latency/sync headaches).

---

## Kickoff prompt for Claude Code

Make a folder, drop `teleprompter.html` and this `PLAN.md` into it, run `claude`, and paste:

```
Read PLAN.md. We are at the start of Milestone 1, and teleprompter.html
in this folder is the finished prompter to build on — rename it index.html
and keep its behavior intact.

Set up a git repo, publish it with GitHub Pages (use the gh CLI, help me
authenticate if needed), and give me the URL to open on my phone.

Then implement Milestones 2 through 4 exactly as specified, one at a time,
committing and deploying after each so I can test on my Samsung Z Fold 5
before you continue. Follow the Gotchas section strictly, especially
HTTPS-only camera and the isTypeSupported fallback chain.
```

Then just test on the phone after each milestone and tell Claude Code what feels wrong. That feedback loop is the actual build process.
