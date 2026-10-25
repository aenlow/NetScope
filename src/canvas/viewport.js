// Interactive floor-plan canvas: pan/zoom, rendering and drawing tools.

import { store, subscribe, setUi, currentFloor, commit, beginTransient, openDialog, toast, notify } from '../state/store.js';
import { uid } from '../core/ids.js';
import * as A from '../state/actions.js';
import { getPlanImage, setImageReadyHandler } from './images.js';
import { buildHeatmap, buildContour } from './heatmapImage.js';
import * as D from './draw.js';
import { distToSegment, closestPointOnSegment, snapAngle, pointInPolygon, polygonCentroid } from '../core/geometry.js';
import { fmtLen } from '../core/units.js';
import { cableRuns } from '../core/analysis.js';

export const cursorBus = {
  fns: new Set(),
  last: null,
  emit(p) { this.last = p; for (const f of this.fns) f(p); },
  sub(f) { this.fns.add(f); return () => this.fns.delete(f); },
};

const TOOL_CURSOR = { select: 'default', pan: 'grab', wall: 'crosshair', rect: 'crosshair', area: 'crosshair', scale: 'crosshair', measure: 'crosshair', ap: 'copy', closet: 'copy', client: 'copy', door: 'crosshair', probe: 'crosshair' };

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.views = new Map();
    this.pointers = new Map();
    this.tool = { chain: [], preview: null };
    this.drag = null;
    this.space = false;
    this.heat = { key: null, value: null, contour: null };
    this.runs = { key: null, value: [] };
    this.needs = true;
    this.lastFloorId = null;
    this.hover = null;
    this.measure = null;
    this.scaleLine = null;

    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(canvas.parentElement);
    this.unsub = subscribe(() => this.invalidate());
    setImageReadyHandler(() => this.invalidate());
    this.bind();
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.unsub();
    this.unbind();
  }

  invalidate() { this.needs = true; }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.cssW = Math.max(1, r.width);
    this.cssH = Math.max(1, r.height);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    // Views the user has not panned or zoomed keep fitting the window.
    for (const [id, v] of this.views) {
      if (!v.auto) continue;
      const f = store.project.floors.find((x) => x.id === id);
      if (f) this.views.set(id, this.fitFor(f));
    }
    this.invalidate();
  }

  // -------------------------------------------------------------- view math
  view() {
    const f = currentFloor();
    if (!f) return { zoom: 1, tx: 0, ty: 0 };
    if (!this.views.has(f.id)) this.views.set(f.id, this.fitFor(f));
    return this.views.get(f.id);
  }

  fitFor(f) {
    const pad = 48;
    const zoom = Math.min((this.cssW - pad * 2) / f.width, (this.cssH - pad * 2) / f.height);
    const z = Math.max(0.02, zoom);
    return { zoom: z, tx: (this.cssW - f.width * z) / 2, ty: (this.cssH - f.height * z) / 2, auto: true };
  }

  fit() {
    const f = currentFloor();
    if (!f) return;
    this.views.set(f.id, this.fitFor(f));
    this.invalidate();
    this.emitZoom();
  }

  zoomAt(factor, sx = this.cssW / 2, sy = this.cssH / 2) {
    const v = this.view();
    const z = Math.min(40, Math.max(0.02, v.zoom * factor));
    const k = z / v.zoom;
    v.tx = sx - (sx - v.tx) * k;
    v.ty = sy - (sy - v.ty) * k;
    v.zoom = z;
    v.auto = false;
    this.invalidate();
    this.emitZoom();
  }

  setZoom(z) { this.zoomAt(z / this.view().zoom); }

  emitZoom() { cursorBus.emit({ ...(cursorBus.last || {}), zoom: this.view().zoom }); }

  toWorld(sx, sy) {
    const v = this.view();
    return { x: (sx - v.tx) / v.zoom, y: (sy - v.ty) / v.zoom };
  }

  toScreen(x, y) {
    const v = this.view();
    return { x: x * v.zoom + v.tx, y: y * v.zoom + v.ty };
  }

  centerOn(x, y) {
    const v = this.view();
    v.tx = this.cssW / 2 - x * v.zoom;
    v.ty = this.cssH / 2 - y * v.zoom;
    v.auto = false;
    this.invalidate();
  }

  // ---------------------------------------------------------------- events
  bind() {
    const c = this.canvas;
    this.h = {
      down: (e) => this.onDown(e),
      move: (e) => this.onMove(e),
      up: (e) => this.onUp(e),
      cancel: (e) => this.onUp(e, true),
      wheel: (e) => this.onWheel(e),
      dbl: (e) => this.onDbl(e),
      leave: () => { cursorBus.emit({ ...(cursorBus.last || {}), x: null, y: null }); this.hover = null; this.invalidate(); },
      ctx: (e) => e.preventDefault(),
      kd: (e) => { if (e.code === 'Space' && !isTyping(e)) { if (!this.space) { this.space = true; this.updateCursor(); } e.preventDefault(); } },
      ku: (e) => { if (e.code === 'Space') { this.space = false; this.updateCursor(); } },
    };
    c.addEventListener('pointerdown', this.h.down);
    c.addEventListener('pointermove', this.h.move);
    c.addEventListener('pointerup', this.h.up);
    c.addEventListener('pointercancel', this.h.cancel);
    c.addEventListener('wheel', this.h.wheel, { passive: false });
    c.addEventListener('dblclick', this.h.dbl);
    c.addEventListener('pointerleave', this.h.leave);
    c.addEventListener('contextmenu', this.h.ctx);
    window.addEventListener('keydown', this.h.kd);
    window.addEventListener('keyup', this.h.ku);
  }

  unbind() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.h.down);
    c.removeEventListener('pointermove', this.h.move);
    c.removeEventListener('pointerup', this.h.up);
    c.removeEventListener('pointercancel', this.h.cancel);
    c.removeEventListener('wheel', this.h.wheel);
    c.removeEventListener('dblclick', this.h.dbl);
    c.removeEventListener('pointerleave', this.h.leave);
    c.removeEventListener('contextmenu', this.h.ctx);
    window.removeEventListener('keydown', this.h.kd);
    window.removeEventListener('keyup', this.h.ku);
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  }

  updateCursor() {
    let cur = TOOL_CURSOR[store.ui.tool] || 'default';
    if (this.space || this.drag?.mode === 'pan') cur = this.drag?.mode === 'pan' ? 'grabbing' : 'grab';
    else if (store.ui.tool === 'select' && this.hover) cur = this.hover.kind === 'handle' || this.hover.kind === 'vertex' ? 'move' : 'pointer';
    this.canvas.style.cursor = cur;
  }

  onWheel(e) {
    e.preventDefault();
    const { sx, sy } = this.local(e);
    const pixelPan = e.deltaMode === 0 && !e.ctrlKey && (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) < 40);
    if (pixelPan) {
      const v = this.view();
      v.tx -= e.deltaX;
      v.ty -= e.deltaY;
      v.auto = false;
      this.invalidate();
      return;
    }
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)), sx, sy);
  }

  onDown(e) {
    if (!currentFloor()) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    const { sx, sy } = this.local(e);
    this.pointers.set(e.pointerId, { sx, sy });
    if (this.pointers.size === 2) {
      // Pinch: abandon any tool drag in progress.
      if (this.drag?.before) commit(null, { before: this.drag.before });
      const [a, b] = [...this.pointers.values()];
      this.drag = { mode: 'pinch', d0: Math.hypot(a.sx - b.sx, a.sy - b.sy), mid: { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 } };
      return;
    }
    if (e.button === 1 || this.space || store.ui.tool === 'pan' || e.button === 2) {
      this.drag = { mode: 'pan', sx, sy };
      this.updateCursor();
      return;
    }
    if (e.button !== 0) return;
    const w = this.toWorld(sx, sy);
    this.toolDown(w, e);
    this.invalidate();
  }

  onMove(e) {
    const { sx, sy } = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { sx, sy });
    const w = this.toWorld(sx, sy);
    cursorBus.emit({ x: w.x, y: w.y, zoom: this.view().zoom });
    if (this.drag?.mode === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      const mid = { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 };
      const v = this.view();
      v.tx += mid.x - this.drag.mid.x;
      v.ty += mid.y - this.drag.mid.y;
      this.zoomAt(d / (this.drag.d0 || d), mid.x, mid.y);
      this.drag.d0 = d;
      this.drag.mid = mid;
      return;
    }
    if (this.drag?.mode === 'pan') {
      const v = this.view();
      v.tx += sx - this.drag.sx;
      v.ty += sy - this.drag.sy;
      v.auto = false;
      this.drag.sx = sx;
      this.drag.sy = sy;
      this.invalidate();
      return;
    }
    this.toolMove(w, e);
    this.invalidate();
  }

  onUp(e, cancelled = false) {
    this.pointers.delete(e.pointerId);
    if (this.drag?.mode === 'pinch') { if (this.pointers.size < 2) this.drag = null; return; }
    if (this.drag?.mode === 'pan') { this.drag = null; this.updateCursor(); return; }
    const { sx, sy } = this.local(e);
    this.toolUp(this.toWorld(sx, sy), e, cancelled);
    this.invalidate();
  }

  onDbl(e) {
    const t = store.ui.tool;
    if (t === 'wall' || t === 'area') this.finishChain();
  }

  // ---------------------------------------------------------------- hit test
  tol() { return 8 / this.view().zoom; }

  hitTest(w, { handles = true } = {}) {
    const f = currentFloor();
    const u = 1 / this.view().zoom;
    const sel = store.ui.selection;
    const L = store.ui.layers;
    if (handles && sel?.kind === 'wall') {
      for (const wl of f.walls) {
        if (!sel.ids.includes(wl.id)) continue;
        if (Math.hypot(w.x - wl.x1, w.y - wl.y1) < 7 * u) return { kind: 'handle', id: wl.id, end: 1, x: wl.x1, y: wl.y1 };
        if (Math.hypot(w.x - wl.x2, w.y - wl.y2) < 7 * u) return { kind: 'handle', id: wl.id, end: 2, x: wl.x2, y: wl.y2 };
      }
    }
    if (handles && sel?.kind === 'zone') {
      for (const z of f.zones) {
        if (!sel.ids.includes(z.id)) continue;
        const i = z.points.findIndex((p) => Math.hypot(w.x - p.x, w.y - p.y) < 7 * u);
        if (i >= 0) return { kind: 'vertex', id: z.id, index: i };
      }
    }
    if (L.aps) for (let i = f.aps.length - 1; i >= 0; i--) if (Math.hypot(w.x - f.aps[i].x, w.y - f.aps[i].y) < 12 * u) return { kind: 'ap', id: f.aps[i].id };
    if (L.closets) for (const c of f.closets) if (Math.abs(w.x - c.x) < 11 * u && Math.abs(w.y - c.y) < 11 * u) return { kind: 'closet', id: c.id };
    if (L.clients) for (const c of f.clients) if (Math.hypot(w.x - c.x, w.y - c.y) < 6 * u) return { kind: 'client', id: c.id };
    if (L.walls) {
      let best = null, bd = this.tol();
      for (const wl of f.walls) {
        const d = distToSegment(w.x, w.y, wl.x1, wl.y1, wl.x2, wl.y2);
        if (d < bd) { bd = d; best = wl; }
      }
      if (best) return { kind: 'wall', id: best.id };
    }
    if (L.rooms) {
      for (let i = f.zones.length - 1; i >= 0; i--) if (pointInPolygon(w.x, w.y, f.zones[i].points)) return { kind: 'zone', id: f.zones[i].id };
    }
    return null;
  }

  /** Snap to wall endpoints, area vertices and chain points, then to walls. */
  snap(w, { anchor = null, shift = false, exclude = null } = {}) {
    if (!store.ui.snap) return { ...w, snapped: null };
    const f = currentFloor();
    const u = 1 / this.view().zoom;
    let p = { ...w };
    if (shift && anchor) p = snapAngle(anchor.x, anchor.y, w.x, w.y, 45);
    let best = null, bd = 10 * u;
    const consider = (x, y, kind) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = { x, y, snapped: kind }; }
    };
    for (const wl of f.walls) {
      if (exclude && exclude(wl)) continue;
      consider(wl.x1, wl.y1, 'end');
      consider(wl.x2, wl.y2, 'end');
    }
    for (const z of f.zones) for (const pt of z.points) consider(pt.x, pt.y, 'end');
    for (const pt of this.tool.chain) consider(pt.x, pt.y, 'end');
    if (best) return best;
    if (!shift) {
      let seg = null, sd = 6 * u;
      for (const wl of f.walls) {
        if (exclude && exclude(wl)) continue;
        const c = closestPointOnSegment(p.x, p.y, wl.x1, wl.y1, wl.x2, wl.y2);
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < sd) { sd = d; seg = { x: c.x, y: c.y, snapped: 'edge' }; }
      }
      if (seg) return seg;
    }
    return { ...p, snapped: null };
  }

  // ------------------------------------------------------------------ tools
  resetTool() {
    this.tool = { chain: [], preview: null };
    this.drag = null;
    this.scaleLine = null;
    this.invalidate();
  }

  toolDown(w, e) {
    const tool = store.ui.tool;
    const f = currentFloor();
    if (tool === 'select') {
      const hit = this.hitTest(w);
      if (hit?.kind === 'handle') {
        const wall = f.walls.find((o) => o.id === hit.id);
        const px = hit.end === 1 ? wall.x1 : wall.x2, py = hit.end === 1 ? wall.y1 : wall.y2;
        const ends = [];
        for (const o of f.walls) {
          if (Math.hypot(o.x1 - px, o.y1 - py) < 0.5) ends.push({ w: o, end: 1 });
          if (Math.hypot(o.x2 - px, o.y2 - py) < 0.5) ends.push({ w: o, end: 2 });
        }
        this.drag = { mode: 'wallEnd', ends, ids: new Set(ends.map((x) => x.w.id)), before: beginTransient(), moved: false };
        return;
      }
      if (hit?.kind === 'vertex') {
        this.drag = { mode: 'vertex', id: hit.id, index: hit.index, before: beginTransient(), moved: false };
        return;
      }
      if (hit) {
        const sel = store.ui.selection;
        const inSel = sel?.kind === hit.kind && sel.ids.includes(hit.id);
        if (e.shiftKey && sel?.kind === hit.kind) {
          const ids = inSel ? sel.ids.filter((i) => i !== hit.id) : [...sel.ids, hit.id];
          setUi({ selection: ids.length ? { kind: hit.kind, ids } : null });
          return;
        }
        if (!inSel) setUi({ selection: { kind: hit.kind, ids: [hit.id] } });
        this.drag = { mode: 'move', last: w, before: beginTransient(), moved: false, start: w };
        return;
      }
      if (!e.shiftKey) setUi({ selection: null });
      this.drag = { mode: 'marquee', a: w, b: w };
      return;
    }
    if (tool === 'wall' || tool === 'area') {
      const chain = this.tool.chain;
      const p = this.snap(w, { anchor: chain.at(-1), shift: e.shiftKey });
      if (e.detail >= 2) return; // the dblclick handler finishes
      if (chain.length >= 3 && Math.hypot(p.x - chain[0].x, p.y - chain[0].y) < 10 / this.view().zoom) {
        chain.push({ x: chain[0].x, y: chain[0].y });
        this.finishChain(true);
        return;
      }
      chain.push({ x: p.x, y: p.y });
      return;
    }
    if (tool === 'rect') {
      const p = this.snap(w, {});
      if (this.tool.rectA) { this.finishRect(this.tool.rectA, this.squareIf(this.tool.rectA, this.snap(w, {}), e.shiftKey)); return; }
      this.tool.rectA = { x: p.x, y: p.y };
      this.tool.rectDragging = true;
      return;
    }
    if (tool === 'scale' || tool === 'measure') {
      const p = this.snap(w, { anchor: this.tool.chain[0], shift: e.shiftKey });
      if (tool === 'measure' && this.tool.chain.length >= 2) this.tool.chain = [];
      this.tool.chain.push({ x: p.x, y: p.y });
      if (this.tool.chain.length === 2) {
        const [a, b] = this.tool.chain;
        const pixels = Math.hypot(b.x - a.x, b.y - a.y);
        if (tool === 'scale') {
          if (pixels < 2) { this.tool.chain = []; return; }
          this.scaleLine = { a, b };
          openDialog('scale', { pixels, floorIndex: store.ui.floorIndex });
          this.tool.chain = [];
        } else {
          this.measure = { a, b };
          if (!f.scale) toast('Set the scale to measure real distances.', 'warn');
        }
      }
      return;
    }
    if (tool === 'ap') {
      if (!store.ui.deviceId) { openDialog('devices', { mode: 'place' }); return; }
      A.addAp(w.x, w.y, store.ui.deviceId);
      return;
    }
    if (tool === 'closet') { A.addCloset(w.x, w.y); return; }
    if (tool === 'client') { A.addClient(w.x, w.y); return; }
    if (tool === 'door') {
      const hit = this.hitTest(w, { handles: false });
      if (hit?.kind !== 'wall') { toast('Click on a wall to cut a door opening.', 'info', 2500); return; }
      A.addDoorGap(hit.id, w.x, w.y);
      return;
    }
    if (tool === 'probe') {
      setUi({ probe: { x: w.x, y: w.y } });
    }
  }

  squareIf(a, b, shift) {
    if (!shift) return b;
    const s = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    return { x: a.x + Math.sign(b.x - a.x || 1) * s, y: a.y + Math.sign(b.y - a.y || 1) * s };
  }

  toolMove(w, e) {
    const tool = store.ui.tool;
    const f = currentFloor();
    if (!f) return;
    if (this.drag?.mode === 'move') {
      let dx = w.x - this.drag.last.x, dy = w.y - this.drag.last.y;
      if (!this.drag.moved && Math.hypot(w.x - this.drag.start.x, w.y - this.drag.start.y) < 3 / this.view().zoom) return;
      this.drag.moved = true;
      this.drag.last = w;
      A.moveSelectionBy(dx, dy);
      return;
    }
    if (this.drag?.mode === 'wallEnd') {
      const p = this.snap(w, { exclude: (o) => this.drag.ids.has(o.id) });
      for (const { w: o, end } of this.drag.ends) {
        if (end === 1) { o.x1 = p.x; o.y1 = p.y; } else { o.x2 = p.x; o.y2 = p.y; }
      }
      this.drag.moved = true;
      store.version++;
      this.invalidateStore();
      return;
    }
    if (this.drag?.mode === 'vertex') {
      const z = f.zones.find((o) => o.id === this.drag.id);
      const p = this.snap(w, {});
      if (z) { z.points[this.drag.index] = { x: p.x, y: p.y }; this.drag.moved = true; store.version++; this.invalidateStore(); }
      return;
    }
    if (this.drag?.mode === 'marquee') { this.drag.b = w; return; }
    if (tool === 'select') {
      const h = this.hitTest(w);
      const changed = (h?.kind || null) !== (this.hover?.kind || null) || h?.id !== this.hover?.id;
      this.hover = h;
      if (changed) this.updateCursor();
      return;
    }
    if (tool === 'wall' || tool === 'area' || tool === 'scale' || tool === 'measure') {
      this.tool.preview = this.snap(w, { anchor: this.tool.chain.at(-1), shift: e.shiftKey });
      return;
    }
    if (tool === 'rect') { this.tool.preview = this.tool.rectA ? this.squareIf(this.tool.rectA, this.snap(w, {}), e.shiftKey) : this.snap(w, {}); return; }
    this.tool.preview = w;
  }

  invalidateStore() {
    // In-place drags: let the heatmap and panels follow.
    notify();
  }

  toolUp(w, e, cancelled) {
    const d = this.drag;
    if (store.ui.tool === 'rect' && this.tool.rectA && this.tool.rectDragging) {
      this.tool.rectDragging = false;
      const b = this.squareIf(this.tool.rectA, this.snap(w, {}), e.shiftKey);
      if (Math.abs(b.x - this.tool.rectA.x) > 6 / this.view().zoom && Math.abs(b.y - this.tool.rectA.y) > 6 / this.view().zoom) this.finishRect(this.tool.rectA, b);
      return;
    }
    if (!d) return;
    this.drag = null;
    if (cancelled) return;
    if ((d.mode === 'move' || d.mode === 'wallEnd' || d.mode === 'vertex') && d.moved) commit(null, { before: d.before });
    if (d.mode === 'marquee') {
      const x0 = Math.min(d.a.x, d.b.x), x1 = Math.max(d.a.x, d.b.x), y0 = Math.min(d.a.y, d.b.y), y1 = Math.max(d.a.y, d.b.y);
      if (x1 - x0 < 3 / this.view().zoom && y1 - y0 < 3 / this.view().zoom) return;
      const f = currentFloor();
      const inR = (p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
      const prev = e.shiftKey ? store.ui.selection : null;
      const pick = (kind, list) => {
        const ids = list.filter(inR).map((o) => o.id);
        if (!ids.length) return false;
        const merged = prev?.kind === kind ? [...new Set([...prev.ids, ...ids])] : ids;
        setUi({ selection: { kind, ids: merged } });
        return true;
      };
      if (!pick('ap', f.aps) && !pick('closet', f.closets) && !pick('client', f.clients)) {
        const walls = f.walls.filter((wl) => inR({ x: wl.x1, y: wl.y1 }) && inR({ x: wl.x2, y: wl.y2 })).map((wl) => wl.id);
        if (walls.length) setUi({ selection: { kind: 'wall', ids: prev?.kind === 'wall' ? [...new Set([...prev.ids, ...walls])] : walls } });
        else {
          const zones = f.zones.filter((z) => inR(polygonCentroid(z.points))).map((z) => z.id);
          if (zones.length) setUi({ selection: { kind: 'zone', ids: zones } });
        }
      }
    }
  }

  finishRect(a, b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    this.tool.rectA = null;
    this.tool.rectDragging = false;
    if (x1 - x0 < 2 || y1 - y0 < 2) return;
    const before = beginTransient();
    const pts = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    const mat = store.ui.wallMaterial;
    commit((p) => {
      const fl = p.floors[store.ui.floorIndex];
      for (let i = 0; i < 4; i++) {
        const s = pts[i], t = pts[(i + 1) % 4];
        // Skip a side that already lies on an existing wall (shared walls between rooms).
        const covered = fl.walls.some((wl) => distToSegment(s.x, s.y, wl.x1, wl.y1, wl.x2, wl.y2) < 1 && distToSegment(t.x, t.y, wl.x1, wl.y1, wl.x2, wl.y2) < 1);
        if (!covered) fl.walls.push({ id: uid('wall'), x1: s.x, y1: s.y, x2: t.x, y2: t.y, materialId: mat });
      }
      const n = fl.zones.filter((z) => z.kind === 'room').length + 1;
      fl.zones.push({ id: uid('zone'), kind: 'room', name: `Room ${n}`, points: pts, materialId: null, devices: 0 });
    }, { before });
  }

  finishChain(closed = false) {
    const chain = this.tool.chain;
    const tool = store.ui.tool;
    if (tool === 'wall' && chain.length >= 2) {
      const segs = [];
      for (let i = 0; i + 1 < chain.length; i++) segs.push({ x1: chain[i].x, y1: chain[i].y, x2: chain[i + 1].x, y2: chain[i + 1].y });
      A.addWalls(segs);
    } else if (tool === 'area') {
      const pts = closed ? chain.slice(0, -1) : chain;
      if (pts.length >= 3) {
        const id = A.addZone(store.ui.zoneKind, pts);
        setUi({ selection: { kind: 'zone', ids: [id] } });
      } else if (pts.length) toast('An area needs at least three points.', 'info', 2500);
    }
    this.tool.chain = [];
    this.tool.preview = null;
    this.invalidate();
  }

  /** Keys the active tool handles before global shortcuts. Returns true if consumed. */
  handleKey(e) {
    const tool = store.ui.tool;
    const chain = this.tool.chain;
    if (e.key === 'Escape') {
      if (chain.length || this.tool.rectA || this.measure || this.drag) {
        if (this.drag?.before && this.drag.moved) commit(null, { before: this.drag.before });
        this.tool = { chain: [], preview: null };
        this.measure = null;
        this.drag = null;
        this.invalidate();
        return true;
      }
      if (store.ui.probe) { setUi({ probe: null }); return true; }
      return false;
    }
    if ((tool === 'wall' || tool === 'area') && chain.length) {
      if (e.key === 'Enter') { this.finishChain(); return true; }
      if (e.key === 'Backspace' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey)) { chain.pop(); this.invalidate(); return true; }
    }
    return false;
  }

  // ---------------------------------------------------------------- render
  frame() {
    this.raf = requestAnimationFrame(this.frame);
    const f = currentFloor();
    if (f?.id !== this.lastFloorId) { this.lastFloorId = f?.id; this.resetTool(); this.measure = null; this.emitZoom(); }
    if (!this.needs) return;
    this.needs = false;
    try { this.render(); } catch (err) { console.error(err); }
  }

  render() {
    const ctx = this.ctx;
    const t = D.THEME.dark;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = t.ground;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    const f = currentFloor();
    if (!f) return;
    const v = this.view();
    if (v.zoom !== this.lastZoom) { this.lastZoom = v.zoom; this.emitZoom(); }
    const u = 1 / v.zoom;
    const ui = store.ui;
    const L = ui.layers;
    const p = store.project;
    ctx.setTransform(this.dpr * v.zoom, 0, 0, this.dpr * v.zoom, this.dpr * v.tx, this.dpr * v.ty);

    D.drawPlan(ctx, f, L.plan ? getPlanImage(p, f.imageId, 'dark') : null, t);
    if (L.grid) D.drawGrid(ctx, f, u, t, p.settings.units);

    const res = store.rf.result;
    if (L.heatmap && res && res.floorId === f.id && res.band === ui.band) {
      const key = `${res.id}|${ui.view}|${L.clip && f.zones.some((z) => z.kind === 'room')}|${p.settings.target.primary}|${p.settings.target.secondary}`;
      if (this.heat.key !== key) {
        const clip = L.clip && f.zones.some((z) => z.kind === 'room');
        this.heat = { key, value: buildHeatmap(res, { view: ui.view, clip, settings: p.settings }), contour: buildContour(res, ui.view, p.settings, clip) };
      }
      D.drawHeatmap(ctx, this.heat.value, res, ui.heatmapOpacity);
      if (L.contour) D.drawContour(ctx, this.heat.contour, u, t);
    }

    const sel = ui.selection;
    const selIds = (k) => (sel?.kind === k ? sel.ids : []);
    if (L.rooms) D.drawZones(ctx, f, u, t, { selectedIds: selIds('zone'), units: p.settings.units, zoneMaterials: p.zoneMaterials });
    if (L.walls) D.drawWalls(ctx, f, p.materials, u, t, { selectedIds: selIds('wall') });
    if (L.cables && f.closets.length) {
      if (this.runs.key !== store.version) this.runs = { key: store.version, value: cableRuns(p, A.devices()) };
      D.drawCables(ctx, f, this.runs.value, u, t);
    }
    if (L.interference) D.drawInterference(ctx, f, this.interferencePairs(), u, t);
    if (L.clients && f.clients.length) D.drawClients(ctx, A.clientAssociations(), f, u, t);
    if (L.closets) D.drawClosets(ctx, f, u, t, selIds('closet'));
    if (L.aps) D.drawAps(ctx, f, u, t, { selectedIds: selIds('ap'), band: ui.band, devices: A.devices(), otherFloorAps: this.ghostAps(f) });

    this.drawToolOverlay(ctx, u, t, f);
    D.drawScaleBar(ctx, f, v.zoom, this.cssW, this.cssH, p.settings.units, t, this.dpr);
  }

  ghostAps(f) {
    const fi = store.ui.floorIndex;
    const out = [];
    for (const k of [fi - 1, fi + 1]) {
      const g = store.project.floors[k];
      if (!g?.scale || !f.scale) continue;
      for (const a of g.aps) out.push({ x: (a.x * g.scale + g.offsetM.x - f.offsetM.x) / f.scale, y: (a.y * g.scale + g.offsetM.y - f.offsetM.y) / f.scale });
    }
    return out;
  }

  interferencePairs() {
    return A.coChannelPairs(store.ui.floorIndex, store.ui.band);
  }

  drawToolOverlay(ctx, u, t, f) {
    const tool = store.ui.tool;
    const units = store.project.settings.units;
    const len = (a, b) => (f.scale ? fmtLen(Math.hypot(b.x - a.x, b.y - a.y) * f.scale, units) : `${Math.hypot(b.x - a.x, b.y - a.y).toFixed(0)} px`);
    const chain = this.tool.chain;
    const pv = this.tool.preview;
    if ((tool === 'wall' || tool === 'area') && (chain.length || pv)) {
      ctx.save();
      const mat = store.project.materials.find((m) => m.id === store.ui.wallMaterial);
      ctx.strokeStyle = tool === 'wall' ? mat?.color || t.ink : t.accent;
      ctx.lineWidth = (tool === 'wall' ? mat?.width || 2.5 : 1.5) * u;
      if (tool === 'area') ctx.setLineDash([5 * u, 4 * u]);
      ctx.beginPath();
      chain.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (pv && chain.length) ctx.lineTo(pv.x, pv.y);
      if (tool === 'area' && chain.length >= 2 && pv) ctx.lineTo(chain[0].x, chain[0].y);
      ctx.stroke();
      ctx.restore();
      for (const p of chain) D.handle(ctx, p.x, p.y, u, t);
      if (pv && chain.length) D.drawDimension(ctx, chain.at(-1), pv, len(chain.at(-1), pv), u, t, 'rgba(0,0,0,0)');
      if (pv) this.snapMark(ctx, pv, u, t);
    }
    if (tool === 'rect' && pv) {
      const a = this.tool.rectA;
      if (a) {
        ctx.save();
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = 1.5 * u;
        ctx.setLineDash([5 * u, 4 * u]);
        ctx.strokeRect(Math.min(a.x, pv.x), Math.min(a.y, pv.y), Math.abs(pv.x - a.x), Math.abs(pv.y - a.y));
        ctx.restore();
        D.drawDimension(ctx, { x: a.x, y: Math.max(a.y, pv.y) }, { x: pv.x, y: Math.max(a.y, pv.y) }, len({ x: a.x, y: 0 }, { x: pv.x, y: 0 }), u, t, 'rgba(0,0,0,0)');
        D.drawDimension(ctx, { x: Math.max(a.x, pv.x), y: a.y }, { x: Math.max(a.x, pv.x), y: pv.y }, len({ x: 0, y: a.y }, { x: 0, y: pv.y }), u, t, 'rgba(0,0,0,0)');
      }
      this.snapMark(ctx, pv, u, t);
    }
    if (tool === 'scale' || tool === 'measure') {
      if (chain.length === 1 && pv) D.drawDimension(ctx, chain[0], pv, tool === 'measure' ? len(chain[0], pv) : `${Math.hypot(pv.x - chain[0].x, pv.y - chain[0].y).toFixed(0)} px`, u, t);
      if (pv) this.snapMark(ctx, pv, u, t);
    }
    if (this.scaleLine && store.ui.dialog?.name === 'scale') D.drawDimension(ctx, this.scaleLine.a, this.scaleLine.b, null, u, t);
    else this.scaleLine = null;
    if (this.measure && tool === 'measure') D.drawDimension(ctx, this.measure.a, this.measure.b, len(this.measure.a, this.measure.b), u, t);
    if ((tool === 'ap' || tool === 'closet' || tool === 'client') && pv) {
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(pv.x, pv.y, (tool === 'client' ? 3.5 : 8.5) * u, 0, Math.PI * 2);
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.drag?.mode === 'marquee') {
      const { a, b } = this.drag;
      ctx.save();
      ctx.fillStyle = 'rgba(255,106,61,0.06)';
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 1 * u;
      ctx.setLineDash([4 * u, 3 * u]);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.restore();
    }
    if (store.ui.probe) {
      const p = store.ui.probe;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * u, 0, Math.PI * 2);
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 12 * u, p.y); ctx.lineTo(p.x - 6 * u, p.y); ctx.moveTo(p.x + 6 * u, p.y); ctx.lineTo(p.x + 12 * u, p.y);
      ctx.moveTo(p.x, p.y - 12 * u); ctx.lineTo(p.x, p.y - 6 * u); ctx.moveTo(p.x, p.y + 6 * u); ctx.lineTo(p.x, p.y + 12 * u);
      ctx.stroke();
    }
  }

  snapMark(ctx, p, u, t) {
    if (!p.snapped) return;
    ctx.save();
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 1.5 * u;
    if (p.snapped === 'end') ctx.strokeRect(p.x - 6 * u, p.y - 6 * u, 12 * u, 12 * u);
    else { ctx.beginPath(); ctx.arc(p.x, p.y, 6 * u, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
}

export function isTyping(e) {
  const el = e.target;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
