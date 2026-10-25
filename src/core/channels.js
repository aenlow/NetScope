// Automatic channel planning: weighted graph colouring over channel blocks.
// Radios that hear each other above the clear-channel threshold should not
// share spectrum; when that is impossible the planner minimises the overlap
// weighted by how loudly they hear each other.

import { blocksFor, isDfs, isPsc } from './bands.js';

/** Non-overlapping 2.4 GHz sets per region. */
export function nonOverlapping24(region) {
  return region === 'EU' ? [[1], [5], [9], [13]] : [[1], [6], [11]];
}

function blocksOverlap(band, a, b) {
  if (band === '2.4') {
    // 22 MHz masks: channels closer than 5 apart overlap.
    return a.some((x) => b.some((y) => Math.abs(x - y) < 5));
  }
  return a.some((x) => b.includes(x));
}

function primaryOf(band, block) {
  if (band === '6') return block.find((c) => isPsc(band, c)) ?? block[0];
  return block[0];
}

/**
 * radios: [{ key, width }] for one band.
 * weight(i, j): interference weight ≥ 0 between radios i and j.
 * Returns { assign: [{ ch, width, block }], conflicts: [{ a, b, weight }] }.
 */
export function planChannels(band, radios, weight, { region = 'US', allowDfs = false } = {}) {
  const n = radios.length;
  const W = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) W[i][j] = W[j][i] = weight(i, j);

  const options = radios.map((r) => {
    let list = band === '2.4' && r.width === 20 ? nonOverlapping24(region) : blocksFor(band, r.width, region, { allowDfs });
    if (!list.length) list = blocksFor(band, 20, region, { allowDfs });
    return list;
  });

  const assign = new Array(n).fill(null);
  const usage = new Map();
  const costOf = (i, block) => {
    let c = 0;
    for (let j = 0; j < n; j++) {
      if (j === i || !assign[j] || !W[i][j]) continue;
      if (blocksOverlap(band, block, assign[j])) c += W[i][j];
    }
    return c;
  };
  const pick = (i) => {
    let best = null, bestCost = Infinity, bestTie = Infinity;
    for (const block of options[i]) {
      const c = costOf(i, block);
      // Tie-breakers: fewer radios already on it, then non-DFS, then lower channel.
      const tie = (usage.get(block.join(',')) || 0) * 10 + (block.some((ch) => isDfs(band, ch)) ? 1 : 0);
      if (c < bestCost - 1e-9 || (Math.abs(c - bestCost) <= 1e-9 && tie < bestTie)) { best = block; bestCost = c; bestTie = tie; }
    }
    return best;
  };
  const setBlock = (i, block) => {
    if (assign[i]) usage.set(assign[i].join(','), (usage.get(assign[i].join(',')) || 1) - 1);
    assign[i] = block;
    usage.set(block.join(','), (usage.get(block.join(',')) || 0) + 1);
  };

  const order = [...Array(n).keys()].sort((a, b) => W[b].reduce((s, v) => s + v, 0) - W[a].reduce((s, v) => s + v, 0));
  for (const i of order) setBlock(i, pick(i));
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const i of order) {
      const cur = assign[i];
      const curCost = costOf(i, cur);
      const next = pick(i);
      if (next && next !== cur && costOf(i, next) < curCost - 1e-9) { setBlock(i, next); changed = true; }
    }
    if (!changed) break;
  }

  const conflicts = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (W[i][j] > 0 && blocksOverlap(band, assign[i], assign[j])) conflicts.push({ a: i, b: j, weight: W[i][j] });
  }
  return {
    assign: assign.map((block) => ({ block, width: block.length * 20, ch: primaryOf(band, block) })),
    conflicts,
  };
}

/** Interference weight from the stronger of the two directions' RSSI (dBm). */
export function couplingWeight(rssiDbm, ccaDbm = -82) {
  if (rssiDbm < ccaDbm - 6) return 0;
  return 10 ** ((rssiDbm - ccaDbm) / 10);
}
