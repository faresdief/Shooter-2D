// Smoke test: boot the inline game scripts in a stubbed DOM.
// Scenario 1: rAF works -> the render loop advances frames.
// Scenario 2: rAF starved (occluded tab) -> the setInterval fallback keeps
//             rendering and the boot watchdog stays quiet.
// Run: node test/smoke.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const needle of ['id="bootErr"', "addEventListener('error'", 'window.__tdsFrames = (window.__tdsFrames | 0) + 1', 'setInterval(() => { if (performance.now() - last > 1000)']) {
  if (!html.includes(needle)) { console.error('FAIL: missing boot-resilience piece:', needle); process.exit(1); }
}
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length < 2) { console.error('FAIL: expected watchdog + game scripts'); process.exit(1); }

function makeStub() {
  const fn = function () { return stub; };
  const stub = new Proxy(fn, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === Symbol.iterator) return function* () {};
      if (p === 'length') return 0;
      if (p === 'then') return undefined;
      return stub;
    },
    apply() { return stub; },
    set() { return true; },
    construct() { return stub; },
  });
  return stub;
}

function boot() {
  const rafQueue = [], intervalCbs = [], timeoutCbs = [];
  let clock = 0;
  const bootErr = { hidden: true, textContent: '' };
  const g = {
    console,
    navigator: { getGamepads: () => [], maxTouchPoints: 0, userAgent: 'smoke-test' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 },
    location: { protocol: 'https:', href: 'https://example.test/', reload: () => {} },
    performance: { now: () => clock },
    requestAnimationFrame: cb => { rafQueue.push(cb); return rafQueue.length; },
    setTimeout: cb => { timeoutCbs.push(cb); return 0; },
    setInterval: cb => { intervalCbs.push(cb); return 0; },
    clearTimeout: () => {}, clearInterval: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    fetch: () => Promise.reject(new Error('offline')),
    EventSource: function () { return makeStub(); },
  };
  const realDoc = makeStub();
  g.document = new Proxy(realDoc, {
    get(t, p) {
      if (p === 'getElementById') return id => (id === 'bootErr' || id === 'bootErrMsg') ? (id === 'bootErr' ? bootErr : bootErr) : makeStub();
      return realDoc[p];
    },
  });
  g.window = g; g.self = g; g.globalThis = g;
  g.__handlers = {};
  g.addEventListener = (t, fn) => { (g.__handlers[t] ||= []).push(fn); };
  g.removeEventListener = () => {};
  vm.createContext(g);
  for (const src of scripts) vm.runInContext(src, g, { filename: 'index-inline.js' });
  return { g, rafQueue, intervalCbs, timeoutCbs, bootErr, advance: ms => { clock += ms; } };
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
