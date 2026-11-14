# CI check on real Windows: starting Rack again while it is already running brings its window
# back in front, whether Rack was closed to the tray, minimised, or sitting behind another window.
#
# The check puts another window in front, uses it (a key press, a mouse nudge), then starts Rack
# from this script. Windows does not treat that as "the user just started this", so Rack gets no
# free pass to the foreground: the hard case. It runs twice:
#   1. with RACK_NO_FRONT=1, the way Rack 1.2.0 behaved. Shown for comparison; never fails the build.
#   2. normally. This one must pass.
#
#   pwsh scripts/ci-check-reopen.ps1 -Exe dist\win-unpacked\Rack.exe -Shot rack-reopen.png
param(
  [string]$Exe = "dist\win-unpacked\Rack.exe",
  [string]$Shot = "rack-reopen.png"
)
$ErrorActionPreference = 'Stop'
$Exe = (Resolve-Path $Exe).Path

Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool on);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);

  [DllImport("user32.dll", SetLastError = true)] public static extern bool SystemParametersInfo(uint action, uint param, ref uint value, uint flags);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SystemParametersInfo(uint action, uint param, IntPtr value, uint flags);
  // How long after the last input Windows keeps other programs from taking the foreground.
  // A desktop PC has 200 seconds; build machines often have 0, which would make this check prove nothing.
  public static uint LockTimeout() { uint v = 0; SystemParametersInfo(0x2000, 0, ref v, 0); return v; }
  public static bool SetLockTimeout(uint ms) { return SystemParametersInfo(0x2001, 0, (IntPtr)ms, 2); }

  // A key press and a nudge of the mouse, as if someone were using the window in front. Windows
  // only guards the foreground for a while after the last input, and a build machine has had none.
  public static void Touch() {
    keybd_event(0x10, 0, 0, UIntPtr.Zero); keybd_event(0x10, 0, 2, UIntPtr.Zero);   // Shift down, up
    mouse_event(1, 2, 2, 0, UIntPtr.Zero); mouse_event(1, -2, -2, 0, UIntPtr.Zero); // move, move back
  }

  public static string Title(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  public static string Class(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }

  // every top-level window, visible or not
  public static List<IntPtr> All() {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
  // the test's own way to the foreground, so it can put another window in front of Rack
  public static bool Force(IntPtr h) {
    IntPtr fg = GetForegroundWindow();
    uint x, mine = GetCurrentThreadId(), theirs = fg == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fg, out x);
    bool on = theirs != 0 && theirs != mine && AttachThreadInput(mine, theirs, true);
    ShowWindow(h, 9); BringWindowToTop(h); SetForegroundWindow(h);
    if (on) AttachThreadInput(mine, theirs, false);
    return GetForegroundWindow() == h;
  }
}
"@

