import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { store, setUi, useStore } from '../state/store.js';
import { commandList } from './commands.js';
import { DEVICES } from '../data/devices.js';

function score(label, q) {
  if (!q) return 1;
  const l = label.toLowerCase();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of words) {
    const i = l.indexOf(w);
    if (i < 0) return 0;
    s += i === 0 ? 3 : l[i - 1] === ' ' ? 2 : 1;
  }
  return s;
}

export function Palette() {
  const open = useStore((s) => s.ui.palette);
  if (!open) return null;
  return <PaletteInner />;
}

function PaletteInner() {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);
  useLayoutEffect(() => { ref.current?.focus(); }, []);
  const close = () => setUi({ palette: false });
  const cmds = commandList().filter((c) => !c.when || c.when());
  const devs = q.length >= 2 && store.project.floors.length
    ? DEVICES.map((d) => ({ id: `place.${d.id}`, group: 'Place device', label: `${d.vendor} ${d.model}`, run: () => { setUi({ deviceId: d.id, tool: 'ap' }); } }))
    : [];
  const items = [...cmds, ...devs]
    .map((c) => ({ c, s: score(`${c.label} ${c.group}`, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => (q ? b.s - a.s : 0))
    .slice(0, 60)
    .map((x) => x.c);
  const idx = Math.min(i, Math.max(0, items.length - 1));
  const runAt = (k) => { const c = items[k]; if (!c) return; close(); setTimeout(() => c.run(), 0); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(items.length - 1, idx + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, idx - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(idx); }
  };
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [idx]);
  let lastGroup = null;
  return (
    <div class="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div class="dialog palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input ref={ref} value={q} placeholder="Type a command or a device model" onInput={(e) => { setQ(e.currentTarget.value); setI(0); }} onKeyDown={onKey}
          role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[idx] ? `pal-${idx}` : undefined} />
        <div class="items" id="palette-list" role="listbox" ref={listRef}>
          {!items.length ? <div class="grp hint">No matches.</div> : null}
          {items.map((c, k) => {
            const head = c.group !== lastGroup ? <div class="grp caps">{c.group}</div> : null;
            lastGroup = c.group;
            return [head, (
              <div class="it" id={`pal-${k}`} role="option" aria-selected={String(k === idx)} onMouseMove={() => setI(k)} onClick={() => runAt(k)}>
                <span>{c.label}</span>
                {c.keys ? <kbd>{c.keys}</kbd> : null}
              </div>
            )];
          })}
        </div>
      </div>
    </div>
  );
}
