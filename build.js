#!/usr/bin/env node
/**
 * build.js — DevTools Companion for Angular build script
 *
 * Usage:
 *   node build.js                   # Firefox: generate icons + package .xpi
 *   node build.js firefox           # same as above (explicit)
 *   node build.js chrome            # Chrome:  generate icons + package .zip
 *   node build.js icons             # only generate PNG icons
 *   node build.js package           # only package (icons must exist)
 *   node build.js chrome package    # Chrome package only
 *
 * No external dependencies — uses only Node.js built-ins (zlib, fs, path, crypto).
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const zlib   = require('zlib');
const crypto = require('crypto');

const ROOT    = __dirname;
const DIST    = path.join(ROOT, 'dist');
const VERSION = require('./package.json').version;

// ── Argument parsing ───────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const TARGET    = rawArgs.includes('chrome') ? 'chrome' : 'firefox';
const taskArgs  = rawArgs.filter(a => a !== 'firefox' && a !== 'chrome');
const doIcons   = !taskArgs.length || taskArgs.includes('icons');
const doPackage = !taskArgs.length || taskArgs.includes('package');

const OUT_FILE  = TARGET === 'chrome'
  ? path.join(DIST, `devtools-companion-angular-chrome-${VERSION}.zip`)
  : path.join(DIST, `devtools-companion-angular-${VERSION}.xpi`);

// ── PNG generator (pure Node.js, no deps) ─────────────────────────────────

/**
 * Creates a PNG buffer for a given size with the DevTools Companion for Angular logo.
 * The logo: dark navy background + Angular-style red triangle.
 */
function createIconPNG(size) {
  const pixels = new Uint8Array(size * size * 4); // RGBA

  // Background colour: #1A1A2E
  const BG  = [0x1A, 0x1A, 0x2E, 0xFF];
  // Angular red: #DD0031
  const RED = [0xDD, 0x00, 0x31, 0xFF];
  // Inner cutout (same as BG): #1A1A2E
  const CUT = [0x1A, 0x1A, 0x2E, 0xFF];

  // Fill background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4 + 0] = BG[0];
    pixels[i * 4 + 1] = BG[1];
    pixels[i * 4 + 2] = BG[2];
    pixels[i * 4 + 3] = BG[3];
  }

  // Rounded-rect clip (corner radius ~18%)
  const cr = Math.round(size * 0.18);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRoundRect(x, y, size, cr)) {
        setPixel(pixels, size, x, y, [0, 0, 0, 0]); // transparent outside
      }
    }
  }

  const cx = size / 2, cy = size / 2;
  const r  = size * 0.36;   // outer triangle radius
  const ri = r * 0.54;      // inner cutout radius

  // Draw outer red triangle
  fillTriangle(pixels, size, cx, cy, r, RED);
  // Cut inner triangle (logo silhouette)
  fillTriangleCutout(pixels, size, cx, cy, ri, CUT);

  return encodePNG(pixels, size, size);
}

function inRoundRect(x, y, size, cr) {
  if (x >= cr && x < size - cr) return true;
  if (y >= cr && y < size - cr) return true;
  // Corners
  const corners = [
    [cr, cr], [size - cr - 1, cr],
    [cr, size - cr - 1], [size - cr - 1, size - cr - 1],
  ];
  for (const [cx, cy] of corners) {
    if (Math.hypot(x - cx, y - cy) <= cr) return true;
  }
  return false;
}

function setPixel(pixels, size, x, y, rgba) {
  const i = (y * size + x) * 4;
  pixels[i]   = rgba[0];
  pixels[i+1] = rgba[1];
  pixels[i+2] = rgba[2];
  pixels[i+3] = rgba[3];
}

/**
 * Fill pixels inside an equilateral triangle centred at (cx, cy)
 * pointing upward, circumradius r.
 */
function fillTriangle(pixels, size, cx, cy, r, color) {
  const x0 = cx,         y0 = cy - r;
  const x1 = cx + r * Math.sin(Math.PI * 2 / 3), y1 = cy - r * Math.cos(Math.PI * 2 / 3);
  const x2 = cx + r * Math.sin(Math.PI * 4 / 3), y2 = cy - r * Math.cos(Math.PI * 4 / 3);

  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)));

  for (let y = minY; y <= maxY; y++) {
    for (let x = 0; x < size; x++) {
      if (pointInTriangle(x + 0.5, y + 0.5, x0, y0, x1, y1, x2, y2)) {
        setPixel(pixels, size, x, y, color);
      }
    }
  }
}

