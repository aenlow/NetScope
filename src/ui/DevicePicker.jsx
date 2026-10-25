import { useMemo, useState, useRef, useEffect } from 'preact/hooks';
import { store, closeDialog, setUi, openDialog, commit, toast } from '../state/store.js';
import * as A from '../state/actions.js';
import { DEVICES, VENDORS, KIND_LABEL, bandsOf, specLevel, SPEC_LABEL } from '../data/devices.js';
import { Dialog } from './Dialog.jsx';
import { Icon } from './icons.jsx';
import { BAND_LABEL } from '../core/bands.js';
import { selectTool } from './commands.js';
import { getViewport } from './viewportRef.js';

const GEN_LABEL = (d) => (d.gen === 6 && d.radios['6'] ? 'Wi-Fi 6E' : `Wi-Fi ${d.gen}`);

export function DevicePicker({ mode = 'browse', onPick }) {
  const all = useMemo(() => [...DEVICES, ...store.project.customDevices], []);
  const [q, setQ] = useState('');
  const [vendor, setVendor] = useState('all');
  const [bands, setBands] = useState([]);
  const [gens, setGens] = useState([]);
  const [kind, setKind] = useState('all');
  const [sel, setSel] = useState(() => {
    const ap = store.ui.selection?.kind === 'ap' ? store.project.floors[store.ui.floorIndex]?.aps.find((a) => a.id === store.ui.selection.ids[0]) : null;
    return ap?.deviceId || store.ui.deviceId || null;
  });
  const [showSpec, setShowSpec] = useState(false);
  const listRef = useRef(null);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = all.filter((d) => {
    if (vendor !== 'all' && d.vendor !== vendor) return false;
    if (kind !== 'all' && d.kind !== kind) return false;
    if (bands.length && !bands.every((b) => d.radios[b])) return false;
    if (gens.length && !gens.includes(GEN_LABEL(d))) return false;
    const hay = `${d.vendor} ${d.family} ${d.model} ${GEN_LABEL(d)} ${KIND_LABEL[d.kind]}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const grouped = new Map();
  for (const d of list) {
    if (!grouped.has(d.vendor)) grouped.set(d.vendor, []);
    grouped.get(d.vendor).push(d);
  }
  const flat = list;
  const dev = all.find((d) => d.id === sel) || null;
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const choose = (d = dev) => {
    if (!d) return;
    if (onPick) { onPick(d); return; }
    if (mode === 'change' && store.ui.selection?.kind === 'ap') {
      A.changeDevice(store.ui.selection.ids, d.id);
      closeDialog();
      toast(`Changed to ${d.vendor} ${d.model}.`, 'ok', 2500);
      return;
    }
    setUi({ deviceId: d.id });
    closeDialog();
    if (store.ui.tool !== 'ap') selectTool('ap');
    getViewport()?.resetTool();
  };

  const onKey = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return;
    e.preventDefault();
    const i = flat.findIndex((d) => d.id === sel);
    if (e.key === 'Enter') { choose(); return; }
    const n = flat[Math.max(0, Math.min(flat.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (n) {
      setSel(n.id);
      requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${CSS.escape(n.id)}"]`)?.scrollIntoView({ block: 'nearest' }));
    }
  };

  useEffect(() => {
    if (sel) requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${CSS.escape(sel)}"]`)?.scrollIntoView({ block: 'center' }));
  }, []);

  const action = onPick ? 'Use this model' : mode === 'change' ? 'Use for selected' : mode === 'browse' ? 'Place this model' : 'Place this model';
  return (
    <Dialog title="Device library" size="wide" initialFocus="#dev-search"
      footer={<>
        <span class="left dimmer" style={{ fontSize: '12px' }}>{list.length} of {all.length} models · * typical values, not from a datasheet</span>
        <button class="btn" onClick={() => openDialog('customdevice', { returnTo: { mode, onPick } })}><Icon name="plus" size={14} />Custom device</button>
        <button class="btn" onClick={closeDialog}>Cancel</button>
        <button class="btn primary" disabled={!dev} onClick={() => choose()}>{action}</button>
      </>}>
      <div class={`picker${showSpec ? ' show-spec' : ''}`} style={{ minHeight: '0', height: 'min(620px, calc(100vh - 180px))' }}>
        <div class="list">
          <div class="filters">
            <input id="dev-search" class="input" placeholder="Search model, vendor or family" value={q} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={onKey} aria-label="Search devices" aria-controls="dev-list" />
            <div class="grid2">
              <select class="input" value={vendor} onChange={(e) => setVendor(e.currentTarget.value)} aria-label="Vendor">
                <option value="all">All vendors</option>
                {VENDORS.map((v) => <option value={v}>{v}</option>)}
                {store.project.customDevices.length ? <option value="Custom">Custom</option> : null}
              </select>
              <select class="input" value={kind} onChange={(e) => setKind(e.currentTarget.value)} aria-label="Device type">
                <option value="all">All types</option>
                {Object.entries(KIND_LABEL).map(([k, v]) => <option value={k}>{v}</option>)}
              </select>
            </div>
            <div class="chips" role="group" aria-label="Filters">
              {['2.4', '5', '6'].map((b) => <button class="chip" aria-pressed={String(bands.includes(b))} onClick={() => toggle(bands, setBands, b)}>{b} GHz</button>)}
              <span style={{ width: '6px' }} />
              {['Wi-Fi 7', 'Wi-Fi 6E', 'Wi-Fi 6', 'Wi-Fi 5'].map((g) => <button class="chip" aria-pressed={String(gens.includes(g))} onClick={() => toggle(gens, setGens, g)}>{g}</button>)}
            </div>
          </div>
          <div class="scroll" id="dev-list" ref={listRef} role="listbox" aria-label="Devices">
            {!list.length ? <div class="sect hint">No models match. Clear a filter, or add a custom device.</div> : null}
            {[...grouped.entries()].map(([v, ds]) => (
              <>
                <div class="vendor-h">{v}</div>
                {ds.map((d) => (
                  <div class="dev" role="option" aria-selected={String(d.id === sel)} data-id={d.id} tabIndex={-1}
                    onClick={() => { setSel(d.id); setShowSpec(true); }} onDblClick={() => choose(d)}>
                    <span class="m">{d.model}</span>
                    <span class="s">{GEN_LABEL(d)}</span>
                    <span class="v">{d.family ? `${d.family} · ` : ''}{KIND_LABEL[d.kind]}</span>
                    <span class="s">{bandsOf(d).join(' · ')}{specLevel(d) === 'datasheet' ? '' : specLevel(d) === 'partial' ? ' ·' : ' *'}</span>
                  </div>
                ))}
              </>
            ))}
          </div>
        </div>
        <div class="specs">
          <button class="btn small quiet mobile-only picker-back" style={{ display: 'none', marginBottom: '10px' }} onClick={() => setShowSpec(false)}>Back to list</button>
          {dev ? <SpecSheet d={dev} /> : <div class="hint">Select a model to see its spec sheet.</div>}
        </div>
      </div>
    </Dialog>
  );
}

