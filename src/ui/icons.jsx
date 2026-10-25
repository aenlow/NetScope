// Purpose-drawn stroke icons (24 × 24 grid, 1.5 px stroke).

const P = {
  select: 'M6 3l13 8-6 1.8-2.6 6.2z',
  pan: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  scale: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  wall: 'M4 20V9h8V4h8',
  rect: 'M4 5h16v14H4zM4 12h7v7',
  area: 'M5 6l9-2 6 7-4 9-10-3z',
  door: 'M4 20h16M6 20V5h8v15M6 5l6 3v12',
  ap: 'M12 13.5a1.5 1.5 0 1 0 0.01 0M8.3 10.6a5.3 5.3 0 0 1 7.4 0M5.4 7.7a9.4 9.4 0 0 1 13.2 0',
  closet: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h8',
  client: 'M8 3h8v18H8zM11 18h2',
  measure: 'M4 20L20 4M4 15v5h5M20 9V4h-5',
  probe: 'M12 3v5M12 16v5M3 12h5M16 12h5M12 9a3 3 0 1 0 0.01 0',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 1 0 0.01 0M16 16l4.5 4.5',
  panelLeft: 'M3 4h18v16H3zM9 4v16',
  panelRight: 'M3 4h18v16H3zM15 4v16',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  export: 'M12 15V3M7 8l5-5 5 5M4 14v6h16v-6',
  open: 'M3 7h7l2 2h9v10H3z',
  save: 'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7',
  help: 'M12 4a8 8 0 1 0 0.01 0M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0.01 0',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.5 6.6C3.8 8.3 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.3-1',
  auto: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4zM12 10.5v3M10.5 12h3',
  channels: 'M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0',
  layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  check: 'M5 12l5 5 9-10',
  warn: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  rooms: 'M4 4h16v16H4zM4 12h8V4M12 12v8',
  clients: 'M5 7a2 2 0 1 0 0.01 0M12 5a2 2 0 1 0 0.01 0M19 9a2 2 0 1 0 0.01 0M8 17a2 2 0 1 0 0.01 0M16 16a2 2 0 1 0 0.01 0',
  versions: 'M12 4a8 8 0 1 0 8 8M12 8v4l3 2M20 4v4h-4',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  file: 'M6 3h9l4 4v14H6zM15 3v4h4',
  grid: 'M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16',
  floors: 'M12 3l9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4',
};

export function Icon({ name, size = 18, stroke = 1.5, title }) {
  const d = P[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} style={{ flex: 'none' }}>
      {title ? <title>{title}</title> : null}
      <path d={d} fill="none" stroke="currentColor" stroke-width={name === 'wall' ? 2.6 : stroke} stroke-linecap={name === 'wall' ? 'square' : 'round'} stroke-linejoin="round" />
    </svg>
  );
}

export function Logo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1" y="1" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" />
      <circle cx="9" cy="9" r="2.2" fill="var(--accent)" />
      <path d="M9 1v4M9 13v4M1 9h4M13 9h4" stroke="currentColor" stroke-width="1.5" />
    </svg>
  );
}
