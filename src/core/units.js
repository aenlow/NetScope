// Unit helpers. All geometry and RF math inside NetScope runs in meters;
// feet exist only at the display boundary.

export const FT_PER_M = 1 / 0.3048;
export const M_PER_FT = 0.3048;

export const ftToM = (ft) => ft * M_PER_FT;
export const mToFt = (m) => m * FT_PER_M;

/** Convert a length in meters to the display unit. */
export function lenOut(m, units) {
  return units === 'ft' ? mToFt(m) : m;
}

/** Convert a length typed in the display unit to meters. */
export function lenIn(v, units) {
  return units === 'ft' ? ftToM(v) : v;
}

export function areaOut(m2, units) {
  return units === 'ft' ? m2 * FT_PER_M * FT_PER_M : m2;
}

export const lenLabel = (units) => (units === 'ft' ? 'ft' : 'm');
export const areaLabel = (units) => (units === 'ft' ? 'sq ft' : 'm²');

/** Typographic minus for negative readings (dBm). */
export function signed(v, digits = 0) {
  if (!Number.isFinite(v)) return '—';
  const s = Math.abs(v).toFixed(digits);
  if (Number(s) === 0) return s;
  return (v < 0 ? '−' : '') + s;
}

export function fmtLen(m, units, digits = 1) {
  if (!Number.isFinite(m)) return '—';
  return `${lenOut(m, units).toFixed(digits)} ${lenLabel(units)}`;
}

export function fmtArea(m2, units) {
  if (!Number.isFinite(m2)) return '—';
  const v = areaOut(m2, units);
  return `${Math.round(v).toLocaleString('en-US')} ${areaLabel(units)}`;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
