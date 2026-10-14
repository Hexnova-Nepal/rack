# Rack

A game launcher for Windows. It finds your games from Steam, Epic, GOG, Ubisoft Connect, the EA app, Battle.net and the Xbox app, scans any folder or drive for the rest, fetches covers, and times how long you play, even when you start a game from somewhere else.

## Install

Download from [Releases](https://github.com/Hexnova-Nepal/rack/releases/latest):

- `Rack-Setup-<version>.exe` installs Rack and keeps it up to date on its own.
- `Rack-Portable-<version>.exe` runs from anywhere, such as a USB stick, and keeps its data next to itself. It tells you when a new version is out, but you download it yourself.

The files aren't code-signed yet, so Windows SmartScreen may say "Windows protected your PC". Click **More info**, then **Run anyway**. See [CODE_SIGNING.md](CODE_SIGNING.md) for the plan to fix this.

## What it does

- **Finds games** from seven stores on its own, and checks for new ones while it runs. Scanning a folder or drive recognises games by what's inside their folders: store files, game engines (Unity, Unreal, Godot, GameMaker, Ren'Py, RPG Maker, Source), and what each program says about itself. Installers, tools and ordinary apps are skipped.
- **ROM folders** with the emulator of your choice.
- **Times your play** from the tray, by watching for programs inside each game's folder. It uses direct Windows calls, not background PowerShell.
- **Covers** from Steam and SteamGridDB, or picked from Google Images inside Rack.
- **Library tools**:
  - favourites, collections and play status;
  - automatic lists, filters, list view and hidden games;
  - select several games at once, and use the keyboard;
  - right-click menus everywhere.
- **Extra ways to start** a game (a mod manager or a config tool), plus desktop shortcuts and taskbar jump lists that count your time.
- **Save backups** with [Ludusavi](https://github.com/mtkennerly/ludusavi), which Rack can download for you.
- **Library backup** to a single `.rackbackup` file.
- **Looks**: light, dark or system theme; four dark and three light backgrounds; seven accent colours or your own; five font styles.
- **Uninstall** through each game's own uninstaller or store, with safety checks before anything is deleted.

## Build it yourself

You need Node.js 20 or later.

```
npm install
npm start          # run it in development
npm test           # unit tests; the Windows-only ones run on Windows
npm run dist       # build the installer and the portable .exe into dist/
```

Building on Windows needs nothing else. Building on Linux or macOS needs Wine for the installer.

## Releasing

GitHub Actions (`.github/workflows/build.yml`) runs the tests on Windows and builds both .exe files on every push. To publish a release:

1. Set `version` in `package.json` and update `RELEASE_NOTES.md`.
2. Commit and push to `main`.

When that version has no release yet, the workflow tests, builds, signs (once SignPath is set up) and publishes the GitHub Release `v<version>`. Pushing a tag like `v1.2.0` works too. Installed copies of Rack update themselves from that release.

## Where things are

| File | What it does |
| --- | --- |
| `src/main/main.js` | Starts the app, the window, the tray, menus, and every request the interface can make |
| `src/main/winapi.js` | Direct Windows calls: the list of running programs, and starting programs |
| `src/main/launch.js` | Works out how to start each game, and times play by watching running programs |
| `src/main/scan.js` | Steam, Epic and GOG games, and ROM folders |
| `src/main/stores.js` | Ubisoft Connect, EA app, Battle.net and Xbox app games; Steam games you own |
| `src/main/detect.js` | Finds games in any folder or drive by what is inside their folders |
| `src/main/pe.js` | Reads a .exe's version info and imported DLLs |
| `src/main/covers.js` | Covers from Steam and SteamGridDB; descriptions, genres and years from the Steam store |
| `src/main/picker.js` | The Google Images cover picker window |
| `src/main/uninstall.js` | Works out how to uninstall a game, with safety checks |
| `src/main/backups.js` | Save backups through Ludusavi, and the library backup file |
| `src/main/updates.js` | Updates from GitHub Releases |
| `src/main/store.js` | The library file, `library.json`, in the data folder |
| `src/main/vdf.js` | Reads Steam's .vdf and .acf files |
| `src/preload.js` | The bridge between the interface and the main process |
| `src/renderer/` | The interface: `app.js`, `styles.css`, fonts, and the rack figure in `vendor/` |
| `test/run.js` | Unit tests, with small real .exe files in `test/fixtures/bin` |

## Data

- Installed version: `%APPDATA%\Rack`.
- Portable version: a `Rack Data` folder next to the .exe.

Uninstalling Rack keeps your data. Rack sends nothing about you anywhere; [CODE_SIGNING.md](CODE_SIGNING.md#privacy) lists the services it contacts.

## Known limits

- Battle.net games that Rack doesn't have a launch code for start from their .exe, which some of them refuse; those open best through Battle.net.
- EA and Ubisoft games may need their launcher running and signed in, the same as when you start them yourself.
- Steam games you own but haven't installed need a free Steam Web API key, and "Game details" set to Public in your Steam privacy settings.
- A game started outside Rack is timed only while Rack is running in the tray.
- The portable version doesn't update itself.
- Save backups cover the games in Ludusavi's database, which is large but not complete.
- No controller mode yet.

## Licence

MIT. See [LICENSE](LICENSE) for this project and the third-party parts it includes.
