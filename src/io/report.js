// PDF report, PNG image and CSV schedule exports.

import { jsPDF } from 'jspdf';
import { renderFloor, composeImage, legendSpec } from '../canvas/render.js';
import { computeFor, summaryNow } from '../engine/rfClient.js';
import { billOfMaterials, cableRuns, closetLoads, capacitySummary } from '../core/analysis.js';
import { resolveDevice } from '../core/propagation.js';
import { BANDS, BAND_LABEL, REGIONS, isDfs } from '../core/bands.js';
import { rampColor, VIEWS, OVERLAP_COLORS } from '../core/colors.js';
import { fmtLen, fmtArea, lenOut, lenLabel } from '../core/units.js';
import { polygonArea } from '../core/geometry.js';
import { downloadBlob, safeFileName } from './files.js';
import { specLevel, SPEC_LABEL } from '../data/devices.js';

/** jsPDF's standard fonts are Latin-1 only; map typographic characters. */
const pdfText = (s) => String(s ?? '')
  .replace(/−/g, '-').replace(/[–—]/g, '-').replace(/×/g, 'x').replace(/·/g, '-')
  .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
  .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');

const INK = [28, 27, 25], INK2 = [74, 71, 65], INK3 = [107, 103, 95], RULE = [217, 212, 199], ACCENT = [217, 72, 28];

class Report {
  constructor(project) {
    this.p = project;
    this.doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    this.W = 297; this.H = 210; this.M = 14;
    this.y = this.M;
    this.page = 1;
  }
  text(s, x, y, { size = 9, style = 'normal', color = INK, align, maxWidth } = {}) {
    const d = this.doc;
    d.setFont('helvetica', style);
    d.setFontSize(size);
    d.setTextColor(...color);
    d.text(pdfText(s), x, y, { align, maxWidth });
  }
  wrap(s, width, size = 9) {
    this.doc.setFontSize(size);
    return this.doc.splitTextToSize(pdfText(s), width);
  }
  rule(y, x0 = this.M, x1 = this.W - this.M) {
    this.doc.setDrawColor(...RULE);
    this.doc.setLineWidth(0.2);
    this.doc.line(x0, y, x1, y);
  }
  header(title) {
    this.text(this.p.name, this.M, 9, { size: 8, color: INK3 });
    this.text(title, this.W - this.M, 9, { size: 8, color: INK3, align: 'right' });
    this.rule(11);
    this.y = 20;
  }
  footer() {
    this.rule(this.H - 10);
    this.text('Predictive Wi-Fi estimates generated with NetScope. Not a substitute for an on-site survey.', this.M, this.H - 6, { size: 7, color: INK3 });
    this.text(`Page ${this.page}`, this.W - this.M, this.H - 6, { size: 7, color: INK3, align: 'right' });
  }
  newPage(title) {
    this.footer();
    this.doc.addPage();
    this.page++;
    this.header(title);
  }
  h(s) {
    this.text(s, this.M, this.y, { size: 13, style: 'bold' });
    this.y += 7;
  }
  /** Table with header row, repeated after page breaks. cols: [{ label, w, align }] */
  table(cols, rows, title) {
    const rowH = 6;
    const drawHead = () => {
      let x = this.M;
      for (const c of cols) {
        this.text(c.label.toUpperCase(), c.align === 'right' ? x + c.w - 4 : x, this.y, { size: 7, style: 'bold', color: INK3, align: c.align === 'right' ? 'right' : undefined });
        x += c.w;
      }
      this.y += 2;
      this.rule(this.y);
      this.y += 4;
    };
    drawHead();
    for (const r of rows) {
      const cells = r.map((v, i) => this.wrap(v, cols[i].w - 5, 8));
      const lines = Math.max(...cells.map((c) => c.length));
      const h = Math.max(rowH, lines * 3.6 + 2.4);
      if (this.y + h > this.H - 16) { this.newPage(title); drawHead(); }
      let x = this.M;
      cells.forEach((lns, i) => {
        const c = cols[i];
        lns.forEach((ln, j) => this.text(ln, c.align === 'right' ? x + c.w - 4 : x, this.y + j * 3.6, { size: 8, color: INK, align: c.align === 'right' ? 'right' : undefined }));
        x += c.w;
      });
      this.y += h - 2.4;
      this.rule(this.y - 1.2);
      this.y += 1.6;
    }
    this.y += 4;
  }
  legend(view, result, x, y, w) {
    const spec = legendSpec(view, result, this.p.settings);
    const d = this.doc;
    this.text(spec.title, x, y, { size: 7.5, color: INK2 });
    if (spec.discrete) {
      spec.discrete.forEach((s, i) => {
        d.setFillColor(...s.rgb);
        d.rect(x + i * 18, y + 2, 5, 4, 'F');
        this.text(s.label, x + i * 18 + 7, y + 5.3, { size: 7.5 });
      });
      return;
    }
    const n = 60;
    for (let i = 0; i < n; i++) {
      const c = rampColor(i / (n - 1));
      d.setFillColor(...c);
      d.rect(x + (w * i) / n, y + 2, w / n + 0.1, 4, 'F');
    }
    const pos = (v) => x + ((v - spec.range.min) / (spec.range.max - spec.range.min)) * w;
    d.setFillColor(...ACCENT);
    for (const m of spec.markers) d.rect(pos(m) - 0.3, y + 0.8, 0.6, 6.4, 'F');
    for (const t of spec.ticks) this.text(view === 'rate' ? String(Math.round(t)) : String(t), pos(t), y + 10, { size: 7, color: INK2, align: 'center' });
  }
  save(name) {
    this.footer();
    const blob = this.doc.output('blob');
    downloadBlob(blob, safeFileName(name, 'pdf'));
    return blob;
  }
}

