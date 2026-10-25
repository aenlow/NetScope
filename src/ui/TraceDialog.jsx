// Trace walls from the floor-plan image: preview, materials, scale, rooms.
import { useEffect, useRef, useState } from 'preact/hooks';
import { store, closeDialog, setUi, toast } from '../state/store.js';
import * as A from '../state/actions.js';
import { Dialog } from './Dialog.jsx';
import { SelectField, Check, Seg } from './controls.jsx';
import { traceImage } from '../engine/traceClient.js';
import { parseLength } from '../core/trace.js';
import { fmtLen } from '../core/units.js';
import { getViewport } from './viewportRef.js';

const DOOR_M = 0.84; // a typical interior door opening (2'-9"), for the rough scale guess
const COLORS = { exterior: '#E8622F', interior: '#3D6FB4', window: '#1E9C8F' };

function largestPlan(result) {
  if (!result?.plans.length) return null;
  return result.plans.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
}

function extThickness(result) {
  const ext = result.walls.filter((w) => w.kind === 'wall' && w.exterior).map((w) => w.thickness).sort((a, b) => a - b);
  return ext.length ? ext[Math.floor(ext.length / 2)] : 0;
}

function Preview({ floor, result, split }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const url = store.project.images[floor.imageId];
    const img = new Image();
    let alive = true;
    img.onload = () => {
      if (!alive) return;
      const W = c.clientWidth || 520, H = c.clientHeight || 300;
      const dpr = window.devicePixelRatio || 1;
      c.width = W * dpr;
      c.height = H * dpr;
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
      const k = Math.min(W / floor.width, H / floor.height);
      const ox = (W - floor.width * k) / 2, oy = (H - floor.height * k) / 2;
      ctx.globalAlpha = 0.4;
      ctx.drawImage(img, ox, oy, floor.width * k, floor.height * k);
      ctx.globalAlpha = 1;
      if (!result) return;
      ctx.lineCap = 'square';
      for (const w of result.walls) {
        ctx.strokeStyle = w.kind === 'window' ? COLORS.window : w.exterior ? COLORS.exterior : COLORS.interior;
        ctx.lineWidth = Math.max(1.5, Math.min(4, w.thickness * k));
        ctx.setLineDash(w.kind === 'window' ? [3, 2] : []);
        ctx.beginPath();
        ctx.moveTo(ox + w.x1 * k, oy + w.y1 * k);
        ctx.lineTo(ox + w.x2 * k, oy + w.y2 * k);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (split && result.plans.length > 1) {
        ctx.font = '600 11px "IBM Plex Mono", monospace';
        result.plans.forEach((p, i) => {
          ctx.strokeStyle = 'rgba(28,27,25,0.55)';
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 1;
          ctx.strokeRect(ox + p.x * k - 3, oy + p.y * k - 3, p.w * k + 6, p.h * k + 6);
          ctx.setLineDash([]);
          const label = `Floor ${i + 1}`;
          const tw = ctx.measureText(label).width + 8;
          ctx.fillStyle = '#1C1B19';
          ctx.fillRect(ox + p.x * k - 3, oy + p.y * k - 19, tw, 16);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(label, ox + p.x * k + 1, oy + p.y * k - 7);
        });
      }
    };
    img.src = url;
    return () => { alive = false; };
  }, [floor.imageId, result, split]);
  return <canvas ref={ref} class="trace-preview" aria-label="Preview of the traced walls over the floor plan" role="img" />;
}

