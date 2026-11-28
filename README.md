# Torque per Capita: Research Agenda Model

Interactive companion to the white paper *The Last Will Be First and the First Will Be Last* (November 23, 2026). It implements the six research steps from section 11 of the paper.

## Run it

Open `index.html` in a browser. There is no build step, no server and no external library. Nothing is uploaded.

## Files

- `index.html`, `style.css`: page and styling.
- `js/core.js`: all model code (queue simulation, diffusion fit, coupling matrix, torque per capita, governance simulation, text similarity). It has no DOM code, so it can be tested in Node: `node -e "const C=require('./js/core.js'); console.log(Object.keys(C))"`.
- `js/ui.js`: reads the inputs, draws the SVG charts and tables.

## Steps and equations

| Tab | Agenda step | Paper equations |
|---|---|---|
| 1 Instrument a queue | Estimate λ, μ, ρ, WIP; check Little's Law; wait tails by pool (cost driver) with a delay-cost pool allocated by a base | 4 |
| 2 Fit the diffusion | Fit on first half, validate on held-out half, compare with a discrete-event baseline | 5 |
| 3 Coupling | Dependency matrix, coupled cost of delay, probability that the spectral radius reaches 1 | 6 |
| 4 Torque per capita | TPC by stage, constraint, where investment raises throughput | 10, 11 |
| 5 Governance | Compare three designs on the full outcome distribution and recovery time | 9 |
| 6 Narrative | Cosine similarity between statements, orthogonal pairs, bridge terms | 12 |
| Contracting | Stand-alone tab: indirect cost pools, allocation bases and rates; forward-pricing sensitivity; estimating track record; contractor screen; traceability checks. Method from the supplied chapter `indirect_cost_analysis.pdf`. | none (extension, not in section 11) |
| Ethics | Stand-alone page: a registered nurse's practitioner testimony beside published healthcare evidence, six principles, a pre-use checklist, references. No model code. | none (extension, not in section 11) |

## Data and limits

- All defaults are synthetic or placeholder. Step 1 accepts your own `arrival,start,end` timestamps (hours) so steps 1 and 2 can run on real data.
- Step 1 also accepts an optional fourth column in your timestamps, a pool name. Pools should be cost drivers known at intake (channel, language assistance needed, distance band, complexity), not demographic groups. The tab reports each pool's wait tail and allocates a delay-cost pool by a chosen base. With synthetic data the pools and an injected hold-up are made up.
- The Contracting tab's method comes from Chapter 9, "Analyzing Indirect Costs" (`indirect_cost_analysis.pdf`). Its defaults for sections 2 and 3 are the chapter's own numbers, and `node tests/indirect.test.js` reproduces them (300% rate, ±$5M absorption, $583,737 total, 1.8% average over-estimate). The contractor and ledger data are invented.
- Step 2 includes one extension that is not in the paper: a state-dependent drift, λ − μ·min(Q, c). On the synthetic default it fits the held-out data much better than equation 5 with constant drift.
- Step 5 parameters are assumptions, not estimates. Do not read its outputs as findings about any plan.
- Step 6 uses TF-IDF word counts, a crude proxy for meaning.
- Nothing here is medical, legal, actuarial or investment advice.

A Risk Runners project under Integral Mass.

Source: https://github.com/jeffy893/riskrunners/tree/dev/2.0/models/healthcare

Site: https://health.riskrunners.com

## The paper

The white paper this model implements is included in `paper/`: `The-Last-Will-Be-First_White-Paper.pdf` (15 pages) and `.html` (self-contained). The site links to both from a bar above the tabs (visible on every tab) and from the footer.

## License

GNU Affero General Public License v3.0. See `LICENSE`. If you run a modified version as a network service, the AGPL requires you to offer its source to the users of that service.
