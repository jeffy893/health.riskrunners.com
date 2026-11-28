/* UI layer: reads inputs, calls Core, draws SVG charts and tables. No libraries. */
(function () {
  'use strict';
  const C = window.Core;
  const $ = id => document.getElementById(id);
  const num = id => parseFloat($(id).value);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = (x, d = 2) => (x === Infinity ? '∞' : (x == null || isNaN(x)) ? '–' : Number(x).toFixed(d));
  const money = x => (x < 0 ? '-$' : '$') + Math.abs(Math.round(x)).toLocaleString('en-US');
  const debounce = (fn, ms = 250) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };

  const NODES = ['Intake', 'Eligibility', 'Prior authorization', 'Clinical review', 'Claims adjudication', 'Payment & appeals'];
  const COL = { red: '#8a1c2b', blue: '#1f4e79', orange: '#d9822b', green: '#2e7d32', grey: '#555', black: '#111', sky: '#2f93e6' };

  /* ---------- tiny SVG chart ---------- */
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function chart(o) {
    const narrow = window.innerWidth < 640, W = o.w || (narrow ? 440 : 680), H = o.h || (narrow ? 250 : 270), m = { l: 58, r: 16, t: 14, b: 44 };
    const series = o.series || [], bands = o.bands || [];
    // legend laid out in rows above the plot area
    const legend = [...series, ...bands].filter(s => s.label), lay = []; let lx = m.l, lrow = 0;
    legend.forEach(s => { const w = 42 + s.label.length * 6.1; if (lx + w > W - m.r && lx > m.l) { lx = m.l; lrow++; } lay.push([s, lx, lrow]); lx += w + 10; });
    if (legend.length) m.t = 16 + (lrow + 1) * 17;
    const pts = []; series.forEach(s => pts.push(...s.pts)); bands.forEach(b => { pts.push(...b.upper, ...b.lower); });
    if (!pts.length) return '';
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]).filter(isFinite);
    let x0 = o.xmin ?? Math.min(...xs), x1 = o.xmax ?? Math.max(...xs);
    let y0 = o.ymin ?? Math.min(...ys), y1 = o.ymax ?? Math.max(...ys);
    if (o.ymax == null) y1 += (y1 - y0) * 0.06 || 1;
    if (x1 === x0) x1 = x0 + 1; if (y1 === y0) y1 = y0 + 1;
    const sx = x => m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r), sy = y => H - m.b - (y - y0) / (y1 - y0) * (H - m.t - m.b);
    let g = '';
    const ty = niceStep(y1 - y0, 5), tx = niceStep(x1 - x0, narrow ? 4 : 6);
    for (let v = Math.ceil(y0 / ty) * ty; v <= y1 + 1e-9; v += ty) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="#eee"/><text x="${m.l - 6}" y="${sy(v) + 4}" font-size="11" text-anchor="end">${+v.toPrecision(4)}</text>`;
    for (let v = Math.ceil(x0 / tx) * tx; v <= x1 + 1e-9; v += tx) g += `<text x="${sx(v)}" y="${H - m.b + 16}" font-size="11" text-anchor="middle">${+v.toPrecision(4)}</text>`;
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="#333"/><line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${H - m.b}" stroke="#333"/>`;
    bands.forEach(b => {
      const d = b.upper.map(p => `${sx(p[0])},${sy(p[1])}`).concat(b.lower.slice().reverse().map(p => `${sx(p[0])},${sy(p[1])}`)).join(' ');
      g += `<polygon points="${d}" fill="${b.color}" opacity="${b.opacity || 0.18}"/>`;
    });
    (o.hlines || []).forEach(h => { g += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(h.y)}" y2="${sy(h.y)}" stroke="${h.color || '#b00'}" stroke-dasharray="5 4"/><text x="${W - m.r - 4}" y="${sy(h.y) - 4}" font-size="11" text-anchor="end" fill="${h.color || '#b00'}">${esc(h.label || '')}</text>`; });
    series.forEach(s => {
      const d = s.pts.filter(p => isFinite(p[1])).map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join('');
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? 'stroke-dasharray="' + s.dash + '"' : ''}/>`;
    });
    lay.forEach(([s, x, row]) => {
      const y = 14 + row * 17;
      g += `<line x1="${x}" x2="${x + 22}" y1="${y}" y2="${y}" stroke="${s.color}" stroke-width="3" ${s.dash ? 'stroke-dasharray="5 3"' : ''}/><text x="${x + 27}" y="${y + 4}" font-size="11">${esc(s.label)}</text>`;
    });
    if (o.xlabel) g += `<text x="${(m.l + W - m.r) / 2}" y="${H - 6}" font-size="12" text-anchor="middle">${esc(o.xlabel)}</text>`;
    if (o.ylabel) g += `<text transform="rotate(-90)" x="${-(m.t + H - m.b) / 2}" y="14" font-size="12" text-anchor="middle">${esc(o.ylabel)}</text>`;
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'chart')}">${g}</svg>${o.cap ? `<div class="cap">${o.cap}</div>` : ''}</div>`;
  }
  function density(samples, lo, hi, bins) {
    const w = (hi - lo) / bins, cnt = new Array(bins).fill(0);
    samples.forEach(v => { const k = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w))); cnt[k]++; });
    return cnt.map((c, i) => [lo + (i + 0.5) * w, c / samples.length / w]);
  }
  function thin(a, max) { if (a.length <= max) return a; const k = Math.ceil(a.length / max); return a.filter((_, i) => i % k === 0); }
  function table(head, rows, opt) {
    opt = opt || {};
    return `<table class="${opt.cls || ''}"><thead><tr>${head.map((h, i) => `<th class="${i && !opt.left ? 'n' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${r.cls || ''}">${(r.cells || r).map((c, i) => `<td class="${i && !opt.left ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  const cards = a => `<div class="cards">${a.map(c => `<div class="card ${c[3] || ''}"><span>${c[0]}</span><b>${c[1]}</b><span style="text-transform:none;letter-spacing:0">${c[2] || ''}</span></div>`).join('')}</div>`;

  /* ---------- tabs ---------- */
  const renderers = {};
  function show(id) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === id));
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
    if (renderers[id]) renderers[id]();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); show(a.dataset.go); }));

  /* ======================= STEP 1 ======================= */
  let cache = null;
  function parseCSV(text) {
    const arr = [], start = [], end = [], lab = [];
    text.split(/\n/).forEach(line => {
      const p = line.split(/[,\t; ]+/).map(parseFloat);
      if (p.length >= 3 && p.slice(0, 3).every(isFinite) && p[1] >= p[0] && p[2] >= p[1]) {
        arr.push(p[0]); start.push(p[1]); end.push(p[2]);
        const parts = line.trim().split(/[,\t;]+/); // optional 4th column: pool name
        lab.push(parts.length >= 4 ? parts.slice(3).join(' ').trim() : '');
      }
    });
    return { arr, start, end, lab };
  }
  function getData() {
    const c = Math.max(1, Math.round(num('cc')));
    const user = parseCSV($('csv').value);
    const key = JSON.stringify([num('lam'), num('mu'), c, num('cv'), num('Tobs'), num('seed'), user.arr.length, user.arr[user.arr.length - 1], user.lab.join('|')]);
    if (cache && cache.key === key) return cache;
    if (user.arr.length >= 20) {
      const T = Math.max(...user.arr);
      cache = { key, rec: user, T, c, source: 'your data (' + user.arr.length + ' items)', truth: null, labels: user.lab };
    } else {
      const P = { lambda: num('lam'), mu: num('mu'), c, cv: num('cv'), T: num('Tobs'), seed: num('seed') };
      cache = { key, rec: C.simulateQueue(P), T: P.T, c, source: 'synthetic simulation', truth: P };
    }
    return cache;
  }
  renderers.t1 = function () {
    const D = getData(), h = D.T / 2;
    const tr = C.estimate(D.rec, 0, h, D.c), te = C.estimate(D.rec, h, D.T, D.c);
    if (!tr || !te) { $('o1').innerHTML = '<p class="err">Not enough items in each half of the window. Increase the window or the arrival rate.</p>'; return; }
    const wip = C.wipSeries(D.rec, 0, D.T, 0.25).map((v, i) => [i * 0.25, v]);
    const tru = D.truth ? { lambda: D.truth.lambda, mu: D.truth.mu, rho: D.truth.lambda / (D.c * D.truth.mu), cs2: D.truth.cv * D.truth.cv, ca2: 1 } : null;
    const row = (name, e, cls) => ({ cls, cells: [name, f(e.lambda), f(e.mu), f(e.rho), f(e.ca2), f(e.cs2), f(e.meanWait, 3), f(e.p95Wait, 3), f(e.avgWIP), f(e.littleL)] });
    const rows = [row('First half (fit)', tr), row('Second half (held out)', te)];
    if (tru) rows.push({ cls: 'ok', cells: ['True simulator values', f(tru.lambda), f(tru.mu), f(tru.rho), f(tru.ca2), f(tru.cs2), '–', '–', '–', '–'] });
    const littleErr = Math.abs(te.avgWIP - te.littleL) / te.avgWIP * 100;
    $('o1').innerHTML =
      `<p class="small">Source: ${D.source}. Window ${f(D.T, 0)} hours, split in half for steps 1 and 2.</p>` +
      cards([['Utilization ρ', f(te.rho), 'second half', te.rho >= 0.9 ? 'bad' : ''], ['Arrivals λ̂', f(te.lambda), 'items/hour'], ['Service rate μ̂', f(te.mu), 'per person per hour'], ['Avg in system (WIP)', f(te.avgWIP, 1), 'second half'], ['Little check', f(littleErr, 1) + '%', 'gap between L and λ·W']]) +
      table(['Window', 'λ̂', 'μ̂', 'ρ̂', 'ca²', 'cs²', 'Mean wait (h)', 'P95 wait (h)', 'Avg WIP L', 'λ̂·W (Eq. 4)'], rows) +
      chart({ series: [{ pts: thin(wip, 700), color: COL.blue }], xlabel: 'Hours', ylabel: 'Items in system', xmin: 0, xmax: D.T, ymin: 0, cap: 'Number of items in the system over time. The first half fits the model in step 2; the second half is held out.', title: 'WIP over time' }) +
      `<div class="callout"><b>Reading this</b>Eq. 4 says average backlog L equals throughput times time in system. The last two columns should agree, and they do when timestamps are consistent. ca² and cs² are the squared variability of arrivals and service times (1.0 is Poisson or exponential). They set the volatility σ in step 2. Utilization above about 0.9 is where waiting climbs steeply.</div>`;
  };
  ['lam', 'mu', 'cc', 'cv', 'Tobs', 'seed', 'csv'].forEach(id => $(id).addEventListener('input', debounce(() => { renderers.t1(); if ($('t2').classList.contains('on')) renderers.t2(); })));
  /* ---- step 1 extension: pools by cost driver, with a delay-cost pool allocated by a base (Contracting tab method) ---- */
  const t1main = renderers.t1;
  renderers.t1 = function () {
    t1main();
    try { renderPools(); } catch (e) { $('o1b').innerHTML = '<p class="err">Pool report failed: ' + esc(e.message) + '</p>'; }
  };
  function renderPools() {
    const D = getData(), rec = D.rec, N = rec.arr.length;
    let labels, extra = {}, note;
    if (D.labels && D.labels.some(x => x)) {
      labels = D.labels.map(x => x || 'Unlabeled'); note = 'Pools come from the fourth column of your data.';
    } else if (D.truth) {
      const names = $('pools1').value.split(',').map(x => x.trim()).filter(Boolean);
      let w = $('wts1').value.split(',').map(parseFloat);
      if (names.length < 2 || w.length !== names.length || w.some(x => !(x > 0))) { $('o1b').innerHTML = '<p class="err">Enter at least two pool names, with one positive share for each.</p>'; return; }
      labels = C.assignPools(N, w, num('seed')).map(i => names[i]);
      extra[names[names.length - 1]] = Math.max(0, num('fr1') || 0);
      note = 'Synthetic pools. Items were assigned to pools at random, and the last pool was given an extra hold-up of ' + f(extra[names[names.length - 1]], 1) + ' hours so the report has something to find.';
    } else {
      $('o1b').innerHTML = '<p class="small">Add a fourth column with a pool name to your timestamps to see waits by pool.</p>'; return;
    }
    const rep = C.poolReport(rec, labels, extra);
    const pool$ = rep.totalWait * Math.max(0, num('dc1') || 0), base = $('base1').value;
    const al = C.allocateByBase(pool$, rep, base), alBy = {}; al.rows.forEach(r => alBy[r.pool] = r);
    const baseName = { wait: 'wait-hour', service: 'service-hour', items: 'item' }[base];
    const small = rep.rows.filter(r => r.n < 30).length;
    const rows = rep.rows.map(r => ({ cls: r.p90Ratio >= 1.25 && r.n >= 30 ? 'hi' : '', cells: [esc(r.pool), r.n, f(r.shareItems * 100, 1) + '%', f(r.meanWait, 2), f(r.medianWait, 2), f(r.p90Wait, 2), f(r.p90Ratio, 2) + '×', f(r.shareWait * 100, 1) + '%', money(alBy[r.pool].dollars), money(alBy[r.pool].perItem)] }));
    const worst = rep.rows[0];
    $('o1b').innerHTML =
      `<p class="small">${note}</p>` +
      table(['Pool', 'Items', 'Share of items', 'Mean wait (h)', 'Median (h)', 'P90 wait (h)', 'P90 vs all items', 'Share of wait-hours', 'Delay cost allocated', 'Per item'], rows) +
      cards([['Overall P90 wait', f(rep.overall.p90Wait, 2) + ' h', 'all items'], ['Longest-tail pool', esc(worst.pool), 'P90 ' + f(worst.p90Wait, 2) + ' h', worst.p90Ratio >= 1.25 && worst.n >= 30 ? 'bad' : ''], ['Delay-cost pool', money(pool$), f(rep.totalWait, 0) + ' wait-hours'], ['Rate', '$' + f(al.rate, 2), 'per ' + baseName]]) +
      `<div class="callout"><b>Reading this</b>Rows are sorted by P90 wait, the wait that the slowest tenth of the pool's items exceed. Red rows have a P90 at least 1.25 times the all-item P90 (a rule of thumb, not a test). The delay-cost pool is wait-hours times the hourly cost above. Following the allocation method in the Contracting tab, the rate is the pool divided by the chosen base, and each pool is charged rate × its base. Switching the base moves the cost between pools, which is why the base must be chosen for a stated reason (consumption or benefit) and fixed before looking at results.${small ? ' ' + small + ' pool(s) have fewer than 30 items, so their tails are noisy and are not flagged.' : ''}</div>` +
      `<div class="callout warn"><b>Limits</b>Grouping by cost driver does not prove the grouping is fair. A driver such as travel distance can still track a demographic group. If you hold demographic data under proper governance, compare pool membership against it as an audit, after the pools are fixed and not as the way pools are formed. Small pools give unstable P90 values.</div>`;
  }
  ['pools1', 'wts1', 'fr1', 'dc1', 'base1'].forEach(id => $(id).addEventListener('input', debounce(() => renderers.t1())));


  /* ======================= STEP 2 ======================= */
  renderers.t2 = function () {
    const D = getData(), h = D.T / 2;
    const tr = C.estimate(D.rec, 0, h, D.c);
    if (!tr) { $('o2').innerHTML = '<p class="err">Not enough data. Check step 1.</p>'; return; }
    $('o2').innerHTML = '<p class="small">Running…</p>';
    setTimeout(() => {
      const obsSeries = C.wipSeries(D.rec, h, D.T, 0.25);
      const Q0 = obsSeries[0], obs = obsSeries.slice(1), os = C.sorted(obs);
      const base = { lambda: tr.lambda, mu: tr.mu, c: D.c, ca2: tr.ca2, cs2: tr.cs2, Q0, T: h, paths: num('paths2'), dt: 0.02, sampleEvery: 0.25 };
      const dc = C.simulateDiffusion({ ...base, mode: 'const', seed: 5 });
      const ds = C.simulateDiffusion({ ...base, mode: 'state', seed: 6 });
      const des = C.baselineDES({ lambda: tr.lambda, mu: tr.mu, c: D.c, T: h, reps: num('reps2'), Q0, sampleEvery: 0.25 });
      const sets = [['Observed (held-out half)', obs, COL.black], ['Eq. 5, constant drift', dc.samples, COL.orange], ['State-dependent drift', ds.samples, COL.sky], ['Discrete-event baseline', des, COL.green]];
      const stat = (name, a) => { const s = C.sorted(a); return [name, f(C.mean(a)), f(C.quantile(s, 0.5), 1), f(C.quantile(s, 0.95), 1), name.startsWith('Observed') ? '–' : f(C.ks(os, s), 3)]; };
      const hi = Math.max(...sets.map(s => C.quantile(C.sorted(s[1]), 0.995))) + 1;
      const bins = Math.min(40, Math.max(12, Math.round(hi)));
      const sig2 = tr.lambda * tr.ca2 + D.c * tr.mu * tr.cs2, m = tr.lambda - D.c * tr.mu;
      const best = [['Eq. 5, constant drift', C.ks(os, C.sorted(dc.samples))], ['State-dependent drift', C.ks(os, C.sorted(ds.samples))], ['Discrete-event baseline', C.ks(os, C.sorted(des))]].sort((a, b) => a[1] - b[1])[0];
      $('o2').innerHTML =
        cards([['Fitted drift λ−cμ', f(m), 'items/hour (negative = stable)'], ['Fitted σ²', f(sig2), 'λ·ca² + cμ·cs²'], ['Closest to observed', best[0], 'by KS distance, lower is better'], ['Starting WIP', String(Q0), 'at start of held-out half']]) +
        chart({ series: sets.map(s => ({ pts: density(s[1], 0, hi, bins), color: s[2], label: s[0], width: s[0].startsWith('Observed') ? 3.2 : 2.4, dash: s[0].startsWith('Eq.') ? '6 4' : null })), xlabel: 'Items in system', ylabel: 'Share of time (density)', title: 'Distribution of WIP', cap: 'Distribution of the number in the system over the held-out half. Closer to the black line is a better fit.' }) +
        table(['Series', 'Mean', 'Median', 'P95', 'KS distance to observed'], sets.map(s => stat(s[0], s[1]))) +
        chart({ h: 230, series: [{ pts: obs.slice(0, 400).map((v, i) => [i * 0.25, v]), color: COL.black, width: 2.6, label: 'Observed' }, { pts: ds.traj.slice(0, 400).map((v, i) => [i * 0.25, v]), color: COL.sky, width: 2, label: 'One diffusion path' }], xlabel: 'Hours into the held-out half', ylabel: 'Items in system', ymin: 0, title: 'Sample paths', cap: 'One realization of each. They should look alike in range and roughness, not match point for point.' }) +
        `<div class="callout"><b>Reading this</b>Equation 5 uses the drift λ − cμ. For a stage with c people that drift applies only when everyone is busy. When some are idle, departures slow down, so the drift is λ − μ·min(Q, c). On the synthetic default the state-dependent version tracks the observed distribution far better than eq. 5 as written, which underestimates the typical backlog. Near full utilization the two converge. For a finite horizon, the diffusion's value is that two numbers (drift and σ) replace a table of transition rates. Where it matches the baseline, it is no worse; where it does not, use the baseline.${m < 0 ? ` For reference, eq. 5 as written has a stationary mean of σ²/(2|drift|) = ${f(sig2 / (2 * -m))} items.` : ' Drift is not negative, so the queue is unstable and has no stationary distribution.'}</div>`;
    }, 20);
  };
  $('run2').addEventListener('click', renderers.t2);
  ['paths2', 'reps2'].forEach(id => $(id).addEventListener('change', renderers.t2));

  /* ======================= STEP 3 ======================= */
  const W0 = [[0, 0, 0, 0, 0, .2], [.35, 0, 0, 0, 0, 0], [.3, .4, 0, .15, 0, 0], [0, 0, .35, 0, 0, 0], [0, .15, .3, .2, 0, .15], [0, 0, 0, 0, .45, 0]];
  const D0 = [8, 5, 12, 10, 15, 9], DUR0 = [2, 1, 3, 3, 4, 2];
  function initCoupling() {
    let h = '<table><thead><tr><th>Row i gets cost from column j →</th>' + NODES.map(n => `<th>${n}</th>`).join('') + '<th>Direct delay cost d ($k/wk)</th><th>Duration (wk)</th></tr></thead><tbody>';
    NODES.forEach((n, i) => {
      h += `<tr><td><b>${n}</b></td>` + NODES.map((_, j) => `<td><input id="w${i}${j}" type="number" step="0.05" min="0" max="1" value="${W0[i][j]}" ${i === j ? 'disabled' : ''}></td>`).join('') +
        `<td><input id="d${i}" type="number" step="1" min="0" value="${D0[i]}"></td><td><input id="du${i}" type="number" step="1" min="0.5" value="${DUR0[i]}"></td></tr>`;
    });
    $('wedit').innerHTML = h + '</tbody></table><p class="small">Placeholder values for a healthcare workflow. Replace them with measured dependencies and costs.</p>';
  }
  initCoupling();
  const readW = () => NODES.map((_, i) => NODES.map((_, j) => Math.max(0, parseFloat($('w' + i + j).value) || 0)));
  const readD = () => NODES.map((_, i) => parseFloat($('d' + i).value) || 0);
  const readDur = () => NODES.map((_, i) => parseFloat($('du' + i).value) || 1);
  let ran3 = false;
  renderers.t3 = function () {
    const b = $('run3'); b.classList.add('busy'); $('o3').innerHTML = '<p class="small">Running Monte Carlo…</p>';
    setTimeout(() => {
      const W = readW(), d = readD(), dur = readDur();
      const P = { W, d, scale: num('scale3'), growth: num('g3'), sigmaW: num('s3'), months: 12, draws: Math.round(num('n3')), seed: 3 };
      const mc = C.couplingMC(P), M = Math.min(12, Math.max(0, Math.round(num('m3')))), mm = mc[M];
      const Wm = W.map(r => r.map(w => w * P.scale * (1 + P.growth * M)));
      const rho0 = C.spectralRadius(W.map(r => r.map(w => w * P.scale))), rhoM = C.spectralRadius(Wm);
      let det = null; if (rhoM < 1) det = C.ccod(Wm, d);
      // Neumann series orders at the milestone
      const mul = (A, v) => A.map(r => r.reduce((s, w, j) => s + w * v[j], 0));
      const o1 = mul(Wm, d), o2 = mul(Wm, o1);
      const cd3 = (v) => v.map((x, i) => x / dur[i]);
      const rank = v => { const idx = v.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]); const r = []; idx.forEach((p, k) => r[p[1]] = k + 1); return r; };
      const rD = rank(cd3(d)), rC = det ? rank(cd3(det)) : null;
      const rows = NODES.map((n, i) => ({
        cls: rC && rC[i] !== rD[i] ? 'hi' : '', cells: [n, f(d[i], 1), det ? f(o1[i], 1) : '–', det ? f(o2[i], 1) : '–', det ? f(det[i] - d[i] - o1[i] - o2[i], 1) : '∞', det ? f(det[i], 1) : 'diverges',
          mm.nodes[i].n ? f(mm.nodes[i].median, 1) : '–', mm.nodes[i].n ? f(mm.nodes[i].p95, 1) : '–', String(rD[i]), rC ? String(rC[i]) : '–']
      }));
      $('o3').innerHTML =
        cards([['ρ(W) at month 0', f(rho0, 2), 'no noise, no growth', rho0 >= 1 ? 'bad' : ''], [`ρ(W) at month ${M}`, f(rhoM, 2), 'no noise', rhoM >= 1 ? 'bad' : ''], [`P(ρ ≥ 1) at month ${M}`, f(mm.pDiverge * 100, 1) + '%', 'with edge noise', mm.pDiverge > 0.1 ? 'bad' : 'good'], ['First month with P ≥ 10%', (mc.find(x => x.pDiverge >= 0.1) || { month: 'none' }).month, 'integration-wall risk']]) +
        chart({ series: [{ pts: mc.map(x => [x.month, x.pDiverge * 100]), color: COL.red }], xlabel: 'Program month', ylabel: 'Probability ρ(W) ≥ 1 (%)', ymin: 0, ymax: 100, xmin: 0, xmax: 12, title: 'Divergence probability', cap: 'Probability that the delay-cost series diverges (the integration wall), given noisy and growing coupling.' }) +
        chart({ h: 240, series: [{ pts: mc.map(x => [x.month, x.rhoMedian]), color: COL.blue, label: 'Median ρ(W)' }, { pts: mc.map(x => [x.month, x.rhoP95]), color: COL.orange, label: '95th percentile ρ(W)', dash: '6 4' }], hlines: [{ y: 1, label: 'ρ = 1: divergence' }], xlabel: 'Program month', ylabel: 'Spectral radius', ymin: 0, xmin: 0, xmax: 12, title: 'Spectral radius over time' }) +
        `<h3>Delay cost at month ${M}</h3>` +
        table(['Node', 'Direct d', '+ 1st-order', '+ 2nd-order', '+ higher orders', 'CCoD (no noise)', 'MC median', 'MC P95', 'Rank by d/duration', 'Rank by CCoD/duration'], rows) +
        `<div class="callout"><b>Reading this</b>The columns d, +1st, +2nd and higher orders add up to the CCoD column (the Neumann series in eq. 6). Monte Carlo median and P95 exclude draws that diverge (${f(mm.pDiverge * 100, 1)}% at this month). Rows shaded pink are nodes whose priority changes once coupling is counted: the CD3 sequencing rule (cost ÷ duration) puts a different item first. When ρ(W) reaches 1, delay costs have no finite value and the series is shown as divergent.</div>`;
      b.classList.remove('busy'); ran3 = true;
    }, 30);
  };
  $('run3').addEventListener('click', renderers.t3);
  const t3open = renderers.t3; renderers.t3 = function () { if (!ran3) t3open(); };
  $('run3').addEventListener('click', () => { ran3 = true; });

  /* ======================= STEP 4 ======================= */
  const ST0 = [[5, 20], [6, 15], [5, 10], [7, 10], [5, 17], [5, 19]];
  (function () {
    let h = '<table class="compact"><thead><tr><th>Stage</th><th>People n</th><th>Output per person per day</th><th>Technology multiplier</th></tr></thead><tbody>';
    NODES.forEach((n, i) => h += `<tr><td><b>${n}</b></td><td><input id="n4_${i}" type="number" min="1" step="1" value="${ST0[i][0]}"></td><td><input id="r4_${i}" type="number" min="0.1" step="0.5" value="${ST0[i][1]}"></td><td><input id="m4_${i}" type="number" min="0.5" max="5" step="0.1" value="1"></td></tr>`);
    $('stageedit').innerHTML = h + '</tbody></table>';
  })();
  const readStages = (mult) => NODES.map((n, i) => ({ name: n, n: Math.max(1, Math.round(parseFloat($('n4_' + i).value) || 1)), rate: parseFloat($('r4_' + i).value) || 1, mult: mult ? mult(i) : (parseFloat($('m4_' + i).value) || 1) }));
  renderers.t4 = function () {
    const demand = num('dem4'), S = readStages(), r = C.stageMetrics(S, demand);
    const lift = S.map((s, i) => { const r2 = C.stageMetrics(readStages(k => k === i ? S[k].mult * 1.2 : S[k].mult), demand); return { name: s.name, d: r2.throughput - r.throughput, nb: r2.rows[r2.bottleneck].name, i }; }).sort((a, b) => b.d - a.d);
    const totalWait = r.rows.reduce((s, x) => s + x.wq, 0);
    const rows = r.rows.map((x, i) => ({ cls: i === r.bottleneck ? 'hi' : '', cells: [x.name, String(x.n), f(x.tpc, 1), f(x.cap, 1), f(x.rho * 100, 0) + '%', x.wq === Infinity ? 'unstable' : f(x.wq * 24, 1) + ' h'] }));
    // bar chart
    const narrowBar = window.innerWidth < 640, Wd = narrowBar ? 440 : 680, Hd = 250, mx = Math.max(demand, ...r.rows.map(x => x.cap)) * 1.1, bw = narrowBar ? 50 : 70, gap = (Wd - 70 - bw * 6) / 6;
    let g = '';
    r.rows.forEach((x, i) => { const hx = x.cap / mx * 190, X = 60 + i * (bw + gap) + gap / 2; g += `<rect x="${X}" y="${215 - hx}" width="${bw}" height="${hx}" fill="${i === r.bottleneck ? COL.red : COL.blue}" opacity=".85"/><text x="${X + bw / 2}" y="${210 - hx}" font-size="11" text-anchor="middle">${f(x.cap, 0)}</text><text x="${X + bw / 2}" y="232" font-size="10" text-anchor="middle">${esc(x.name.split(' ')[0])}</text>`; });
    const yd = 215 - demand / mx * 190;
    g += `<line x1="55" x2="${Wd - 10}" y1="${yd}" y2="${yd}" stroke="#222" stroke-dasharray="5 4"/><text x="${Wd - 12}" y="${yd - 4}" font-size="11" text-anchor="end">demand ${demand}/day</text><line x1="55" x2="55" y1="20" y2="215" stroke="#333"/><line x1="55" x2="${Wd - 10}" y1="215" y2="215" stroke="#333"/><text transform="rotate(-90)" x="-110" y="14" font-size="12" text-anchor="middle">Capacity (items/day)</text>`;
    $('o4').innerHTML =
      cards([['System throughput', f(r.throughput, 1), 'items/day (eq. 11)', r.throughput < demand ? 'bad' : 'good'], ['Constraint', r.rows[r.bottleneck].name, 'lowest capacity'], ['Unmet demand', f(Math.max(0, demand - r.throughput), 1), 'items/day', demand > r.throughput ? 'bad' : 'good'], ['Total mean wait', totalWait === Infinity ? '∞' : f(totalWait * 24, 1) + ' h', 'sum of stage waits (M/M/c)']]) +
      `<div class="chart"><svg viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="Capacity by stage">${g}</svg><div class="cap">Capacity by stage against demand. The red bar is the constraint.</div></div>` +
      table(['Stage', 'People', 'TPC (per person/day)', 'Capacity n·TPC', 'Utilization', 'Mean wait Wq'], rows) +
      `<h3>Where would a 20% technology gain pay off?</h3>` +
      table(['Stage improved by 20%', 'Throughput gain (items/day)', 'Constraint afterwards'], lift.map(l => ({ cls: l.d > 0 ? 'ok' : '', cells: [l.name, f(l.d, 1), l.nb] }))) +
      `<div class="callout"><b>Reading this</b>Improving a stage that is not the constraint raises its own TPC but leaves system throughput unchanged. That is the test the research agenda calls for. Utilization above 100% means demand exceeds that stage and its queue grows without bound ("unstable"). Waits use the Erlang C formula for c servers with Poisson arrivals and exponential service.</div>`;
  };
  $('dem4').addEventListener('input', debounce(renderers.t4, 100));
  $('stageedit').addEventListener('input', debounce(renderers.t4, 100));

  /* ======================= STEP 5 ======================= */
  const DES0 = [['Fully insured (carrier bears risk)', 0.3, 0.55, 1, 1.15, false], ['Captive + stop-loss', 0.6, 0.60, 1, 1.05, true], ['Captive + stop-loss + opt-in wellness', 1.2, 0.68, 0.6, 1.05, true]];
  (function () {
    let h = '<table><thead><tr><th>Design</th><th>Reversion speed θ (per yr)</th><th>Target cooperation p*</th><th>Participation (0–1)</th><th>Cost loading</th><th>Stop-loss?</th></tr></thead><tbody>';
    DES0.forEach((d, i) => h += `<tr><td><b>${d[0]}</b></td><td><input id="th5_${i}" type="number" step="0.1" min="0.05" value="${d[1]}"></td><td><input id="ps5_${i}" type="number" step="0.01" min="0.05" max="0.95" value="${d[2]}"></td><td><input id="pa5_${i}" type="number" step="0.1" min="0" max="1" value="${d[3]}"></td><td><input id="lo5_${i}" type="number" step="0.01" min="0.5" value="${d[4]}"></td><td><input id="sl5_${i}" type="checkbox" ${d[5] ? 'checked' : ''} style="width:auto"></td></tr>`);
    $('govedit').innerHTML = h + '</tbody></table><p class="small">The first row is the baseline: other designs\' θ and p* apply in proportion to their participation, measured from the baseline values.</p>';
  })();
  let ran5 = false;
  renderers.t5 = function () {
    const b = $('run5'); b.classList.add('busy'); $('o5').innerHTML = '<p class="small">Simulating three designs…</p>';
    setTimeout(() => {
      const g = { years: num('yrs5'), shockYear: num('shy5'), shock: num('sh5'), paths: Math.round(num('paths5')), members: num('mem5'), baseCost: 6000, k: 0.8, jumpRate: num('jr5'), xm: 50000, alpha: 1.8, slLoad: 1.25, sigma: 0.15, thetaBase: parseFloat($('th5_0').value), pstarBase: parseFloat($('ps5_0').value) };
      const res = DES0.map((d, i) => C.simulateGovernance({ theta: parseFloat($('th5_' + i).value), pstar: parseFloat($('ps5_' + i).value), participation: i === 0 ? 1 : parseFloat($('pa5_' + i).value), loading: parseFloat($('lo5_' + i).value), attach: $('sl5_' + i).checked ? num('att5') : null }, g, 21 + i));
      const cols = [COL.orange, COL.sky, COL.green];
      const fans = res.map((r, i) => chart({ w: 380, h: 250, bands: [{ upper: r.fan.map((q, w) => [w / 52, q[2]]), lower: r.fan.map((q, w) => [w / 52, q[0]]), color: cols[i] }], series: [{ pts: r.fan.map((q, w) => [w / 52, q[1]]), color: cols[i] }], xlabel: 'Year', ylabel: 'Cooperation share p', ymin: 0, ymax: 1, xmin: 0, xmax: g.years, title: DES0[i][0], cap: `<b>${esc(DES0[i][0])}</b>: median and 5–95% band` }));
      const all = res.flatMap(r => r.cost), lo = Math.min(...all) * 0.98, hi = C.quantile(C.sorted(all), 0.995) * 1.02;
      const rows = res.map((r, i) => [DES0[i][0], money(r.mean), money(r.p50), money(r.p95), money(r.p99), money(r.slPrem), f(r.recoveryWeeks, 0)]);
      const best95 = res.reduce((bi, r, i) => r.p95 < res[bi].p95 ? i : bi, 0), fast = res.reduce((bi, r, i) => r.recoveryWeeks < res[bi].recoveryWeeks ? i : bi, 0);
      $('o5').innerHTML =
        `<div class="three">${fans.join('')}</div>` +
        chart({ series: res.map((r, i) => ({ pts: density(r.cost, lo, hi, 36), color: cols[i], label: DES0[i][0] })), xlabel: 'Employer cost per member-year ($)', ylabel: 'Density', ymin: 0, title: 'Annual cost distribution', cap: 'Distribution of annual employer cost per member across all simulated paths and years, including the stop-loss premium.' }) +
        table(['Design', 'Mean cost', 'Median', 'P95', 'P99', 'Stop-loss premium', 'Weeks to recover after shock'], rows) +
        `<div class="callout"><b>Reading this</b>Lowest 95th-percentile cost in this run: <strong>${esc(DES0[best95][0])}</strong>. Fastest recovery after the shock: <strong>${esc(DES0[fast][0])}</strong>. Both follow from the placeholder parameters above, and with different inputs the ranking can change. The point of the method is the comparison of full distributions (the tail and the recovery time), which a single average cost hides. "Weeks to recover" is the time for p to return within 0.05 of its target after the shock, and runs that never recover within the horizon count at the full remaining time.</div>`;
      b.classList.remove('busy'); ran5 = true;
    }, 30);
  };
  $('run5').addEventListener('click', renderers.t5);
  const t5open = renderers.t5; renderers.t5 = function () { if (!ran5) t5open(); };
  $('run5').addEventListener('click', () => { ran5 = true; });

  /* ======================= STEP 6 ======================= */
  $('txt6').value = [
    'Employer: Health insurance costs are crushing small businesses, and workers need affordable plans with predictable premiums.',
    'Wellness advocate: Healthy habits and prevention lower chronic disease, so workers who take care of their health should be rewarded with lower costs.',
    'Privacy advocate: Employer access to wearable and biometric data threatens worker privacy and invites discrimination against people who are sick.',
    'Actuary: Stop-loss reinsurance caps catastrophic claims, so an employer can retain predictable risk and price the tail.',
    'Patient: I wait weeks for prior authorization and nobody can tell me why my claim was denied.',
    'Clinic manager: Prior authorization and claims denials delay care and add administrative work for every patient and clinic.'
  ].join('\n');
  renderers.t6 = function () {
    const lines = $('txt6').value.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => { const k = l.indexOf(':'); return k > 0 && k < 40 ? [l.slice(0, k), l.slice(k + 1).trim()] : ['Statement ' + (i + 1), l]; });
    if (lines.length < 2) { $('o6').innerHTML = '<p class="err">Enter at least two statements.</p>'; return; }
    const V = C.tfidf(lines.map(l => l[1])), n = lines.length;
    const M = lines.map((_, i) => lines.map((_, j) => C.cosine(V[i], V[j])));
    const heat = v => `background:rgba(31,78,121,${(0.08 + 0.85 * v).toFixed(2)});color:${v > 0.5 ? '#fff' : '#111'}`;
    let t = '<table class="heat"><thead><tr><th></th>' + lines.map(l => `<th>${esc(l[0])}</th>`).join('') + '</tr></thead><tbody>';
    lines.forEach((l, i) => { t += `<tr><th>${esc(l[0])}</th>` + lines.map((_, j) => i === j ? '<td style="background:#eee">1</td>' : `<td style="${heat(M[i][j])}">${f(M[i][j])}</td>`).join('') + '</tr>'; });
    t += '</tbody></table>';
    const pairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j, M[i][j]]);
    pairs.sort((a, b) => a[2] - b[2]);
    const orth = pairs.filter(p => p[2] < 0.05), near = pairs.slice().reverse().slice(0, 3);
    const shared = (i, j) => Object.keys(V[i]).filter(w => V[j][w]).sort((a, b) => V[i][b] * V[j][b] - V[i][a] * V[j][a]);
    // bridge terms: words appearing in the most distinct statements
    const df = {}; V.forEach(v => Object.keys(v).forEach(w => df[w] = (df[w] || 0) + 1));
    const bridge = Object.keys(df).filter(w => df[w] >= 2).sort((a, b) => df[b] - df[a]).slice(0, 12);
    $('o6').innerHTML =
      cards([['Statements', String(n), ''], ['Orthogonal pairs', String(orth.length), 'cosine below 0.05', orth.length ? 'bad' : ''], ['Mean similarity', f(C.mean(pairs.map(p => p[2]))), 'across all pairs']]) +
      '<h3>Cosine similarity (eq. 12)</h3>' + t +
      '<h3>Most similar pairs and their shared terms</h3>' +
      table(['Pair', 'Cosine', 'Shared terms'], near.map(p => [esc(lines[p[0]][0]) + ' ↔ ' + esc(lines[p[1]][0]), f(p[2]), esc(shared(p[0], p[1]).slice(0, 6).join(', ') || '–')]), { left: true }) +
      '<h3>Least similar pairs</h3>' +
      table(['Pair', 'Cosine'], pairs.slice(0, 4).map(p => [esc(lines[p[0]][0]) + ' ↔ ' + esc(lines[p[1]][0]), f(p[2])]), { left: true, cls: 'fit' }) +
      `<div class="callout"><b>Bridge terms</b>Words used by more than one statement are candidate shared framings: ${bridge.length ? esc(bridge.join(', ')) : 'none found'}. A message built around them overlaps the most audiences.</div>`;
  };
  $('txt6').addEventListener('input', debounce(renderers.t6, 300));


  /* ======================= CONTRACTING (chapter 9 method) ======================= */
  const lines8 = id => $(id).value.split(/\n/).map(l => l.split(/[,\t]/).map(x => x.trim())).filter(p => p.length > 1 || (p[0] || '') !== '');
  const pct = (x, d = 1) => (x == null || isNaN(x)) ? '–' : (x * 100).toFixed(d) + '%';
  renderers.t8 = function () {
    /* --- 1. volume, rate, absorption --- */
    const vol = lines8('vol8').map(p => ({ label: p[0], base: parseFloat(p[1]), p: parseFloat(p[2]) })).filter(x => isFinite(x.base) && x.base > 0 && x.p >= 0 && x.p <= 1);
    const F = num('fix8'), v = num('var8'), act = num('act8');
    if (!vol.length || !isFinite(F) || !isFinite(v) || !(act > 0)) { $('o8a').innerHTML = '<p class="err">Enter at least one valid expected-work line (label, base dollars, probability 0 to 1), and the cost and actual-base values.</p>'; }
    else {
      const est = C.expectedVolume(vol), a = C.absorption({ fixed: F, varRate: v, baseEst: est, baseAct: act }), lost = C.rateIfLost(vol, F, v);
      const xs = []; for (let i = 0; i <= 40; i++) xs.push(est * 2 * i / 40);
      const sens = [0.6, 0.8, 1, 1.2, 1.4].map(k => { const b = est * k, r = C.absorption({ fixed: F, varRate: v, baseEst: est, baseAct: b }); return { cls: k === 1 ? 'ok' : (r.variance < 0 ? 'hi' : ''), cells: [Math.round(k * 100) + '% of forecast', money(b), pct(r.rateActual, 1), money(r.applied), money(r.actualPool), money(r.variance)] }; });
      $('o8a').innerHTML =
        table(['Source of work', 'Base ($)', 'Probability', 'Expected base ($)'], vol.map(x => [esc(x.label), money(x.base), pct(x.p, 0), money(x.base * x.p)]).concat([{ cls: 'ok', cells: ['Expected base', '', '', money(est)] }])) +
        cards([['Forecast rate', pct(a.rate, 1), 'pool ÷ expected base'], ['Fixed share of pool', pct(a.fixedShare, 0), 'drives sensitivity'], ['Rate at actual base', pct(a.rateActual, 1), 'what the pool really cost per $ of base', Math.abs(a.rateActual - a.rate) / a.rate > 0.05 ? 'bad' : ''], ['Applied − actual pool', money(a.variance), a.variance < 0 ? 'under-absorbed' : 'over-absorbed', a.variance < 0 ? 'bad' : 'good'], ['Rate if largest source is lost', pct(lost.after, 1), 'from ' + pct(lost.before, 1)]]) +
        chart({ series: [{ pts: xs.map(x => [x / 1e6, C.absorption({ fixed: F, varRate: v, baseEst: est, baseAct: x }).applied / 1e6]), color: COL.blue, label: 'Applied (forecast rate × base)' }, { pts: xs.map(x => [x / 1e6, (F + v * x) / 1e6]), color: COL.red, label: 'Budget (fixed + variable)' }], xlabel: 'Allocation base ($ millions)', ylabel: 'Indirect cost ($ millions)', xmin: 0, ymin: 0, title: 'Applied versus budgeted indirect cost', cap: 'The applied line passes through zero because indirect cost can only be charged against work that is performed. The budget line starts at the fixed cost. The lines cross at the forecast base. Left of that point the pool is under-applied, and right of it over-applied.' }) +
        table(['If the base is', 'Base', 'Rate that would have been right', 'Applied at forecast rate', 'Actual pool', 'Applied − actual'], sens) +
        `<div class="callout"><b>Reading this</b>The forecast rate is right only if the base lands on the forecast. Red rows are under-absorbed: the contractor has charged less than the pool cost, and on a fixed-price contract the gap is its loss. That gap is the moment a contractor asks for more. A buyer that sees the fixed share, the probability weights and the sensitivity table at bid time is not surprised by the request. The ${pct(a.fixedShare, 0)} fixed share is why a 20% volume miss moves the rate by ${pct(C.absorption({ fixed: F, varRate: v, baseEst: est, baseAct: est * 0.8 }).rateActual / a.rate - 1, 1)}.</div>`;
    }
    /* --- 2. accuracy history --- */
    const hist = lines8('hist8').map(p => ({ label: p[0], proj: parseFloat(p[1]), actual: parseFloat(p[2]) })).filter(x => isFinite(x.proj) && x.actual > 0);
    if (!hist.length) { $('o8b').innerHTML = '<p class="err">Enter at least one period as: label, projected rate %, actual rate %.</p>'; }
    else {
      const q = C.rateAccuracy(hist);
      const verdict = q.nOver === hist.length ? 'Over-estimated every period' : q.nUnder === hist.length ? 'Under-estimated every period' : 'Mixed';
      $('o8b').innerHTML =
        table(['Period', 'Projected %', 'Actual %', 'Error (points)', 'Relative error'], hist.map((x, i) => ({ cls: q.errs[i] < 0 ? 'hi' : '', cells: [esc(x.label), f(x.proj, 1), f(x.actual, 1), f(x.proj - x.actual, 1), pct(q.errs[i], 2)] }))) +
        cards([['Average relative error', pct(q.bias, 2), q.bias > 0 ? 'over-estimate' : 'under-estimate', q.bias < 0 ? 'bad' : ''], ['Average absolute error', pct(q.mae, 2), ''], ['Pattern', verdict, q.nOver + ' over, ' + q.nUnder + ' under']]) +
        `<div class="callout"><b>Reading this</b>A positive error means the projected rate was higher than the actual rate, so customers were charged more than the cost. With the chapter's data the average over-estimate is about 1.8%, or about $101.80 charged for every $100 of cost. A negative error is an under-estimate, shown in red, and is the pattern behind requests for more money later. The test is symmetric: a contractor that pads every year is no more reliable than one that cuts every year.</div>`;
    }
    /* --- 3. rate application --- */
    const els = lines8('apply8').map(p => ({ name: p[0], direct: parseFloat(p[1]), rate: parseFloat(p[2]) / 100 })).filter(x => x.name && isFinite(x.direct) && isFinite(x.rate));
    const ga = num('ga8') / 100;
    if (!els.length || !isFinite(ga)) { $('o8c').innerHTML = '<p class="err">Enter cost elements as: element, direct dollars, overhead rate %, and a G&amp;A rate.</p>'; }
    else {
      const r = C.applyRates(els, ga);
      $('o8c').innerHTML =
        table(['Cost element', 'Direct ($)', 'Overhead ($)', 'Subtotal ($)'], r.lines.map(l => [esc(l.name), money(l.direct), money(l.oh), money(l.direct + l.oh)]).concat([{ cls: 'ok', cells: ['Total input cost', '', '', money(r.input)] }, ['G&A @ ' + f(ga * 100, 1) + '% of total input', '', '', money(r.ga)], { cls: 'ok', cells: ['Total cost', '', '', money(r.total)] }])) +
        `<p class="small">Indirect costs are ${pct(r.indirectShare, 0)} of this estimate. Differences between a buyer's and a seller's estimate come from two places: the rate, and the size of the base. Even with an accepted rate, a lower base gives a lower indirect cost.</p>`;
    }
    /* --- 4. contractor screen --- */
    const tr = lines8('trk8').map(p => ({ who: p[0], award: parseFloat(p[2]), final: parseFloat(p[3]) })).filter(x => x.who && x.award > 0 && isFinite(x.final));
    const o = { tol: num('tol8') / 100, minN: Math.max(1, num('minn8') || 3), minShare: (num('mins8') || 60) / 100 };
    if (!tr.length || !isFinite(o.tol)) { $('o8d').innerHTML = '<p class="err">Enter contracts as: contractor, contract, awarded $, final $.</p>'; }
    else {
      const res = C.trackRecord(tr, o), lab = { under: 'Consistent under-estimator', over: 'Consistent over-estimator', ok: 'Within tolerance', short: 'Too few contracts to judge' };
      $('o8d').innerHTML =
        table(['Contractor', 'Contracts', 'Average change after award', 'Above tolerance', 'Below tolerance', 'Screen result'], res.map(x => ({ cls: x.flag === 'under' ? 'hi' : x.flag === 'ok' ? 'ok' : '', cells: [esc(x.who), x.n, pct(x.mean, 1), x.up + ' of ' + x.n, x.down + ' of ' + x.n, lab[x.flag]] }))) +
        `<div class="callout warn"><b>Screen, not verdict</b>A contractor is flagged when at least ${f(o.minShare * 100, 0)}% of its contracts (and at least ${o.minN}) ended more than ${f(o.tol * 100, 0)}% away from the award price in one direction. Look at why each contract changed before relying on a flag. Scope changes the buyer requested are not underestimates. A short record is not evidence either way, and FAR 15.305(a)(2)(iv) says an offeror with no record is not to be rated favorably or unfavorably on it.</div>`;
    }
    /* --- 5. ledger --- */
    const led = lines8('led8').map(p => ({ ref: p[0], type: (p[1] || '').toLowerCase(), pool: p[2] || '', amount: parseFloat(p[3]) })).filter(x => x.ref && (x.type === 'direct' || x.type === 'indirect') && isFinite(x.amount));
    if (!led.length) { $('o8e').innerHTML = '<p class="err">Enter transactions as: reference, direct or indirect, pool, amount.</p>'; }
    else {
      const L = C.ledgerCheck(led), pl = [...L.pools.entries()];
      const issues = [];
      L.noPool.forEach(r => issues.push([esc(r.ref), 'Indirect charge with no pool', money(r.amount)]));
      const seen = new Set(); L.dup.forEach(r => { if (!seen.has(r.ref)) { seen.add(r.ref); const amt = L.dup.filter(x => x.ref === r.ref).reduce((a, x) => a + x.amount, 0); issues.push([esc(r.ref), 'Charged as both a direct and an indirect cost (possible double charge)', money(amt)]); } });
      $('o8e').innerHTML =
        cards([['Total charged', money(L.total), led.length + ' lines'], ['Untraceable or doubled', money(L.untraced), pct(L.share, 1) + ' of total', L.share > 0 ? 'bad' : 'good'], ['Pools used', pl.length, pl.map(x => esc(x[0])).join(', ')]]) +
        (issues.length ? table(['Reference', 'Issue', 'Amount'], issues, { left: false }) : '<p class="small">No issues found by these two checks.</p>') +
        `<div class="callout"><b>Reading this</b>Two checks only: an indirect charge needs a named pool, and one reference cannot appear as both a direct and an indirect cost (the chapter's "erroneous double charges"). Untraceable and doubled dollars are shown together, so a line can be counted once in the total even when it breaks both rules. A buyer that can follow every dollar from pool to contract is the buyer that is not surprised later.</div>`;
    }
  };
  ['vol8', 'fix8', 'var8', 'act8', 'hist8', 'apply8', 'ga8', 'trk8', 'tol8', 'minn8', 'mins8', 'led8'].forEach(id => $(id).addEventListener('input', debounce(() => renderers.t8(), 200)));
  /* ---------- mobile support ---------- */
  // Wrap every table in a horizontally scrollable box so wide tables never push the page sideways.
  function wrapTables(root) {
    root.querySelectorAll('table').forEach(t => {
      if (t.parentElement && t.parentElement.classList.contains('tscroll')) return;
      const d = document.createElement('div'); d.className = 'tscroll';
      t.parentNode.insertBefore(d, t); d.appendChild(t);
    });
  }
  const mainEl = document.querySelector('main');
  wrapTables(mainEl);
  new MutationObserver(() => wrapTables(mainEl)).observe(mainEl, { childList: true, subtree: true });
  // Charts choose their size from the screen width, so redraw when the layout class changes (rotation, resize).
  let wasNarrow = window.innerWidth < 640;
  window.addEventListener('resize', debounce(() => {
    const now = window.innerWidth < 640;
    if (now === wasNarrow) return;
    wasNarrow = now;
    const open = document.querySelector('.tab.on');
    if (open && renderers[open.id] && open.id !== 't0') renderers[open.id]();
  }, 300));

  show('t0');
})();
