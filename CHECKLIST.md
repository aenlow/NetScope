# NetScope 2.0 – verification checklist

Verified 2026-10-25 with `npm run check`: 48 unit tests passed; Playwright end-to-end tests passed at desktop (1440 × 900) and tablet (1024 × 768, touch) sizes; performance test passed; zero console errors or page errors in every E2E run (asserted by the tests).

## Brief requirements

| Requirement | Result | Notes |
|---|---|---|
| FSPL constant: −27.55 for m/MHz, −37.87 for ft/MHz | Pass | Unit test checks both constants and a worked example. |
| Internal units consistent; RSSI in dBm | Pass | Meters internally; feet only at display. |
| Walls counted only when crossed | Pass | Segment intersection with shared-vertex dedupe; unit tested. |
| Directional antenna pattern | Pass | Angle normalised; main lobe and front-to-back floor; unit tested. |
| No log(0) | Pass | 0.1 m minimum 3-D distance. |
| Scale flows through every calculation | Pass | Distances, cable runs, areas, auto-place and exports use the floor scale. |
| 6 GHz support | Pass | Channels, PSC, widths to 320 MHz, LPI EIRP warnings. |
| Per-band wall losses, labelled as estimates, editable | Pass | See docs/materials.md. |
| Throughput from MCS/SNR, labelled as estimate | Pass | PHY from subcarriers × bits × coding × streams; × 0.65 efficiency. |
| Device library with no invented specs | Pass | 222 models; 27 datasheet-checked with sources; the rest shown as "Typical / unverified". |
| Channel planning with DFS | Pass | Auto-plan with coupling graph; DFS optional. |
| Interference view | Pass | Channel overlap view, co-channel lines, plan check. |
| Configurable coverage threshold and presets | Pass | Voice, data, basic, custom; secondary coverage. |
| Rooms, measure, clients, probe | Pass | Plus room detection and client simulation. |
| Undo/redo, shortcuts, command palette | Pass | E2E covers undo/redo and palette. |
| PDF / PNG / CSV export | Pass | PDF reviewed page by page; E2E downloads each format. |
| JSON save/load including v1 files | Pass | E2E opens a v1 fixture; migration unit tested. |
| PDF floor plan import | Pass | E2E imports a PDF fixture. |
| Pan/zoom, touch and pinch | Pass | Tablet E2E runs with touch enabled. |
| Performance with 50+ APs | Pass | 64 APs, 2,336 walls: first heatmap about 5 s, 60 fps while dragging, no main-thread long tasks. |
| Three.js removed; pinned versions | Pass | Exact versions in package.json; Konva, Three.js, FileSaver and Feather removed. |
| Validate uploaded files; never execute content | Pass | Content sniffing, size limits, schema validation, PDF.js eval disabled, CSP; E2E checks an HTML-laden AP name renders as text and that invalid files are rejected. |
| Multi-floor with slab loss | Pass | Office example has two floors. |
| Bill of materials in PDF | Pass | With spec provenance and optional prices. |
| Example projects with fictional plans | Pass | Office, warehouse, retail; each plan is labelled "Fictional example plan". |
| Colour-blind-safe heatmap with legend and threshold | Pass | Cividis-like scale; threshold marked on legend and as a contour. |
| Reduced motion respected | Pass | `prefers-reduced-motion` disables transitions. |
| Static build for Cloudflare Pages | Pass | `dist/` is about 3 MB; `_headers` sets CSP. |
| README rewrite, no emoji, no external project links | Pass | Vendor datasheet links appear only in docs/devices.md as sources. |
| MIT license kept | Pass | See note below about the copyright line. |

## What changed from v1

- Rebuilt as a Vite + Preact app with a custom canvas renderer and a Web Worker for all RF computation.
- Corrected path loss, wall crossing and antenna pattern maths; added 6 GHz, SNR, data rate, secondary coverage and channel overlap.
- New device library (222 models, provenance per field), new materials model (per band), attenuation and exclusion areas.
- New planning tools: auto-place, auto-channel, closets and cabling, design versions, client simulation, plan check.
- New interface: tool rail, layers and AP lists, inspector, status bar, command palette, onboarding with examples, tablet and phone layouts; plans render in a dark theme on screen and a light theme in the PDF.
- Safe file handling, autosave in the browser and v1 migration.

## Numbers that are estimates

Wall and area losses; device values marked "Typical / unverified" or `*`; noise floor (thermal + 6 dB noise figure unless measured); MCS SNR thresholds; the 0.65 throughput efficiency; cable run lengths; capacity per radio; indicative EIRP limits.

## Known limits

- No reflections, diffraction, multipath or antenna polarisation; walls are thin lines with a fixed loss regardless of angle.
- Free-space loss (exponent 2.0) plus drawn walls can be optimistic in large open spaces with clutter that is not drawn. Auto-place shows this caveat; raise the path-loss exponent in Settings, Propagation for a more conservative plan.
- Throughput is a single-client estimate; it does not model airtime sharing between clients.
- Only US and EU regulatory summaries; 6 GHz standard power (AFC) is not modelled.
- 195 of 222 devices use typical class values for power and gain.
- Phones are suited to viewing and light edits; drawing walls is best with a mouse or stylus.
- Projects autosave per browser. Download the project file to move work between machines.

## Before you publish

- `LICENSE` uses "NetScope contributors" as the copyright holder. Replace it with the holder name and year from your original repository's license.
- Add your own repository and hosted URLs to the README.
