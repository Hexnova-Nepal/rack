## What's new in Rack 1.2.1

**Fixed: Rack's shortcut did nothing while Rack was in the tray.** If you closed Rack's window (it keeps running near the clock to time your games) and then started Rack again from its desktop icon or the Start menu, the window either didn't come up or only flashed on the taskbar. Windows was refusing to let the window come to the front. Rack's shortcut now always brings the window back, in front of whatever else is open. The same goes when Rack is minimised or behind another window.

**Fixed: the window could open where you can't see it.** If Rack was last used on a second monitor that has since been unplugged or moved, it now opens on a screen you have.

Under the hood: the Windows build now tests all of this on every change, by starting Rack a second time with another window in front.

---

## What's new in Rack 1.2

**Themes.** Eight ready-made looks that recolour the whole app and bring their own font: Rack, Nord, Dracula, Gruvbox, Catppuccin, Solarized, Synthwave and Forest. Most come in dark and light; Dracula and Synthwave are dark only. You can still change the accent colour and font after picking one, and the window's title bar follows the theme.

**Wallpaper.** A picture behind Rack's screens, dimmed and blurred behind text so everything stays readable.
- Show your own pictures from a folder, wide artwork of your games (from Steam, or SteamGridDB with a key), or both
- Change the picture every few minutes, and use different folders for morning, day, evening and night
- Follow the game you point at: anywhere in Rack, the wallpaper shows the art of the game under the pointer; otherwise Home shows the featured game
- Dim and blur sliders, and an option to show it on Home only

**Drag and drop.**
- Drop games onto a collection, Favourites, Playing, Backlog, Completed, Dropped or Hidden in the sidebar, or onto New collection
- Drag games into your own order, in All games and in each collection ("Your order"); Alt and an arrow key moves the selected game too
- Arrange Home: drag rows by their handle, hide them, and add Favourites, Playing, Backlog or any collection as a row. Drop games onto a row to add them to it
- Desktop layout for Home: place games anywhere over the wallpaper, like icons on a desktop, with Tidy up

**The rack.**
- Point anywhere on a cartridge, not just its top, to pull it out. Covers sit on the cartridges' labels, and the one in front shows your most played game
- Keep games on the rack: drag a game onto a cartridge and it stays in that slot, whatever you play most. "Always on the rack" is in each game's menu and page too
- Choose how many cartridges the rack holds, from 3 to 12 (Settings › Home)

**Under the hood.** Rack falls back to PowerShell for starting and timing games if its Windows helper can't load, and says so in Settings. The build is locked down so Rack's files can't be used to run other code.
