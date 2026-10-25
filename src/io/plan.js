// Floor-plan import: images and PDFs. Files are identified by their content,
// decoded as images only (never executed), downscaled when huge and stored as
// PNG or JPEG data URLs.

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_SIDE = 6000;

export class PlanError extends Error {}

async function sniff(file) {
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const s = (i, str) => [...str].every((ch, k) => head[i + k] === ch.charCodeAt(0));
  if (head[0] === 0x89 && s(1, 'PNG')) return 'png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (s(0, 'GIF8')) return 'gif';
  if (s(0, 'RIFF') && s(8, 'WEBP')) return 'webp';
  if (s(0, 'BM')) return 'bmp';
  if (s(0, '%PDF')) return 'pdf';
  const text = new TextDecoder().decode(head).trimStart().toLowerCase();
  if (text.startsWith('<?xml') || text.startsWith('<svg') || text.includes('<svg')) return 'svg';
  return null;
}

function canvasToDataUrl(canvas) {
  const area = canvas.width * canvas.height;
  // Line drawings compress well as PNG; very large plans use JPEG to stay small.
  if (area <= 6_000_000) return canvas.toDataURL('image/png');
  return canvas.toDataURL('image/jpeg', 0.9);
}

function fit(w, h, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), scaled: k < 1 };
}

async function rasterFromBitmap(bmp) {
  const { w, h, scaled } = fit(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  return { dataUrl: canvasToDataUrl(c), width: w, height: h, downscaled: scaled };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new PlanError('The image could not be decoded.'));
    img.src = url;
  });
}

let pdfjsPromise = null;
async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
  }
  return pdfjsPromise;
}

/** Open a PDF and return { pageCount, render(pageNumber) }. */
export async function openPdf(file) {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  const task = lib.getDocument({ data, isEvalSupported: false, enableXfa: false });
  try {
    doc = await task.promise;
  } catch {
    throw new PlanError('The PDF could not be opened. It may be damaged or password-protected.');
  }
  return {
    pageCount: doc.numPages,
    async render(pageNumber = 1) {
      const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(4, 4000 / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
      return { dataUrl: canvasToDataUrl(c), width: c.width, height: c.height, downscaled: false };
    },
    destroy() { task.destroy(); },
  };
}

/**
 * Import a plan file. For PDFs with several pages, `choosePage(count)` is
 * awaited to pick one. Returns { dataUrl, width, height, downscaled, name }.
 */
export async function importPlanFile(file, choosePage = async () => 1) {
  if (!file) throw new PlanError('No file selected.');
  if (file.size > MAX_FILE_BYTES) throw new PlanError('The file is larger than 50 MB.');
  const kind = await sniff(file);
  if (!kind) throw new PlanError('Unsupported file. Use a PNG, JPEG, WebP, GIF, BMP, SVG or PDF.');
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
  if (kind === 'pdf') {
    const pdf = await openPdf(file);
    try {
      const n = pdf.pageCount > 1 ? await choosePage(pdf.pageCount) : 1;
      if (!n) return null;
      return { ...(await pdf.render(n)), name };
    } finally {
      pdf.destroy();
    }
  }
  if (kind === 'svg') {
    const url = URL.createObjectURL(new Blob([await file.arrayBuffer()], { type: 'image/svg+xml' }));
    try {
      const img = await loadImage(url);
      const w = img.naturalWidth || 2000, h = img.naturalHeight || 1400;
      const target = fit(Math.max(w, 2000), Math.max(h, (2000 * h) / w));
      const c = document.createElement('canvas');
      c.width = target.w;
      c.height = target.h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return { dataUrl: canvasToDataUrl(c), width: c.width, height: c.height, downscaled: false, name };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new PlanError('The image could not be decoded.');
  }
  const out = await rasterFromBitmap(bmp);
  bmp.close?.();
  return { ...out, name };
}

/** Decode a stored data URL into an HTMLImageElement for drawing. */
export function imageFromDataUrl(url) {
  return loadImage(url);
}
