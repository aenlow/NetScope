import { useEffect, useState } from 'preact/hooks';
import { openDialog, toast, setUi } from '../state/store.js';
import * as A from '../state/actions.js';
import { EXAMPLES, loadExample } from '../examples/index.js';
import { listRecent, loadRecent, deleteRecent } from '../io/files.js';
import { importPlanInteractive, openProjectInteractive } from './io.js';
import { MOD } from './commands.js';
import { getViewport } from './viewportRef.js';

function Thumb({ id }) {
  // Small schematic of each example (not to scale).
  const common = { stroke: 'var(--text-2)', 'stroke-width': 1.2, fill: 'none' };
  return (
    <svg class="thumb" viewBox="0 0 240 92" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {id === 'office' ? (
        <g {...common}>
          <rect x="30" y="10" width="180" height="72" />
          <path d="M30 32h120M60 10v22M90 10v22M120 10v22M150 10v34h60M112 46h30v18h-30zM30 62h34v20M180 62h30M190 62v20" />
          <circle cx="66" cy="50" r="3" fill="var(--accent)" stroke="none" /><circle cx="170" cy="22" r="3" fill="var(--accent)" stroke="none" /><circle cx="140" cy="72" r="3" fill="var(--accent)" stroke="none" />
        </g>
      ) : id === 'warehouse' ? (
        <g {...common}>
          <rect x="20" y="8" width="200" height="76" />
          <path d="M20 28h50v-20M70 8v20" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect x={86 + i * 16} y="18" width="5" height="50" stroke-dasharray="2 2" />)}
          <path d="M120 84v-4M140 84v-4M160 84v-4M180 84v-4" />
          <circle cx="100" cy="30" r="3" fill="var(--accent)" stroke="none" /><circle cx="148" cy="56" r="3" fill="var(--accent)" stroke="none" /><circle cx="196" cy="30" r="3" fill="var(--accent)" stroke="none" />
        </g>
      ) : (
        <g {...common}>
          <rect x="40" y="8" width="160" height="76" />
          <path d="M40 30h114M154 8v22h46M40 30v26h24V30" />
          {[0, 1, 2, 3].map((i) => <rect x="76" y={40 + i * 9} width="100" height="3" stroke-dasharray="2 2" />)}
          <path d="M40 84h66M128 84h72" stroke="var(--info)" />
          <circle cx="96" cy="58" r="3" fill="var(--accent)" stroke="none" /><circle cx="150" cy="70" r="3" fill="var(--accent)" stroke="none" />
        </g>
      )}
    </svg>
  );
}

export function Welcome() {
  const [recent, setRecent] = useState([]);
  useEffect(() => { listRecent().then(setRecent); }, []);
  const openRecent = async (id) => {
    try {
      const { project, warnings } = await loadRecent(id);
      A.replaceProject(project);
      requestAnimationFrame(() => getViewport()?.fit());
      if (warnings.length) openDialog('warnings', { title: 'Opened with notes', warnings });
    } catch (e) {
      toast(`Could not open that project: ${e.message || e}`, 'error');
    }
  };
  return (
    <div class="empty">
      <div class="empty-inner">
        <h1>Plan Wi-Fi on a floor plan</h1>
        <p class="lead">NetScope predicts coverage, signal quality and channel overlap from your floor plan, walls and access points. Everything runs in your browser; projects stay on this device unless you download them.</p>

        <div class="steps" aria-label="Workflow">
          <div class="step"><div class="n">01</div><h3>Import the plan</h3><p>Image or PDF. Set the scale from the building's overall size, the PDF's scale note or any known length.</p></div>
          <div class="step"><div class="n">02</div><h3>Trace walls</h3><p>Found automatically on clean plans, sorted into exterior and interior. Review them, then adjust materials; losses are editable estimates.</p></div>
          <div class="step"><div class="n">03</div><h3>Place access points</h3><p>Choose models from the library, or let auto-place propose a layout for your target.</p></div>
          <div class="step"><div class="n">04</div><h3>Check and export</h3><p>Plan check flags gaps and overlaps. Export a PDF report with a bill of materials.</p></div>
        </div>

        <div class="starts">
          <button class="start primary" onClick={() => importPlanInteractive({ newFloor: true })}>
            <span class="t">Import a floor plan</span>
            <span class="fmt">PNG · JPG · WebP · PDF · SVG</span>
            <span class="d">Start from a drawing. You can also drop a file anywhere on this screen.</span>
          </button>
          <button class="start" onClick={() => openDialog('blankfloor', { first: true })}>
            <span class="t">Start on a blank floor</span>
            <span class="fmt">width × depth</span>
            <span class="d">Sketch walls on a grid of known size. Good for quick estimates.</span>
          </button>
          <button class="start" onClick={() => openProjectInteractive()}>
            <span class="t">Open a project file</span>
            <span class="fmt">.json · {MOD} O</span>
            <span class="d">NetScope .json projects, including files from the original single-page version.</span>
          </button>
        </div>

        <div class="caps" style={{ marginBottom: '10px' }}>Try an example project</div>
        <div class="examples">
          {EXAMPLES.map((ex) => (
            <button class="example" onClick={() => loadExample(ex.id)}>
              <Thumb id={ex.id} />
              <div class="body2">
                <div class="t">{ex.name}</div>
                <div class="d">{ex.blurb}</div>
                <div class="d mono" style={{ fontSize: '11px', marginTop: '6px' }}>{ex.stats}</div>
              </div>
            </button>
          ))}
        </div>

        {recent.length ? (
          <>
            <div class="caps" style={{ marginBottom: '10px' }}>Recent in this browser</div>
            <div class="recent">
              {recent.slice(0, 8).map((r) => (
                <div class="r">
                  <button class="open" onClick={() => openRecent(r.id)}>{r.name}</button>
                  <span class="dimmer mono" style={{ fontSize: '11px' }}>{r.floors} floor{r.floors === 1 ? '' : 's'} · {r.aps} APs</span>
                  <span class="dimmer mono" style={{ fontSize: '11px' }}>{new Date(r.updatedAt).toLocaleString()}</span>
                  <button class="btn quiet small" aria-label={`Remove ${r.name} from this browser`} onClick={async () => { await deleteRecent(r.id); setRecent(await listRecent()); }}>Remove</button>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <p class="note">Predictions are estimates from a free-space model with per-wall losses. They are useful for planning and comparing designs, and are not a substitute for an on-site survey.</p>
      </div>
    </div>
  );
}

export { setUi };
