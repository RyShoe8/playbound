param(
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$GameProcessId,
    [Parameter(Mandatory=$true)][string]$ExecutablePath
)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PlayBoundBorderless {
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr window, int index, int value);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
}
'@
[PlayBoundBorderless]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
$expectedPath = [IO.Path]::GetFullPath($ExecutablePath)
$initial = Get-Process -Id $GameProcessId
if (-not [string]::Equals($initial.Path,$expectedPath,[StringComparison]::OrdinalIgnoreCase)) { throw 'Game executable does not match' }
$started = $initial.StartTime
$changed = $false
for ($attempt=0; $attempt -lt 60; $attempt++) {
    $game = Get-Process -Id $GameProcessId -ErrorAction SilentlyContinue
    if (-not $game -or $game.StartTime -ne $started) { exit 1 }
    $window = $game.MainWindowHandle
    if ($window -ne [IntPtr]::Zero) {
        [uint32]$owner = 0
        [PlayBoundBorderless]::GetWindowThreadProcessId($window,[ref]$owner) | Out-Null
        if ($owner -ne $GameProcessId) { throw 'Game window ownership changed' }
        $width = [PlayBoundBorderless]::GetSystemMetrics(0)
        $height = [PlayBoundBorderless]::GetSystemMetrics(1)
        # Remove caption, frame and system buttons; cover the primary monitor,
        # including the taskbar. No permanent topmost flag or process injection.
        $style = [PlayBoundBorderless]::GetWindowLong($window,-16)
        [PlayBoundBorderless]::SetWindowLong($window,-16,($style -band (-bnot 0x00CF0000))) | Out-Null
        if (-not [PlayBoundBorderless]::SetWindowPos($window,[IntPtr]::Zero,0,0,$width,$height,0x0064)) { throw 'Could not size game window' }
        $changed = $true
        # Cover initialization changes without fighting later user choices.
        if ($attempt -ge 10) { exit 0 }
    }
    Start-Sleep -Milliseconds 250
}
if (-not $changed) { exit 1 }
