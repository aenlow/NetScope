import { store, useStore, setUi, openDialog, commit } from '../state/store.js';
import * as A from '../state/actions.js';
import { Icon } from './icons.jsx';
import { NumField, TextField, SelectField, Check, Section, Meter } from './controls.jsx';
import { BANDS, BAND_LABEL, primaryChannels, WIDTHS, channelLabel, eirpLimit, blockOf } from '../core/bands.js';
import { lenIn, lenOut, lenLabel, fmtLen, fmtArea, signed } from '../core/units.js';
import { polygonArea } from '../core/geometry.js';
import { KIND_LABEL, specLevel, SPEC_LABEL } from '../data/devices.js';
import { cableRuns, closetLoads } from '../core/analysis.js';
import { POWER_PRESETS } from '../core/schema.js';
import { MOD } from './commands.js';
import { selectTool } from './commands.js';
import { importPlanInteractive } from './io.js';

export function Inspector() {
  useStore((s) => [s.version, s.ui.selection, s.ui.floorIndex, s.rf.summary, s.rf.result, s.ui.band]);
  const f = store.project.floors[store.ui.floorIndex];
  const sel = store.ui.selection;
  let body;
  if (!f) body = <div class="sect hint">Import a floor plan or start a blank floor to begin.</div>;
  else if (sel?.kind === 'ap') body = <ApInspector f={f} ids={sel.ids} />;
  else if (sel?.kind === 'wall') body = <WallInspector f={f} ids={sel.ids} />;
  else if (sel?.kind === 'zone') body = <ZoneInspector f={f} ids={sel.ids} />;
  else if (sel?.kind === 'closet') body = <ClosetInspector f={f} ids={sel.ids} />;
  else if (sel?.kind === 'client') body = <ClientInspector f={f} ids={sel.ids} />;
  else body = <FloorInspector f={f} />;
  return (
    <aside class="panel right" aria-label="Inspector">
      <div class="scroll">{body}</div>
    </aside>
  );
}

