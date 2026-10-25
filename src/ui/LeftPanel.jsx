import { useState, useEffect } from 'preact/hooks';
import { store, useStore, setUi, setLayers, openDialog } from '../state/store.js';
import * as A from '../state/actions.js';
import { Icon } from './icons.jsx';
import { selectTool } from './commands.js';
import { getViewport } from './viewportRef.js';
import { BANDS, BAND_LABEL } from '../core/bands.js';
import { staticIssues, capacitySummary } from '../core/analysis.js';
import { importPlanInteractive } from './io.js';

export function LeftPanel() {
  const tab = useStore((s) => s.ui.leftTab);
  const key = useStore((s) => [s.version, s.ui.floorIndex, s.rf.summary]);
  const [issues, setIssues] = useState(() => planIssues());
  useEffect(() => {
    // Recompute checks once edits pause, so dragging stays smooth.
    const t = setTimeout(() => setIssues(planIssues()), 350);
    return () => clearTimeout(t);
  }, key);
  const counts = { error: issues.filter((i) => i.level === 'error').length, warn: issues.filter((i) => i.level === 'warn').length };
  const f = store.project.floors[store.ui.floorIndex];
  return (
    <aside class="panel left" aria-label="Layers, access points and plan check">
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={String(tab === 'layers')} onClick={() => setUi({ leftTab: 'layers' })}>Layers</button>
        <button role="tab" aria-selected={String(tab === 'aps')} onClick={() => setUi({ leftTab: 'aps' })}>Access points<span class="count">{f?.aps.length || 0}</span></button>
        <button role="tab" aria-selected={String(tab === 'check')} onClick={() => setUi({ leftTab: 'check' })}>Check<span class="count" style={{ color: counts.error ? 'var(--bad)' : counts.warn ? 'var(--warn)' : undefined }}>{counts.error + counts.warn}</span></button>
      </div>
      <div class="scroll" role="tabpanel">
        {tab === 'layers' ? <Layers /> : tab === 'aps' ? <ApList /> : <PlanCheck issues={issues} />}
      </div>
    </aside>
  );
}

function SetupCard() {
  const f = store.project.floors[store.ui.floorIndex];
  if (!f) return null;
  const items = [
    { k: 'plan', label: 'Floor plan', done: !!f.imageId, act: () => importPlanInteractive({ newFloor: false }), opt: true },
    { k: 'scale', label: 'Set the scale', done: !!f.scale, act: () => selectTool('scale') },
    { k: 'walls', label: 'Trace walls', done: f.walls.length > 0, act: () => selectTool('wall') },
    { k: 'rooms', label: 'Mark rooms that need Wi-Fi', done: f.zones.some((z) => z.kind === 'room'), act: () => (f.walls.length ? A.detectRoomsOnFloor() : selectTool('rect')), opt: true },
    { k: 'aps', label: 'Place access points', done: f.aps.length > 0, act: () => (f.scale ? openDialog('autoplace') : selectTool('scale')) },
    { k: 'ch', label: 'Plan channels', done: f.aps.length > 1 && store.ui.channelsPlanned, act: () => openDialog('channels'), opt: true },
  ];
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length || store.ui.setupHidden) return null;
  const next = items.find((i) => !i.done);
  return (
    <div class="setup">
      <div class="h"><span class="caps">Setup · {f.name}</span><button class="btn quiet small" onClick={() => setUi({ setupHidden: true })} aria-label="Hide setup checklist">Hide</button></div>
      {items.map((i) => (
        <button class={`item${i.done ? ' done' : ''}${i === next ? ' next' : ''}`} onClick={i.act}>
          <span class="tick">{i.done ? <Icon name="check" size={12} stroke={2.5} /> : null}</span>
          <span class="lbl">{i.label}</span>
          <span class="dimmer" style={{ fontSize: '11px' }}>{i.opt && !i.done ? 'optional' : ''}</span>
        </button>
      ))}
      <div style={{ height: '6px' }} />
    </div>
  );
}