function Rack-Pids { @(Get-Process Rack -ErrorAction SilentlyContinue | ForEach-Object { [uint32]$_.Id }) }
# Rack's window: a visible Chromium window of a Rack process that is big enough to be the app
function Rack-Window {
  $pids = Rack-Pids
  foreach ($h in [W]::All()) {
    if (-not [W]::IsWindowVisible($h)) { continue }
    if ($pids -notcontains [W]::Pid($h)) { continue }
    if ([W]::Class($h) -ne 'Chrome_WidgetWin_1') { continue }
    $r = New-Object W+RECT
    [void][W]::GetWindowRect($h, [ref]$r)
    if ([W]::IsIconic($h) -or (($r.R - $r.L) -ge 600 -and ($r.B - $r.T) -ge 400)) { return $h }
  }
  return [IntPtr]::Zero
}
function Wait-Until([scriptblock]$Test, [int]$Seconds = 20) {
  $end = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $end) { if (& $Test) { return $true }; Start-Sleep -Milliseconds 250 }
  return [bool](& $Test)
}
function Stop-Rack { Get-Process Rack -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
function Describe([IntPtr]$h) { if ($h -eq [IntPtr]::Zero) { 'nothing' } else { "'$([W]::Title($h))' [$([W]::Class($h))]" } }

# another program's window to sit in front of Rack: a console, which every Windows has
$blockerTitle = "RackBlocker$PID"
$blockerProc = Start-Process cmd.exe -ArgumentList '/k', "title $blockerTitle" -PassThru
function Blocker { foreach ($h in [W]::All()) { if ([W]::IsWindowVisible($h) -and [W]::Title($h) -like "*$blockerTitle*") { return $h } }; return [IntPtr]::Zero }
if (-not (Wait-Until { (Blocker) -ne [IntPtr]::Zero } 20)) { Write-Host "::warning::No desktop to test on: the console window never showed. Skipping the reopen check."; exit 0 }

# make this machine guard the foreground the way a desktop PC does
[void][W]::Force((Blocker))
$lockWas = [W]::LockTimeout()
$lockSet = if ($lockWas -lt 200000) { [W]::SetLockTimeout(200000) } else { $true }
Write-Host "Foreground lock: was $lockWas ms, now $([W]::LockTimeout()) ms (set: $lockSet)"

# Starting Rack the second time. From this script it would inherit the script's standing with
# Windows, which can include the right to take the foreground. Task Scheduler starts it with no
# such right, like a program the user has not touched: the case where windows open behind others.
$task = "RackReopen$PID"
$viaTask = $false
try {
  $action = New-ScheduledTaskAction -Execute $Exe
  $who = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest
  Register-ScheduledTask -TaskName $task -Action $action -Principal $who -Force | Out-Null
  $viaTask = $true
} catch { Write-Host "Task Scheduler not usable ($($_.Exception.Message)); starting Rack from this script instead" }
Write-Host "Second start goes through: $(if ($viaTask) { 'Task Scheduler' } else { 'this script' })"
function Start-Again { if ($viaTask) { Start-ScheduledTask -TaskName $task } else { Start-Process -FilePath $Exe | Out-Null } }

# One pass: start Rack, then ask for it again in three situations. Returns what happened in each.
function Run-Pass([string]$Name, [bool]$NoFront) {
  Stop-Rack
  if ($NoFront) { $env:RACK_NO_FRONT = '1' } else { Remove-Item Env:RACK_NO_FRONT -ErrorAction SilentlyContinue }
  Start-Process -FilePath $Exe | Out-Null
  if (-not (Wait-Until { (Rack-Window) -ne [IntPtr]::Zero } 40)) { throw "[$Name] Rack's window never opened" }
  Start-Sleep -Seconds 4   # let the page finish loading

  $results = [ordered]@{}
  foreach ($case in 'behind another window', 'minimised', 'closed to the tray') {
    $h = Rack-Window
    if ($case -eq 'minimised') { [void][W]::ShowWindow($h, 6) }
    if ($case -eq 'closed to the tray') {
      [void][W]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)   # WM_CLOSE, the X button
      if (-not (Wait-Until { (Rack-Window) -eq [IntPtr]::Zero } 15)) { throw "[$Name] Rack's window did not close" }
      if (-not (Rack-Pids).Count) { throw "[$Name] Rack quit when its window closed, so it is not staying in the tray" }
    }
    Start-Sleep -Milliseconds 800
    $b = Blocker
    $inFront = [W]::Force($b)
    Start-Sleep -Milliseconds 300
    [W]::Touch()
    Start-Sleep -Milliseconds 300
    $before = [W]::GetForegroundWindow()

    $sw = [Diagnostics.Stopwatch]::StartNew()
    Start-Again
    $ok = Wait-Until { $w = Rack-Window; ($w -ne [IntPtr]::Zero) -and (-not [W]::IsIconic($w)) -and ([W]::GetForegroundWindow() -eq $w) } 15
    $sw.Stop()
    Start-Sleep -Milliseconds 500
    $w = Rack-Window
    $state = if ($w -eq [IntPtr]::Zero) { 'no window' } elseif ([W]::IsIconic($w)) { 'still minimised' } elseif ([W]::GetForegroundWindow() -eq $w) { 'in front' } else { 'open, but not in front' }
    $results[$case] = [pscustomobject]@{ ok = $ok; state = $state; ms = $sw.ElapsedMilliseconds; blockerInFront = ($inFront -and $before -eq $b); front = Describe ([W]::GetForegroundWindow()) }
    Write-Host ("[{0}] {1,-22} -> {2,-22} in front now: {3}  ({4} ms; other window was in front first: {5})" -f $Name, $case, $state, $results[$case].front, $sw.ElapsedMilliseconds, $results[$case].blockerInFront)
  }
  return $results
}

$code = 0
try {
  $old = Run-Pass 'as 1.2.0' $true
  $new = Run-Pass 'now' $false

  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $s.Width, $s.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($s.Location, [System.Drawing.Point]::Empty, $s.Size)
    $bmp.Save((Join-Path (Get-Location) $Shot), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  } catch { Write-Host "No screenshot: $($_.Exception.Message)" }

  $bad = @($new.Keys | Where-Object { -not $new[$_].ok })
  $proved = @($old.Keys | Where-Object { -not $old[$_].ok })
  if ($proved.Count) { Write-Host "Without the fix, Rack failed to come to the front when: $($proved -join ', ')" }
  else { Write-Host "::notice::Rack came to the front even without the fix here, so this run does not prove the fix (it still checks nothing broke)" }
  if ($bad.Count) { Write-Host "::error::Rack did not come back in front when: $($bad -join ', ')"; $code = 1 }
  else { Write-Host "Rack comes back in front when you start it again" }
}
catch { Write-Host "::error::$($_.Exception.Message)"; $code = 1 }
finally {
  Remove-Item Env:RACK_NO_FRONT -ErrorAction SilentlyContinue
  Stop-Rack
  if ($viaTask) { Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue }
  if ($blockerProc -and -not $blockerProc.HasExited) { Stop-Process -Id $blockerProc.Id -Force -ErrorAction SilentlyContinue }
  Get-Process cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*$blockerTitle*" } | Stop-Process -Force -ErrorAction SilentlyContinue
}
exit $code
