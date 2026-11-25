// Smoke test: boot the inline game scripts in a stubbed DOM.
// Scenario 1: rAF works -> the render loop advances frames.
// Scenario 2: rAF starved (occluded tab) -> the setInterval fallback keeps
//             rendering and the boot watchdog stays quiet.
// Run: node test/smoke.mjs
import { boot, html, scripts } from './harness.mjs';

for (const needle of ['id="bootErr"', "addEventListener('error'", 'window.__tdsFrames = (window.__tdsFrames | 0) + 1', 'setInterval(() => { if (performance.now() - last > 1000)']) {
  if (![html, ...scripts].some(source => source.includes(needle))) { console.error('FAIL: missing boot-resilience piece:', needle); process.exit(1); }
}

// Scenario 1: rAF driven
{
  const { g, rafQueue, bootErr, advance } = boot();
  for (let i = 0; i < 12; i++) {
    const cbs = rafQueue.splice(0);
    if (!cbs.length) { console.error('FAIL: render loop did not reschedule at frame', i); process.exit(1); }
    advance(16.7);
    for (const cb of cbs) cb(g.performance.now());
  }
  if (!(g.window.__tdsFrames >= 12)) { console.error('FAIL: frames did not advance under rAF'); process.exit(1); }
  if (!bootErr.hidden) { console.error('FAIL: boot error overlay shown on healthy boot'); process.exit(1); }
  console.log('PASS scenario 1: rAF-driven loop rendered', g.window.__tdsFrames, 'frames, overlay quiet');
}

// Scenario 2: rAF never fires -> interval fallback must drive frames, watchdog stays quiet
{
  const { g, intervalCbs, timeoutCbs, bootErr, advance } = boot();
  if (!intervalCbs.length) { console.error('FAIL: no rAF-starvation fallback interval registered'); process.exit(1); }
  for (let s = 0; s < 7; s++) { advance(1100); for (const cb of intervalCbs) cb(); }
  if (!(g.window.__tdsFrames > 0)) { console.error('FAIL: interval fallback did not render any frame'); process.exit(1); }
  for (const cb of timeoutCbs) cb();  // fire the 6s watchdog now that fallback frames exist
  if (!bootErr.hidden) { console.error('FAIL: watchdog overlay shown even though fallback rendered'); process.exit(1); }
  console.log('PASS scenario 2: rAF starved, fallback rendered', g.window.__tdsFrames, 'frames, watchdog quiet');
}