function fillTriangleCutout(pixels, size, cx, cy, ri, color) {
  // Inner triangle is shifted down slightly to create the Angular logo look
  const offset = ri * 0.15;
  const x0 = cx,         y0 = cy - ri * 0.5 + offset;
  const x1 = cx + ri * 0.87, y1 = cy + ri * 0.5 + offset;
  const x2 = cx - ri * 0.87, y2 = cy + ri * 0.5 + offset;

  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)));

  for (let y = minY; y <= maxY; y++) {
    for (let x = 0; x < size; x++) {
      if (pointInTriangle(x + 0.5, y + 0.5, x0, y0, x1, y1, x2, y2)) {
        setPixel(pixels, size, x, y, color);
      }
    }
  }
}

function sign(p1x, p1y, p2x, p2y, p3x, p3y) {
  return (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
}

function pointInTriangle(px, py, x0, y0, x1, y1, x2, y2) {
  const d1 = sign(px, py, x0, y0, x1, y1);
  const d2 = sign(px, py, x1, y1, x2, y2);
  const d3 = sign(px, py, x2, y2, x0, y0);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

// ── PNG encoder ────────────────────────────────────────────────────────────

function encodePNG(pixels, width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 6;  // colour type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // Raw image data with filter byte 0 (None) per scanline
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (1 + width * 4) + 1 + x * 4;
      raw[dst]   = pixels[src];
      raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2];
      raw[dst+3] = pixels[src+3];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crcInput = Buffer.concat([typeBytes, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcInput));
    return Buffer.concat([len, typeBytes, data, crc]);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// CRC-32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── XPI packager ───────────────────────────────────────────────────────────

// ── Chrome manifest patcher ────────────────────────────────────────────────

function buildChromeManifest(original) {
  const m = JSON.parse(JSON.stringify(original)); // deep clone

  // Firefox-only key — Chrome rejects it
  delete m.browser_specific_settings;

  // MV3 Chrome requires service_worker instead of scripts[]
  if (m.background && Array.isArray(m.background.scripts)) {
    m.background = { service_worker: m.background.scripts[0] };
  }

  // Remove 'unsafe-inline' — blocked by Chrome's extension CSP
  if (m.content_security_policy?.extension_pages) {
    m.content_security_policy.extension_pages =
      m.content_security_policy.extension_pages
        .replace(/'unsafe-inline'\s*/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
  }

  // Prepend browser-shim to content scripts so inspector.js sees `browser`
  if (Array.isArray(m.content_scripts?.[0]?.js)) {
    m.content_scripts[0].js = ['compat/browser-shim.js', ...m.content_scripts[0].js];
  }

  return m;
}

// ── File excludes ──────────────────────────────────────────────────────────

const EXCLUDE = new Set([
  'build.js', 'package.json', 'package-lock.json',
  '.gitignore', '.git', 'dist', '.claude',
  'node_modules', 'icons/generate-icons.html',
]);

function shouldInclude(relPath) {
  const parts = relPath.split(path.sep);
  return !parts.some(p => EXCLUDE.has(p));
}

function collectFiles(dir, base = dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath  = path.relative(base, fullPath);
    if (!shouldInclude(relPath)) continue;
    if (entry.isDirectory()) {
      result.push(...collectFiles(fullPath, base));
    } else {
      result.push({ fullPath, relPath: relPath.replace(/\\/g, '/') });
    }
  }
  return result;
}

/**
 * Minimal ZIP writer (no compression — browser extensions allow stored files).
 * XPI = ZIP, so this is all we need.
 */
function writeZIP(entries, outPath) {
  const parts       = [];
  const centralDir  = [];
  let   offset      = 0;

  for (const { relPath, data } of entries) {
    const nameBytes = Buffer.from(relPath, 'utf8');
    const crc       = crc32(data);
    const size      = data.length;

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034B50,  0); // signature
    local.writeUInt16LE(20,          4); // version needed
    local.writeUInt16LE(0x0800,      6); // flags (UTF-8)
    local.writeUInt16LE(0,           8); // compression: stored
    local.writeUInt16LE(0,          10); // mod time
    local.writeUInt16LE(0,          12); // mod date
    local.writeUInt32LE(crc,        14); // CRC-32
    local.writeUInt32LE(size,       18); // compressed size
    local.writeUInt32LE(size,       22); // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0,          28); // extra field length
    nameBytes.copy(local, 30);

    parts.push(local);
    parts.push(data);

    // Central directory entry
    const cd = Buffer.alloc(46 + nameBytes.length);
    cd.writeUInt32LE(0x02014B50,  0); // signature
    cd.writeUInt16LE(20,          4); // version made by
    cd.writeUInt16LE(20,          6); // version needed
    cd.writeUInt16LE(0x0800,      8); // flags
    cd.writeUInt16LE(0,          10); // compression
    cd.writeUInt16LE(0,          12); // mod time
    cd.writeUInt16LE(0,          14); // mod date
    cd.writeUInt32LE(crc,        16); // CRC-32
    cd.writeUInt32LE(size,       20); // compressed size
    cd.writeUInt32LE(size,       24); // uncompressed size
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0,          30); // extra
    cd.writeUInt16LE(0,          32); // comment
    cd.writeUInt16LE(0,          34); // disk start
    cd.writeUInt16LE(0,          36); // internal attr
    cd.writeUInt32LE(0,          38); // external attr
    cd.writeUInt32LE(offset,     42); // local header offset
    nameBytes.copy(cd, 46);
    centralDir.push(cd);

    offset += local.length + data.length;
  }

  const cdBuf     = Buffer.concat(centralDir);
  const cdOffset  = offset;
  const cdSize    = cdBuf.length;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054B50,  0);
  eocd.writeUInt16LE(0,           4); // disk number
  eocd.writeUInt16LE(0,           6); // disk with CD start
  eocd.writeUInt16LE(centralDir.length, 8);
  eocd.writeUInt16LE(centralDir.length, 10);
  eocd.writeUInt32LE(cdSize,     12);
  eocd.writeUInt32LE(cdOffset,   16);
  eocd.writeUInt16LE(0,          20); // comment length

  const buf = Buffer.concat([...parts, cdBuf, eocd]);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
}

