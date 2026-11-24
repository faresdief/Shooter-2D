# Top Down Shooter (Shooter-2D)

A canvas top-down arena shooter ported to a single self-contained `index.html` from the Godot "Top Down Template 2D" project. No build step, no external runtime dependencies: open the page and play.

**Live demo:** https://faresdief.github.io/Shooter-2D/

## Features
- Story mode, Arcade, Endless and Daily challenge modes
- Waves, weapons and upgrades, bosses, coins and a shop
- Achievements, daily missions, persistent saves (localStorage, import/export)
- Touch, keyboard/mouse and gamepad controls
- Optional peer-to-peer online rooms (WebRTC with Firebase signaling; manual codes as fallback)
- PWA manifest + service worker for offline play

## Running locally
Any static file server works:

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

Opening `index.html` directly also works, but the service worker (offline support) needs HTTP(S).

## Tests
A dependency-free smoke test boots the inline game script in a stubbed DOM and pumps the render loop:

```bash
node test/smoke.mjs
```

## Resilience
A boot watchdog in `index.html` shows a visible error card with a reload button instead of a silent blank canvas if startup fails or the first frame never renders.

## Credits
Gameplay structure ported from the Godot "Top Down Template 2D". Colours are the original palette; all code here is plain HTML/Canvas/JS.

## Online security (Firebase rules)
Online rooms use a Firebase Realtime Database only to pass short signaling messages between players. The rules in `database.rules.json` lock it down:
- Nothing is readable or writable by default. Only `tds/tdsq-<code>` room channels are open, and the list of all rooms cannot be read.
- Every message must be an object with a single `m` string of at most 30000 characters. Messages can be created or deleted but never overwritten.
- The shared lobby channel (`tdsq-lobby1`) cannot be deleted as a whole.
- There is no sign-in, so anyone who knows a room code can still read that room's messages. Room passwords are checked by the host, not by the database.

To publish: Firebase console > Realtime Database > Rules, paste the file, Publish.
