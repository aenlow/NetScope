// Heatmap colour scales. The main scale runs dark blue-grey → grey → yellow
// with lightness rising steadily, in the spirit of cividis, so it stays
// readable with red-green colour blindness and in greyscale print.

export const SIGNAL_STOPS = [
  [0.0, [28, 42, 67]],
  [0.156, [52, 64, 90]],
  [0.311, [87, 93, 108]],
  [0.467, [124, 123, 120]],
  [0.622, [165, 156, 116]],
  [0.8, [210, 190, 95]],
  [1.0, [247, 224, 75]],
];

export const OVERLAP_COLORS = [
  [0, 0, 0, 0],
  [40, 58, 84, 210],
  [154, 107, 58, 220],
  [216, 137, 58, 230],
  [244, 201, 160, 235],
];

export function rampColor(t, stops = SIGNAL_STOPS) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    const [t0, c0] = stops[i - 1];
    if (x <= t1) {
      const k = (x - t0) / (t1 - t0 || 1);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k));
    }
  }
  return stops[stops.length - 1][1];
}

export function cssGradient(stops = SIGNAL_STOPS) {
  return `linear-gradient(90deg, ${stops.map(([t, c]) => `rgb(${c.join(',')}) ${(t * 100).toFixed(1)}%`).join(', ')})`;
}

/** View definitions: value domain, units and legend ticks. */
export const VIEWS = {
  signal: { label: 'Signal', unit: 'dBm', min: -90, max: -30, ticks: [-90, -80, -70, -60, -50, -40, -30], floor: -90 },
  secondary: { label: 'Secondary', unit: 'dBm', min: -90, max: -30, ticks: [-90, -80, -70, -60, -50, -40, -30], floor: -90 },
  snr: { label: 'SNR', unit: 'dB', min: 0, max: 50, ticks: [0, 10, 20, 30, 40, 50], floor: 0 },
  overlap: { label: 'Channel overlap', unit: 'radios', discrete: true },
  rate: { label: 'Data rate est.', unit: 'Mbps', min: 0, max: 1000, ticks: [0, 250, 500, 750, 1000], floor: 0.5 },
};

/** Build a 256-entry RGBA lookup for a continuous view. */
export function buildLut(alpha = 220) {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const c = rampColor(i / 255);
    lut.set([c[0], c[1], c[2], alpha], i * 4);
  }
  return lut;
}