/**
 * Build and download the PDF report.
 * opts: { bands: ['5', …], view: 'signal', includeSchedule, includeBom, includeChecks, issues, devices, onProgress }
 */
export async function exportPdf(project, opts) {
  const { bands = ['5'], view = 'signal', includeSchedule = true, includeBom = true, includeChecks = true, issues = [], devices, onProgress = () => {} } = opts;
  const r = new Report(project);
  const s = project.settings;
  const units = s.units;
  const summary = await summaryNow().catch(() => null);
  const floors = project.floors.map((f, i) => ({ f, i })).filter(({ f }) => f.scale);
  const total = floors.length * bands.length + 2;
  let step = 0;

  // ---- Cover
  r.text('Wi-Fi design report', r.M, 30, { size: 24, style: 'bold' });
  r.text(project.name, r.M, 40, { size: 14, color: INK2 });
  r.text(`Prepared ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} with NetScope`, r.M, 47, { size: 9, color: INK3 });
  r.y = 60;
  const apCount = project.floors.reduce((n, f) => n + f.aps.length, 0);
  const t = s.target;
  const kv = [
    ['Floors', String(project.floors.length)],
    ['Access points', String(apCount)],
    ['Coverage target', `${t.primary} dBm primary${t.secondaryEnabled ? `, ${t.secondary} dBm secondary` : ''}, goal ${t.coverageGoal}% of area`],
    ['Region', REGIONS[s.region].label + (s.allowDfs ? ', DFS allowed' : ', DFS not used')],
    ['Client profile', `Wi-Fi ${s.client.gen}, ${s.client.nss}x${s.client.nss}, ${s.client.bands.join(' / ')} GHz, client at ${fmtLen(s.clientHeightM, units)}`],
    ['Propagation', `Free-space path loss over 3-D distance, path-loss exponent ${s.pathLossExponent}, per-band wall losses, slab loss between floors`],
    ['Noise', s.noiseOverride != null ? `Measured noise floor ${s.noiseOverride} dBm per 20 MHz` : `Thermal noise with ${s.noiseFigure} dB noise figure`],
  ];
  for (const [k, v] of kv) {
    r.text(k, r.M, r.y, { size: 9, color: INK3 });
    const lines = r.wrap(v, 190, 9);
    lines.forEach((ln, i) => r.text(ln, r.M + 45, r.y + i * 4.2, { size: 9 }));
    r.y += Math.max(6, lines.length * 4.2 + 1.8);
  }
  r.y += 4;
  if (summary) {
    r.text('Predicted coverage by floor', r.M, r.y, { size: 11, style: 'bold' });
    r.y += 6;
    const rows = project.floors.map((f) => {
      const sm = summary.find((x) => x.floorId === f.id);
      const cell = (b) => {
        const st = sm?.bands[b]?.stats;
        return st ? `${st.primaryPct.toFixed(1)}%${t.secondaryEnabled ? ` / ${st.secondaryPct.toFixed(1)}%` : ''}` : '-';
      };
      return [f.name, String(f.aps.length), cell('2.4'), cell('5'), cell('6')];
    });
    r.table([{ label: 'Floor', w: 70 }, { label: 'APs', w: 20, align: 'right' }, { label: '2.4 GHz', w: 40, align: 'right' }, { label: '5 GHz', w: 40, align: 'right' }, { label: '6 GHz', w: 40, align: 'right' }], rows, 'Summary');
    r.text(`Share of the evaluated area (rooms, or the whole plan when none are marked) meeting ${t.primary} dBm${t.secondaryEnabled ? ` / secondary ${t.secondary} dBm` : ''}.`, r.M, r.y, { size: 8, color: INK3 });
    r.y += 8;
  }
  r.doc.setFillColor(246, 243, 236);
  r.doc.rect(r.M, r.H - 40, r.W - 2 * r.M, 20, 'F');
  r.text('About these results', r.M + 4, r.H - 34, { size: 9, style: 'bold' });
  r.wrap('This report is a predictive model. Wall losses, device specifications marked typical, noise, capacity and data rates are estimates. Real coverage depends on construction details, furniture, people, interference and client devices. Validate with an on-site survey before installation.', r.W - 2 * r.M - 8, 8.5)
    .forEach((ln, i) => r.text(ln, r.M + 4, r.H - 28.5 + i * 3.8, { size: 8.5, color: INK2 }));
  onProgress(++step / total);

  // ---- Floor maps
  for (const { f, i } of floors) {
    for (const band of bands) {
      r.newPage(`${f.name} - ${BAND_LABEL[band]}`);
      const res = await computeFor(i, band, 'medium').catch(() => null);
      const result = res && !res.empty ? res : null;
      const canvas = await renderFloor({ project, floorIndex: i, result, view, band, theme: 'light', maxSide: 2600, devices, layers: { cables: false } });
      const boxW = r.W - 2 * r.M - 70, boxH = r.H - 20 - 22;
      const k = Math.min(boxW / canvas.width, boxH / canvas.height);
      const w = canvas.width * k, h = canvas.height * k;
      r.doc.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', r.M, 18, w, h, undefined, 'FAST');
      const x = r.M + boxW + 6;
      let y = 22;
      r.text(f.name, x, y, { size: 12, style: 'bold' }); y += 5;
      r.text(`${BAND_LABEL[band]} - ${VIEWS[view].label}`, x, y, { size: 9, color: INK2 }); y += 8;
      if (result) { r.legend(view, result, x, y, 62); y += 16; }
      const st = result?.stats;
      const line = (a, b) => { r.text(a, x, y, { size: 8, color: INK3 }); r.text(b, x + 62, y, { size: 8, align: 'right' }); y += 5; };
      if (st) {
        line(`Meets ${t.primary} dBm`, `${st.primaryPct.toFixed(1)}%`);
        line(`Secondary ${t.secondary} dBm`, `${st.secondaryPct.toFixed(1)}%`);
      }
      line('Access points', String(f.aps.length));
      line('Floor area', fmtArea(f.width * f.height * f.scale ** 2, units));
      const rooms = f.zones.filter((z) => z.kind === 'room');
      if (rooms.length) line('Room area', fmtArea(rooms.reduce((n, z) => n + polygonArea(z.points), 0) * f.scale ** 2, units));
      if (st?.rooms?.length) {
        y += 3;
        r.text('Rooms below 90%', x, y, { size: 8, style: 'bold' }); y += 4.5;
        const low = st.rooms.filter((z) => z.cells && z.primaryPct < 90).slice(0, 14);
        if (!low.length) { r.text('None', x, y, { size: 8, color: INK2 }); y += 4.5; }
        for (const z of low) { r.text(z.name, x, y, { size: 8, color: INK2, maxWidth: 46 }); r.text(`${z.primaryPct.toFixed(0)}%`, x + 62, y, { size: 8, align: 'right' }); y += 4.5; }
      }
      onProgress(++step / total);
    }
  }

  // ---- AP schedule
  if (includeSchedule && apCount) {
    r.newPage('Access point schedule');
    r.h('Access point schedule');
    const runs = cableRuns(project, devices);
    const rows = [];
    for (const f of project.floors) {
      for (const ap of f.aps) {
        const d = resolveDevice(ap.deviceId, devices);
        const rad = (b) => { const x = ap.radios[b]; return d.radios[b] && x.on ? `ch ${x.ch}${isDfs(b, x.ch) ? ' DFS' : ''} / ${x.width} / ${x.power} dBm` : '-'; };
        const run = runs.find((x) => x.apId === ap.id);
        rows.push([f.name, ap.name, `${d.vendor} ${d.model}`, fmtLen(ap.heightM, units), rad('2.4'), rad('5'), rad('6'), run?.lengthM != null ? `${run.closetName} ${fmtLen(run.lengthM, units, 0)}` : '-']);
      }
    }
    r.table([{ label: 'Floor', w: 26 }, { label: 'Name', w: 24 }, { label: 'Model', w: 48 }, { label: 'Height', w: 16, align: 'right' }, { label: '2.4 GHz', w: 38 }, { label: '5 GHz', w: 40 }, { label: '6 GHz', w: 40 }, { label: 'Cable', w: 37 }], rows, 'Access point schedule');
    r.text('Channel / width (MHz) / transmit power per radio. Cable lengths are estimates: rectilinear path plus vertical allowance and slack.', r.M, r.y, { size: 8, color: INK3 });
  }

  // ---- Bill of materials
  if (includeBom && apCount) {
    r.newPage('Bill of materials');
    r.h('Bill of materials');
    const bom = billOfMaterials(project, devices);
    const anyPrice = bom.some((b) => b.unitPrice != null);
    r.table(
      [{ label: 'Qty', w: 16, align: 'right' }, { label: 'Vendor', w: 44 }, { label: 'Model', w: 60 }, { label: 'Floors', w: 70 }, { label: 'Specs', w: 34 }, ...(anyPrice ? [{ label: 'Unit', w: 22, align: 'right' }, { label: 'Total', w: 25, align: 'right' }] : [])],
      bom.map((b) => [String(b.qty), b.vendor, b.model, b.floors.join(', '), SPEC_LABEL[specLevel(resolveDevice(b.deviceId, devices))], ...(anyPrice ? [b.unitPrice != null ? b.unitPrice.toFixed(2) : '-', b.total != null ? b.total.toFixed(2) : '-'] : [])]),
      'Bill of materials',
    );
    const total = bom.reduce((n, b) => n + b.qty, 0);
    r.text(`${total} access points in total.${anyPrice ? ` Priced total ${bom.reduce((n, b) => n + (b.total || 0), 0).toFixed(2)} (unpriced items excluded).` : ''}`, r.M, r.y, { size: 9 });
    r.y += 8;
    const loads = closetLoads(project, cableRuns(project, devices));
    if (loads.length) {
      r.text('Network closets', r.M, r.y, { size: 11, style: 'bold' });
      r.y += 6;
      r.table([{ label: 'Closet', w: 50 }, { label: 'Floor', w: 50 }, { label: 'AP ports', w: 30, align: 'right' }, { label: 'PoE draw (est.)', w: 40, align: 'right' }, { label: 'Budget', w: 30, align: 'right' }],
        loads.map((l) => [l.name, l.floorName, String(l.ports), `${l.poeW.toFixed(0)} W${l.unknownPoe ? ` + ${l.unknownPoe} unknown` : ''}`, l.budgetW != null ? `${l.budgetW} W` : '-']), 'Bill of materials');
    }
    const cap = capacitySummary(project).filter((c) => c.devices);
    if (cap.length) {
      r.text('Capacity (estimate)', r.M, r.y, { size: 11, style: 'bold' });
      r.y += 6;
      r.table([{ label: 'Floor', w: 60 }, { label: 'Expected devices', w: 40, align: 'right' }, { label: 'Radio capacity', w: 40, align: 'right' }, { label: 'APs', w: 20, align: 'right' }],
        cap.map((c) => [c.floorName, String(c.devices), String(c.capacity), String(c.aps)]), 'Bill of materials');
      r.text(`Capacity assumes ${s.capacity.devicesPerRadio} active devices per 5 or 6 GHz radio and half that on 2.4 GHz.`, r.M, r.y, { size: 8, color: INK3 });
    }
  }

  // ---- Plan check and materials
  if (includeChecks) {
    r.newPage('Plan check and assumptions');
    r.h('Plan check');
    if (!issues.length) { r.text('No issues found.', r.M, r.y); r.y += 8; }
    for (const i of issues.slice(0, 60)) {
      const lines = r.wrap(i.text, r.W - 2 * r.M - 20, 8.5);
      if (r.y + lines.length * 4 > r.H - 16) r.newPage('Plan check and assumptions');
      r.text(i.level === 'error' ? 'Error' : i.level === 'warn' ? 'Warning' : 'Note', r.M, r.y, { size: 8, color: i.level === 'info' ? INK3 : ACCENT, style: 'bold' });
      lines.forEach((ln, k) => r.text(ln, r.M + 20, r.y + k * 4, { size: 8.5 }));
      r.y += lines.length * 4 + 2;
    }
    r.y += 4;
    if (r.y > r.H - 70) r.newPage('Plan check and assumptions');
    r.text('Wall materials (loss per crossing, estimates)', r.M, r.y, { size: 11, style: 'bold' });
    r.y += 6;
    const used = new Set(project.floors.flatMap((f) => f.walls.map((w) => w.materialId)));
    r.table([{ label: 'Material', w: 60 }, ...BANDS.map((b) => ({ label: BAND_LABEL[b], w: 24, align: 'right' })), { label: 'Note', w: 137 }],
      project.materials.filter((m) => used.has(m.id)).map((m) => [m.name, ...BANDS.map((b) => `${m.loss[b]} dB`), m.note || '']), 'Plan check and assumptions');
  }

  onProgress(1);
  return r.save(`${project.name} report`);
}

