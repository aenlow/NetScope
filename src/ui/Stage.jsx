import { useEffect, useRef, useState } from 'preact/hooks';
import { store, useStore, setUi } from '../state/store.js';
import * as A from '../state/actions.js';
import { Viewport, cursorBus } from '../canvas/viewport.js';
import { setViewport, getViewport } from './viewportRef.js';
import { Seg } from './controls.jsx';
import { VIEWS, cssGradient, OVERLAP_COLORS } from '../core/colors.js';
import { BANDS, BAND_LABEL } from '../core/bands.js';
import { TARGET_PRESETS } from '../core/schema.js';
import { signed } from '../core/units.js';
import { viewRange } from '../canvas/heatmapImage.js';
import { TOOLS } from './commands.js';
import { Welcome } from './Welcome.jsx';
import { Icon } from './icons.jsx';
import { importPlanFrom, openProjectFrom } from './io.js';

export function Stage() {
  const ref = useRef(null);
  const hasFloors = useStore((s) => s.project.floors.length > 0);
  const started = useStore((s) => s.ui.started);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const vp = new Viewport(ref.current);
    setViewport(vp);
    return () => { vp.destroy(); setViewport(null); };
  }, []);

  const onDrop = async (e) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (/\.json$/i.test(file.name) || file.type === 'application/json') await openProjectFrom(file);
    else await importPlanFrom(file, { newFloor: true });
  };

  const showWelcome = !hasFloors || !started && !hasFloors;
  return (
    <main class="stage" aria-label="Floor plan canvas"
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
      onDrop={onDrop}>
      <canvas ref={ref} tabIndex={0} aria-label="Floor plan. Use the tool rail or shortcuts to draw; arrow keys move the selection." />
      {hasFloors ? (
        <>
          <ViewBar />
          <Legend />
          <ZoomCtl />
          <ToolHint />
          <ProbeCard />
          <ScaleMissing />
        </>
      ) : null}
      <Busy />
      {showWelcome ? <Welcome /> : null}
      {drag ? <div class="drop">Drop a floor plan (image or PDF) or a NetScope project file</div> : null}
    </main>
  );
}

