/* Generates the PWA icon set as true pixel art PNGs - no external assets, no deps.
   Run: node tools/make-icons.js  (from the project root) */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* 16x16 art: B=blue frame, .=black, W=white glyph, Y=gold accent */
const ART = [
  'BBBBBBBBBBBBBBBB',
  'B..............B',
  'B...WWWWWWWWW..B',
  'B..WWWWWWWWWWW.B',
  'B..WW.....WWWW.B',
  'B..........WWW.B',
  'B..........WWW.B',
  'B.........WWW..B',
  'B........WWW...B',
  'B.......WWW....B',
  'B......WWW.....B',
  'B.....WWW......B',
  'B....WWW...YYY.B',
  'B...WWWWWWWWYY.B',
  'B...WWWWWWWWWY.B',
  'BBBBBBBBBBBBBBBB'
];
const COLORS = {
  B: [0x1d, 0x9b, 0xf0, 0xff],
  '.': [0x00, 0x00, 0x00, 0xff],
  W: [0xe7, 0xe9, 0xea, 0xff],
  Y: [0xff, 0xd4, 0x00, 0xff]
};

/* ---- minimal PNG encoder (RGBA, filter 0) ---- */
const CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; }
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) { c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
/* ---- render ART at scale S, optional inset (for maskable safe zone) ---- */
function render(size, scale, insetPx) {
  const px = Buffer.alloc(size * size * 4);
  const artW = 16 * scale;
  const off = Math.floor((size - artW) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let col = [0, 0, 0, 255]; /* outside = black */
      if (insetPx > 0) { col = [0x1d, 0x9b, 0xf0, 0xff]; } /* maskable full-bleed blue edge */
      const ax = x - off, ay = y - off;
      if (ax >= 0 && ay >= 0 && ax < artW && ay < artW) {
        const cx = Math.min(15, Math.floor(ax / scale)), cy = Math.min(15, Math.floor(ay / scale));
        col = COLORS[ART[cy][cx]] || col;
      }
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = col[3];
    }
  }
  return png(size, size, px);
}
const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192, 12, 0));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512, 32, 0));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, 25, 64)); /* art ~80% inside safe zone, blue bleed */
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), render(180, 11, 0));
console.log('icons written:', fs.readdirSync(out).join(', '));
