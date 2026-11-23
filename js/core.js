/* Torque-model core: pure functions, no DOM. Works in browser (window.Core) and Node (module.exports).
   All simulations are seeded so results are reproducible. */
(function (root) {
  'use strict';
  const C = {};

  /* ---------- random numbers ---------- */
  C.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  C.normal = function (r) {
    let u = 0; while (u === 0) u = r();
    const v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  C.expo = (r, rate) => -Math.log(1 - r()) / rate;
  C.poisson = function (r, mean) {
    if (mean <= 0) return 0;
    const L = Math.exp(-mean); let k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    return k - 1;
  };
  /* positive sampler with given mean and coefficient of variation (cv=1 -> exponential) */
  C.serviceSampler = function (r, mean, cv) {
    if (cv <= 0) return () => mean;
    if (Math.abs(cv - 1) < 1e-9) return () => C.expo(r, 1 / mean);
    const s2 = Math.log(1 + cv * cv), m = Math.log(mean) - s2 / 2, s = Math.sqrt(s2);
    return () => Math.exp(m + s * C.normal(r));
  };

  /* ---------- basic statistics ---------- */
  C.mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  C.variance = a => { const m = C.mean(a); return a.length > 1 ? a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1) : NaN; };
  C.quantile = function (sorted, q) {
    if (!sorted.length) return NaN;
    const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  };
  C.sorted = a => Float64Array.from(a).sort();
  C.ks = function (a, b) { // two-sample Kolmogorov-Smirnov distance on sorted inputs
    let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      const x = Math.min(a[i], b[j]);
      while (i < a.length && a[i] <= x) i++;
      while (j < b.length && b[j] <= x) j++;
      d = Math.max(d, Math.abs(i / a.length - j / b.length));
    }
    return d;
  };

  /* ---------- 1. discrete-event queue (FIFO, c servers) ---------- */
  C.simulateQueue = function (o) {
    const r = C.rng(o.seed || 1), svc = C.serviceSampler(r, 1 / o.mu, o.cv == null ? 1 : o.cv);
    const free = new Float64Array(o.c); // time each server becomes free
    const arr = [], start = [], end = [];
    const push = a => {
      let k = 0; for (let i = 1; i < o.c; i++) if (free[i] < free[k]) k = i;
      const s = Math.max(a, free[k]), e = s + svc();
      free[k] = e; arr.push(a); start.push(s); end.push(e);
    };
    for (let i = 0; i < (o.initial || 0); i++) push(0);
    let t = 0;
    for (;;) { t += C.expo(r, o.lambda); if (t > o.T) break; push(t); }
    return { arr, start, end };
  };

  /* number in system on a regular grid */
  C.wipSeries = function (rec, t0, t1, dt) {
    const A = Float64Array.from(rec.arr).sort(), E = Float64Array.from(rec.end).sort();
    const out = []; let ia = 0, ie = 0;
    for (let t = t0; t <= t1 + 1e-9; t += dt) {
      while (ia < A.length && A[ia] <= t) ia++;
      while (ie < E.length && E[ie] <= t) ie++;
      out.push(ia - ie);
    }
    return out;
  };

  /* agenda step 1: estimate lambda, mu, rho, WIP and check Little's law */
  C.estimate = function (rec, t0, t1, c) {
    const idx = [];
    for (let i = 0; i < rec.arr.length; i++) if (rec.arr[i] >= t0 && rec.arr[i] < t1) idx.push(i);
    const n = idx.length, span = t1 - t0;
    if (n < 5) return null;
    const arrs = idx.map(i => rec.arr[i]).sort((a, b) => a - b);
    const gaps = []; for (let i = 1; i < arrs.length; i++) gaps.push(arrs[i] - arrs[i - 1]);
    const svc = idx.map(i => rec.end[i] - rec.start[i]);
    const waits = idx.map(i => rec.start[i] - rec.arr[i]);
    const soj = idx.map(i => rec.end[i] - rec.arr[i]);
    const ms = C.mean(svc), mg = C.mean(gaps);
    const wip = C.wipSeries(rec, t0, t1, 0.05);
    const lambda = n / span, mu = 1 / ms;
    return {
      n, span, lambda, mu, c,
      rho: lambda / (c * mu),
      ca2: C.variance(gaps) / (mg * mg),
      cs2: C.variance(svc) / (ms * ms),
      meanWait: C.mean(waits), meanSojourn: C.mean(soj),
      p95Wait: C.quantile(C.sorted(waits), 0.95),
      avgWIP: C.mean(wip),
      littleL: lambda * C.mean(soj)           // lambda * W, to compare with avgWIP
    };
  };

  /* ---------- 2. diffusion approximation (eq. 5) ---------- */
  /* mode 'const': dQ = (lambda - c mu) dt + sigma dB + dL           (eq. 5 as written)
     mode 'state': dQ = (lambda - mu min(Q,c)) dt + sigma(Q) dB + dL (state-dependent drift, Halfin-Whitt style) */
  C.simulateDiffusion = function (o) {
    const r = C.rng(o.seed || 7), dt = o.dt || 0.02, steps = Math.round(o.T / dt);
    const every = Math.max(1, Math.round((o.sampleEvery || 0.25) / dt));
    const samples = [], traj = [];
    const sq = Math.sqrt(dt);
    for (let p = 0; p < o.paths; p++) {
      let q = o.Q0 || 0;
      for (let s = 1; s <= steps; s++) {
        let drift, var_;
        if (o.mode === 'const') { drift = o.lambda - o.c * o.mu; var_ = o.lambda * o.ca2 + o.c * o.mu * o.cs2; }
        else { const b = Math.min(q, o.c); drift = o.lambda - o.mu * b; var_ = o.lambda * o.ca2 + o.mu * b * o.cs2; }
        q += drift * dt + Math.sqrt(Math.max(var_, 1e-9)) * sq * C.normal(r);
        if (q < 0) q = 0;              // reflecting boundary (local-time term L)
        if (s % every === 0) { samples.push(q); if (p === 0) traj.push(q); }
      }
    }
    return { samples, traj };
  };

  /* plain discrete-event baseline: M/M/c with the fitted lambda and mu */
  C.baselineDES = function (o) {
    const samples = [];
    for (let k = 0; k < o.reps; k++) {
      const rec = C.simulateQueue({ lambda: o.lambda, mu: o.mu, c: o.c, cv: 1, T: o.T, seed: (o.seed || 11) + k * 101, initial: Math.round(o.Q0 || 0) });
      const w = C.wipSeries(rec, 0, o.T, o.sampleEvery || 0.25);
      for (let i = 1; i < w.length; i++) samples.push(w[i]);
    }
    return samples;
  };

  /* ---------- 3. coupled cost of delay (eq. 6) ---------- */
  C.solve = function (A, b) { // Gauss-Jordan with partial pivoting
    const n = b.length, M = A.map((row, i) => row.concat([b[i]]));
    for (let i = 0; i < n; i++) {
      let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
      [M[i], M[p]] = [M[p], M[i]];
      const d = M[i][i]; if (Math.abs(d) < 1e-12) return null;
      for (let j = i; j <= n; j++) M[i][j] /= d;
      for (let k = 0; k < n; k++) if (k !== i) { const f = M[k][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; }
    }
    return M.map(row => row[n]);
  };
  /* spectral radius of a non-negative matrix: power iteration on (W + I), which is aperiodic */
  C.spectralRadius = function (W) {
    const n = W.length; let x = new Array(n).fill(1 / Math.sqrt(n)), lam = 0;
    for (let it = 0; it < 150; it++) {
      const y = new Array(n).fill(0);
      for (let i = 0; i < n; i++) { y[i] = x[i]; for (let j = 0; j < n; j++) y[i] += W[i][j] * x[j]; }
      const nr = Math.sqrt(y.reduce((s, v) => s + v * v, 0)) || 1;
      const next = y.map(v => v / nr);
      if (Math.abs(nr - lam) < 1e-10) { lam = nr; x = next; break; }
      lam = nr; x = next;
    }
    return lam - 1;
  };
  C.ccod = function (W, d) {
    const n = d.length;
    const A = W.map((row, i) => row.map((w, j) => (i === j ? 1 : 0) - w));
    return C.solve(A, d);
  };
  C.couplingMC = function (o) {
    const r = C.rng(o.seed || 3), n = o.d.length, out = [];
    for (let m = 0; m <= o.months; m++) {
      const f = o.scale * (1 + o.growth * m);
      let diverged = 0; const per = Array.from({ length: n }, () => []); const rhos = [];
      for (let k = 0; k < o.draws; k++) {
        const W = o.W.map(row => row.map(w => w === 0 ? 0 : w * f * Math.exp(o.sigmaW * C.normal(r) - o.sigmaW * o.sigmaW / 2)));
        const rho = C.spectralRadius(W); rhos.push(rho);
        if (rho >= 1) { diverged++; continue; }
        const c = C.ccod(W, o.d); if (c) for (let i = 0; i < n; i++) per[i].push(c[i]);
      }
      const rs = C.sorted(rhos);
      out.push({
        month: m, pDiverge: diverged / o.draws, rhoMedian: C.quantile(rs, 0.5), rhoP95: C.quantile(rs, 0.95),
        nodes: per.map(a => { const s = C.sorted(a); return { median: C.quantile(s, 0.5), p95: C.quantile(s, 0.95), n: a.length }; })
      });
    }
    return out;
  };

  /* ---------- 4. torque per capita (eqs. 10, 11) ---------- */
  C.erlangC = function (c, a) { // probability of waiting, offered load a = lambda/mu
    if (a >= c) return 1;
    let term = 1, sum = 1;
    for (let k = 1; k < c; k++) { term *= a / k; sum += term; }
    const last = term * a / c * (c / (c - a)); // a^c / c! * c/(c-a)
    return last / (sum + last);
  };
  C.stageMetrics = function (stages, demand) {
    const rows = stages.map(s => {
      const rate = s.rate * s.mult;                 // TPC_k : items per person per day
      const cap = s.n * rate;                       // mu_k : stage capacity per day
      const rho = demand / cap;
      let wq = Infinity;
      if (rho < 1) wq = C.erlangC(s.n, demand / rate) / (cap - demand);
      return { name: s.name, n: s.n, tpc: rate, cap, rho, wq };
    });
    const bottleneck = rows.reduce((b, x, i) => x.cap < rows[b].cap ? i : b, 0);
    const throughput = Math.min(demand, ...rows.map(x => x.cap));
    return { rows, bottleneck, throughput };
  };

  /* ---------- 5. governance designs (eq. 9) ---------- */
  C.simulateGovernance = function (d, g, seed) {
    const r = C.rng(seed), dt = 1 / 52, H = g.years * 52, shockWeek = Math.round(g.shockYear * 52);
    const attach = d.attach == null ? Infinity : d.attach;
    const theta = g.thetaBase + d.participation * (d.theta - g.thetaBase);
    const pstar = g.pstarBase + d.participation * (d.pstar - g.pstarBase);
    const bands = Array.from({ length: H + 1 }, () => new Float32Array(g.paths));
    const yearCost = [], yearExcess = [], recovery = [];
    for (let m = 0; m < g.paths; m++) {
      let p = pstar, base = 0, kept = 0, excess = 0, shocked = false, done = false, recW = 0;
      bands[0][m] = p;
      for (let w = 1; w <= H; w++) {
        if (w === shockWeek) { p = Math.max(0.001, p - g.shock); shocked = true; }
        p += theta * (pstar - p) * dt + g.sigma * Math.sqrt(Math.max(p * (1 - p), 0)) * Math.sqrt(dt) * C.normal(r);
        p = Math.min(0.999, Math.max(0.001, p));
        bands[w][m] = p;
        if (shocked && !done) { if (p >= pstar - 0.05) { done = true; recovery.push(recW); } else recW++; }
        base += g.baseCost / 52 * (1 + g.k * (1 - p));
        const nj = C.poisson(r, g.members * g.jumpRate / 52);
        for (let j = 0; j < nj; j++) {
          const J = g.xm / Math.pow(1 - r(), 1 / g.alpha);
          kept += Math.min(J, attach); excess += Math.max(J - attach, 0);
        }
        if (w % 52 === 0) { yearCost.push(base + kept / g.members); yearExcess.push(excess / g.members); base = 0; kept = 0; excess = 0; }
      }
      if (shocked && !done) recovery.push(recW); // not recovered within the horizon (censored)
    }
    const slPrem = isFinite(attach) ? g.slLoad * C.mean(yearExcess) : 0;
    const cost = yearCost.map(x => x * d.loading + slPrem);
    const fan = bands.map(a => { const s = C.sorted(a); return [C.quantile(s, 0.05), C.quantile(s, 0.5), C.quantile(s, 0.95)]; });
    const cs = C.sorted(cost);
    return {
      theta, pstar, slPrem, cost, fan,
      mean: C.mean(cost), p50: C.quantile(cs, 0.5), p95: C.quantile(cs, 0.95), p99: C.quantile(cs, 0.99),
      recoveryWeeks: C.mean(recovery)
    };
  };

  /* ---------- 6. narrative orthogonality (eq. 12) ---------- */
  const STOP = new Set('a an the and or but of to in on for with at by from is are was were be been being it its this that these those as not no so if then than too very can could should would will just i we you he she they them our your their my me his her do does did have has had about into over under more most such also who what when where which how all any each other some'.split(' '));
  C.tokens = function (text) {
    return (text.toLowerCase().match(/[a-z][a-z'-]+/g) || [])
      .map(w => w.replace(/'s$/, '').replace(/(ies)$/, 'y').replace(/(s)$/, m => (w.length > 4 && !/ss$/.test(w) ? '' : m)))
      .filter(w => w.length > 2 && !STOP.has(w));
  };
  C.tfidf = function (docs) {
    const toks = docs.map(C.tokens), df = {};
    toks.forEach(t => new Set(t).forEach(w => df[w] = (df[w] || 0) + 1));
    const N = docs.length;
    return toks.map(t => {
      const tf = {}; t.forEach(w => tf[w] = (tf[w] || 0) + 1);
      const v = {}; Object.keys(tf).forEach(w => v[w] = tf[w] * (Math.log((1 + N) / (1 + df[w])) + 1));
      return v;
    });
  };
  C.cosine = function (a, b) {
    let dot = 0, na = 0, nb = 0;
    for (const k in a) { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; }
    for (const k in b) nb += b[k] * b[k];
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C; else root.Core = C;
})(typeof window !== 'undefined' ? window : globalThis);