function ViewBar() {
  useStore((s) => [s.ui.view, s.ui.band, s.version]);
  const t = store.project.settings.target;
  const used = new Set();
  const devs = A.devices();
  for (const f of store.project.floors) for (const a of f.aps) for (const b of BANDS) if (a.radios[b]?.on && devs.get(a.deviceId)?.radios[b]) used.add(b);
  return (
    <div class="overlay-top">
      <Seg label="View" value={store.ui.view} onChange={(v) => setUi({ view: v })}
        options={Object.entries(VIEWS).map(([k, v], i) => ({ value: k, label: v.label, title: `${v.label} (${i + 1})` }))} />
      <Seg label="Band" mono value={store.ui.band} onChange={(v) => setUi({ band: v })}
        options={BANDS.map((b) => ({ value: b, label: b === '6' ? '6 GHz' : b, title: `${BAND_LABEL[b]}${used.has(b) ? '' : ' (no radios on)'} · B cycles bands` }))} />
      <div style={{ flex: 1 }} />
      <label class="row floating hide-phone" style={{ padding: '0 4px 0 10px', gap: '8px', height: '30px', minHeight: 0 }}>
        <span class="dim" style={{ fontSize: '12px' }}>Target</span>
        <select class="input mono" style={{ height: '26px', border: 0, background: 'transparent', width: 'auto', fontSize: '12px' }} value={t.preset}
          onChange={(e) => A.applyTargetPreset(e.currentTarget.value)} aria-label="Coverage target">
          {Object.entries(TARGET_PRESETS).map(([k, v]) => (
            <option value={k}>{k === 'custom' ? `Custom ${t.preset === 'custom' ? `${t.primary} dBm` : ''}` : `${v.label}  ${v.primary}${v.secondaryEnabled ? ` / ${v.secondary}` : ''} dBm`}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Legend() {
  useStore((s) => [s.ui.view, s.ui.band, s.rf.result, s.version, s.ui.layers.heatmap]);
  const res = store.rf.result;
  const f = store.project.floors[store.ui.floorIndex];
  if (!store.ui.layers.heatmap || !f?.scale) return null;
  const view = store.ui.view;
  const v = VIEWS[view];
  const s = store.project.settings;
  if (!res || !f.aps.length) {
    return <div class="legend floating"><div class="caps">{v.label} · {BAND_LABEL[store.ui.band]}</div><div class="hint" style={{ marginTop: '6px' }}>{f.aps.length ? 'Computing…' : 'Place access points to see a heatmap.'}</div></div>;
  }
  if (view === 'overlap') {
    return (
      <div class="legend floating">
        <div class="row between" style={{ minHeight: 0, marginBottom: '8px' }}><span class="caps">Channel overlap · {BAND_LABEL[store.ui.band]}</span><span class="dimmer mono" style={{ fontSize: '11px' }}>est.</span></div>
        <div class="swatches">
          {[1, 2, 3, 4].map((n) => <span><i style={{ background: `rgb(${OVERLAP_COLORS[n].slice(0, 3).join(',')})` }} />{n === 4 ? '4+' : n}</span>)}
        </div>
        <div class="hint" style={{ marginTop: '6px' }}>Radios on the serving channel heard above {s.ccaDbm} dBm. 1 means no co-channel contention.</div>
      </div>
    );
  }
  const range = viewRange(view, res, s);
  const pos = (x) => `${((x - range.min) / (range.max - range.min)) * 100}%`;
  const ticks = view === 'rate' ? [0, range.max / 4, range.max / 2, (3 * range.max) / 4, range.max] : v.ticks;
  const markers = [];
  if (view === 'signal') markers.push({ v: s.target.primary, label: 'Target' });
  if (view === 'secondary') markers.push({ v: s.target.secondary, label: 'Secondary target', sec: true });
  return (
    <div class="legend floating" aria-label={`${v.label} legend`}>
      <div class="row between" style={{ minHeight: 0, marginBottom: '8px' }}>
        <span class="caps">{v.label} · {BAND_LABEL[store.ui.band]}</span>
        <span class="dimmer mono" style={{ fontSize: '11px' }}>{v.unit}, est.</span>
      </div>
      <div class="bar" style={{ background: cssGradient() }}>
        {markers.map((m) => <div class={`marker${m.sec ? ' sec' : ''}`} style={{ left: pos(m.v) }} title={`${m.label} ${m.v} ${v.unit}`} />)}
      </div>
      <div class="ticks">
        {ticks.map((x, i) => <span style={{ left: pos(x), transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : undefined }}>{view === 'rate' ? Math.round(x) : signed(x)}</span>)}
      </div>
      <div class="hint">
        {view === 'signal' ? <>Orange line on the map marks {s.target.primary} dBm. Below {v.floor} dBm is not drawn.</> : null}
        {view === 'secondary' ? <>Second-strongest AP. Needed for roaming and voice.</> : null}
        {view === 'snr' ? <>Signal minus noise floor ({s.noiseOverride != null ? `${s.noiseOverride} dBm set` : `thermal + ${s.noiseFigure} dB`}).</> : null}
        {view === 'rate' ? <>Wi-Fi {s.client.gen} {s.client.nss}×{s.client.nss} client, one at a time, × {s.efficiency} efficiency.</> : null}
        {res.stats && (view === 'signal' || view === 'secondary') ? <> Coverage <span class="mono" style={{ color: 'var(--text)' }}>{(view === 'signal' ? res.stats.primaryPct : res.stats.secondaryPct).toFixed(1)}%</span>.</> : null}
      </div>
    </div>
  );
}

function ZoomCtl() {
  const [z, setZ] = useState(cursorBus.last?.zoom || 1);
  useEffect(() => cursorBus.sub((p) => p.zoom && setZ(p.zoom)), []);
  return (
    <div class="zoomctl floating">
      <button aria-label="Zoom out" onClick={() => getViewport()?.zoomAt(0.8)}>−</button>
      <span class="z" aria-live="off">{Math.round(z * 100)}%</span>
      <button aria-label="Zoom in" onClick={() => getViewport()?.zoomAt(1.25)}>+</button>
      <button class="fit" onClick={() => getViewport()?.fit()} title="Fit (F)">Fit</button>
    </div>
  );
}

function ToolHint() {
  const tool = useStore((s) => s.ui.tool);
  const deviceId = useStore((s) => s.ui.deviceId);
  if (tool === 'select') return null;
  const t = TOOLS.find((x) => x.id === tool);
  const dev = deviceId ? A.devices().get(deviceId) : null;
  return (
    <div class="toolhint floating" role="status">
      <b>{t.label}{tool === 'ap' && dev ? `: ${dev.vendor} ${dev.model}` : ''}</b>
      <span>{t.hint}</span>
      <span class="dimmer">Esc to finish</span>
    </div>
  );
}

function ProbeCard() {
  const probe = useStore((s) => s.ui.probe);
  useStore((s) => [s.version, s.ui.band]);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!probe) return undefined;
    const tick = () => { const s = getViewport()?.toScreen(probe.x, probe.y); if (s) setPos(s); };
    tick();
    return cursorBus.sub(tick);
  }, [probe]);
  if (!probe || !pos) return null;
  const r = A.probeAt(probe.x, probe.y);
  const vp = getViewport();
  const left = Math.min(Math.max(8, pos.x + 16), (vp?.cssW || 800) - 270);
  const top = Math.min(Math.max(48, pos.y + 16), (vp?.cssH || 600) - 220);
  return (
    <div class="probe floating" style={{ left: `${left}px`, top: `${top}px` }} role="dialog" aria-label="Signal at point">
      <div class="row between" style={{ minHeight: 0, marginBottom: '6px' }}>
        <span class="caps">Heard here · {BAND_LABEL[store.ui.band]}</span>
        <button class="btn icon quiet small" aria-label="Close" onClick={() => setUi({ probe: null })}><Icon name="close" size={14} /></button>
      </div>
      {!r || !r.readings.length ? <div class="hint">No radios on this band.</div> : (
        <>
          <table>
            <tbody>
              {r.readings.slice(0, 8).map((x) => <tr><td>{x.e.name}</td><td class="dim">ch {x.e.ch}</td><td>{signed(x.rssi, 0)} dBm</td></tr>)}
            </tbody>
          </table>
          <div class="hint" style={{ marginTop: '6px' }}>SNR {r.snr.toFixed(0)} dB against a {signed(r.noise, 0)} dBm noise floor (estimate).</div>
        </>
      )}
    </div>
  );
}

function ScaleMissing() {
  useStore((s) => [s.version, s.ui.floorIndex, s.ui.tool]);
  const f = store.project.floors[store.ui.floorIndex];
  if (!f || f.scale || store.ui.tool === 'scale') return null;
  return (
    <div class="floating" style={{ position: 'absolute', left: '50%', top: '56px', transform: 'translateX(-50%)', padding: '8px 10px 8px 14px', display: 'flex', gap: '12px', alignItems: 'center' }} role="status">
      <span>Scale not set. Signal can't be predicted until it is.</span>
      <button class="btn small primary" onClick={() => { setUi({ tool: 'scale' }); getViewport()?.resetTool(); }}>Set scale <span class="k">S</span></button>
    </div>
  );
}

function Busy() {
  const busy = useStore((s) => s.ui.busy);
  const pending = useStore((s) => s.rf.pending);
  const progress = useStore((s) => s.rf.progress);
  if (busy) {
    return (
      <>
        <div class={`busy${busy.progress == null ? ' indeterminate' : ''}`} role="progressbar" aria-label={busy.label} aria-valuenow={busy.progress != null ? Math.round(busy.progress * 100) : undefined}><div style={{ width: busy.progress != null ? `${busy.progress * 100}%` : undefined }} /></div>
        <div class="floating" style={{ position: 'absolute', top: '52px', right: '12px', padding: '7px 12px', fontSize: '12px' }} role="status">{busy.label}{busy.progress != null ? ` · ${Math.round(busy.progress * 100)}%` : '…'}</div>
      </>
    );
  }
  if (pending) return <div class={`busy${progress == null ? ' indeterminate' : ''}`} role="progressbar" aria-label="Computing heatmap"><div style={{ width: progress != null ? `${progress * 100}%` : undefined }} /></div>;
  return null;
}
