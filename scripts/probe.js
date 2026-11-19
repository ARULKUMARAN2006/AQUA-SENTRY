// Injected by the browser check: renders a coarse colour grid of the canvas so
// the scene can be verified numerically when a screenshot is unavailable.
window.__as3dProbe = function probe(cols = 24, rows = 14) {
  const canvas = document.querySelector('.as3d-canvas');
  if (!canvas) return { error: 'no canvas' };
  const w = canvas.width;
  const h = canvas.height;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const ctx = off.getContext('2d');
  ctx.drawImage(canvas, 0, 0, w, h, 0, 0, cols, rows);
  const d = ctx.getImageData(0, 0, cols, rows).data;

  let sum = 0;
  let min = 255;
  let max = 0;
  const cells = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += lum;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
      // coarse symbol: brightness band + dominant hue
      let ch;
      if (lum > 200) ch = '#';
      else if (lum > 150) ch = '*';
      else if (lum > 100) ch = '+';
      else if (lum > 55) ch = '.';
      else ch = ' ';
      const hue = r > b + 20 ? 'G' : b > r + 20 ? 'B' : 'N';
      line += ch + hue;
      cells.push([r, g, b]);
    }
    cells.push([]);
  }
  const n = cols * rows;
  return {
    mean: +(sum / n).toFixed(1),
    min: +min.toFixed(1),
    max: +max.toFixed(1),
    grid: cells.filter((c) => Array.isArray(c) && c.length === 3).map((c) => c.join(',')),
    ascii: (function () { return null; })(),
  };
};

// Compact ASCII map helper
window.__as3dAscii = function (cols = 48, rows = 22) {
  const canvas = document.querySelector('.as3d-canvas');
  const w = canvas.width;
  const h = canvas.height;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const ctx = off.getContext('2d');
  ctx.drawImage(canvas, 0, 0, w, h, 0, 0, cols, rows);
  const d = ctx.getImageData(0, 0, cols, rows).data;
  const ramp = ' .:-=+*#%@';
  let out = '';
  let sum = 0;
  let uniq = new Set();
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      sum += lum;
      uniq.add((r >> 4) * 256 + (g >> 4) * 16 + (b >> 4));
      line += ramp[Math.min(9, Math.floor((lum / 255) * 9.99))];
    }
    out += line + '\n';
  }
  return { ascii: out, mean: +(sum / (cols * rows)).toFixed(1), distinctColors: uniq.size };
};