function Header({ kind, title, sub, children }) {
  return (
    <div class="sect">
      <div class="caps" style={{ marginBottom: '6px' }}>{kind}</div>
      <div class="row between" style={{ alignItems: 'baseline', minHeight: 0 }}>
        <span class="mono" style={{ fontSize: '17px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {sub ? <span class="dimmer" style={{ fontSize: '12px' }}>{sub}</span> : null}
      </div>
      {children}
    </div>
  );
}

function SpecBadge({ dev }) {
  const lvl = specLevel(dev);
  if (lvl === 'datasheet' || lvl === 'partial') {
    return <a class={`badge ${lvl === 'datasheet' ? 'ok' : 'warn'}`} href={dev.source} target="_blank" rel="noopener noreferrer" title={`Checked ${dev.checked}: ${(dev.verifiedFields || []).join(', ')}. Other values are typical.`}>{SPEC_LABEL[lvl]}</a>;
  }
  if (dev.status === 'user') return <span class="badge">Custom</span>;
  return <span class="badge warn" title="These values are typical for this class of device and have not been checked against a datasheet.">Typical / unverified</span>;
}

function ApInspector({ f, ids }) {
  const aps = f.aps.filter((a) => ids.includes(a.id));
  if (!aps.length) return null;
  const devs = A.devices();
  const ap = aps[0];
  const multi = aps.length > 1;
  const dev = A.deviceOf(ap);
  const sameDevice = aps.every((a) => a.deviceId === ap.deviceId);
  const units = store.project.settings.units;
  const region = store.project.settings.region;
  const assoc = f.clients.length ? A.clientAssociations() : null;
  const runs = f.closets.length ? cableRuns(store.project, devs).filter((r) => ids.includes(r.apId)) : [];
  return (
    <>
      <Header kind={multi ? `${aps.length} access points` : 'Access point'} title={multi ? aps.map((a) => a.name).join(', ') : ap.name} sub={multi ? null : KIND_LABEL[dev.kind]}>
        <div class="row" style={{ marginTop: '10px', gap: '8px' }}>
          <button class="btn" style={{ flex: 1, justifyContent: 'space-between', minWidth: 0 }} onClick={() => openDialog('devices', { mode: 'change' })} title="Change device model">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sameDevice ? `${dev.vendor} ${dev.model}` : 'Mixed models'}</span><Icon name="chevronRight" size={14} />
          </button>
          {sameDevice ? <SpecBadge dev={dev} /> : null}
        </div>
        {sameDevice ? <div class="hint" style={{ marginTop: '6px' }}>Wi-Fi {dev.gen}{dev.radios['6'] && dev.gen === 6 ? 'E' : ''} · {BANDS.filter((b) => dev.radios[b]).map((b) => `${b} GHz ${dev.radios[b].nss}×${dev.radios[b].nss}`).join(' · ')}</div> : null}
      </Header>

      {!multi ? (
        <div class="sect">
          <div class="grid2">
            <TextField label="Name" value={ap.name} maxLength={40} mono onCommit={(v) => A.updateAp(ap.id, { name: v.trim() || ap.name })} />
            <NumField label="Mount height" unit={lenLabel(units)} value={lenOut(ap.heightM, units)} min={0} max={lenOut(50, units)} onCommit={(v) => A.updateAp(ap.id, { heightM: lenIn(v, units) })} />
          </div>
          {f.scale ? (
            <div class="grid2" style={{ marginTop: '8px' }}>
              <NumField label="X" unit={lenLabel(units)} value={lenOut(ap.x * f.scale, units)} onCommit={(v) => A.updateAp(ap.id, { x: lenIn(v, units) / f.scale })} />
              <NumField label="Y" unit={lenLabel(units)} value={lenOut(ap.y * f.scale, units)} onCommit={(v) => A.updateAp(ap.id, { y: lenIn(v, units) / f.scale })} />
            </div>
          ) : null}
          {dev.antenna?.pattern === 'directional' ? (
            <div style={{ marginTop: '8px' }}>
              <NumField label="Antenna direction" unit="° from east, clockwise" value={ap.orientation} min={0} max={359.9} onCommit={(v) => A.updateAp(ap.id, { orientation: v })} />
            </div>
          ) : null}
          <div style={{ marginTop: '6px' }}>
            <Check label="Enabled in the prediction" checked={ap.enabled !== false} onChange={(v) => A.updateAp(ap.id, { enabled: v })} />
          </div>
        </div>
      ) : (
        <div class="sect">
          <Check label="Enabled in the prediction" checked={aps.every((a) => a.enabled !== false)} onChange={(v) => A.updateAps(ids, (a) => { a.enabled = v; })} />
          <div style={{ marginTop: '6px' }}>
            <NumField label="Mount height (all)" unit={lenLabel(units)} value={aps.every((a) => a.heightM === ap.heightM) ? lenOut(ap.heightM, units) : null} min={0} max={lenOut(50, units)} onCommit={(v) => A.updateAps(ids, (a) => { a.heightM = lenIn(v, units); })} />
          </div>
        </div>
      )}

      <Section title="Radios" right={<span class="dimmer mono" style={{ fontSize: '11px' }}>{region}{store.project.settings.allowDfs ? ' · DFS on' : ''}</span>}>
        <div class="radios">
          <span /><span class="h">BAND</span><span class="h">CHANNEL / WIDTH</span><span class="h" style={{ textAlign: 'right' }}>EIRP</span>
          {BANDS.map((b) => {
            const dr = dev.radios[b];
            const supported = aps.every((a) => A.deviceOf(a).radios[b]);
            const r = ap.radios[b];
            const same = (k) => aps.every((a) => a.radios[b][k] === r[k]);
            const chans = primaryChannels(b, r.width, region, { allowDfs: true });
            const eirp = dr ? r.power + dr.gain : null;
            const limit = dr ? eirpLimit(region, b, r.ch, r.width) : Infinity;
            if (!supported) {
              return [<span />, <span class="band dimmer">{b}</span>, <span class="dimmer" style={{ fontSize: '12px' }}>{multi ? 'Not on every selected model' : 'No radio'}</span>, <span />];
            }
            return [
              <input type="checkbox" aria-label={`${BAND_LABEL[b]} radio on`} checked={aps.every((a) => a.radios[b].on)} onChange={(e) => A.updateRadio(ids, b, { on: e.currentTarget.checked })} style={{ accentColor: 'var(--accent)' }} />,
              <span class="band" style={{ color: r.on ? 'var(--text)' : 'var(--text-3)' }}>{b}</span>,
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 58px', gap: '4px' }}>
                <select class="input" aria-label={`${BAND_LABEL[b]} channel`} value={same('ch') ? String(r.ch) : ''} disabled={!r.on} onChange={(e) => A.updateRadio(ids, b, { ch: Number(e.currentTarget.value) })}>
                  {!same('ch') ? <option value="">mixed</option> : null}
                  {!chans.includes(r.ch) && same('ch') ? <option value={String(r.ch)}>{r.ch} (not allowed)</option> : null}
                  {chans.map((c) => <option value={String(c)}>{channelLabel(b, c, 20)}</option>)}
                </select>
                <select class="input" aria-label={`${BAND_LABEL[b]} channel width`} value={same('width') ? String(r.width) : ''} disabled={!r.on} onChange={(e) => {
                  const width = Number(e.currentTarget.value);
                  const ok = blockOf(b, r.ch, width);
                  const ch = ok ? r.ch : primaryChannels(b, width, region, { allowDfs: store.project.settings.allowDfs })[0] ?? r.ch;
                  A.updateRadio(ids, b, { width, ch });
                }}>
                  {!same('width') ? <option value="">mixed</option> : null}
                  {WIDTHS[b].filter((w) => w <= (dr?.maxWidth || 20)).map((w) => <option value={String(w)}>{w}</option>)}
                </select>
              </div>,
              <span class="mono" style={{ textAlign: 'right', fontSize: '12px', color: eirp > limit ? 'var(--warn)' : 'var(--text-2)' }} title={eirp > limit ? `Above the indicative ${limit.toFixed(0)} dBm limit` : 'Transmit power plus antenna gain'}>{r.on && same('power') ? `${eirp.toFixed(0)}` : '—'}</span>,
              r.on ? (
                <div class="radio-extra">
                  <select class="input" aria-label={`${BAND_LABEL[b]} power preset`} value={same('preset') ? r.preset : ''} onChange={(e) => A.updateRadio(ids, b, { preset: e.currentTarget.value })}>
                    {!same('preset') ? <option value="">mixed</option> : null}
                    {Object.entries(POWER_PRESETS).map(([k, v]) => <option value={k}>{v.label} power</option>)}
                    <option value="max">Device maximum ({dr.txMax} dBm)</option>
                    <option value="custom">Custom</option>
                  </select>
                  <NumField ariaLabel={`${BAND_LABEL[b]} transmit power dBm`} value={same('power') ? r.power : null} min={-10} max={36} digits={0} onCommit={(v) => A.updateRadio(ids, b, { power: v })} />
                </div>
              ) : <span style={{ gridColumn: '2 / -1', height: '4px' }} />,
            ];
          })}
        </div>
        <div class="hint">Power in dBm per radio. EIRP adds the antenna gain{(dev.verifiedFields || []).includes('gain') ? ' from the datasheet' : ' (typical value for this class)'}.</div>
      </Section>

      {assoc || runs.length ? (
        <Section title="Connections">
          {assoc ? <div class="kv"><span>Simulated clients</span><span>{assoc.clients.filter((c) => c.assoc && ids.includes(c.assoc.apId)).length}</span></div> : null}
          {runs.map((r) => (
            <div class="kv"><span>{multi ? `${r.apName} cable` : 'Cable to'} {r.closetName}</span><span style={{ color: r.over ? 'var(--warn)' : undefined }}>{r.lengthM != null ? fmtLen(r.lengthM, units, 0) : '—'}</span></div>
          ))}
          {!multi && f.closets.length > 1 ? (
            <div style={{ marginTop: '6px' }}>
              <SelectField label="Network closet" value={ap.closetId || ''} onChange={(v) => A.updateAp(ap.id, { closetId: v || null })}
                options={[{ value: '', label: 'Nearest' }, ...f.closets.map((c) => ({ value: c.id, label: c.name }))]} />
            </div>
          ) : null}
        </Section>
      ) : null}

      {!multi ? (
        <div class="sect">
          <label class="field">
            <span>Notes</span>
            <textarea class="input" maxLength={400} value={ap.notes} onBlur={(e) => e.currentTarget.value !== ap.notes && A.updateAp(ap.id, { notes: e.currentTarget.value })} placeholder="Mounting, cabling, access…" />
          </label>
        </div>
      ) : null}

      <div class="sect row" style={{ gap: '8px' }}>
        <button class="btn" style={{ flex: 1 }} onClick={() => A.duplicateSelection()}>Duplicate <span class="k">{MOD}D</span></button>
        <button class="btn danger" style={{ flex: 1 }} onClick={() => A.deleteSelection()}>Delete <span class="k">Del</span></button>
      </div>
    </>
  );
}

function WallInspector({ f, ids }) {
  const walls = f.walls.filter((w) => ids.includes(w.id));
  if (!walls.length) return null;
  const units = store.project.settings.units;
  const mats = store.project.materials;
  const same = walls.every((w) => w.materialId === walls[0].materialId);
  const m = mats.find((x) => x.id === walls[0].materialId);
  const lenPx = walls.reduce((s, w) => s + Math.hypot(w.x2 - w.x1, w.y2 - w.y1), 0);
  return (
    <>
      <Header kind={walls.length > 1 ? `${walls.length} walls` : 'Wall'} title={f.scale ? fmtLen(lenPx * f.scale, units) : `${lenPx.toFixed(0)} px`} sub={walls.length > 1 ? 'total length' : null} />
      <Section title="Material">
        <SelectField value={same ? walls[0].materialId : ''} onChange={(v) => v && A.setWallMaterial(ids, v)}
          options={[...(same ? [] : [{ value: '', label: 'Mixed materials' }]), ...mats.map((x) => ({ value: x.id, label: x.name }))]} />
        {same && m ? (
          <>
            <table class="t" style={{ marginTop: '10px' }}>
              <thead><tr><th>Band</th><th class="num">Loss per crossing</th></tr></thead>
              <tbody>{BANDS.map((b) => <tr><td class="mono">{BAND_LABEL[b]}</td><td class="num">{m.loss[b]} dB</td></tr>)}</tbody>
            </table>
            <div class="hint" style={{ marginTop: '8px' }}>{m.note} Estimates; edit them in Project settings, Materials.</div>
          </>
        ) : null}
        <button class="btn small quiet" style={{ marginTop: '8px' }} onClick={() => openDialog('settings', { tab: 'materials' })}>Edit materials</button>
      </Section>
      <div class="sect">
        <button class="btn block" onClick={() => selectTool('door')}><Icon name="door" size={16} />Cut a door opening</button>
      </div>
      <div class="sect">
        <button class="btn danger block" onClick={() => A.deleteSelection()}>Delete {walls.length > 1 ? `${walls.length} walls` : 'wall'} <span class="k">Del</span></button>
      </div>
    </>
  );
}

function ZoneInspector({ f, ids }) {
  const z = f.zones.find((o) => o.id === ids[0]);
  if (!z) return null;
  const units = store.project.settings.units;
  const area = f.scale ? polygonArea(z.points) * f.scale ** 2 : null;
  const summary = store.rf.summary?.find((s) => s.floorId === f.id);
  const band = store.ui.band;
  const room = summary?.bands[band]?.stats.rooms.find((r) => r.id === z.id);
  const t = store.project.settings.target;
  const kinds = { room: 'Room (needs coverage)', exclusion: 'Excluded (not counted)', attenuation: 'Attenuation zone' };
  return (
    <>
      <Header kind={kinds[z.kind]} title={z.name || 'Area'} sub={area != null ? fmtArea(area, units) : null} />
      <div class="sect">
        <TextField label="Name" value={z.name} maxLength={60} onCommit={(v) => A.updateZone(z.id, { name: v })} />
        <div style={{ marginTop: '8px' }}>
          <SelectField label="Type" value={z.kind} onChange={(v) => A.updateZone(z.id, { kind: v, materialId: v === 'attenuation' ? z.materialId || 'cubicles' : null })}
            options={Object.entries(kinds).map(([k, l]) => ({ value: k, label: l }))} />
        </div>
        {z.kind === 'room' ? (
          <div style={{ marginTop: '8px' }}>
            <NumField label="Expected devices" value={z.devices} min={0} max={100000} digits={0} hint="Used for the capacity check and client simulation." onCommit={(v) => A.updateZone(z.id, { devices: Math.round(v) })} />
          </div>
        ) : null}
        {z.kind === 'attenuation' ? (
          <div style={{ marginTop: '8px' }}>
            <SelectField label="Contents" value={z.materialId} onChange={(v) => A.updateZone(z.id, { materialId: v })}
              options={store.project.zoneMaterials.map((m) => ({ value: m.id, label: `${m.name} · ${m.lossPerM['5']} dB/m at 5 GHz` }))} hint="Signal loses this much per meter travelled inside the zone. Estimates." />
          </div>
        ) : null}
      </div>
      {z.kind === 'room' && room ? (
        <Section title={`Coverage · ${BAND_LABEL[band]}`}>
          <div class="kv"><span>Meets {t.primary} dBm</span><span>{room.primaryPct.toFixed(1)}%</span></div>
          <Meter pct={room.primaryPct} goal={t.coverageGoal} />
          {t.secondaryEnabled ? (<><div class="kv"><span>Secondary {t.secondary} dBm</span><span>{room.secondaryPct.toFixed(1)}%</span></div><Meter pct={room.secondaryPct} goal={t.coverageGoal} /></>) : null}
        </Section>
      ) : null}
      <div class="sect"><button class="btn danger block" onClick={() => A.deleteSelection()}>Delete area <span class="k">Del</span></button></div>
    </>
  );
}

function ClosetInspector({ f, ids }) {
  const c = f.closets.find((o) => o.id === ids[0]);
  if (!c) return null;
  const units = store.project.settings.units;
  const runs = cableRuns(store.project, A.devices());
  const load = closetLoads(store.project, runs).find((l) => l.id === c.id);
  const mine = runs.filter((r) => r.closetId === c.id);
  return (
    <>
      <Header kind="Network closet" title={c.name} />
      <div class="sect">
        <TextField label="Name" value={c.name} maxLength={40} mono onCommit={(v) => A.updateCloset(c.id, { name: v.trim() || c.name })} />
        <div style={{ marginTop: '8px' }}>
          <NumField label="PoE budget" unit="W" value={c.poeBudgetW} min={0} max={100000} digits={0} hint="Leave empty if unknown." onCommit={(v) => A.updateCloset(c.id, { poeBudgetW: v })} />
        </div>
      </div>
      <Section title="Load (estimate)">
        <div class="kv"><span>Switch ports for APs</span><span>{load?.ports ?? 0}</span></div>
        <div class="kv"><span>PoE draw</span><span style={{ color: load?.budgetW != null && load.poeW > load.budgetW ? 'var(--warn)' : undefined }}>{load ? `${load.poeW.toFixed(0)} W` : '—'}{load?.unknownPoe ? ` + ${load.unknownPoe} unknown` : ''}</span></div>
        <div class="kv"><span>Longest run</span><span>{mine.length ? fmtLen(Math.max(...mine.map((r) => r.lengthM)), units, 0) : '—'}</span></div>
        <div class="hint" style={{ marginTop: '6px' }}>Runs are rectilinear plus {store.project.settings.cabling.verticalM} m vertical allowance and {store.project.settings.cabling.slackPct}% slack. PoE uses device figures, typical where unverified.</div>
      </Section>
      <div class="sect"><button class="btn danger block" onClick={() => A.deleteSelection()}>Delete closet <span class="k">Del</span></button></div>
    </>
  );
}

function ClientInspector({ f, ids }) {
  const assoc = A.clientAssociations();
  const c = assoc.clients.find((o) => o.id === ids[0]);
  const s = store.project.settings;
  return (
    <>
      <Header kind={ids.length > 1 ? `${ids.length} clients` : 'Client'} title={c?.assoc ? `Joined ${c.assoc.apName}` : 'Not associated'} />
      {c ? (
        <Section title="Estimate">
          {c.assoc ? (
            <>
              <div class="kv"><span>Band</span><span>{BAND_LABEL[c.assoc.band]}</span></div>
              <div class="kv"><span>Signal</span><span>{signed(c.assoc.rssi, 0)} dBm</span></div>
              <div class="kv"><span>Link (MCS)</span><span>{c.link.mcs >= 0 ? `MCS ${c.link.mcs} · ${c.link.nss}SS · ${c.link.width} MHz` : 'none'}</span></div>
              <div class="kv"><span>PHY rate</span><span>{c.link.phy.toFixed(0)} Mbps</span></div>
              <div class="kv"><span>Est. throughput, alone</span><span>{c.link.throughput.toFixed(0)} Mbps</span></div>
              <div class="kv"><span>Est. share ({c.sharing} on radio)</span><span>{c.shareMbps.toFixed(0)} Mbps</span></div>
            </>
          ) : <div class="hint">No AP reaches {s.associateMinDbm} dBm here on a band the client supports.</div>}
          <div class="hint" style={{ marginTop: '8px' }}>Client profile: Wi-Fi {s.client.gen}, {s.client.nss} streams. Throughput = PHY × {s.efficiency} efficiency, divided among clients on the same radio and capped by the {s.internet.down} Mbps internet link. Estimates only.</div>
        </Section>
      ) : null}
      <div class="sect"><button class="btn danger block" onClick={() => A.deleteSelection()}>Delete <span class="k">Del</span></button></div>
    </>
  );
}

function FloorInspector({ f }) {
  const p = store.project;
  const units = p.settings.units;
  const summary = store.rf.summary?.find((s) => s.floorId === f.id);
  const t = p.settings.target;
  const res = store.rf.result?.floorId === f.id ? store.rf.result : null;
  const stats = res?.stats || summary?.bands[store.ui.band]?.stats;
  const rooms = f.zones.filter((z) => z.kind === 'room');
  const area = f.scale ? (rooms.length ? rooms.reduce((s, z) => s + polygonArea(z.points), 0) : f.width * f.height) * f.scale ** 2 : null;
  return (
    <>
      <Header kind="Floor" title={f.name} sub={f.scale ? fmtArea(f.width * f.height * f.scale ** 2, units) : 'scale not set'}>
        <div class="row" style={{ gap: '6px', marginTop: '10px' }}>
          <button class="btn small" onClick={() => openDialog('floor')}>Floor settings</button>
          <button class="btn small" onClick={() => importPlanInteractive({ newFloor: false })}>{f.imageId ? 'Replace plan' : 'Add plan image'}</button>
        </div>
      </Header>
      {!f.scale ? (
        <div class="sect">
          <div class="hint warn" style={{ marginBottom: '8px' }}>Set the scale to predict signal. Click both ends of a known length on the plan.</div>
          <button class="btn primary block" onClick={() => selectTool('scale')}><Icon name="scale" size={16} />Set scale <span class="k">S</span></button>
        </div>
      ) : (
        <Section title={`Coverage · ${BAND_LABEL[store.ui.band]}`} right={<button class="btn quiet small" onClick={() => openDialog('settings', { tab: 'target' })}>Target</button>}>
          {stats ? (
            <>
              <div class="kv"><span>Meets {t.primary} dBm</span><span>{stats.primaryPct.toFixed(1)}%</span></div>
              <Meter pct={stats.primaryPct} goal={t.coverageGoal} />
              <div class="kv"><span>Secondary {t.secondary} dBm</span><span>{stats.secondaryPct.toFixed(1)}%</span></div>
              <Meter pct={stats.secondaryPct} goal={t.secondaryEnabled ? t.coverageGoal : null} />
              <div class="hint">Share of {area != null ? fmtArea(area, units) : 'the floor'} {rooms.length ? 'in rooms' : '(whole plan; mark rooms to focus)'}{f.zones.some((z) => z.kind === 'exclusion') ? ', excluding marked areas' : ''}. Goal {t.coverageGoal}%. Predictive estimate.</div>
            </>
          ) : <div class="hint">{f.aps.length ? 'Computing…' : 'Place access points to see coverage.'}</div>}
        </Section>
      )}
      <Section title="On this floor">
        <div class="kv"><span>Access points</span><span>{f.aps.length}</span></div>
        <div class="kv"><span>Walls</span><span>{f.walls.length}</span></div>
        <div class="kv"><span>Rooms</span><span>{rooms.length}</span></div>
        <div class="kv"><span>Expected devices</span><span>{rooms.reduce((s, z) => s + (z.devices || 0), 0)}</span></div>
        <div class="kv"><span>Network closets</span><span>{f.closets.length}</span></div>
        <div class="kv"><span>Floor-to-floor height</span><span>{fmtLen(f.heightM, units)}</span></div>
      </Section>
      <Section title="Drawing">
        <SelectField label="New walls use" value={store.ui.wallMaterial} onChange={(v) => setUi({ wallMaterial: v })} options={p.materials.map((m) => ({ value: m.id, label: `${m.name} · ${m.loss['5']} dB at 5 GHz` }))} />
        <div style={{ marginTop: '8px' }}>
          <SelectField label="Area tool draws" value={store.ui.zoneKind} onChange={(v) => setUi({ zoneKind: v })} options={[{ value: 'room', label: 'Rooms (need coverage)' }, { value: 'exclusion', label: 'Excluded areas' }, { value: 'attenuation', label: 'Attenuation zones' }]} />
        </div>
        <div style={{ marginTop: '6px' }}>
          <Check label="Snap to walls and corners" checked={store.ui.snap} onChange={(v) => setUi({ snap: v })} />
        </div>
      </Section>
    </>
  );
}

export { commit };
