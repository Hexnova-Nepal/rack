// CI check on real Windows: the built Rack opens its window, the interface loads, and the
// native Windows helper works inside the packaged app.
// Start Rack with --remote-debugging-port=9333 first, then: node scripts/ci-check-ui.mjs out.png
// Needs Node 22 or later (built-in fetch and WebSocket), nothing else.
import fs from 'node:fs';

const PORT = process.env.RACK_DEBUG_PORT || 9333;
const OUT = process.argv[2] || 'rack-window.png';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error(msg); process.exit(1); };

let target;
for (let i = 0; i < 90 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page' && /renderer\/index\.html/.test(t.url));
  } catch { /* not up yet */ }
  if (!target) await sleep(1000);
}
if (!target) fail('Rack’s window never loaded its page');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not connect to the page')); });
let seq = 0;
const waiting = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable');

let ui;
for (let i = 0; i < 30; i++) {
  ui = await run(`({ bridge: typeof window.rack, rail: document.querySelectorAll('#rail button').length, heading: (document.querySelector('#view h1') || {}).textContent || '', font: [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Geist' && f.status === 'loaded') })`);
  if (ui.rail && ui.heading) break;
  await sleep(1000);
}
console.log('interface:', JSON.stringify(ui));
const app = await run('window.rack.state().then((s) => s.app)');
console.log('app:', JSON.stringify(app));

const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
ws.close();

if (ui.bridge !== 'object') fail('The bridge to the main process is missing');
if (!ui.rail || !ui.heading) fail('The interface did not draw');
if (!ui.font) fail('The bundled fonts did not load');
if (!app.packaged) fail('Expected the packaged app');
if (app.windows && !app.native) fail(`The native Windows helper did not load: ${app.nativeError}`);
if (errors.length) fail('Errors in the page:\n' + errors.join('\n'));
console.log('Rack’s window and interface work');
