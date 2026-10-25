let counter = 0;

/** Short, collision-resistant id with a readable prefix. */
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1679616;
  const rand = Math.floor(Math.random() * 2176782336).toString(36).padStart(6, '0');
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(4, '0')}${rand}`;
}
