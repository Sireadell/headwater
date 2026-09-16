// Closes the last open piece of phase 4: a real page, not just a CLI
// script, showing Headwater's own track record. Static, generated from
// the current data/predictions.json, works by opening the file directly,
// no server needed. Run after scripts/demo.mjs finds something new:
//
//   node scripts/generateScoreboardPage.mjs
//
// Regenerates docs/scoreboard.html from whatever is in the log right now.

import { getScoreboard } from '../src/scoreboard.js';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(__dirname, '..', 'docs', 'scoreboard.html');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(status) {
  const colors = {
    UNVALIDATED: '#8a6d00; background:#fff7cc',
    CONFIRMED: '#0a6b2d; background:#d9f7e3',
    REFUTED: '#8a1c1c; background:#fde2e2',
  };
  return `<span style="color:${colors[status] ?? '#333'}; padding:2px 8px; border-radius:4px; font-size:13px; font-weight:600;">${status}</span>`;
}

function renderRow(p) {
  const validation = p.status === 'UNVALIDATED'
    ? `<div class="meta">Why still unvalidated: ${escapeHtml(p.reason)}</div>`
    : `<div class="meta">Validated ${escapeHtml(p.validatedAt)} — ${escapeHtml(p.validationNote ?? '')}</div>`;
  return `
    <tr>
      <td>${statusBadge(p.status)}</td>
      <td>
        <div class="claim">${escapeHtml(p.claim)}</div>
        <div class="meta">Signal: ${escapeHtml(p.signalCode)} &middot; Logged ${escapeHtml(p.madeAt)}</div>
        ${validation}
      </td>
    </tr>`;
}

const board = await getScoreboard();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Headwater scoreboard</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
  h1 { margin-bottom: 4px; }
  .subtitle { color: #666; margin-bottom: 24px; }
  .totals { display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
  .stat { border: 1px solid #ddd; border-radius: 8px; padding: 12px 18px; }
  .stat .n { font-size: 24px; font-weight: 700; }
  .stat .label { font-size: 13px; color: #666; }
  table { width: 100%; border-collapse: collapse; }
  td { border-top: 1px solid #eee; padding: 12px 8px; vertical-align: top; }
  td:first-child { width: 130px; white-space: nowrap; }
  .claim { margin-bottom: 4px; }
  .meta { font-size: 13px; color: #777; }
  .honest-read { margin-top: 32px; padding: 16px; background: #f7f7f7; border-radius: 8px; font-size: 14px; color: #444; }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #eee; }
    .stat { border-color: #333; }
    td { border-top-color: #2a2a2a; }
    .honest-read { background: #1a1a1a; color: #ccc; }
  }
</style>
</head>
<body>
  <h1>Headwater scoreboard</h1>
  <div class="subtitle">Every claim this tool has made about ERC-8004 agent reputation on Monad, checked against reality where that's possible.</div>

  <div class="totals">
    <div class="stat"><div class="n">${board.total}</div><div class="label">Total claims</div></div>
    <div class="stat"><div class="n">${board.confirmed}</div><div class="label">Confirmed</div></div>
    <div class="stat"><div class="n">${board.refuted}</div><div class="label">Refuted</div></div>
    <div class="stat"><div class="n">${board.unvalidated}</div><div class="label">Unvalidated</div></div>
  </div>

  ${board.total === 0
    ? '<p>Nothing logged yet. Run <code>node scripts/demo.mjs</code> first, then regenerate this page.</p>'
    : `<table><tbody>${board.predictions.map(renderRow).join('')}</tbody></table>`}

  <div class="honest-read">
    Honest read: this product is new, so most or all claims here are UNVALIDATED,
    not because they're weak, but because nothing external exists yet to check
    them against. That state is shown on purpose instead of hidden. As real
    outcomes become checkable, those claims move to CONFIRMED or REFUTED here,
    not silently dropped. This page is generated from
    <code>data/predictions.json</code> by <code>scripts/generateScoreboardPage.mjs</code>,
    regenerate it after running <code>scripts/demo.mjs</code> again.
  </div>
</body>
</html>
`;

await mkdir(path.dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, html, 'utf8');
console.log(`Wrote ${OUT_FILE}`);
