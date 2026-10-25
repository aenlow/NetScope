import { useState, useEffect, useRef } from 'preact/hooks';

let idn = 0;
export const useId = (p = 'f') => useRef(`${p}${++idn}`).current;

/** Number field that commits on Enter or blur, validating range. */
export function NumField({ label, value, onCommit, min = -Infinity, max = Infinity, step = 'any', unit, digits = 1, hint, disabled, id: forcedId, ariaLabel }) {
  const gen = useId('n');
  const id = forcedId || gen;
  const fmt = (v) => (v == null || !Number.isFinite(v) ? '' : String(Number(v.toFixed(digits))));
  const [text, setText] = useState(fmt(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) { setText(fmt(value)); setBad(false); } }, [value]);
  const commit = () => {
    const t = text.trim().replace(',', '.').replace('−', '-');
    if (t === '') { setText(fmt(value)); setBad(false); return; }
    const v = Number(t);
    if (!Number.isFinite(v) || v < min || v > max) { setBad(true); return; }
    setBad(false);
    if (v !== value) onCommit(v);
  };
  const input = (
    <input
      id={id}
      class="input mono"
      inputMode="decimal"
      value={text}
      step={step}
      disabled={disabled}
      aria-invalid={bad ? 'true' : 'false'}
      aria-label={label ? undefined : ariaLabel}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; commit(); }}
      onInput={(e) => setText(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.currentTarget.blur(); } if (e.key === 'Escape') { setText(fmt(value)); setBad(false); e.currentTarget.blur(); } }}
    />
  );
  if (!label) return input;
  return (
    <label class="field" for={id}>
      <span><span>{label}</span>{unit ? <span class="dimmer mono">{unit}</span> : null}</span>
      {input}
      {bad ? <span class="hint warn">Enter a value from {Number.isFinite(min) ? min : '…'} to {Number.isFinite(max) ? max : '…'}</span> : hint ? <span class="hint">{hint}</span> : null}
    </label>
  );
}

/** Text field committing on blur / Enter. */
export function TextField({ label, value, onCommit, placeholder, maxLength = 120, mono }) {
  const id = useId('t');
  const [text, setText] = useState(value || '');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value || ''); }, [value]);
  const commit = () => { if (text !== value) onCommit(text); };
  return (
    <label class="field" for={id}>
      {label ? <span>{label}</span> : null}
      <input id={id} class={`input${mono ? ' mono' : ''}`} value={text} maxLength={maxLength} placeholder={placeholder}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; commit(); }}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setText(value || ''); e.currentTarget.blur(); } }} />
    </label>
  );
}

export function SelectField({ label, value, onChange, options, hint, mono, id: forced }) {
  const gen = useId('s');
  const id = forced || gen;
  return (
    <label class="field" for={id}>
      {label ? <span>{label}</span> : null}
      <select id={id} class={`input${mono ? ' mono' : ''}`} value={String(value)} onChange={(e) => onChange(e.currentTarget.value)}>
        {options.map((o) => <option value={String(o.value)} disabled={o.disabled}>{o.label}</option>)}
      </select>
      {hint ? <span class="hint">{hint}</span> : null}
    </label>
  );
}

export function Check({ label, checked, onChange, hint, disabled }) {
  return (
    <label class="check">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span>{label}{hint ? <span class="hint" style={{ display: 'block' }}>{hint}</span> : null}</span>
    </label>
  );
}

export function Seg({ value, options, onChange, label, mono }) {
  return (
    <div class={`seg${mono ? ' mono' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" aria-pressed={String(value === o.value)} title={o.title} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Section({ title, right, children, id }) {
  return (
    <section class="sect" aria-labelledby={id}>
      {title ? <div class="sect-h"><h2 class="caps" id={id} style={{ margin: 0 }}>{title}</h2>{right}</div> : null}
      {children}
    </section>
  );
}

export function Meter({ pct, goal }) {
  return (
    <div class={`meter${goal != null && pct < goal ? ' below' : ''}`} role="img" aria-label={`${pct.toFixed(1)} percent`}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}
