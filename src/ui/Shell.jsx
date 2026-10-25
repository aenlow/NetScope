import { useEffect, useState } from 'preact/hooks';
import { store, useStore, setUi, undo, redo, openDialog, dismissToast } from '../state/store.js';
import * as A from '../state/actions.js';
import { Icon, Logo } from './icons.jsx';
import { TOOLS, selectTool, MOD } from './commands.js';
import { cursorBus } from '../canvas/viewport.js';
import { signed, fmtLen } from '../core/units.js';
import { saveProjectFile } from './io.js';

export function TopBar() {
  useStore((s) => [s.version, s.ui.floorIndex, s.ui.autosaved, s.ui.lastSavedVersion, s.history.undo.length, s.history.redo.length, s.ui.leftOpen, s.ui.rightOpen]);
  const p = store.project;
  const [name, setName] = useState(p.name);
  useEffect(() => setName(p.name), [p.name]);
  const dirty = store.version !== store.ui.lastSavedVersion;
  return (
    <header class="topbar">
      <button class="btn icon quiet panel-toggle" aria-label="Toggle layers panel" aria-expanded={String(store.ui.leftOpen)} onClick={() => setUi({ leftOpen: !store.ui.leftOpen, rightOpen: window.innerWidth <= 1080 ? false : store.ui.rightOpen })}><Icon name="layers" /></button>
      <div class="brand"><Logo /><span>NetScope</span></div>
      <div class="vsep hide-phone" />
      <input
        class="projname hide-phone"
        aria-label="Project name"
        value={name}
        maxLength={120}
        onInput={(e) => setName(e.currentTarget.value)}
        onBlur={() => name !== p.name && A.setProjectName(name)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {p.floors.length ? (
        <nav class="floors" aria-label="Floors">
          {p.floors.map((f, i) => (
            <button class="floortab" aria-current={String(i === store.ui.floorIndex)} title={f.name} onClick={() => setUi({ floorIndex: i, selection: null })}
              onDblClick={() => openDialog('floor')}>{f.name}</button>
          ))}
          <button class="btn icon quiet small" aria-label="Add floor" title="Add floor" onClick={() => openDialog('addfloor')}><Icon name="plus" size={16} /></button>
        </nav>
      ) : null}
      <div class="spacer" />
      <div class="hide-phone" style={{ display: 'flex', gap: '2px' }}>
        <button class="btn icon quiet" aria-label={`Undo (${MOD} Z)`} title={`Undo (${MOD} Z)`} disabled={!store.history.undo.length} onClick={undo}><Icon name="undo" /></button>
        <button class="btn icon quiet" aria-label="Redo" title="Redo" disabled={!store.history.redo.length} onClick={redo}><Icon name="redo" /></button>
      </div>
      <button class="cmdk hide-phone" onClick={() => setUi({ palette: true })} aria-label="Open command palette">
        <span class="label">Search tools, devices, commands</span><kbd>{MOD}K</kbd>
      </button>
      <button class="btn icon quiet mobile-only" style={{ display: 'none' }} aria-label="Commands" onClick={() => setUi({ palette: true })}><Icon name="search" /></button>
      <span class="savestate hide-tablet" title="Projects autosave in this browser. Download a project file to keep a portable copy.">
        {!p.floors.length ? '' : dirty ? (store.ui.autosaved ? 'Saved in browser' : 'Saving…') : 'Saved'}
      </span>
      <button class="btn quiet hide-phone" onClick={() => openDialog('settings')} aria-label="Project settings" title={`Project settings (${MOD} ,)`}><Icon name="settings" /></button>
      {p.floors.length ? (
        <>
          <button class="btn hide-phone" onClick={saveProjectFile} title={`Download project file (${MOD} S)`}><Icon name="save" size={16} />Save</button>
          <button class="btn primary" onClick={() => openDialog('export')} title={`Export (${MOD} E)`}>Export</button>
        </>
      ) : null}
      <button class="btn icon quiet panel-toggle" aria-label="Toggle inspector" aria-expanded={String(store.ui.rightOpen)} onClick={() => setUi({ rightOpen: !store.ui.rightOpen, leftOpen: window.innerWidth <= 1080 ? false : store.ui.leftOpen })}><Icon name="panelRight" /></button>
    </header>
  );
}

export function Rail() {
  const tool = useStore((s) => s.ui.tool);
  const hasFloor = useStore((s) => s.project.floors.length > 0);
  const [tip, setTip] = useState(null);
  const groups = [['select', 'pan'], ['scale', 'wall', 'rect', 'area', 'door'], ['ap', 'closet', 'client'], ['measure', 'probe']];
  const desktopOnly = new Set(['pan', 'door', 'area', 'closet', 'client', 'probe']);
  return (
    <nav class="rail" aria-label="Tools">
      {groups.map((g, gi) => [
        gi ? <div class="sep" /> : null,
        ...g.map((id) => {
          const t = TOOLS.find((x) => x.id === id);
          return (
            <button
              class={`tool${desktopOnly.has(id) ? ' desktop-tool' : ''}`}
              aria-pressed={String(tool === id)}
              aria-label={`${t.label} (${t.key})`}
              disabled={!hasFloor}
              onClick={() => selectTool(id)}
              onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ t, x: r.right + 8, y: r.top }); }}
              onMouseLeave={() => setTip(null)}
              onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ t, x: r.right + 8, y: r.top }); }}
              onBlur={() => setTip(null)}
            >
              <Icon name={t.icon} />
              <span class="k">{t.key}</span>
            </button>
          );
        }),
      ])}
      {tip ? (
        <div class="tip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }} role="tooltip">
          <div class="row between" style={{ minHeight: 0 }}><span class="t">{tip.t.label}</span><kbd>{tip.t.key}</kbd></div>
          <div class="dim" style={{ marginTop: '4px' }}>{tip.t.hint}</div>
        </div>
      ) : null}
    </nav>
  );
}