// ── Main ───────────────────────────────────────────────────────────────────

function step(msg) { process.stdout.write(`\n  ${msg}`); }
function ok()      { process.stdout.write(' ✓'); }

(function main() {
  const label = TARGET === 'chrome' ? 'Chrome' : 'Firefox';
  const title = `DevTools Companion for Angular — ${label}`;
  const bar = '═'.repeat(title.length + 4);
  console.log(`\n╔${bar}╗`);
  console.log(`║  ${title}  ║`);
  console.log(`╚${bar}╝`);

  if (doIcons) {
    step('Generating icon-48.png');
    fs.writeFileSync(path.join(ROOT, 'icons', 'icon-48.png'), createIconPNG(48));
    ok();

    step('Generating icon-96.png');
    fs.writeFileSync(path.join(ROOT, 'icons', 'icon-96.png'), createIconPNG(96));
    ok();
  }

  if (doPackage) {
    step('Collecting extension files');
    const files = collectFiles(ROOT);
    ok();

    // Build in-memory entries, applying Chrome patches where needed
    const shimData = TARGET === 'chrome'
      ? fs.readFileSync(path.join(ROOT, 'compat', 'browser-shim.js'))
      : null;

    // Files that need the shim prepended in the Chrome service-worker/panel context
    const PREPEND_SHIM = new Set([
      'background/background.js',
      'devtools/panel.js',
    ]);

    const entries = files.map(({ fullPath, relPath }) => {
      let data = fs.readFileSync(fullPath);

      if (TARGET === 'chrome') {
        if (relPath === 'manifest.json') {
          // Replace with Chrome-patched manifest
          const original = JSON.parse(data.toString('utf8'));
          data = Buffer.from(JSON.stringify(buildChromeManifest(original), null, 2), 'utf8');
        } else if (PREPEND_SHIM.has(relPath)) {
          // Prepend shim so `browser` is defined before any usage
          data = Buffer.concat([shimData, Buffer.from('\n'), data]);
        }
      }

      return { relPath, data };
    });

    const outBase = path.basename(OUT_FILE);
    step(`Packaging ${entries.length} files → dist/${outBase}`);
    writeZIP(entries, OUT_FILE);
    const sizeKB = Math.round(fs.statSync(OUT_FILE).size / 1024);
    ok();
    console.log(`\n  Size: ${sizeKB} KB`);

    // SHA256 (useful for AMO / Chrome Web Store submissions)
    const sha      = crypto.createHash('sha256').update(fs.readFileSync(OUT_FILE)).digest('hex');
    const hashName = TARGET === 'chrome'
      ? `devtools-companion-angular-chrome.zip.sha256`
      : `devtools-companion-angular.xpi.sha256`;
    fs.writeFileSync(path.join(DIST, hashName), `${sha}  ${outBase}\n`);
    console.log(`  SHA256: ${sha.slice(0, 16)}…`);
  }

  console.log('\n  Done.\n');
})();