export function SpecSheet({ d }) {
  const bands = bandsOf(d);
  return (
    <div>
      <div class="dimmer" style={{ fontSize: '12px' }}>{d.vendor}{d.family ? ` · ${d.family}` : ''}</div>
      <h3>{d.model}</h3>
      <div class="row" style={{ gap: '6px', flexWrap: 'wrap', margin: '6px 0 14px' }}>
        <span class="badge">{GEN_LABEL(d)}</span>
        <span class="badge">{KIND_LABEL[d.kind]}</span>
        {d.status === 'datasheet' ? <a class={`badge ${specLevel(d) === 'datasheet' ? 'ok' : 'warn'}`} href={d.source} target="_blank" rel="noopener noreferrer">{SPEC_LABEL[specLevel(d)]}, checked {d.checked}</a>
          : d.status === 'user' ? <span class="badge">Custom device</span>
            : <span class="badge warn">Typical / unverified</span>}
      </div>
      <table class="t">
        <thead><tr><th>Band</th><th class="num">Streams</th><th class="num">Max TX</th><th class="num">Gain</th><th class="num">Max width</th></tr></thead>
        <tbody>
          {bands.map((b) => {
            const r = d.radios[b];
            const v = (f) => d.status === 'user' || (d.status === 'datasheet' && (d.verifiedFields || []).includes(f));
            return (
              <tr>
                <td class="mono">{BAND_LABEL[b]}</td>
                <td class="num">{r.nss}×{r.nss}{v('streams') ? '' : '*'}</td>
                <td class="num">{r.txMax} dBm{v('txMax') ? '' : '*'}</td>
                <td class="num">{r.gain} dBi{v('gain') ? '' : '*'}</td>
                <td class="num">{r.maxWidth} MHz{v('width') ? '' : '*'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div class="kv" style={{ marginTop: '10px' }}><span>Antenna</span><span>{d.antenna?.pattern === 'directional' ? `Directional, ${d.antenna.beamwidth}°` : 'Omnidirectional'}</span></div>
      <div class="kv"><span>Typical mounting</span><span>{d.mount}</span></div>
      <div class="kv"><span>Max power draw</span><span>{d.poeW != null ? `${d.poeW} W${d.status === 'user' || (d.status === 'datasheet' && (d.verifiedFields || []).includes('poe')) ? '' : '*'}` : '—'}</span></div>
      <p class="hint" style={{ marginTop: '12px' }}>
        {d.status === 'datasheet'
          ? <>Confirmed from the datasheet: {(d.verifiedFields || []).join(', ') || 'see source'}. Values marked * are typical for this class.</>
          : <>* Typical values for a {GEN_LABEL(d)} {KIND_LABEL[d.kind].toLowerCase()}, used until checked against the vendor datasheet. Band list and stream counts reflect the product line but are not verified.</>}
        {d.notes ? <> {d.notes}</> : null}
      </p>
    </div>
  );
}

export function CustomDeviceDialog({ returnTo }) {
  const [d, setD] = useState({ vendor: 'Custom', model: '', kind: 'ap', gen: 6, radios: { '2.4': { on: true, nss: 2, txMax: 22, gain: 4, maxWidth: 40 }, '5': { on: true, nss: 2, txMax: 23, gain: 5, maxWidth: 160 }, '6': { on: false, nss: 2, txMax: 22, gain: 5, maxWidth: 160 } }, pattern: 'omni', beamwidth: 60, poeW: '' });
  const set = (patch) => setD({ ...d, ...patch });
  const setR = (b, patch) => setD({ ...d, radios: { ...d.radios, [b]: { ...d.radios[b], ...patch } } });
  const save = () => {
    if (!d.model.trim()) { toast('Give the device a model name.', 'warn'); return; }
    if (!Object.values(d.radios).some((r) => r.on)) { toast('Enable at least one radio.', 'warn'); return; }
    const id = `custom-${Date.now().toString(36)}`;
    const radios = {};
    for (const [b, r] of Object.entries(d.radios)) if (r.on) radios[b] = { nss: Number(r.nss), txMax: Number(r.txMax), gain: Number(r.gain), maxWidth: Number(r.maxWidth) };
    const dev = { id, vendor: d.vendor.trim() || 'Custom', family: '', model: d.model.trim(), kind: d.kind, gen: Number(d.gen), mount: d.kind === 'wallplate' ? 'wall' : d.kind === 'router' || d.kind === 'mesh' ? 'desk' : d.kind === 'outdoor' ? 'outdoor' : 'ceiling', radios, antenna: { pattern: d.pattern, beamwidth: Number(d.beamwidth), frontToBack: 20 }, poeW: d.poeW === '' ? null : Number(d.poeW), status: 'user', source: '', notes: 'Entered by the user.' };
    commit((p) => { p.customDevices.push(dev); });
    toast(`Added ${dev.vendor} ${dev.model}.`, 'ok');
    if (returnTo?.onPick) { returnTo.onPick(dev); return; }
    setUi({ deviceId: id });
    openDialog('devices', { mode: returnTo?.mode || 'place' });
  };
  const num = (v, f) => <input class="input mono" value={v} inputMode="decimal" onInput={(e) => f(e.currentTarget.value)} style={{ height: '28px' }} />;
  return (
    <Dialog title="Custom device" size="mid" footer={<><button class="btn" onClick={() => openDialog('devices', returnTo || {})}>Back</button><button class="btn primary" onClick={save}>Add device</button></>}>
      <div class="content">
        <p class="hint" style={{ marginTop: 0 }}>Use values from the device's datasheet. Max TX is conducted power per radio; gain is the antenna gain in that band.</p>
        <div class="grid2">
          <label class="field"><span>Vendor</span><input class="input" value={d.vendor} onInput={(e) => set({ vendor: e.currentTarget.value })} /></label>
          <label class="field"><span>Model</span><input class="input" value={d.model} onInput={(e) => set({ model: e.currentTarget.value })} /></label>
          <label class="field"><span>Type</span><select class="input" value={d.kind} onChange={(e) => set({ kind: e.currentTarget.value })}>{Object.entries(KIND_LABEL).map(([k, v]) => <option value={k}>{v}</option>)}</select></label>
          <label class="field"><span>Generation</span><select class="input" value={String(d.gen)} onChange={(e) => set({ gen: Number(e.currentTarget.value) })}><option value="7">Wi-Fi 7</option><option value="6">Wi-Fi 6 / 6E</option><option value="5">Wi-Fi 5</option><option value="4">Wi-Fi 4</option></select></label>
        </div>
        <table class="t" style={{ marginTop: '14px' }}>
          <thead><tr><th>Radio</th><th>Streams</th><th>Max TX dBm</th><th>Gain dBi</th><th>Max width</th></tr></thead>
          <tbody>
            {['2.4', '5', '6'].map((b) => (
              <tr>
                <td><label class="check"><input type="checkbox" checked={d.radios[b].on} onChange={(e) => setR(b, { on: e.currentTarget.checked })} />{BAND_LABEL[b]}</label></td>
                <td>{num(d.radios[b].nss, (v) => setR(b, { nss: v }))}</td>
                <td>{num(d.radios[b].txMax, (v) => setR(b, { txMax: v }))}</td>
                <td>{num(d.radios[b].gain, (v) => setR(b, { gain: v }))}</td>
                <td><select class="input mono" style={{ height: '28px' }} value={String(d.radios[b].maxWidth)} onChange={(e) => setR(b, { maxWidth: Number(e.currentTarget.value) })}>{(b === '2.4' ? [20, 40] : b === '5' ? [20, 40, 80, 160] : [20, 40, 80, 160, 320]).map((w) => <option value={String(w)}>{w}</option>)}</select></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div class="grid3" style={{ marginTop: '14px' }}>
          <label class="field"><span>Antenna</span><select class="input" value={d.pattern} onChange={(e) => set({ pattern: e.currentTarget.value })}><option value="omni">Omnidirectional</option><option value="directional">Directional</option></select></label>
          <label class="field"><span>Beamwidth °</span><input class="input mono" disabled={d.pattern !== 'directional'} value={d.beamwidth} onInput={(e) => set({ beamwidth: e.currentTarget.value })} /></label>
          <label class="field"><span>Max power draw W</span><input class="input mono" value={d.poeW} placeholder="unknown" onInput={(e) => set({ poeW: e.currentTarget.value })} /></label>
        </div>
      </div>
    </Dialog>
  );
}