export function StatusBar() {
  const [cur, setCur] = useState(cursorBus.last);
  useEffect(() => cursorBus.sub((p) => setCur({ ...p })), []);
  useStore((s) => [s.version, s.ui.band, s.ui.floorIndex, s.rf.pending, s.rf.progress, s.ui.selection]);
  const f = store.project.floors[store.ui.floorIndex];
  const units = store.project.settings.units;
  let reading = null;
  if (cur?.x != null && f?.scale && f.aps.length) reading = A.probeAt(cur.x, cur.y);
  const top = reading?.readings?.[0];
  const sel = store.ui.selection;
  const anchor = sel?.kind === 'ap' && sel.ids.length === 1 ? f?.aps.find((a) => a.id === sel.ids[0]) : top ? f?.aps.find((a) => a.id === top.e.id) : null;
  const dist = anchor && cur?.x != null && f?.scale ? Math.hypot(cur.x - anchor.x, cur.y - anchor.y) * f.scale : null;
  return (
    <footer class="statusbar" aria-live="off">
      {f ? (
        <>
          <span>{cur?.x != null && f.scale ? <>X <b>{fmtLen(cur.x * f.scale, units)}</b> Y <b>{fmtLen(cur.y * f.scale, units)}</b></> : cur?.x != null ? <>X {cur.x.toFixed(0)} Y {cur.y.toFixed(0)} px</> : '—'}</span>
          <span>RSSI <b>{top ? `${signed(top.rssi, 0)} dBm` : '—'}</b>{top ? <> via {top.e.name}</> : null}</span>
          <span class="hide-phone">SNR <b>{top ? `${reading.snr.toFixed(0)} dB` : '—'}</b></span>
          <span class="hide-phone">{dist != null ? <>Dist <b>{fmtLen(dist, units)}</b> to {anchor.name}</> : 'Dist —'}</span>
          <span style={{ flex: 1 }} />
          {store.rf.pending ? <span>{store.rf.progress != null ? `Computing ${Math.round(store.rf.progress * 100)}%` : 'Computing'}</span> : null}
          <span class="hide-phone">{f.scale ? `Scale 1 px = ${fmtLen(f.scale, units, f.scale * (units === 'ft' ? 3.28 : 1) < 0.1 ? 3 : 2)}` : 'Scale not set'}</span>
          <span class="hide-phone">Zoom {cur?.zoom ? `${Math.round(cur.zoom * 100)}%` : '—'}</span>
        </>
      ) : <span>No floor yet</span>}
    </footer>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.ui.toasts);
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div class={`toast ${t.level}`} key={t.id}>
          <span class="dot" />
          <span>{t.text}</span>
          <button aria-label="Dismiss" onClick={() => dismissToast(t.id)}><Icon name="close" size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export { redo };
