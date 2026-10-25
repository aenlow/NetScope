import { useEffect, useRef } from 'preact/hooks';
import { closeDialog } from '../state/store.js';
import { Icon } from './icons.jsx';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, children, footer, size = '', onClose = closeDialog, labelledBy, initialFocus, class: cls = '' }) {
  const ref = useRef(null);
  const prev = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  useEffect(() => {
    const el = ref.current;
    const target = (initialFocus && el.querySelector(initialFocus)) || el.querySelector('.content ' + FOCUSABLE) || el.querySelector(FOCUSABLE);
    target?.focus();
    const prevEl = prev.current;
    return () => { if (prevEl && prevEl.focus && document.contains(prevEl)) prevEl.focus(); };
  }, []);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const id = labelledBy || `dlg-${title?.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div class="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class={`dialog ${size} ${cls}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} onKeyDown={onKey}>
        <header>
          <h2 id={id}>{title}</h2>
          <button class="btn icon quiet" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button>
        </header>
        {children}
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}
