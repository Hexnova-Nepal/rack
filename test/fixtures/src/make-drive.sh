#!/bin/bash
# Builds a fake game drive with real Windows programs (real imports and version info).
set -e
S=/tmp/claude-0/-home-claude/afebe63a-cd2c-5d2d-a8b3-0d707740270b/scratchpad/fixture
B=$S/bin; D=$S/drive
mkdir -p $B
cc() { # name kind(gui|console) libs product company description
  local name=$1 kind=$2 libs=$3 prod=$4 comp=$5 desc=$6
  cat > $B/$name.c <<EOF
#include <windows.h>
$( [[ $libs == *d3d11* ]] && echo '#include <d3d11.h>' )
$( [[ $libs == *xinput* ]] && echo '#include <xinput.h>' )
$( [[ $libs == *ddraw* ]] && echo '#include <ddraw.h>' )
$( [[ $libs == *dinput8* ]] && echo '#define DIRECTINPUT_VERSION 0x0800
#include <dinput.h>' )
$( [[ $libs == *opengl32* ]] && echo '#include <GL/gl.h>' )
int main(void){
$( [[ $libs == *d3d11* ]] && echo 'D3D11CreateDevice(0,0,0,0,0,0,0,0,0,0);' )
$( [[ $libs == *xinput* ]] && echo 'XINPUT_STATE s; XInputGetState(0,&s);' )
$( [[ $libs == *ddraw* ]] && echo 'DirectDrawCreate(0,0,0);' )
$( [[ $libs == *dinput8* ]] && echo 'DirectInput8Create(0,0,0,0,0);' )
$( [[ $libs == *opengl32* ]] && echo 'glClear(0);' )
MessageBoxA(0,"x","y",0); return 0; }
EOF
  local rc=""
  if [[ -n $prod || -n $desc ]]; then
    cat > $B/$name.rc <<EOF
1 VERSIONINFO
FILEVERSION 1,0,0,0
PRODUCTVERSION 1,0,0,0
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "040904b0"
    BEGIN
      VALUE "CompanyName", "$comp"
      VALUE "FileDescription", "$desc"
      VALUE "ProductName", "$prod"
      VALUE "FileVersion", "1.0.0.0"
    END
  END
  BLOCK "VarFileInfo"
  BEGIN
    VALUE "Translation", 0x409, 1200
  END
END
EOF
    x86_64-w64-mingw32-windres $B/$name.rc -O coff -o $B/$name.res
    rc=$B/$name.res
  fi
  local l=""; for x in $libs; do l="$l -l$x"; done
  x86_64-w64-mingw32-gcc -O1 -s $( [[ $kind == gui ]] && echo -mwindows ) $B/$name.c $rc -o $B/$name.exe $l -luser32
}
cc game_gfx gui "d3d11 xinput" "" "" ""
cc game_unity gui "" "Hollow Knight" "Team Cherry" "Hollow Knight"
cc game_ddraw gui "ddraw dinput8 dxguid" "" "" ""
cc game_gl gui "opengl32" "" "" ""
cc game_plain gui "" "" "" ""
cc app_vlc gui "d3d11" "VLC media player" "VideoLAN" "VLC media player"
cc app_7z gui "" "7-Zip" "Igor Pavlov" "7-Zip File Manager"
cc tool_console console "" "" "" ""
cc setup_gui gui "" "Some Game" "Some Studio" "Some Game Setup"
cc ue_boot gui "" "BootstrapPackagedGame" "Epic Games, Inc." "BootstrapPackagedGame"
ls $B/*.exe | wc -l

rm -rf $D; mkdir -p $D
put() { mkdir -p "$(dirname "$D/$1")"; cp "$B/$2.exe" "$D/$1"; }
touchf() { mkdir -p "$(dirname "$D/$1")"; printf '%s' "${2:-x}" > "$D/$1"; }

# Steam library on this drive
touchf "SteamLibrary/steamapps/appmanifest_1145360.acf" '"AppState" { "appid" "1145360" "name" "Hades" "StateFlags" "4" "installdir" "Hades" }'
touchf "SteamLibrary/steamapps/appmanifest_228980.acf" '"AppState" { "appid" "228980" "name" "Steamworks Common Redistributables" "StateFlags" "4" "installdir" "Steamworks Shared" }'
put "SteamLibrary/steamapps/common/Hades/x64/Hades.exe" game_gfx
put "SteamLibrary/steamapps/common/Hades/x64Vk/Hades.exe" game_gfx
touchf "SteamLibrary/steamapps/common/Hades/x64/steam_api64.dll"
put "SteamLibrary/steamapps/common/Steamworks Shared/_CommonRedist/vcredist/2019/VC_redist.x64.exe" setup_gui
put "SteamLibrary/steamapps/common/Orphan Game/Orphan.exe" game_gfx

# A folder of games
put "Games/Celeste/Celeste.exe" game_gfx; touchf "Games/Celeste/fmod.dll"; touchf "Games/Celeste/fmodstudio.dll"; mkdir -p "$D/Games/Celeste/Content"
put "Games/Hollow Knight/hollow_knight.exe" game_unity; touchf "Games/Hollow Knight/UnityPlayer.dll"; put "Games/Hollow Knight/UnityCrashHandler64.exe" tool_console
touchf "Games/Hollow Knight/hollow_knight_Data/app.info" $'Team Cherry\nHollow Knight'
put "Games/Witcher 3 GOTY/bin/x64/witcher3.exe" game_gfx; put "Games/Witcher 3 GOTY/unins000.exe" setup_gui
touchf "Games/Witcher 3 GOTY/goggame-1495134320.info" '{"gameId":"1495134320","name":"The Witcher 3: Wild Hunt - Game of the Year Edition","playTasks":[{"isPrimary":true,"type":"FileTask","path":"bin\\x64\\witcher3.exe","workingDir":"bin\\x64","category":"game"}]}'
put "Games/Witcher 3 GOTY/redkit/bin/redkit.exe" tool_console
put "Games/Ashen Road/AshenRoad.exe" ue_boot; put "Games/Ashen Road/AshenRoad/Binaries/Win64/AshenRoad-Win64-Shipping.exe" game_gfx
mkdir -p "$D/Games/Ashen Road/Engine/Binaries/ThirdParty"; put "Games/Ashen Road/Engine/Extras/Redist/en-us/UE4PrereqSetup_x64.exe" setup_gui
touchf "Games/Ashen Road/AshenRoad/Content/Paks/AshenRoad-WindowsNoEditor.pak"
put "Games/Ren Game/RenGame.exe" game_plain; put "Games/Ren Game/RenGame-32.exe" game_plain; mkdir -p "$D/Games/Ren Game/renpy" "$D/Games/Ren Game/game" "$D/Games/Ren Game/lib/py3-windows-x86_64"
put "Games/Ren Game/lib/py3-windows-x86_64/python.exe" tool_console
put "Games/RPG Thing/Game.exe" game_plain; touchf "Games/RPG Thing/nw.dll"; mkdir -p "$D/Games/RPG Thing/www/js"
put "Games/Godot Gem/gem.exe" game_plain; touchf "Games/Godot Gem/gem.pck"
put "Games/OldGame/OLDGAME.EXE" game_ddraw; mkdir -p "$D/Games/OldGame/DATA"
put "Games/CaveStory_v1.2_repack/Doukutsu.exe" game_gl
# Epic and Xbox
put "Epic Games/SomeEpic/Binaries/Win64/SomeEpic.exe" game_gfx; touchf "Epic Games/SomeEpic/.egstore/ABCDEF.mancpn" '{"FormatVersion":0,"AppName":"Wombat","CatalogItemId":"cid123","CatalogNamespace":"ns456"}'
put "XboxGames/Forza Thing/Content/ForzaThing.exe" game_gfx; put "XboxGames/Forza Thing/Content/gamelaunchhelper.exe" game_plain
touchf "XboxGames/Forza Thing/Content/MicrosoftGame.config" '<Game><Identity Name="Microsoft.ForzaThing"/><ExecutableList><Executable Name="gamelaunchhelper.exe" Id="Game"/></ExecutableList><ShellVisuals DefaultDisplayName="Forza Thing"/></Game>'
# Not games
put "Program Files/7-Zip/7zFM.exe" app_7z; put "Program Files/7-Zip/7z.exe" tool_console
put "Program Files/VideoLAN/VLC/vlc.exe" app_vlc; touchf "Program Files/VideoLAN/VLC/libvlc.dll"
put "Program Files/Chatty/Chatty.exe" game_plain; touchf "Program Files/Chatty/chrome_100_percent.pak"; touchf "Program Files/Chatty/LICENSES.chromium.html"; touchf "Program Files/Chatty/resources/app.asar"
put "Program Files (x86)/Steam/steam.exe" game_plain; mkdir -p "$D/Program Files (x86)/Steam/steamapps"
put "Emulators/Dolphin/Dolphin.exe" game_gfx
put "Tools/MyTool/tool.exe" tool_console
put "Downloads/setup_somegame.exe" setup_gui
put "Windows/System32/notepad.exe" game_plain
put '$Recycle.Bin/S-1-5/deleted.exe' game_gfx
echo built