function Layer({ k, label, n, disabled }) {
  const on = store.ui.layers[k];
  return (
    <label class={`layer${on ? '' : ' off'}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => setLayers({ [k]: e.currentTarget.checked })} />
      <span>{label}</span>
      {n != null ? <span class="n">{n}</span> : null}
    </label>
  );
}

function Layers() {
  useStore((s) => [s.ui.layers, s.ui.heatmapOpacity, s.ui.quality, s.ui.planStyle]);
  const f = store.project.floors[store.ui.floorIndex];
  if (!f) return <div class="sect hint">Add a floor to see its layers.</div>;
  const rooms = f.zones.filter((z) => z.kind === 'room').length;
  return (
    <>
      <SetupCard />
      <div class="sect" style={{ paddingLeft: '6px', paddingRight: '6px' }}>
        <Layer k="plan" label="Floor plan" n={f.imageId ? 'image' : 'blank'} />
        <Layer k="walls" label="Walls" n={f.walls.length} />
        <Layer k="rooms" label="Rooms and areas" n={f.zones.length} />
        <Layer k="aps" label="Access points" n={f.aps.length} />
        <Layer k="heatmap" label="Heatmap" n={BAND_LABEL[store.ui.band]} />
        <Layer k="contour" label="Target contour" />
        <Layer k="clients" label="Clients" n={f.clients.length} />
        <Layer k="interference" label="Co-channel lines" />
        <Layer k="closets" label="Network closets" n={f.closets.length} />
        <Layer k="cables" label="Cable runs" />
        <Layer k="grid" label="Grid" />
      </div>
      <div class="sect">
        <label class="field">
          <span><span>Heatmap opacity</span><span class="mono">{Math.round(store.ui.heatmapOpacity * 100)}%</span></span>
          <input type="range" min="20" max="100" value={Math.round(store.ui.heatmapOpacity * 100)} onInput={(e) => setUi({ heatmapOpacity: Number(e.currentTarget.value) / 100 })} aria-label="Heatmap opacity" />
        </label>
        <label class="check" style={{ marginTop: '6px' }}>
          <input type="checkbox" checked={store.ui.layers.clip} disabled={!rooms} onChange={(e) => setLayers({ clip: e.currentTarget.checked })} />
          <span>Show heatmap inside rooms only{!rooms ? <span class="hint" style={{ display: 'block' }}>Mark rooms to use this.</span> : null}</span>
        </label>
        <label class="field" style={{ marginTop: '8px' }}>
          <span>Heatmap detail</span>
          <select class="input" value={store.ui.quality} onChange={(e) => setUi({ quality: e.currentTarget.value })}>
            <option value="low">Draft (fastest)</option>
            <option value="medium">Standard</option>
            <option value="high">Fine (slower)</option>
          </select>
        </label>
      </div>
      <div class="sect">
        <div class="sect-h"><h2 class="caps" style={{ margin: 0 }}>Plan tools</h2></div>
        <div style={{ display: 'grid', gap: '6px' }}>
          <button class="btn block" disabled={!f.scale} onClick={() => openDialog('autoplace')}><Icon name="auto" size={16} />Auto-place access points</button>
          <button class="btn block" disabled={!f.aps.length} onClick={() => openDialog('channels')}><Icon name="channels" size={16} />Auto-plan channels</button>
          <button class="btn block" disabled={!f.walls.length} onClick={() => A.detectRoomsOnFloor()}><Icon name="rooms" size={16} />Detect rooms from walls</button>
          <button class="btn block" disabled={!f.scale || !f.aps.length} onClick={() => openDialog('clients')}><Icon name="clients" size={16} />Simulate clients</button>
        </div>
      </div>
    </>
  );
}

function ApList() {
  const [q, setQ] = useState('');
  useStore((s) => [s.version, s.ui.selection, s.ui.band]);
  const f = store.project.floors[store.ui.floorIndex];
  if (!f) return null;
  const devs = A.devices();
  const sel = store.ui.selection;
  const list = f.aps.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || (devs.get(a.deviceId)?.model || '').toLowerCase().includes(q.toLowerCase()));
  const assoc = f.clients.length ? A.clientAssociations() : null;
  return (
    <>
      <div class="sect">
        <input class="input" placeholder="Filter by name or model" value={q} onInput={(e) => setQ(e.currentTarget.value)} aria-label="Filter access points" />
        <div class="row between" style={{ marginTop: '8px' }}>
          <span class="hint">Bands: 2.4 · 5 · 6 GHz. Click a square to toggle a radio.</span>
        </div>
      </div>
      {!f.aps.length ? (
        <div class="sect hint">No access points on this floor yet. Use the Access point tool (A) or Auto-place.</div>
      ) : null}
      <div role="listbox" aria-label="Access points" aria-multiselectable="true">
        {list.map((a) => {
          const dev = devs.get(a.deviceId);
          const r = a.radios[store.ui.band];
          const selected = sel?.kind === 'ap' && sel.ids.includes(a.id);
          const nClients = assoc ? assoc.clients.filter((c) => c.assoc?.apId === a.id).length : null;
          return (
            <div class={`aplist-item${a.enabled === false ? ' off' : ''}`} role="option" aria-selected={String(selected)} tabIndex={0}
              onClick={(e) => {
                const ids = e.shiftKey && sel?.kind === 'ap' ? (selected ? sel.ids.filter((i) => i !== a.id) : [...sel.ids, a.id]) : [a.id];
                setUi({ selection: ids.length ? { kind: 'ap', ids } : null });
                if (!e.shiftKey) getViewport()?.centerOn(a.x, a.y);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUi({ selection: { kind: 'ap', ids: [a.id] } }); getViewport()?.centerOn(a.x, a.y); } }}>
              <span class="name" title={`${a.name} · ${dev?.vendor || ''} ${dev?.model || 'Unknown device'}`}>{a.name}<span class="dimmer" style={{ fontFamily: 'var(--sans)', fontSize: '11.5px', marginLeft: '8px' }}>{dev?.model || 'Unknown'}</span></span>
              <span class="mono dim" style={{ fontSize: '11px', minWidth: '58px', textAlign: 'right' }}>{r?.on && dev?.radios[store.ui.band] ? `ch ${r.ch}${r.width > 20 ? '/' + r.width : ''}` : 'off'}{nClients != null ? ` · ${nClients}` : ''}</span>
              <span class="bands">
                {BANDS.map((b) => {
                  const supported = !!dev?.radios[b];
                  const on = supported && a.radios[b]?.on;
                  return (
                    <i
                      class={supported ? (on ? 'on' : '') : 'na'}
                      title={supported ? `${BAND_LABEL[b]} ${on ? 'on' : 'off'}` : `No ${BAND_LABEL[b]} radio`}
                      role="checkbox"
                      aria-checked={String(on)}
                      aria-label={`${a.name} ${BAND_LABEL[b]}`}
                      tabIndex={supported ? 0 : -1}
                      onClick={(e) => { e.stopPropagation(); if (supported) A.updateRadio([a.id], b, { on: !on }); }}
                      onKeyDown={(e) => { if (supported && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); A.updateRadio([a.id], b, { on: !on }); } }}
                      style={{ cursor: supported ? 'pointer' : 'default' }}
                    />
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Static checks plus RF results from the latest summary. */
export function planIssues() {
  const p = store.project;
  const devs = A.devices();
  const out = staticIssues(p, devs);
  const summary = store.rf.summary;
  const t = p.settings.target;
  if (summary) {
    p.floors.forEach((f) => {
      const s = summary.find((x) => x.floorId === f.id);
      if (!s) return;
      const b5 = s.bands['5'] || s.bands['6'] || s.bands['2.4'];
      const band = s.bands['5'] ? '5' : s.bands['6'] ? '6' : '2.4';
      if (!b5) return;
      const st = b5.stats;
      if (st.primaryPct < t.coverageGoal) out.unshift({ level: 'warn', code: 'coverage', text: `${f.name}: ${st.primaryPct.toFixed(1)}% of the area meets ${t.primary} dBm on ${BAND_LABEL[band]} (goal ${t.coverageGoal}%).`, floorId: f.id, target: { kind: 'band', band } });
      if (t.secondaryEnabled && st.secondaryPct < t.coverageGoal) out.unshift({ level: 'warn', code: 'secondary', text: `${f.name}: secondary coverage at ${t.secondary} dBm is ${st.secondaryPct.toFixed(1)}% (goal ${t.coverageGoal}%).`, floorId: f.id, target: { kind: 'view', view: 'secondary', band } });
      for (const r of st.rooms) {
        if (r.cells && r.primaryPct < 90) out.push({ level: 'warn', code: 'room', text: `${f.name} · ${r.name}: ${r.primaryPct.toFixed(0)}% meets ${t.primary} dBm on ${BAND_LABEL[band]}.`, floorId: f.id, target: { kind: 'zone', id: r.id } });
      }
    });
  }
  p.floors.forEach((f, fi) => {
    if (!f.scale || f.aps.length < 2) return;
    for (const band of BANDS) {
      const pairs = A.coChannelPairs(fi, band);
      if (!pairs.length) continue;
      const names = pairs.slice(0, 3).map((x) => `${x.an}/${x.bn}`).join(', ');
      out.push({ level: band === '2.4' ? 'info' : 'warn', code: 'cochannel', text: `${f.name} ${BAND_LABEL[band]}: ${pairs.length} pair${pairs.length === 1 ? '' : 's'} of radios share spectrum and hear each other above ${p.settings.ccaDbm} dBm (${names}${pairs.length > 3 ? ', …' : ''}).${band === '2.4' ? ' Common with only three channels; consider turning some 2.4 GHz radios off.' : ''}`, floorId: f.id, target: { kind: 'view', view: 'overlap', band } });
    }
  });
  for (const c of capacitySummary(p)) {
    if (c.short) out.push({ level: 'warn', code: 'capacity', text: `${c.floorName}: ${c.devices} devices expected but the radios carry about ${c.capacity} at ${p.settings.capacity.devicesPerRadio} per radio (estimate).`, floorId: c.floorId });
  }
  const order = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

function PlanCheck({ issues }) {
  if (!store.project.floors.length) return <div class="sect hint">Nothing to check yet.</div>;
  const go = (i) => {
    const fi = store.project.floors.findIndex((f) => f.id === i.floorId);
    if (fi >= 0) setUi({ floorIndex: fi });
    const t = i.target;
    if (!t) return;
    if (t.kind === 'ap' || t.kind === 'zone') {
      setUi({ selection: { kind: t.kind, ids: [t.id] }, rightOpen: true });
      const f = store.project.floors[store.ui.floorIndex];
      const o = t.kind === 'ap' ? f.aps.find((a) => a.id === t.id) : f.zones.find((z) => z.id === t.id);
      if (o) requestAnimationFrame(() => getViewport()?.centerOn(o.x ?? o.points[0].x, o.y ?? o.points[0].y));
    } else if (t.kind === 'band') setUi({ band: t.band, view: 'signal' });
    else if (t.kind === 'view') { setUi({ band: t.band, view: t.view }); if (i.code === 'cochannel') setLayers({ interference: true }); }
    else if (t.kind === 'floor') selectTool('scale');
  };
  return (
    <>
      <div class="sect">
        <div class="hint">Checks rerun as you edit. Coverage figures come from the predictive model and are estimates.</div>
      </div>
      {!issues.length ? <div class="sect">No issues found.</div> : null}
      {issues.map((i) => (
        <div class={`issue ${i.level}${i.target || i.floorId ? ' go' : ''}`} onClick={() => go(i)} role={i.target ? 'button' : undefined} tabIndex={i.target ? 0 : -1}
          onKeyDown={(e) => { if (e.key === 'Enter') go(i); }}>
          <span class="dot" aria-label={i.level} />
          <span>{i.text}</span>
        </div>
      ))}
    </>
  );
}
