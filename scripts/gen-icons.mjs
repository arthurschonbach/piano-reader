import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function drawIcon(size, opts = {}) {
  const S = size;
  const buf = Buffer.alloc(S * S * 4);
  const full = opts.maskable === true;
  const r = full ? 0 : S * 0.22;
  const bg = [15, 23, 42, 255];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let inside = true;
      if (r > 0) {
        const cx = Math.min(Math.max(x, r), S - r);
        const cy = Math.min(Math.max(y, r), S - r);
        const dx = x - cx;
        const dy = y - cy;
        inside = dx * dx + dy * dy <= r * r || (x >= r && x <= S - r) || (y >= r && y <= S - r);
      }
      const i = (y * S + x) * 4;
      if (inside) {
        buf[i] = bg[0];
        buf[i + 1] = bg[1];
        buf[i + 2] = bg[2];
        buf[i + 3] = 255;
      }
    }
  }
  const pad = full ? 0.3 : 0.18;
  const kx0 = Math.round(S * pad);
  const kx1 = Math.round(S * (1 - pad));
  const ky0 = Math.round(S * (full ? 0.32 : 0.24));
  const ky1 = Math.round(S * (full ? 0.68 : 0.76));
  const keys = 4;
  const kw = (kx1 - kx0) / keys;
  const white = [241, 245, 249, 255];
  const black = [30, 41, 59, 255];
  const blue = [37, 99, 235, 255];
  const fill = (x, y, c) => {
    const i = (y * S + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = 255;
  };
  for (let y = ky0; y < ky1; y++) {
    for (let x = kx0; x < kx1; x++) {
      fill(x, y, white);
    }
  }
  for (let k = 1; k < keys; k++) {
    for (let y = ky0; y < ky1; y++) {
      fill(kx0 + k * kw - 1, y, bg);
      fill(kx0 + k * kw, y, bg);
    }
  }
  const blackH = Math.round((ky1 - ky0) * 0.58);
  const bkeys = [1, 3];
  for (const bk of bkeys) {
    for (let y = ky0; y < ky0 + blackH; y++) {
      for (let x = Math.round(kx0 + bk * kw - kw * 0.18); x < kx0 + bk * kw + kw * 0.18; x++) {
        fill(x, y, black);
      }
    }
  }
  const px = Math.round(kx0 + (kx1 - kx0) * 0.78);
  const pw = Math.max(3, Math.round(S * 0.035));
  for (let y = ky0 - Math.round(S * 0.03); y < ky1 + Math.round(S * 0.03); y++) {
    for (let x = px; x < px + pw; x++) {
      if (x < S && y < S && y >= 0) fill(x, y, [96, 165, 250, 255]);
    }
  }
  return png(S, S, buf);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', drawIcon(192));
writeFileSync('public/icons/icon-512.png', drawIcon(512));
writeFileSync('public/icons/maskable-512.png', drawIcon(512, { maskable: true }));
writeFileSync('public/icons/apple-touch-icon.png', drawIcon(180));
writeFileSync('public/icons/favicon-32.png', drawIcon(32));
console.log('icons written');