'use strict';
/*
 * Builds the company profile PDF from brochure/brochure.html using headless Edge or Chrome.
 *   npm run brochure            -> assets/Motamax-Company-Profile.pdf
 *   BROWSER=/path/to/chrome npm run brochure
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'brochure', 'brochure.html');
const OUT = path.join(ROOT, 'assets', 'Motamax-Company-Profile.pdf');

const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) { console.error('No Edge/Chrome found. Set BROWSER=/path/to/chrome'); process.exit(1); }

const before = fs.existsSync(OUT) ? fs.statSync(OUT).mtimeMs : 0;
const profile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mmx-pdf-'));
execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, '--allow-file-access-from-files',
  '--run-all-compositor-stages-before-draw', '--virtual-time-budget=15000',
  '--no-pdf-header-footer', `--print-to-pdf=${OUT}`, pathToFileURL(SRC).href,
], { stdio: 'inherit' });

// On Windows the Edge launcher can return before the PDF is written: wait until it appears and stops growing.
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
let last = -1;
for (let i = 0; i < 120; i++) {
  if (fs.existsSync(OUT) && fs.statSync(OUT).mtimeMs > before) {
    const size = fs.statSync(OUT).size;
    if (size > 0 && size === last) break;
    last = size;
  }
  sleep(500);
}
if (!fs.existsSync(OUT) || fs.statSync(OUT).mtimeMs <= before) { console.error('PDF was not written.'); process.exit(1); }
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* browser may still hold the profile briefly */ }
console.log('Brochure written to', path.relative(ROOT, OUT), `(${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
