import { useState } from 'preact/hooks';
import { store, closeDialog, setUi, toast, notify } from '../state/store.js';
import * as A from '../state/actions.js';
import { Dialog } from './Dialog.jsx';
import { Check, SelectField, Seg } from './controls.jsx';
import { BANDS, BAND_LABEL } from '../core/bands.js';
import { VIEWS } from '../core/colors.js';
import { saveProjectFile } from './io.js';
import { planIssues } from './LeftPanel.jsx';

export function ExportDialog() {
  const p = store.project;
  const [kind, setKind] = useState('pdf');
  const used = BANDS.filter((b) => p.floors.some((f) => f.aps.some((a) => a.radios[b]?.on && A.deviceOf(a).radios[b])));
  const [bands, setBands] = useState(used.includes('5') ? ['5'] : used.slice(0, 1));
  const [view, setView] = useState(store.ui.view === 'overlap' || store.ui.view === 'rate' ? store.ui.view : 'signal');
  const [sections, setSections] = useState({ schedule: true, bom: true, checks: true });
  const [theme, setTheme] = useState('light');
  const [working, setWorking] = useState(false);
  const noScale = p.floors.every((f) => !f.scale);

  const go = async () => {
    setWorking(true);
    const devices = A.devices();
    try {
      const { exportPdf, exportPng, exportCsv } = await import('../io/report.js');
      if (kind === 'pdf') {
        setUi({ busy: { label: 'Building PDF report', progress: 0 } });
        await exportPdf(p, { bands, view, includeSchedule: sections.schedule, includeBom: sections.bom, includeChecks: sections.checks, issues: planIssues(), devices, onProgress: (x) => setUi({ busy: { label: 'Building PDF report', progress: x } }) });
        toast('PDF report downloaded.', 'ok');
      } else if (kind === 'png') {
        setUi({ busy: { label: 'Rendering image', progress: null } });
        await exportPng(p, { floorIndex: store.ui.floorIndex, band: store.ui.band, view: store.ui.view, theme, devices, layers: { cables: store.ui.layers.cables } });
        toast('Image downloaded.', 'ok');
      } else if (kind === 'csv') {
        exportCsv(p, devices);
        toast('AP schedule downloaded.', 'ok');
      } else if (kind === 'json') {
        saveProjectFile();
      }
      closeDialog();
    } catch (err) {
      console.error(err);
      toast(`Export failed: ${err.message || err}`, 'error', 8000);
    } finally {
      setUi({ busy: null });
      setWorking(false);
      notify();
    }
  };

  const f = p.floors[store.ui.floorIndex];
  return (
    <Dialog title="Export" size="mid" footer={<><button class="btn" onClick={closeDialog}>Cancel</button><button class="btn primary" disabled={working || (kind === 'pdf' && !bands.length)} onClick={go}>{working ? 'Working…' : kind === 'pdf' ? 'Download PDF' : kind === 'png' ? 'Download PNG' : kind === 'csv' ? 'Download CSV' : 'Download project file'}</button></>}>
      <div class="content" style={{ display: 'grid', gap: '14px' }}>
        <Seg label="Format" value={kind} onChange={setKind} options={[{ value: 'pdf', label: 'PDF report' }, { value: 'png', label: 'Image (PNG)' }, { value: 'csv', label: 'AP schedule (CSV)' }, { value: 'json', label: 'Project file' }]} />
        {kind === 'pdf' ? (
          <>
            <p class="dim" style={{ margin: 0 }}>Cover summary with assumptions, a heatmap page per floor and band, the AP schedule, a bill of materials with quantities, plan check results and the wall losses used.</p>
            {noScale ? <p class="hint warn" style={{ margin: 0 }}>No floor has a scale yet, so the report will have no heatmaps.</p> : null}
            <div class="field"><span>Heatmaps for</span>
              <div class="chips">{BANDS.map((b) => <button class="chip" aria-pressed={String(bands.includes(b))} onClick={() => setBands(bands.includes(b) ? bands.filter((x) => x !== b) : [...bands, b])}>{BAND_LABEL[b]}{used.includes(b) ? '' : ' (no radios)'}</button>)}</div>
            </div>
            <SelectField label="Heatmap view" value={view} onChange={setView} options={Object.entries(VIEWS).map(([k, v]) => ({ value: k, label: v.label }))} />
            <div>
              <Check label="Access point schedule" checked={sections.schedule} onChange={(v) => setSections({ ...sections, schedule: v })} />
              <Check label="Bill of materials, closets and capacity" checked={sections.bom} onChange={(v) => setSections({ ...sections, bom: v })} />
              <Check label="Plan check and wall losses" checked={sections.checks} onChange={(v) => setSections({ ...sections, checks: v })} />
            </div>
          </>
        ) : null}
        {kind === 'png' ? (
          <>
            <p class="dim" style={{ margin: 0 }}>The whole of {f?.name} at high resolution, with the current view ({VIEWS[store.ui.view].label}, {BAND_LABEL[store.ui.band]}), a legend and a title.</p>
            <Seg label="Background" value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light (print)' }, { value: 'dark', label: 'Dark (screen)' }]} />
          </>
        ) : null}
        {kind === 'csv' ? <p class="dim" style={{ margin: 0 }}>One row per access point with floor, model, position, height, channel, width and power per band, and cable estimates. Opens in any spreadsheet.</p> : null}
        {kind === 'json' ? <p class="dim" style={{ margin: 0 }}>Everything needed to reopen this project anywhere, including floor plan images and saved versions.</p> : null}
      </div>
    </Dialog>
  );
}
