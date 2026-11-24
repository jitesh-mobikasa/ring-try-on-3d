/* Browser tests for the try-on viewer, the theme scripts and the ring configurator.
   Starts a static server on the project root (port 8811), runs every *.test.mjs here in a real Chromium,
   prints PASS / FAIL lines and exits 1 if anything failed. Screenshots + downloads go to tests/e2e/output/.

   npm run test:e2e                      → all tests
   npm run test:e2e -- studio            → only files whose name contains "studio"
   CHROME=/path/to/chrome npm run test:e2e   → use a specific Chromium (default: Playwright's) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PORT = 8811;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(PORT, r));
fs.mkdirSync(path.join(HERE, 'output'), { recursive: true });

const only = process.argv[2];
const files = fs.readdirSync(HERE).filter(f => f.endsWith('.test.mjs') && (!only || f.includes(only))).sort();
let pass = 0, fail = 0, crashed = [];
for (const f of files) {
  console.log(`\n▶ ${f}`);
  const out = await new Promise(resolve => {
    let buf = '';
    const p = spawn(process.execPath, [path.join(HERE, f)], { env: process.env });
    p.stdout.on('data', d => { buf += d; process.stdout.write(d); });
    p.stderr.on('data', d => { buf += d; process.stderr.write(d); });
    p.on('close', code => resolve({ buf, code }));
  });
  pass += (out.buf.match(/^PASS/gm) || []).length;
  fail += (out.buf.match(/^FAIL/gm) || []).length;
  if (out.code) crashed.push(f);
}
server.close();
console.log(`\n${pass} passed · ${fail} failed${crashed.length ? ` · crashed: ${crashed.join(', ')}` : ''}`);
process.exit(fail || crashed.length ? 1 : 0);
