# Material losses

Every value below is a planning estimate. They are editable per project (Project settings, Materials) and are listed in each PDF report. Real losses vary with thickness, moisture, reinforcement, coatings, fixtures and angle of incidence; measure on site when a wall matters to the design.

## Walls (dB per crossing)

| Material | 2.4 GHz | 5 GHz | 6 GHz | Basis |
|---|---|---|---|---|
| Drywall partition | 3 | 4 | 4 | NIST measured about 1 dB per single panel; a stud wall has two panels plus studs, insulation and fixtures. Estimate. |
| Glass, clear | 2 | 2 | 2 | NIST measured about 1 dB for 6 mm glass; framing adds a little. |
| Glass, coated / low-E | 25 | 30 | 32 | Metallic coatings vary widely. Estimate only. |
| Wood door or panel | 3 | 4 | 4 | NIST, 38 mm dry lumber. |
| Brick | 6 | 15 | 15 | NIST, brick. |
| Masonry block (CMU) | 11 | 15 | 16 | NIST, masonry block. |
| Concrete, 100 mm | 15 | 22 | 25 | NIST, 102 mm concrete. |
| Concrete, 200 mm | 29 | 48 | 54 | NIST, 203 mm concrete. Reinforced 203 mm measured roughly 31 / 55 / 63 dB. |
| Metal, elevator shaft | 30 | 35 | 38 | Treated as near-blocking. Estimate only. |
| Floor slab (between floors) | 15 | 22 | 25 | Defaults to the 102 mm concrete figure; real slabs are often thicker. |

NIST figures: W. C. Stone, *Electromagnetic Signal Attenuation in Construction Materials*, NIST IR 6055, National Institute of Standards and Technology, 1997. The report covers roughly 0.5–8 GHz; the values here are rounded and, for drywall and glass, include an allowance for framing. Values were cross-checked against the tabulation of that report published by wifivitae.com.

## Attenuation areas (dB per meter inside the area)

| Area | 2.4 GHz | 5 GHz | 6 GHz |
|---|---|---|---|
| Cubicles and furniture | 0.2 | 0.3 | 0.35 |
| Shelving, light stock | 0.4 | 0.6 | 0.7 |
| Racking, dense or metal stock | 1.0 | 1.5 | 1.8 |
| Crowd | 0.3 | 0.5 | 0.6 |

These are estimates chosen to give plausible results in common layouts; they are not from a single published source. Stock contents (liquids, metal) change racking loss dramatically.

## Older project files

NetScope v1 stored one loss value per wall for all bands. When a v1 file is opened, each distinct v1 value becomes a project material named after its v1 type (for example "Concrete (v1 file, 12 dB)") with that loss on every band, so walls keep their original loss. Edit those materials to apply per-band values. v1 "obstacles" were never applied to the signal by v1; they are converted to a rectangle of walls at half the stated loss per side (a path through the obstacle crosses two sides), and the app warns that results will differ from the old version.