export async function exportPng(project, { floorIndex, band, view, theme, devices, layers }) {
  const res = await computeFor(floorIndex, band, 'high').catch(() => null);
  const result = res && !res.empty ? res : null;
  const f = project.floors[floorIndex];
  const canvas = await renderFloor({ project, floorIndex, result, view, band, theme, maxSide: 3200, devices, layers });
  const out = composeImage(canvas, {
    title: `${project.name} — ${f.name}`,
    subtitle: `${VIEWS[view].label}, ${BAND_LABEL[band]} · target ${project.settings.target.primary} dBm${result?.stats ? ` · ${result.stats.primaryPct.toFixed(1)}% meets target` : ''} · ${new Date().toLocaleDateString()}`,
    view, band, result, settings: project.settings, theme,
  });
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  downloadBlob(blob, safeFileName(`${project.name} ${f.name} ${VIEWS[view].label} ${band}GHz`, 'png'));
  return blob;
}

export function exportCsv(project, devices) {
  const units = project.settings.units;
  const runs = cableRuns(project, devices);
  const esc = (v) => {
    const s = String(v ?? '');
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // avoid spreadsheet formula injection
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ['Floor', 'Name', 'Vendor', 'Model', 'Spec status', `X (${lenLabel(units)})`, `Y (${lenLabel(units)})`, `Mount height (${lenLabel(units)})`];
  for (const b of BANDS) head.push(`${b} GHz on`, `${b} GHz channel`, `${b} GHz width MHz`, `${b} GHz power dBm`);
  head.push('Closet', `Cable (${lenLabel(units)})`, 'Notes');
  const rows = [head];
  for (const f of project.floors) {
    for (const ap of f.aps) {
      const d = resolveDevice(ap.deviceId, devices);
      const run = runs.find((r) => r.apId === ap.id);
      const row = [f.name, ap.name, d.vendor, d.model, d.status, f.scale ? lenOut(ap.x * f.scale, units).toFixed(2) : '', f.scale ? lenOut(ap.y * f.scale, units).toFixed(2) : '', lenOut(ap.heightM, units).toFixed(2)];
      for (const b of BANDS) {
        const r = ap.radios[b];
        const ok = !!d.radios[b] && r.on;
        row.push(ok ? 'yes' : 'no', ok ? r.ch : '', ok ? r.width : '', ok ? r.power : '');
      }
      row.push(run?.closetName || '', run?.lengthM != null ? lenOut(run.lengthM, units).toFixed(1) : '', ap.notes || '');
      rows.push(row);
    }
  }
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, safeFileName(`${project.name} AP schedule`, 'csv'));
  return blob;
}

export { OVERLAP_COLORS };
