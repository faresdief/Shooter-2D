import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

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

export function boot(opts = {}) {
  const rafQueue = [], intervalCbs = [], timeoutCbs = [];
  let clock = 0;
  const bootErr = { hidden: true, textContent: '', style: {} };
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
  if (opts.test) g.__TDS_TEST__ = true;
  g.window = g; g.self = g; g.globalThis = g;
  g.__handlers = {};
  g.addEventListener = (t, fn) => { (g.__handlers[t] ||= []).push(fn); };
  g.removeEventListener = () => {};
  vm.createContext(g);
  for (const src of scripts) vm.runInContext(src, g, { filename: 'index-inline.js' });
  return { g, rafQueue, intervalCbs, timeoutCbs, bootErr, advance: ms => { clock += ms; } };
}
