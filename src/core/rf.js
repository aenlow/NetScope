// Radio math: path loss, antenna patterns, noise, MCS and data-rate estimates.
// Units: distance in meters, frequency in MHz, power in dBm, gains/losses in dB.

/** FSPL constant for d in meters and f in MHz: 20·log10(4π·10^6 / c) = −27.55 dB. */
export const FSPL_CONST_M_MHZ = 20 * Math.log10((4 * Math.PI * 1e6) / 299792458);
/** Same constant for d in feet: −27.55 + 20·log10(0.3048) = −37.87 dB. */
export const FSPL_CONST_FT_MHZ = FSPL_CONST_M_MHZ + 20 * Math.log10(0.3048);

export const MIN_DISTANCE_M = 0.1;

/** Free-space path loss in dB, d in meters, f in MHz. */
export function fspl(dM, fMHz) {
  const d = Math.max(MIN_DISTANCE_M, dM);
  return 20 * Math.log10(d) + 20 * Math.log10(fMHz) + FSPL_CONST_M_MHZ;
}

/**
 * Log-distance path loss referenced to free space at 1 m.
 * n = 2 reproduces free space exactly; higher n models un-drawn clutter.
 */
export function pathLoss(dM, fMHz, n = 2) {
  const d = Math.max(MIN_DISTANCE_M, dM);
  if (d <= 1 || n === 2) return fspl(d, fMHz);
  return fspl(1, fMHz) + 10 * n * Math.log10(d);
}

/** Smallest signed angle difference in degrees, result in [0, 180]. */
export function angleOff(a, b) {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Antenna gain (dBi) toward an azimuth.
 * Omni: constant. Directional: parabolic main lobe −12·(θ/θ3dB)² dB,
 * floored at the front-to-back ratio. Azimuth convention: 0° = +x (east),
 * angles increase clockwise on screen (y points down).
 */
export function antennaGain(ant, azimuthDeg, orientationDeg = 0) {
  if (!ant) return 0;
  const g = ant.gain || 0;
  if (ant.pattern !== 'directional') return g;
  const theta = angleOff(azimuthDeg, orientationDeg);
  const bw = Math.max(5, ant.beamwidth || 60);
  const fbr = ant.frontToBack ?? 20;
  return g - Math.min(12 * (theta / bw) ** 2, fbr);
}

/** Thermal noise floor in dBm for a channel width (MHz) and receiver noise figure (dB). */
export function noiseFloor(widthMHz, nf = 6) {
  return -174 + 10 * Math.log10(widthMHz * 1e6) + nf;
}

// Modulation and coding per MCS index: [bits per subcarrier, coding rate].
export const MCS_TABLE = [
  [1, 1 / 2], [2, 1 / 2], [2, 3 / 4], [4, 1 / 2], [4, 3 / 4], [6, 2 / 3], [6, 3 / 4], [6, 5 / 6],
  [8, 3 / 4], [8, 5 / 6], [10, 3 / 4], [10, 5 / 6], [12, 3 / 4], [12, 5 / 6],
];
export const MCS_NAMES = ['BPSK 1/2', 'QPSK 1/2', 'QPSK 3/4', '16-QAM 1/2', '16-QAM 3/4', '64-QAM 2/3', '64-QAM 3/4', '64-QAM 5/6', '256-QAM 3/4', '256-QAM 5/6', '1024-QAM 3/4', '1024-QAM 5/6', '4096-QAM 3/4', '4096-QAM 5/6'];

/**
 * Minimum SNR (dB) for each MCS. Typical planning values, editable in
 * project settings. Real receivers vary by several dB.
 */
export const DEFAULT_MCS_SNR = [5, 8, 11, 14, 18, 22, 24, 26, 29, 32, 35, 38, 41, 44];

// PHY generations: data subcarriers per width, symbol duration (µs), top MCS.
export const PHY = {
  4: { name: 'Wi-Fi 4 (802.11n)', nsd: { 20: 52, 40: 108 }, sym: 3.6, maxMcs: 7 },
  5: { name: 'Wi-Fi 5 (802.11ac)', nsd: { 20: 52, 40: 108, 80: 234, 160: 468 }, sym: 3.6, maxMcs: 9 },
  6: { name: 'Wi-Fi 6/6E (802.11ax)', nsd: { 20: 234, 40: 468, 80: 980, 160: 1960 }, sym: 13.6, maxMcs: 11 },
  7: { name: 'Wi-Fi 7 (802.11be)', nsd: { 20: 234, 40: 468, 80: 980, 160: 1960, 320: 3920 }, sym: 13.6, maxMcs: 13 },
};

/** Generation number from a label such as '6E' or 'Wi-Fi 7'. */
export function genNumber(g) {
  const n = parseInt(String(g).replace(/[^0-9]/g, ''), 10);
  return [4, 5, 6, 7].includes(n) ? n : 6;
}

/**
 * PHY rate in Mbps from first principles:
 * data subcarriers × bits per subcarrier × coding rate × streams ÷ symbol time.
 * HT/VHT use the 0.4 µs short guard interval; HE/EHT use 0.8 µs.
 */
export function phyRate(gen, widthMHz, mcs, nss) {
  const p = PHY[gen];
  if (!p) return 0;
  let w = widthMHz;
  while (!p.nsd[w] && w > 20) w /= 2;
  const nsd = p.nsd[w];
  const m = MCS_TABLE[Math.min(mcs, p.maxMcs)];
  if (!nsd || !m) return 0;
  return (nsd * m[0] * m[1] * nss) / p.sym;
}

/** Highest MCS whose SNR threshold is met, capped by generation; −1 if none. */
export function mcsForSnr(snr, gen, thresholds = DEFAULT_MCS_SNR) {
  const top = PHY[gen]?.maxMcs ?? 11;
  let best = -1;
  for (let i = 0; i <= top; i++) if (snr >= thresholds[i]) best = i;
  return best;
}

/**
 * Link estimate between an AP radio and a client.
 * Returns { mcs, phy, throughput } where throughput = phy × efficiency.
 */
export function linkEstimate({ snr, apGen, apNss, apWidth, clientGen, clientNss, clientMaxWidth, efficiency = 0.65, thresholds }) {
  const gen = Math.min(apGen, clientGen);
  const nss = Math.max(1, Math.min(apNss, clientNss));
  const width = Math.min(apWidth, clientMaxWidth);
  const mcs = mcsForSnr(snr, gen, thresholds);
  if (mcs < 0) return { mcs: -1, phy: 0, throughput: 0, gen, nss, width };
  const phy = phyRate(gen, width, mcs, nss);
  return { mcs, phy, throughput: phy * efficiency, gen, nss, width };
}

export function dbmToMw(dbm) { return 10 ** (dbm / 10); }
export function mwToDbm(mw) { return mw > 0 ? 10 * Math.log10(mw) : -Infinity; }
