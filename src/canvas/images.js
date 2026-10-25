// Decoded floor-plan images, plus a dark rendition for the dark UI that maps
// white paper to the canvas ground and ink to a warm light grey.

const cache = new Map(); // imageId -> { url, img, dark, ready, promise }
let onReady = () => {};

export function setImageReadyHandler(fn) { onReady = fn; }

export function getPlanImage(project, imageId, style = 'dark') {
  if (!imageId) return null;
  const url = project.images[imageId];
  if (!url) return null;
  let entry = cache.get(imageId);
  if (!entry || entry.url !== url) {
    entry = { url, img: null, dark: null, ready: false };
    cache.set(imageId, entry);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { entry.img = img; entry.ready = true; onReady(); };
    img.onerror = () => { entry.ready = false; };
    img.src = url;
  }
  if (!entry.ready) return null;
  if (style !== 'dark') return entry.img;
  if (!entry.dark) entry.dark = makeDark(entry.img);
  return entry.dark;
}

function makeDark(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  try {
    const data = ctx.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    const base = [24, 23, 21], ink = [206, 200, 190];
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a + 255 * (1 - a);
      const t = 1 - l / 255;
      d[i] = base[0] + t * (ink[0] - base[0]);
      d[i + 1] = base[1] + t * (ink[1] - base[1]);
      d[i + 2] = base[2] + t * (ink[2] - base[2]);
      d[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
  } catch {
    return img;
  }
  return c;
}

export function clearImageCache() {
  cache.clear();
}
