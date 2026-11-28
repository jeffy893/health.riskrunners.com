const C = require('../js/core.js');
const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n);
// doc example: F=10M, v=2.0, base est 10M -> 300%
let a = C.absorption({ fixed: 1e7, varRate: 2, baseEst: 1e7, baseAct: 5e6 });
ok('rate 300%', Math.abs(a.rate - 3) < 1e-9);
ok('under-absorbed by 5M at base 5M', Math.abs(a.variance + 5e6) < 1);
a = C.absorption({ fixed: 1e7, varRate: 2, baseEst: 1e7, baseAct: 15e6 });
ok('over-absorbed by 5M at base 15M', Math.abs(a.variance - 5e6) < 1);
// doc rate application: 583,737
const r = C.applyRates([{ name: 'Material', direct: 200000, rate: .096 }, { name: 'Eng', direct: 5000, rate: .647 }, { name: 'Mfg', direct: 75000, rate: 2.508 }], .19);
ok('total 583,737 (' + Math.round(r.total) + ')', Math.round(r.total) === 583737);
ok('input 490,535', Math.round(r.input) === 490535);
// doc accuracy: avg relative overestimate ~1.8%
const q = C.rateAccuracy([{ proj: 259.1, actual: 254.8 }, { proj: 256.3, actual: 251.8 }, { proj: 260.0, actual: 254.8 }]);
ok('bias ~1.8% (' + (q.bias * 100).toFixed(2) + ')', Math.abs(q.bias * 100 - 1.8) < 0.1 && q.nOver === 3);
// pools
const rec = C.simulateQueue({ lambda: 14, mu: 2, c: 8, cv: .7, T: 336, seed: 42 });
const lab = C.assignPools(rec.arr.length, [.6, .25, .15], 42).map(i => ['Std', 'Lang', 'Dist'][i]);
const rep = C.poolReport(rec, lab, { Dist: 1.5 });
ok('3 pools, top P90 = Dist', rep.rows.length === 3 && rep.rows[0].pool === 'Dist');
const al = C.allocateByBase(1000, rep, 'wait');
ok('alloc sums to pool', Math.abs(al.rows.reduce((x, y) => x + y.dollars, 0) - 1000) < 1e-6);
console.log(rep.rows.map(x => [x.pool, x.n, x.meanWait.toFixed(2), x.p90Wait.toFixed(2), x.p90Ratio.toFixed(2)].join(' ')).join('\n'));
const tr = C.trackRecord([{ who: 'A', award: 100, final: 120 }, { who: 'A', award: 100, final: 130 }, { who: 'A', award: 100, final: 101 }, { who: 'B', award: 100, final: 102 }], { tol: .05, minN: 3, minShare: .6 });
ok('A flagged under, B short', tr.find(x => x.who === 'A').flag === 'under' && tr.find(x => x.who === 'B').flag === 'short');
const lg = C.ledgerCheck([{ ref: 'X1', type: 'direct', pool: '', amount: 100 }, { ref: 'X1', type: 'indirect', pool: 'OH', amount: 100 }, { ref: 'X2', type: 'indirect', pool: '', amount: 50 }, { ref: 'X3', type: 'indirect', pool: 'OH', amount: 50 }]);
ok('ledger: 1 no-pool(+dup), dup 2', lg.noPool.length === 1 && lg.dup.length === 2 && Math.abs(lg.share - 250 / 300) < 1e-9);
const v = [{ base: 6e6, p: 1 }, { base: 2e6, p: .6 }, { base: 3e6, p: .5 }, { base: 4e6, p: .25 }];
ok('expected volume 9.7M', Math.abs(C.expectedVolume(v) - 9.7e6) < 1);
const lo = C.rateIfLost(v, 1e7, 2); ok('rate rises if biggest lost (' + lo.before.toFixed(3) + '->' + lo.after.toFixed(3) + ')', lo.after > lo.before);
