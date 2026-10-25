// Channel plans, frequencies and regulatory gates for 2.4, 5 and 6 GHz.
// A radio is described by its primary 20 MHz channel and its width; the
// occupied block is derived from those.

export const BANDS = ['2.4', '5', '6'];
export const BAND_LABEL = { '2.4': '2.4 GHz', '5': '5 GHz', '6': '6 GHz' };
export const WIDTHS = { '2.4': [20, 40], '5': [20, 40, 80, 160], '6': [20, 40, 80, 160, 320] };

export function centerFreq(band, ch) {
  if (band === '2.4') return ch === 14 ? 2484 : 2407 + 5 * ch;
  if (band === '5') return 5000 + 5 * ch;
  return 5950 + 5 * ch;
}

// 5 GHz bonding blocks (US channelization; regions filter them below).
const BLOCKS_5 = {
  20: [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165].map((c) => [c]),
  40: [[36, 40], [44, 48], [52, 56], [60, 64], [100, 104], [108, 112], [116, 120], [124, 128], [132, 136], [140, 144], [149, 153], [157, 161]],
  80: [[36, 40, 44, 48], [52, 56, 60, 64], [100, 104, 108, 112], [116, 120, 124, 128], [132, 136, 140, 144], [149, 153, 157, 161]],
  160: [[36, 40, 44, 48, 52, 56, 60, 64], [100, 104, 108, 112, 116, 120, 124, 128]],
};

function blocks6(width) {
  const n = width / 20;
  const out = [];
  for (let start = 1; start + (n - 1) * 4 <= 233; start += 4 * n) {
    const b = [];
    for (let i = 0; i < n; i++) b.push(start + 4 * i);
    out.push(b);
  }
  return out;
}

export const DFS_5 = new Set([52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144]);
export const isDfs = (band, ch) => band === '5' && DFS_5.has(ch);
export const isPsc = (band, ch) => band === '6' && ch >= 5 && (ch - 5) % 16 === 0;

/**
 * Regulatory domains. Channel sets are the commonly enabled indoor sets.
 * EIRP limits are used for warnings only.
 */
export const REGIONS = {
  US: {
    label: 'United States (FCC)',
    channels: {
      '2.4': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      '5': [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165],
      '6': range6(1, 233),
    },
    sixGhzClass: 'Low-power indoor',
  },
  EU: {
    label: 'Europe (ETSI)',
    channels: {
      '2.4': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      '5': [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140],
      '6': range6(1, 93),
    },
    sixGhzClass: 'Low-power indoor',
  },
  ANY: {
    label: 'Unrestricted (no regulatory checks)',
    channels: {
      '2.4': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      '5': BLOCKS_5[20].map((b) => b[0]),
      '6': range6(1, 233),
    },
    sixGhzClass: 'Not checked',
  },
};

function range6(lo, hi) {
  const out = [];
  for (let c = lo; c <= hi; c += 4) out.push(c);
  return out;
}

/** All bonding blocks for a band and width, filtered by region and DFS policy. */
export function blocksFor(band, width, region = 'US', { allowDfs = true } = {}) {
  const allowed = new Set((REGIONS[region] || REGIONS.US).channels[band] || []);
  let list;
  if (band === '2.4') {
    if (width === 20) list = [...allowed].map((c) => [c]);
    else list = [...allowed].filter((c) => allowed.has(c + 4)).map((c) => [c, c + 4]);
  } else if (band === '5') list = BLOCKS_5[width] || [];
  else list = blocks6(width);
  return list.filter((b) => b.every((c) => allowed.has(c)) && (allowDfs || !b.some((c) => isDfs(band, c))));
}

/** Primary channels selectable for a band/width in a region. */
export function primaryChannels(band, width, region = 'US', opts) {
  const out = [];
  for (const b of blocksFor(band, width, region, opts)) for (const c of b) out.push(c);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Block (list of 20 MHz channels) that contains a primary channel at a width. */
export function blockOf(band, ch, width) {
  if (band === '2.4') return width === 40 ? [ch, ch + 4] : [ch];
  const list = band === '5' ? BLOCKS_5[width] || [] : blocks6(width);
  return list.find((b) => b.includes(ch)) || null;
}

/** Occupied frequency range in MHz. 2.4 GHz uses a 22 MHz mask per 20 MHz channel. */
export function occupied(band, ch, width) {
  const b = blockOf(band, ch, width);
  if (!b) return null;
  const half = band === '2.4' ? 11 : 10;
  const lo = centerFreq(band, b[0]) - half;
  const hi = centerFreq(band, b[b.length - 1]) + half;
  return { lo, hi, center: (lo + hi) / 2, block: b };
}

/** True if two radios share spectrum (co-channel or partially overlapping). */
export function radiosOverlap(band, chA, wA, chB, wB) {
  const a = occupied(band, chA, wA);
  const b = occupied(band, chB, wB);
  if (!a || !b) return false;
  return Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 0.5;
}

/** Validate a radio's channel/width in a region; returns a list of problems. */
export function channelProblems(band, ch, width, region) {
  const problems = [];
  const reg = REGIONS[region] || REGIONS.US;
  const block = blockOf(band, ch, width);
  if (!block) problems.push(`Channel ${ch} cannot carry a ${width} MHz channel`);
  else if (!block.every((c) => reg.channels[band].includes(c)) && region !== 'ANY') {
    problems.push(`Channel ${ch} at ${width} MHz is not available in ${reg.label}`);
  }
  if (band === '2.4' && width > 20) problems.push('40 MHz on 2.4 GHz overlaps most of the band');
  return problems;
}

export function channelLabel(band, ch, width) {
  const tags = [];
  if (isDfs(band, ch)) tags.push('DFS');
  if (isPsc(band, ch)) tags.push('PSC');
  return `${ch}${width > 20 ? `/${width}` : ''}${tags.length ? ' ' + tags.join(' ') : ''}`;
}

/**
 * Indicative maximum EIRP (dBm) by band, channel and width, used only to warn.
 * Figures and their sources are listed in docs/regulatory.md; they vary with
 * device certification and local rules.
 */
export function eirpLimit(region, band, ch, width) {
  if (region === 'US') {
    if (band === '2.4') return 36;
    if (band === '5') {
      if (ch >= 52 && ch <= 144) return Math.min(30, 11 + 10 * Math.log10(width) + 6);
      return 36;
    }
    return Math.min(30, 5 + 10 * Math.log10(width));
  }
  if (region === 'EU') {
    if (band === '2.4') return 20;
    if (band === '5') return ch <= 64 ? 23 : 30;
    return Math.min(23, 10 + 10 * Math.log10(width));
  }
  return Infinity;
}
