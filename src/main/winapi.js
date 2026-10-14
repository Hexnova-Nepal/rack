// Direct Windows calls, so Rack never has to start PowerShell in the background.
// - running(): the full path of every running program, in a few milliseconds
// - open(file, args, cwd, admin): starts a program the way Explorer does, so Windows can ask for
//   administrator permission when the program needs it
// If the native helper can't load on some PC, both fall back to PowerShell: slower, but games still
// start and get timed. RACK_NO_NATIVE=1 forces the fallback (for testing, or as an escape hatch).
'use strict';
const { execFile } = require('child_process');

let api;
function load() {
  if (api !== undefined) return api;
  api = null;
  if (process.platform !== 'win32') return api;
  if (process.env.RACK_NO_NATIVE === '1') { module.exports.loadError = 'turned off with RACK_NO_NATIVE'; return api; }
  try {
    const koffi = require('koffi');
    const k32 = koffi.load('kernel32.dll');
    const sh32 = koffi.load('shell32.dll');
    const HANDLE = koffi.pointer('RACK_HANDLE', koffi.opaque());
    api = {
      koffi,
      EnumProcesses: k32.func('bool __stdcall K32EnumProcesses(_Out_ uint32_t *pids, uint32_t cb, _Out_ uint32_t *needed)'),
      OpenProcess: k32.func('RACK_HANDLE __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
      QueryName: k32.func('bool __stdcall QueryFullProcessImageNameW(RACK_HANDLE h, uint32_t flags, _Out_ uint8_t *buf, _Inout_ uint32_t *size)'),
      CloseHandle: k32.func('bool __stdcall CloseHandle(RACK_HANDLE h)'),
      ShellExecute: sh32.func('intptr_t __stdcall ShellExecuteW(void *hwnd, const char16_t *op, const char16_t *file, const char16_t *params, const char16_t *dir, int show)'),
      HANDLE,
    };
  } catch (e) {
    api = null;
    module.exports.loadError = e.message;
  }
  return api;
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

// fallback: a snapshot from PowerShell, refreshed in the background on each call
let snap = [], refreshing = false;
function refreshSnapshot() {
  if (refreshing) return;
  refreshing = true;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Process | ForEach-Object { $_.Path } | Where-Object { $_ }'],
    { windowsHide: true, maxBuffer: 16 << 20, timeout: 30000 }, (err, out) => {
      refreshing = false;
      if (!err) snap = String(out).split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    });
}

/** Paths of every running program this user can see, lower-cased. [] when not on Windows. */
function running() {
  const a = load();
  if (!a) {
    if (process.platform !== 'win32') return [];
    refreshSnapshot();
    return snap;
  }
  let cap = 2048, ids, count;
  for (;;) {
    ids = new Uint32Array(cap);
    const needed = [0];
    if (!a.EnumProcesses(ids, ids.byteLength, needed)) return [];
    count = needed[0] / 4;
    if (count < cap) break;
    cap *= 2;
  }
  const out = [];
  const buf = Buffer.alloc(32768 * 2);
  for (let i = 0; i < count; i++) {
    const pid = ids[i];
    if (!pid) continue;
    const h = a.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if (!h) continue;
    try {
      const size = [32768];
      if (a.QueryName(h, 0, buf, size)) out.push(buf.toString('utf16le', 0, size[0] * 2).toLowerCase());
    } finally { a.CloseHandle(h); }
  }
  return out;
}

const quoteArg = (s) => (s === '' ? '""' : /[\s"]/.test(s) ? `"${String(s).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"` : s);

/**
 * Starts a program, a shortcut or a link through Windows. Resolves true when Windows accepted it.
 * args may be a string (passed as is) or an array (quoted for you).
 */
function open(file, args = '', cwd = '', admin = false) {
  const a = load();
  const params = Array.isArray(args) ? args.map(quoteArg).join(' ') : String(args || '');
  if (!a) return process.platform === 'win32' ? openFallback(file, params, cwd, admin) : Promise.resolve(false);
  return new Promise((resolve) => {
    a.ShellExecute.async(null, admin ? 'runas' : 'open', file, params || null, cwd || null, 1, (err, res) => {
      resolve(!err && Number(res) > 32);
    });
  });
}

// fallback: Start-Process also goes through ShellExecute; the values travel in environment
// variables so nothing in a path or argument can break the command
function openFallback(file, params, cwd, admin) {
  const script = "$a = @{ FilePath = $env:RACK_FILE }; if ($env:RACK_ARGS) { $a.ArgumentList = $env:RACK_ARGS }; if ($env:RACK_CWD) { $a.WorkingDirectory = $env:RACK_CWD }; if ($env:RACK_ADMIN -eq '1') { $a.Verb = 'RunAs' }; try { Start-Process @a -ErrorAction Stop; exit 0 } catch { exit 1 }";
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 120000, env: { ...process.env, RACK_FILE: String(file), RACK_ARGS: params || '', RACK_CWD: cwd || '', RACK_ADMIN: admin ? '1' : '0' } },
      (err) => resolve(!err));
  });
}

module.exports = { running, open, available: () => !!load(), quoteArg, loadError: null };
