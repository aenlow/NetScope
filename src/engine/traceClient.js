// Runs wall tracing on a floor-plan image in a dedicated worker.

const TRACE_MAX_SIDE = 3000;
let worker = null;
let seq = 0;
const jobs = new Map();

function ensure() {
  if (worker) return worker;
  worker = new Worker(new URL('../worker/trace.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const job = jobs.get(ev.data.id);
    if (!job) return;
    jobs.delete(ev.data.id);
    if (ev.data.ok) job.resolve(ev.data.result);
    else job.reject(new Error(ev.data.message));
  };
  worker.onerror = (e) => {
    for (const j of jobs.values()) j.reject(new Error(e.message || 'Tracing failed.'));
    jobs.clear();
    worker = null;
  };
  return worker;
}

async function decode(dataUrl) {
  const img = new Image();
  img.decoding = 'async';
  img.src = dataUrl;
  await img.decode();
  return img;
}

/**
 * Trace walls in a plan image (data URL). Large images are traced at up to
 * 3000 px on the long side; results come back in the image's own pixels.
 */
export async function traceImage(dataUrl) {
  const img = await decode(dataUrl);
  const w0 = img.naturalWidth, h0 = img.naturalHeight;
  const factor = Math.min(1, TRACE_MAX_SIDE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * factor)), h = Math.max(1, Math.round(h0 * factor));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    ensure().postMessage({ id, width: w, height: h, buffer: data.buffer, factor }, [data.buffer]);
  });
}

/** Crop a region of a data-URL image into a new PNG/JPEG data URL. */
export async function cropImage(dataUrl, { x, y, w, h }) {
  const img = await decode(dataUrl);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, -Math.round(x), -Math.round(y));
  const url = c.width * c.height <= 6_000_000 ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
  return { dataUrl: url, width: c.width, height: c.height };
}
