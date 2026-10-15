// Rack's tests. Run with `npm test`. They run on Linux and on Windows (GitHub Actions runs them on windows-latest).
// Fixture games are built from small real Windows programs in test/fixtures/bin (see test/fixtures/README.md).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const req = (m) => require(path.join(ROOT, 'src', 'main', m));
const BIN = path.join(__dirname, 'fixtures', 'bin');
const isWin = process.platform === 'win32';

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/* ---------- helpers ---------- */

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'rack-test-'));
const w = (p, s = 'x') => { const f = path.join(T, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };
const put = (p, exe) => { const f = path.join(T, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.copyFileSync(path.join(BIN, exe + '.exe'), f); return f; };

/** A fake game drive with real programs in it. */
function buildDrive() {
  const D = 'drive/';
  w(D + 'SteamLibrary/steamapps/appmanifest_1145360.acf', '"AppState" { "appid" "1145360" "name" "Hades" "StateFlags" "4" "installdir" "Hades" }');
  w(D + 'SteamLibrary/steamapps/appmanifest_228980.acf', '"AppState" { "appid" "228980" "name" "Steamworks Common Redistributables" "StateFlags" "4" "installdir" "Steamworks Shared" }');
  put(D + 'SteamLibrary/steamapps/common/Hades/x64/Hades.exe', 'game_gfx');
  put(D + 'SteamLibrary/steamapps/common/Hades/x64Vk/Hades.exe', 'game_gfx');
  w(D + 'SteamLibrary/steamapps/common/Hades/x64/steam_api64.dll');
  put(D + 'SteamLibrary/steamapps/common/Steamworks Shared/_CommonRedist/vcredist/2019/VC_redist.x64.exe', 'setup_gui');
  put(D + 'SteamLibrary/steamapps/common/Orphan Game/Orphan.exe', 'game_gfx');
  put(D + 'Games/Celeste/Celeste.exe', 'game_gfx'); w(D + 'Games/Celeste/fmod.dll'); w(D + 'Games/Celeste/fmodstudio.dll'); fs.mkdirSync(path.join(T, D, 'Games/Celeste/Content'), { recursive: true });
  put(D + 'Games/Hollow Knight/hollow_knight.exe', 'game_unity'); w(D + 'Games/Hollow Knight/UnityPlayer.dll'); put(D + 'Games/Hollow Knight/UnityCrashHandler64.exe', 'tool_console');
  w(D + 'Games/Hollow Knight/hollow_knight_Data/app.info', 'Team Cherry\nHollow Knight');
  put(D + 'Games/Witcher 3 GOTY/bin/x64/witcher3.exe', 'game_gfx'); put(D + 'Games/Witcher 3 GOTY/unins000.exe', 'setup_gui');
  w(D + 'Games/Witcher 3 GOTY/goggame-1495134320.info', JSON.stringify({ gameId: '1495134320', name: 'The Witcher 3: Wild Hunt - Game of the Year Edition', playTasks: [{ isPrimary: true, type: 'FileTask', path: 'bin\\x64\\witcher3.exe', workingDir: 'bin\\x64', category: 'game' }] }));
  put(D + 'Games/Witcher 3 GOTY/redkit/bin/redkit.exe', 'tool_console');
  put(D + 'Games/Ashen Road/AshenRoad.exe', 'ue_boot'); put(D + 'Games/Ashen Road/AshenRoad/Binaries/Win64/AshenRoad-Win64-Shipping.exe', 'game_gfx');
  fs.mkdirSync(path.join(T, D, 'Games/Ashen Road/Engine/Binaries/ThirdParty'), { recursive: true }); put(D + 'Games/Ashen Road/Engine/Extras/Redist/en-us/UE4PrereqSetup_x64.exe', 'setup_gui');
  w(D + 'Games/Ashen Road/AshenRoad/Content/Paks/AshenRoad-WindowsNoEditor.pak');
  put(D + 'Games/Ren Game/RenGame.exe', 'game_plain'); put(D + 'Games/Ren Game/RenGame-32.exe', 'game_plain');
  for (const d of ['renpy', 'game', 'lib/py3-windows-x86_64']) fs.mkdirSync(path.join(T, D, 'Games/Ren Game', d), { recursive: true });
  put(D + 'Games/Ren Game/lib/py3-windows-x86_64/python.exe', 'tool_console');
  put(D + 'Games/RPG Thing/Game.exe', 'game_plain'); w(D + 'Games/RPG Thing/nw.dll'); fs.mkdirSync(path.join(T, D, 'Games/RPG Thing/www/js'), { recursive: true });
  put(D + 'Games/Godot Gem/gem.exe', 'game_plain'); w(D + 'Games/Godot Gem/gem.pck');
  put(D + 'Games/OldGame/OLDGAME.EXE', 'game_ddraw'); fs.mkdirSync(path.join(T, D, 'Games/OldGame/DATA'), { recursive: true });
  put(D + 'Games/CaveStory_v1.2_repack/Doukutsu.exe', 'game_gl');
  put(D + 'Epic Games/SomeEpic/Binaries/Win64/SomeEpic.exe', 'game_gfx'); w(D + 'Epic Games/SomeEpic/.egstore/ABCDEF.mancpn', JSON.stringify({ FormatVersion: 0, AppName: 'Wombat', CatalogItemId: 'cid123', CatalogNamespace: 'ns456' }));
  put(D + 'XboxGames/Forza Thing/Content/ForzaThing.exe', 'game_gfx'); put(D + 'XboxGames/Forza Thing/Content/gamelaunchhelper.exe', 'game_plain');
  w(D + 'XboxGames/Forza Thing/Content/MicrosoftGame.config', '<Game><Identity Name="Microsoft.ForzaThing"/><ExecutableList><Executable Name="gamelaunchhelper.exe" Id="Game"/></ExecutableList><ShellVisuals DefaultDisplayName="Forza Thing"/></Game>');
  put(D + 'Program Files/7-Zip/7zFM.exe', 'app_7z'); put(D + 'Program Files/7-Zip/7z.exe', 'tool_console');
  put(D + 'Program Files/VideoLAN/VLC/vlc.exe', 'app_vlc'); w(D + 'Program Files/VideoLAN/VLC/libvlc.dll');
  put(D + 'Program Files/Chatty/Chatty.exe', 'game_plain'); w(D + 'Program Files/Chatty/chrome_100_percent.pak'); w(D + 'Program Files/Chatty/LICENSES.chromium.html'); w(D + 'Program Files/Chatty/resources/app.asar');
  put(D + 'Program Files (x86)/Steam/steam.exe', 'game_plain'); fs.mkdirSync(path.join(T, D, 'Program Files (x86)/Steam/steamapps'), { recursive: true });
  put(D + 'Emulators/Dolphin/Dolphin.exe', 'game_gfx');
  put(D + 'Tools/MyTool/tool.exe', 'tool_console');
  put(D + 'Downloads/setup_somegame.exe', 'setup_gui');
  put(D + 'Windows/System32/notepad.exe', 'game_plain');
  put(D + '$Recycle.Bin/S-1-5/deleted.exe', 'game_gfx');
  return path.join(T, 'drive');
}

/* ---------- exe reader ---------- */

test('pe: reads imports, windowed/console and version info', async () => {
  const pe = req('pe.js');
  const g = await pe.info(path.join(BIN, 'game_gfx.exe'));
  assert.ok(g.gui && !g.console && g.imports.has('d3d11.dll') && g.imports.has('xinput1_3.dll'));
  const u = await pe.info(path.join(BIN, 'game_unity.exe'));
  assert.strictEqual(u.version.ProductName, 'Hollow Knight');
  assert.strictEqual(u.version.CompanyName, 'Team Cherry');
  const c = await pe.info(path.join(BIN, 'tool_console.exe'));
  assert.ok(c.console && !c.gui);
  assert.strictEqual(await pe.info(__filename), null);
});

/* ---------- folder and drive scanning ---------- */

test('detect: a whole drive', async () => {
  const detect = req('detect.js');
  const D = buildDrive();
  const r = await detect.scan(D, { steamInstalled: true, notGames: (id) => id === '228980' });
  const by = (n) => r.candidates.find((c) => c.name === n);
  const must = (n, status, extra = {}) => {
    const c = by(n);
    assert.ok(c, `missing ${n}; got ${r.candidates.map((x) => x.name).join(', ')}`);
    assert.strictEqual(c.status, status, `${n} is ${c.status}`);
    for (const [k, v] of Object.entries(extra)) assert.ok(typeof v === 'function' ? v(c[k]) : c[k] === v, `${n}.${k} = ${c[k]}`);
  };
  must('Hades', 'likely', { source: 'steam', sourceId: '1145360' });
  must('Celeste', 'likely', { exe: (e) => e.endsWith('Celeste.exe') });
  must('Hollow Knight', 'likely', { exe: (e) => e.endsWith('hollow_knight.exe'), reason: 'Unity game' });
  must('The Witcher 3: Wild Hunt - Game of the Year Edition', 'likely', { source: 'gog', exe: (e) => e.endsWith(path.join('bin', 'x64', 'witcher3.exe')) });
  must('Ashen Road', 'likely', { exe: (e) => e.endsWith(path.join('Ashen Road', 'AshenRoad.exe')) });
  must('Ren Game', 'likely', { exe: (e) => e.endsWith('RenGame.exe') });
  must('RPG Thing', 'likely');
  must('Godot Gem', 'likely');
  must('Old Game', 'likely');
  must('Some Epic', 'likely', { source: 'epic' });
  must('Forza Thing', 'likely', { exe: (e) => e.endsWith('gamelaunchhelper.exe') });
  must('Cave Story', 'unsure');
  assert.ok(!r.candidates.some((c) => /Steamworks/.test(c.name)));
  assert.ok(!r.candidates.some((c) => /notepad|deleted/i.test(c.exe)), 'Windows and Recycle Bin are skipped');
  for (const n of ['7-Zip', 'VLC', 'Chatty', 'steam', 'Dolphin']) { const c = r.candidates.find((x) => x.name.includes(n)); assert.ok(!c || c.status === 'skipped', `${n} should be skipped`); }
});

test('detect: one game folder on its own, and stopping', async () => {
  const detect = req('detect.js');
  const D = path.join(T, 'drive');
  const one = await detect.scan(path.join(D, 'Games', 'Witcher 3 GOTY'), {});
  assert.strictEqual(one.candidates.length, 1);
  const sig = { stopped: true };
  assert.ok((await detect.scan(D, { signal: sig })).stopped);
});

test('detect: names', () => {
  const { cleanName } = req('detect.js');
  assert.strictEqual(cleanName('CaveStory_v1.2_repack'), 'Cave Story');
  assert.strictEqual(cleanName('Hollow.Knight.v1.5.78'), 'Hollow Knight');
  assert.strictEqual(cleanName('Baldurs.Gate.3-RUNE'), 'Baldurs Gate 3');
  assert.strictEqual(cleanName('Portal 2'), 'Portal 2');
});

/* ---------- stores ---------- */

const REG = (key, vals) => `\r\n${key}\r\n` + Object.entries(vals).map(([k, v]) => `    ${k}    REG_SZ    ${v}`).join('\r\n') + '\r\n';

test('stores: Steam, Epic and GOG records', async () => {
  const scan = req('scan.js');
  w('Steam/steamapps/libraryfolders.vdf', `"libraryfolders" { "0" { "path" "${path.join(T, 'Steam').replace(/\\/g, '\\\\')}" } }`);
  w('Steam/steamapps/appmanifest_620.acf', '"AppState" { "appid" "620" "name" "Portal 2" "StateFlags" "4" "installdir" "Portal 2" }');
  w('Steam/userdata/1/config/localconfig.vdf', '"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps" { "620" { "LastPlayed" "1700000000" "Playtime" "754" } } } } } }');
  const st = await scan.scanSteam({ steamRoot: path.join(T, 'Steam') });
  assert.strictEqual(st.games[0].steamPlaytime, 754);
  w('Epic/Hades.item', JSON.stringify({ DisplayName: 'Hades', InstallLocation: 'C:\\Games\\Hades', LaunchExecutable: 'Hades.exe', CatalogNamespace: 'ns', CatalogItemId: 'cid', AppName: 'Hades', MainGameAppName: 'Hades', AppCategories: ['games'] }));
  assert.strictEqual((await scan.scanEpic({ epicDir: path.join(T, 'Epic') })).games[0].name, 'Hades');
  const gog = await scan.scanGog({ gogRegText: REG('HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1', { gameID: '1', gameName: 'Witcher 3', exe: 'C:\\GOG\\w3.exe', path: 'C:\\GOG', dependsOn: '' }) });
  assert.strictEqual(gog.games[0].name, 'Witcher 3');
  assert.ok(scan.steamNotGame('228980', '') && !scan.steamNotGame('620', 'Portal 2'));
});

test('stores: Ubisoft, EA, Battle.net, Xbox', async () => {
  const s = req('stores.js');
  const uninstall = [
    REG('HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Uplay Install 635', { DisplayName: "Assassin's Creed Odyssey", Publisher: 'Ubisoft' }),
    REG('HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{EA-1}', { DisplayName: 'Battlefield™ 2042', Publisher: 'Electronic Arts', InstallLocation: 'C:\\Program Files\\EA Games\\Battlefield 2042\\', UninstallString: '"C:\\x\\Cleanup.exe"' }),
    REG('HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\EA app', { DisplayName: 'EA app', Publisher: 'Electronic Arts' }),
    REG('HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Diablo IV', { DisplayName: 'Diablo IV', Publisher: 'Blizzard Entertainment', InstallLocation: 'C:\\Program Files (x86)\\Diablo IV', UninstallString: '"C:\\ProgramData\\Battle.net\\Agent\\Blizzard Uninstaller.exe" --lang=enUS --uid=fenris --displayname="Diablo IV"' }),
    REG('HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Battle.net', { DisplayName: 'Battle.net', Publisher: 'Blizzard Entertainment' }),
  ];
  const ubi = await s.scanUbisoft({ regText: REG('HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs\\635', { InstallDir: 'C:/Games/ACO/' }), uninstallTexts: uninstall, skipExists: true });
  assert.deepStrictEqual([ubi.games[0].name, ubi.games[0].uri], ["Assassin's Creed Odyssey", 'uplay://launch/635/0']);
  const ea = await s.scanEA({ uninstallTexts: uninstall, skipExists: true });
  assert.deepStrictEqual(ea.games.map((g) => g.name), ['Battlefield 2042']);
  const bn = await s.scanBattleNet({ uninstallTexts: uninstall, skipExists: true });
  assert.deepStrictEqual([bn.games[0].name, bn.games[0].uri], ['Diablo IV', 'battlenet://Fen']);
  const xb = await s.scanXbox({ json: JSON.stringify([{ name: 'Forza Horizon 5', family: 'Microsoft.624F8B84B80_8wekyb3d8bbwe', app: 'Game', dir: 'C:\\XboxGames\\Forza Horizon 5\\Content' }, { name: 'ms-resource:Title', family: 'X.Y_z', app: 'App', dir: 'C:\\XboxGames\\Cool Game\\Content' }]) });
  assert.strictEqual(xb.games[0].uri, 'shell:AppsFolder\\Microsoft.624F8B84B80_8wekyb3d8bbwe!Game');
  assert.strictEqual(xb.games[1].name, 'Cool Game', 'a game with no readable title is named after its XboxGames folder');
});

test('stores: Steam account and owned games', async () => {
  const s = req('stores.js');
  const acc = s.steamAccount('', '"users" { "76561198000000001" { "AccountName" "a" "PersonaName" "Old" "MostRecent" "0" "Timestamp" "1" } "76561198000000002" { "AccountName" "b" "PersonaName" "Me" "MostRecent" "1" "Timestamp" "2" } }');
  assert.strictEqual(acc.id, '76561198000000002');
  const owned = await s.steamOwned(async () => ({ response: { game_count: 1, games: [{ appid: 620, name: 'Portal 2', playtime_forever: 900, rtime_last_played: 1700000000 }] } }), 'KEY', '76561198000000002');
  assert.deepStrictEqual(owned[0], { appid: '620', name: 'Portal 2', minutes: 900, lastPlayed: 1700000000000 });
  await assert.rejects(() => s.steamOwned(async () => ({ response: {} }), 'KEY', '76561198000000002'), /Public/);
});

/* ---------- launching and timing ---------- */

test('launch: plans, and the tracker times games started anywhere', () => {
  const L = req('launch.js');
  assert.deepStrictEqual(L.splitArgs('-windowed -fps 120 "C:\\a b\\c.cfg" ""'), ['-windowed', '-fps', '120', 'C:\\a b\\c.cfg', '']);
  assert.strictEqual(L.plan({ notInstalled: true, source: 'steam', sourceId: '620' }).uri, 'steam://install/620');
  assert.strictEqual(L.plan({ exe: 'x.exe' }, null, { exe: 'C:\\g\\cfg.exe', args: '-x' }).file, 'C:\\g\\cfg.exe');
  const dir = path.join(T, 'tracked');
  const games = [
    { id: 'a', installDir: path.join(dir, 'Game A'), exe: path.join(dir, 'Game A', 'a.exe') },
    { id: 'lib', installDir: dir, exe: path.join(dir, 'launcher.exe') }, // a "game" folder that holds other games is ignored
  ];
  const folders = L.gameFolders(games);
  assert.ok(folders.every((f) => f.id === 'a'));
  let running = [];
  const events = [];
  const tr = new L.Tracker({ games: () => games, listRunning: () => running, onStart: (id, x) => events.push(['start', id, x.external]), onEnd: (id, s) => events.push(['end', id, s.external]), onGiveUp: () => {} });
  tr.schedule = () => {};
  running = [path.join(dir, 'game a', 'a.exe').toLowerCase()];
  tr.tick();
  running = [path.join(dir, 'game a', 'unitycrashhandler64.exe').toLowerCase()]; // a helper alone doesn't count
  tr.tick(); tr.tick();
  assert.deepStrictEqual(events, [['start', 'a', true], ['end', 'a', true]]);
  tr.stop('nothing');
});

/* ---------- uninstall safety ---------- */

test('uninstall: commands and folder safety', () => {
  const u = req('uninstall.js');
  assert.deepStrictEqual(u.splitCommand('MsiExec.exe /I{1234}'), { file: 'MsiExec.exe', args: '/X{1234}' });
  assert.deepStrictEqual(u.splitCommand('"C:\\G\\unins000.exe" /SILENT'), { file: 'C:\\G\\unins000.exe', args: '/SILENT' });
  assert.ok(u.unsafeFolder(path.parse(T).root));
  assert.ok(u.unsafeFolder(os.homedir()));
  assert.ok(u.unsafeFolder(path.join(T, 'Games')));
  assert.ok(u.unsafeFolder(path.join(T, 'x'), { otherGames: [{ exe: path.join(T, 'x', 'y', 'z.exe') }] }));
  assert.strictEqual(u.unsafeFolder(path.join(T, 'drive', 'Games', 'Celeste')), null);
});

/* ---------- backups and updates ---------- */

test('backups: library file round trip', () => {
  const b = req('backups.js');
  const data = path.join(T, 'data');
  fs.mkdirSync(path.join(data, 'covers'), { recursive: true });
  fs.writeFileSync(path.join(data, 'library.json'), JSON.stringify({ games: [{ id: '1', name: 'A', cover: 'c.jpg' }] }));
  fs.writeFileSync(path.join(data, 'covers', 'c.jpg'), Buffer.alloc(3000, 7));
  const file = path.join(T, 'lib.rackbackup');
  assert.strictEqual(b.exportLibrary(data, file).covers, 1);
  fs.rmSync(path.join(data, 'covers'), { recursive: true });
  const lib = b.importLibrary(data, file);
  assert.strictEqual(lib.games[0].name, 'A');
  assert.strictEqual(fs.statSync(path.join(data, 'covers', 'c.jpg')).size, 3000);
  assert.ok(fs.existsSync(path.join(data, 'library.before-import.json')));
  assert.throws(() => b.readBackup(path.join(data, 'library.json')));
});

test('updates: version comparison', () => {
  const { newer } = req('updates.js');
  assert.ok(newer('1.1.0', '1.0.9') && newer('v1.10.0', '1.9.9') && !newer('1.0.0', '1.0.0') && !newer('1.0.0', '1.0.1'));
  const { plain } = req('updates.js');
  assert.strictEqual(plain(new Error('HttpError: 404 \n"method: GET url: https://github.com/x/releases.atom"')), null);
  assert.match(plain(new Error('net::ERR_INTERNET_DISCONNECTED')), /No internet/);
  assert.match(plain(new Error('getaddrinfo ENOTFOUND github.com')), /No internet/);
  assert.match(plain(new Error('HttpError: 403 rate limit exceeded')), /busy/);
  assert.match(plain(new Error('sha512 checksum mismatch, expected abc')), /didn’t check out/);
  assert.ok(plain(new Error('Error: ' + 'x'.repeat(300))).length <= 140);
});

test('wallpaper: lists pictures, serves only those, parts of the day', () => {
  const { listPictures, slotOf, Pictures } = req('wallpaper.js');
  const W = 'walls/';
  w(W + 'b-sunset.jpg'); w(W + 'a-forest.PNG'); w(W + 'notes.txt'); w(W + 'sub/c-sea.webp'); w(W + 'sub/deeper/d.jpg'); w(W + 'sub/deeper/too/deep/e.jpg'); w(W + '.hidden/f.jpg');
  w('night/stars.jpg'); w('secret.jpg');
  const list = listPictures(path.join(T, 'walls')).map((f) => path.relative(path.join(T, 'walls'), f).replace(/\\/g, '/'));
  assert.deepStrictEqual(list, ['a-forest.PNG', 'b-sunset.jpg', 'sub/c-sea.webp', 'sub/deeper/d.jpg']);
  assert.deepStrictEqual(listPictures(''), []);
  assert.deepStrictEqual(listPictures(path.join(T, 'missing')), []);
  const pics = new Pictures();
  const out = pics.list({ folder: path.join(T, 'walls'), times: { night: path.join(T, 'night'), morning: '' } });
  assert.strictEqual(out.main.length, 4);
  assert.strictEqual(out.night.length, 1);
  assert.deepStrictEqual(out.morning, []);
  assert.ok(out.main.every((x) => /^rack:\/\/wall\/[0-9a-f]{20}$/.test(x.url) && !x.url.includes(T)), 'urls carry an id, never a path');
  assert.strictEqual(pics.file(out.main[0].id), path.join(T, 'walls', 'a-forest.PNG'));
  // nothing it didn't list: not another file, not a made-up id, not a path
  assert.strictEqual(pics.file(Pictures.id(path.join(T, 'secret.jpg'))), null);
  assert.strictEqual(pics.file('../secret.jpg'), null);
  assert.strictEqual(pics.file(''), null);
  // a listed file that disappears is no longer served
  const gone = out.main.find((x) => x.name === 'b-sunset.jpg');
  fs.unlinkSync(path.join(T, 'walls', 'b-sunset.jpg'));
  assert.strictEqual(pics.file(gone.id), null);
  const at = (h, m = 0) => slotOf(new Date(2026, 9, 15, h, m));
  assert.deepStrictEqual([at(4, 59), at(5), at(10, 59), at(11), at(16, 59), at(17), at(20, 59), at(21), at(0)], ['night', 'morning', 'morning', 'day', 'day', 'evening', 'evening', 'night', 'night']);
});

test('covers: wide art from Steam’s cache, Steam’s servers, then SteamGridDB', async () => {
  const { Covers } = req('covers.js');
  const heroDir = path.join(T, 'heroes'); fs.mkdirSync(heroDir, { recursive: true });
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000)]);
  const calls = [];
  const fakeFetch = (routes) => async (url) => {
    calls.push(url);
    for (const [re, r] of routes) if (re.test(url)) return typeof r === 'function' ? r(url) : r;
    return { ok: false, status: 404, headers: { get: () => '' } };
  };
  const img = { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => jpg };
  const json = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });
  const size = (w) => () => ({ width: w, height: Math.round(w / 3.1) });
  // 1. Steam's own cache: no download at all
  const root = path.join(T, 'steamroot'); w('steamroot/appcache/librarycache/620/x/library_hero.jpg', 'cachedhero');
  const scan = req('scan.js');
  let c = new Covers({ fetch: fakeFetch([]), coverDir: heroDir, heroDir, imageSize: size(1920) });
  let f = await c.hero({ id: 'g1', source: 'steam', sourceId: '620', name: 'Portal 2' }, { steamRoot: root, steamCachedHero: scan.steamCachedHero });
  assert.ok(f && fs.readFileSync(path.join(heroDir, f), 'utf8') === 'cachedhero');
  assert.strictEqual(calls.length, 0);
  // 2. Steam's servers for a Steam game not in the cache
  c = new Covers({ fetch: fakeFetch([[/steamstatic\.com\/steam\/apps\/400\/library_hero\.jpg/, img]]), coverDir: heroDir, heroDir, imageSize: size(1920) });
  f = await c.hero({ id: 'g2', source: 'steam', sourceId: '400', name: 'Portal' }, { steamRoot: root, steamCachedHero: scan.steamCachedHero });
  assert.ok(f && f.startsWith('g2-') && fs.existsSync(path.join(heroDir, f)));
  // too small to be wide art: refused
  c = new Covers({ fetch: fakeFetch([[/library_hero/, img]]), coverDir: heroDir, heroDir, imageSize: size(460) });
  assert.strictEqual(await c.hero({ id: 'g3', source: 'steam', sourceId: '401', name: 'X' }), null);
  // 3. SteamGridDB by name for other games, only with a key
  calls.length = 0;
  c = new Covers({ fetch: fakeFetch([[/search\/autocomplete\/Celeste/, json([{ id: 77 }])], [/heroes\/game\/77/, json([{ url: 'https://cdn2.steamgriddb.com/hero/a.jpg' }])], [/cdn2\.steamgriddb\.com\/hero\/a\.jpg/, img]]), coverDir: heroDir, heroDir, imageSize: size(1920) });
  assert.strictEqual(await c.hero({ id: 'g4', source: 'folder', name: 'Celeste' }, {}), null, 'no key, no SteamGridDB');
  assert.strictEqual(calls.length, 0);
  f = await c.hero({ id: 'g4', source: 'folder', name: 'Celeste' }, { key: 'k' });
  assert.ok(f && f.startsWith('g4-'));
  assert.ok(calls.some((u) => /heroes\/game\/77\?dimensions=/.test(u)));
});

