// Built-in wall and zone materials. Every value is a planning estimate and
// is editable per project. Where a value follows a published measurement the
// source is noted; see docs/materials.md for the full references.

export const NIST_REF = 'NIST IR 6055 (Stone, 1997), as tabulated by wifivitae.com';

export const DEFAULT_MATERIALS = [
  {
    id: 'drywall', name: 'Drywall partition', loss: { '2.4': 3, '5': 4, '6': 4 }, color: '#CFC8BC', width: 2.5,
    note: 'Stud wall with two panels. NIST measured about 1 dB per single panel; studs, insulation and fixtures add loss.',
  },
  {
    id: 'glass', name: 'Glass, clear', loss: { '2.4': 2, '5': 2, '6': 2 }, color: '#9FC0C8', width: 2,
    note: 'NIST measured 1 dB for 6 mm glass at all three bands; framing adds a little.',
  },
  {
    id: 'glass-coated', name: 'Glass, coated / low-E', loss: { '2.4': 25, '5': 30, '6': 32 }, color: '#7FA9B5', width: 2.5,
    note: 'Metallic coatings vary widely. Estimate only; measure on site if it matters.',
  },
  {
    id: 'wood', name: 'Wood door or panel', loss: { '2.4': 3, '5': 4, '6': 4 }, color: '#B9A486', width: 2.5,
    note: 'NIST, 38 mm dry lumber.',
  },
  {
    id: 'brick', name: 'Brick', loss: { '2.4': 6, '5': 15, '6': 15 }, color: '#AFA196', width: 3.5,
    note: 'NIST, brick.',
  },
  {
    id: 'block', name: 'Masonry block (CMU)', loss: { '2.4': 11, '5': 15, '6': 16 }, color: '#B7AE9C', width: 3.5,
    note: 'NIST, masonry block.',
  },
  {
    id: 'concrete-100', name: 'Concrete, 100 mm', loss: { '2.4': 15, '5': 22, '6': 25 }, color: '#E8E2D6', width: 4,
    note: 'NIST, 102 mm concrete.',
  },
  {
    id: 'concrete-200', name: 'Concrete, 200 mm', loss: { '2.4': 29, '5': 48, '6': 54 }, color: '#F2EDE3', width: 5,
    note: 'NIST, 203 mm concrete. Reinforced 203 mm measured 31 / 55 / 63 dB.',
  },
  {
    id: 'metal', name: 'Metal, elevator shaft', loss: { '2.4': 30, '5': 35, '6': 38 }, color: '#E8E2D6', width: 4, dash: [3, 3],
    note: 'Treat as near-blocking. Estimate only.',
  },
];

// Attenuation zones (racking, cubicles, crowds) lose signal per meter of path inside them.
export const DEFAULT_ZONE_MATERIALS = [
  { id: 'cubicles', name: 'Cubicles and furniture', lossPerM: { '2.4': 0.2, '5': 0.3, '6': 0.35 }, note: 'Estimate.' },
  { id: 'shelving-light', name: 'Shelving, light stock', lossPerM: { '2.4': 0.4, '5': 0.6, '6': 0.7 }, note: 'Estimate. Depends heavily on what is stored.' },
  { id: 'racking-dense', name: 'Racking, dense or metal stock', lossPerM: { '2.4': 1.0, '5': 1.5, '6': 1.8 }, note: 'Estimate. Liquids and metal stock attenuate most.' },
  { id: 'people', name: 'Crowd', lossPerM: { '2.4': 0.3, '5': 0.5, '6': 0.6 }, note: 'Estimate for dense standing crowds.' },
];

export const DEFAULT_SLAB = { id: 'slab', name: 'Floor slab', loss: { '2.4': 15, '5': 22, '6': 25 }, note: 'Defaults to NIST 102 mm concrete; real slabs are often thicker.' };

/**
 * Map a v1 project's single wall attenuation (dB, all bands) to a material.
 * Known v1 values keep their old meaning; anything else becomes a custom
 * material with the same loss on every band so old files reproduce exactly.
 */
export function materialForLegacyLoss(db) {
  const n = Number(db);
  const v1Names = { 3: 'Glass', 5: 'Wood', 8: 'Drywall', 12: 'Concrete', 15: 'Brick', 20: 'Metal' };
  return {
    id: `legacy-${n}`,
    name: `${v1Names[n] || 'Custom'} (v1 file, ${n} dB)`,
    loss: { '2.4': n, '5': n, '6': n },
    color: '#CFC8BC',
    width: 2.5,
    note: 'Imported from an older project. Edit to apply per-band values.',
  };
}
