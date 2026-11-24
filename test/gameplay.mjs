// Gameplay tests: run real game functions inside the stubbed DOM and check the rules.
// Run: node test/gameplay.mjs
import { boot } from './harness.mjs';

const { g } = boot({ test: true });
const ev = code => g.__tdsEval(code);
let failed = 0;
function check(name, ok, extra = '') { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) failed++; }

// Weapons: every weapon has sane stats and the shop order goes up in price.
const W = ev('JSON.parse(JSON.stringify(WEAPONS))');
const ids = Object.keys(W);
check('weapons defined', ids.length >= 5, ids.join(','));
check('every weapon has positive cooldown, damage, speed', ids.every(k => W[k].cd > 0 && W[k].dm > 0 && W[k].sp > 0 && W[k].n >= 1));
check('pistol is free, others cost coins', W.pistol.price === 0 && ids.filter(k => k !== 'pistol').every(k => W[k].price > 0));
check('lancer sits between blaster and railgun in price', W.lancer && W.lancer.price > W.blaster.price && W.lancer.price < W.rail.price);
check('railgun pierces, shotgun fires a spread', W.rail.pierce >= 99 && W.shotgun.n > 1);

// Firing a weapon creates the right number of bullets.
for (const id of ids) {
  const n = ev(`(() => { startGame(0); weapon.id = '${id}'; bullets.length = 0; shoot(); return bullets.length; })()`);
  check('shoot() with ' + id + ' fires ' + W[id].n + ' bullet(s)', n === W[id].n, '(got ' + n + ')');
}

// Waves: enemy count and strength never go down within a level, and the last wave has a boss.
const waves = ev(`(() => { const out = []; startGame(0); for (let i = 0; i < LEVELS[0].waves; i++) { enemies.length = 0; spawnWave(); out.push({ n: enemies.length, hp: enemies[0].max, types: enemies.map(e => e.type) }); } return out; })()`);
check('wave sizes do not shrink', waves.every((w, i) => i === 0 || w.n >= waves[i - 1].n), JSON.stringify(waves.map(w => w.n)));
check('final wave of level 1 has a boss', waves[waves.length - 1].types.includes('boss'));
check('early waves have no boss', waves.slice(0, -1).every(w => !w.types.includes('boss')));

// Difficulty: higher levels give tougher enemies.
const hpAt = lv => ev(`(() => { startGame(${lv}); enemies.length = 0; spawnAt(400, 300, 'grunt'); return enemies[0].max; })()`);
check('level 12 grunts have more health than level 1', hpAt(11) > hpAt(0));
check('level 30 is a mega boss level', ev(`(() => { startGame(9); enemies.length = 0; wave = LEVELS[9].waves - 1; spawnWave(); return enemies.some(e => e.type === 'mega'); })()`));

// Scoring: combo raises the points per kill.
const sc = ev(`(() => { startGame(0); score = 0; combo = 0; onKill(); const a = score; onKill(); const b = score - a; return [a, b]; })()`);
check('kill score grows with combo', sc[0] === 10 && sc[1] === 20, JSON.stringify(sc));

// Damage: a hit removes health and kills at zero.
const dead = ev(`(() => { startGame(0); enemies.length = 0; spawnAt(300, 300, 'grunt'); const e = enemies[0]; e.health = 1; hitEnemy(e, { x: 300, y: 300, dx: 1, dy: 0, rot: 0, dm: 1, own: player }); return e.dying; })()`);
check('lethal hit marks the enemy dying', dead === true);

// Charger: appears from level 5, lunges toward the player, never before level 5.
const types = lv => ev(`(() => { startGame(${lv}); const s = new Set(); for (let i = 0; i < 60; i++) { enemies.length = 0; wave = 0; spawnWave(); enemies.forEach(e => s.add(e.type)); } return [...s]; })()`);
check('chargers appear on level 6', types(5).includes('charger'));
check('no chargers on level 2', !types(1).includes('charger'));
const lunge = ev(`(() => { startGame(5); enemies.length = 0; player.x = 300; player.y = 300; spawnAt(600, 300, 'charger'); const e = enemies[0]; e.ct = 99; const x0 = e.x; for (let i = 0; i < 20; i++) updateEnemies(1 / 60); return x0 - e.x; })()`);
check('charger lunges toward the player', lunge > 60, '(moved ' + Math.round(lunge) + 'px)');

// Late bosses shoot a ring of bullets; early ones do not.
const ring = lv => ev(`(() => { startGame(${lv}); enemies.length = 0; eBullets.length = 0; player.x = 200; player.y = 200; spawnAt(700, 300, 'boss'); const e = enemies[0]; e.ring = 0; updateEnemies(1 / 60); return eBullets.length; })()`);
check('level 10 boss fires a ring volley', ring(9) >= 8, '(' + ring(9) + ' bullets)');
check('level 3 boss does not', ring(2) === 0);

// Leaderboard: the posted entry matches the shape the database rules accept.
import { readFileSync } from 'node:fs';
const rules = JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8')).rules;
check('rules lock the root and index scores by s', rules['.read'] === false && rules['.write'] === false && rules['tds-scores']['.indexOn'][0] === 's');
const sent = ev(`(async () => { startGame(0); score = 1234; NET.name = 'Tester'; let body; const old = fetch; window.fetch = (u, o) => { body = o && o.body; return Promise.resolve({ ok: true }); }; await sbPost(); window.fetch = old; return body; })()`);
const sentObj = JSON.parse(await sent);
check('posted entry has exactly n, s, t', Object.keys(sentObj).sort().join() === 'n,s,t' && sentObj.n === 'Tester' && sentObj.s === 1234 && sentObj.t['.sv'] === 'timestamp', JSON.stringify(sentObj));

console.log(failed ? failed + ' check(s) failed' : 'All gameplay checks passed');
process.exit(failed ? 1 : 0);