/* ---------- Windows only: real system calls ---------- */

test('winapi: running programs and starting one (Windows only)', async () => {
  const winapi = req('winapi.js');
  if (!isWin) { assert.strictEqual(winapi.available(), false); return 'skipped (not Windows)'; }
  assert.ok(winapi.available(), winapi.loadError);
  const before = winapi.running();
  assert.ok(before.length > 3 && before.some((p) => p.endsWith('.exe')));
  const dir = path.join(T, 'Sleeper Game');
  const exe = put('Sleeper Game/sleeper.exe', 'sleeper');
  assert.ok(await winapi.open(exe, ['--level', 'two words'], dir));
  await new Promise((r) => setTimeout(r, 2500));
  assert.ok(winapi.running().some((p) => p === exe.toLowerCase()), 'started program is seen running');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'args.txt'), 'utf8').trim(), '--level "two words"');
  assert.strictEqual(await winapi.open(path.join(T, 'nope.exe')), false);
});

test('winapi: PowerShell fallback when the helper can’t load (Windows only)', async () => {
  if (!isWin) return 'skipped (not Windows)';
  const file = require.resolve(path.join(ROOT, 'src', 'main', 'winapi.js'));
  const saved = require.cache[file];
  delete require.cache[file];
  process.env.RACK_NO_NATIVE = '1';
  try {
    const w = require(file);
    assert.strictEqual(w.available(), false);
    w.running(); // starts the first snapshot
    const dir = path.join(T, 'Sleeper Two');
    const exe = put('Sleeper Two/sleeper.exe', 'sleeper');
    assert.ok(await w.open(exe, ['--level', 'two words'], dir), 'started through PowerShell');
    let seen = false;
    for (let i = 0; i < 20 && !seen; i++) { await new Promise((r) => setTimeout(r, 1000)); seen = w.running().some((p) => p === exe.toLowerCase()); }
    assert.ok(seen, 'started program is seen running');
    assert.strictEqual(fs.readFileSync(path.join(dir, 'args.txt'), 'utf8').trim(), '--level "two words"');
    assert.strictEqual(await w.open(path.join(T, 'nope.exe')), false);
  } finally {
    delete process.env.RACK_NO_NATIVE;
    delete require.cache[file];
    if (saved) require.cache[file] = saved;
  }
});

test('stores: reading this PC’s real records does not fail (Windows only)', async () => {
  if (!isWin) return 'skipped (not Windows)';
  const s = req('stores.js'), scan = req('scan.js');
  for (const fn of [scan.scanSteam, scan.scanEpic, scan.scanGog, s.scanUbisoft, s.scanEA, s.scanBattleNet, s.scanXbox]) {
    const r = await fn();
    assert.ok(r && Array.isArray(r.games));
  }
  assert.ok(Array.isArray(await s.uninstallEntries()));
});

/* ---------- run ---------- */

(async () => {
  for (const [name, fn] of tests) {
    try {
      const note = await fn();
      passed++;
      console.log(`ok   ${name}${typeof note === 'string' ? `  (${note})` : ''}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${name}\n     ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n     ')}`);
    }
  }
  try { fs.rmSync(T, { recursive: true, force: true }); } catch { /* a test program may still be running */ }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