export function TraceDialog({ floorIndex, auto = false, scaleHint = null }) {
  const floor = store.project.floors[floorIndex];
  const units = store.project.settings.units;
  const mats = store.project.materials;
  const has = (id) => mats.some((m) => m.id === id);
  const [state, setState] = useState({ phase: 'running', result: null, error: null });
  const [ext, setExt] = useState(has('brick') ? 'brick' : mats[0]?.id);
  const [int, setInt] = useState(has('drywall') ? 'drywall' : mats[0]?.id);
  const [win, setWin] = useState(has('glass') ? 'glass' : mats[0]?.id);
  const [split, setSplit] = useState(true);
  const [replace, setReplace] = useState(true);
  const [rooms, setRooms] = useState(true);
  const needScale = !floor?.scale;
  const [scaleMode, setScaleMode] = useState(scaleHint ? 'pdf' : 'width');
  const [dimText, setDimText] = useState('');
  const [dimAxis, setDimAxis] = useState('w');

  useEffect(() => {
    if (!floor?.imageId) { setState({ phase: 'error', result: null, error: 'This floor has no plan image to trace.' }); return; }
    let alive = true;
    traceImage(store.project.images[floor.imageId])
      .then((result) => alive && setState({ phase: 'done', result, error: null }))
      .catch((err) => alive && setState({ phase: 'error', result: null, error: err.message || String(err) }));
    return () => { alive = false; };
  }, []);

  if (!floor) return null;
  const { phase, result } = state;
  const walls = result?.walls || [];
  const nWall = walls.filter((w) => w.kind === 'wall').length;
  const nExt = walls.filter((w) => w.kind === 'wall' && w.exterior).length;
  const nWin = walls.filter((w) => w.kind === 'window').length;
  const multi = (result?.plans.length || 0) > 1;
  const canSplit = multi && !floor.walls.length && !floor.aps.length && !floor.zones.length;
  const doSplit = canSplit && split;

  // Scale candidates (metres per pixel).
  const plan = largestPlan(result);
  const outline = plan ? { w: plan.w + extThickness(result), h: plan.h + extThickness(result) } : null;
  const dimM = parseLength(dimText, units === 'ft' ? 'ft' : 'm');
  const fromDim = outline && dimM ? dimM / (dimAxis === 'w' ? outline.w : outline.h) : null;
  let fromDoor = result?.doorPx ? DOOR_M / result.doorPx : null;
  if (fromDoor && outline) {
    const wM = outline.w * fromDoor;
    if (wM < 4 || wM > 200) fromDoor = null; // implausible building size
  }
  const scale = !needScale ? null
    : scaleMode === 'pdf' ? scaleHint?.mPerPx || null
      : scaleMode === 'width' ? fromDim
        : scaleMode === 'door' ? fromDoor : null;

  const finish = (added) => {
    closeDialog();
    requestAnimationFrame(() => getViewport()?.fit());
    const f = store.project.floors[floorIndex];
    if (!f.scale) {
      setUi({ tool: 'scale' });
      getViewport()?.resetTool();
      toast(added ? 'Walls added. Next, set the scale: draw a line along something of known length.' : 'Next, set the scale: draw a line along something of known length.', 'ok', 7000);
    } else {
      setUi({ tool: 'select' });
      toast(added ? `Walls added and scale set (the plan is ${fmtLen(f.width * f.scale, units)} wide). Check the walls, then place access points.` : `Scale set: the plan is ${fmtLen(f.width * f.scale, units)} wide.`, 'ok', 7000);
    }
  };

  const apply = async () => {
    if (!walls.length) {
      if (scale) A.setScale(floorIndex, 1, scale);
      finish(false);
      return;
    }
    const res = await A.applyTrace(floorIndex, result, { exterior: ext, interior: int, window: win, replace, split: doSplit, scale, rooms: rooms && !!(scale || floor.scale) });
    if (res && doSplit) toast(`Split into ${result.plans.length} floors, ordered bottom to top as they appear on the sheet. Rename or reorder them in Floor settings.`, 'info', 9000);
    finish(true);
  };

  const skip = () => finish(false);
  const matOptions = mats.map((m) => ({ value: m.id, label: m.name }));
  const fmt = (mpp) => (mpp && outline ? `${fmtLen(outline.w * mpp, units)} × ${fmtLen(outline.h * mpp, units)}` : '');

  return (
    <Dialog title="Trace walls from the plan" size="wide" onClose={skip}
      footer={<>
        <button class="btn" onClick={skip}>{auto ? 'Skip, draw by hand' : 'Cancel'}</button>
        <button class="btn primary" disabled={phase === 'running' || (phase === 'error' && !scale)} onClick={apply}>
          {walls.length ? `Add ${nWall + nWin} walls${doSplit ? ` to ${result.plans.length} floors` : ''}` : scale ? 'Set scale' : 'Continue'}
        </button>
      </>}>
      <div class="content trace">
        <div class="trace-left">
          <Preview floor={floor} result={result} split={doSplit} />
          {phase === 'running' ? <p class="hint" role="status">Looking for walls…</p> : null}
          {phase === 'error' ? <p class="hint warn" role="alert">Tracing failed: {state.error}</p> : null}
          {phase === 'done' ? (
            <div class="trace-legend" aria-live="polite">
              <span><i style={{ background: COLORS.exterior }} />Exterior {nExt}</span>
              <span><i style={{ background: COLORS.interior }} />Interior {nWall - nExt}</span>
              <span><i class="dash" style={{ borderColor: COLORS.window }} />Window {nWin}</span>
            </div>
          ) : null}
        </div>
        <div class="trace-right">
          {phase === 'done' && !walls.length ? (
            <p class="hint warn" style={{ margin: 0 }}>No walls were recognised. Tracing works best on clean plans with solid or outlined walls; draw walls with the Wall tool instead.</p>
          ) : (
            <p class="dim" style={{ margin: 0 }}>Straight horizontal and vertical walls are found automatically. Review the result: angled or curved walls, faint scans and stray lines may need a touch-up with the Wall tool.</p>
          )}
          {walls.length ? (
            <div class="grid3">
              <SelectField label="Exterior walls" value={ext} onChange={setExt} options={matOptions} />
              <SelectField label="Interior walls" value={int} onChange={setInt} options={matOptions} />
              <SelectField label="Windows" value={win} onChange={setWin} options={matOptions} />
            </div>
          ) : null}
          {walls.length ? <p class="hint" style={{ margin: 0 }}>A drawing does not show what walls are made of; pick what this building uses. Every wall can be changed afterwards.</p> : null}
          {multi ? (
            canSplit
              ? <Check label={`Split into ${result.plans.length} floors`} checked={split} onChange={setSplit} hint="This image holds several separate plans. Each becomes its own floor, bottom floor first in reading order." />
              : <p class="hint" style={{ margin: 0 }}>This image holds {result.plans.length} separate plans; they are added to this floor.</p>
          ) : null}
          {floor.walls.length && walls.length ? <Check label={`Replace the ${floor.walls.length} walls already on this floor`} checked={replace} onChange={setReplace} /> : null}

          {needScale ? (
            <fieldset class="trace-scale">
              <legend>Scale</legend>
              <Seg label="How to set the scale" value={scaleMode} onChange={setScaleMode} options={[
                ...(scaleHint ? [{ value: 'pdf', label: 'From PDF' }] : []),
                { value: 'width', label: 'Building size' },
                ...(fromDoor ? [{ value: 'door', label: 'Rough guess' }] : []),
                { value: 'later', label: 'Later' },
              ]} />
              {scaleMode === 'pdf' && scaleHint ? (
                <p class="hint" style={{ margin: 0 }}>The sheet says <b class="mono">{scaleHint.note}</b>. That makes the whole sheet {fmtLen(floor.width * scaleHint.mPerPx, units)} × {fmtLen(floor.height * scaleHint.mPerPx, units)}. Check it against a known dimension; sheets printed at a different size than drawn will be off.</p>
              ) : null}
              {scaleMode === 'width' ? (
                outline ? (
                  <>
                    <div class="grid2">
                      <label class="field" for="trace-dim"><span>Overall {dimAxis === 'w' ? 'width' : 'depth'}, outside walls</span>
                        <input id="trace-dim" class="input mono" value={dimText} placeholder={units === 'ft' ? "e.g. 45'6\"" : 'e.g. 13.9 m'} onInput={(e) => setDimText(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && scale && apply()} />
                      </label>
                      <SelectField label="Measured across" value={dimAxis} onChange={setDimAxis} options={[{ value: 'w', label: 'Width (left to right)' }, { value: 'h', label: 'Depth (top to bottom)' }]} />
                    </div>
                    <p class="hint" style={{ margin: 0 }}>
                      {dimText && !dimM ? 'Use a length like 45\'6", 45 ft or 13.9 m.' : fromDim ? `Building: ${fmt(fromDim)}.` : 'Most plans print the overall size along the edge. Type the one that matches the traced outline.'}
                    </p>
                  </>
                ) : <p class="hint" style={{ margin: 0 }}>{phase === 'running' ? 'Waiting for the outline…' : 'No building outline was found. Set the scale by drawing a line instead.'}</p>
              ) : null}
              {scaleMode === 'door' && fromDoor ? (
                <p class="hint warn" style={{ margin: 0 }}>Estimated from the most common door opening (assumed {fmtLen(DOOR_M, units)}): building about {fmt(fromDoor)}. This is a rough guess; check it against a dimension on the plan.</p>
              ) : null}
              {scaleMode === 'later' ? <p class="hint" style={{ margin: 0 }}>You will be asked to draw a line of known length next.</p> : null}
            </fieldset>
          ) : null}

          {walls.length ? <Check label="Mark rooms from the traced walls" checked={rooms && !!(scale || floor.scale)} disabled={!scale && !floor.scale} onChange={setRooms} hint={!scale && !floor.scale ? 'Needs the scale.' : 'Enclosed spaces become rooms, which coverage is measured over.'} /> : null}
        </div>
      </div>
    </Dialog>
  );
}
