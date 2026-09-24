$source = @"
using System;
using System.Runtime.InteropServices;
public class WindowHelper {
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);
    [DllImport("user32.dll")]
    public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);
    [DllImport("user32.dll")]
    public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct MONITORINFO {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }
}
"@
Add-Type -TypeDefinition $source

$rawArgs = @($args)
# Games with their own deliberate window-size override (resize-window.ps1)
# pass this first — main.js still needs THIS script's rect measurement for
# cropping (that game won't fill the monitor either), it just must not
# maximize or Alt+Enter it and undo that intentional sizing.
$measureOnly = $false
if ($rawArgs.Count -gt 0 -and $rawArgs[0] -eq "--measure-only") {
    $measureOnly = $true
    $rawArgs = $rawArgs[1..($rawArgs.Count - 1)]
}
$targets = $rawArgs
if ($targets.Count -eq 0) { $targets = @("Pokemon Online", "PDoDLauncher") }

if (-not $measureOnly) {
    Add-Type -AssemblyName System.Windows.Forms
}

# MONITOR_DEFAULTTONEAREST
$MONITOR_DEFAULTTONEAREST = 2
# DWMWA_EXTENDED_FRAME_BOUNDS — the actual visible window edge, unlike
# GetWindowRect, which on Windows 10/11 includes several pixels of invisible
# resize-border padding on each side. Using GetWindowRect here left a sliver
# of desktop visible around every edge of the crop.
$DWMWA_EXTENDED_FRAME_BOUNDS = 9

$maxAttempts = 50
for ($i = 0; $i -lt $maxAttempts; $i++) {
    Start-Sleep -Milliseconds 250
    foreach ($target in $targets) {
        $procs = Get-Process -Name $target -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            if ($p.MainWindowHandle -ne 0) {
                if (-not $measureOnly) {
                    # SW_MAXIMIZE = 3
                    [WindowHelper]::ShowWindowAsync($p.MainWindowHandle, 3)
                    [WindowHelper]::SetForegroundWindow($p.MainWindowHandle)

                    # True exclusive fullscreen (as opposed to borderless/"windowed
                    # fullscreen") bypasses the desktop compositor entirely — screen
                    # capture can only see whatever DWM last composited, which is a
                    # frozen frame of the desktop from the instant before the game
                    # grabbed the screen. Alt+Enter is the standard, if blunt,
                    # capture-tool trick for knocking a game out of that mode into a
                    # capturable one. Best-effort: some games use Alt+Enter for
                    # something else, or ignore it outright, or are already in a
                    # capturable mode and this is a harmless no-op toggle.
                    Start-Sleep -Milliseconds 150
                    [System.Windows.Forms.SendKeys]::SendWait("%{ENTER}")
                    # Switching modes recreates the render surface — not instant.
                    Start-Sleep -Milliseconds 600

                    # Give the engine a moment to actually respond to the resize (or
                    # not — this is exactly what tells us whether it did) before
                    # reading bounds.
                    Start-Sleep -Milliseconds 400
                }

                $rect = New-Object WindowHelper+RECT
                $hr = [WindowHelper]::DwmGetWindowAttribute($p.MainWindowHandle, $DWMWA_EXTENDED_FRAME_BOUNDS, [ref]$rect, [System.Runtime.InteropServices.Marshal]::SizeOf($rect))
                if ($hr -ne 0) {
                    # DWM unavailable (rare) — fall back to the old, slightly
                    # wider rect rather than failing the crop outright.
                    [WindowHelper]::GetWindowRect($p.MainWindowHandle, [ref]$rect) | Out-Null
                }

                $monitor = [WindowHelper]::MonitorFromWindow($p.MainWindowHandle, $MONITOR_DEFAULTTONEAREST)
                $mi = New-Object WindowHelper+MONITORINFO
                $mi.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($mi)
                [WindowHelper]::GetMonitorInfo($monitor, [ref]$mi) | Out-Null

                Write-Output "MAXIMIZED target=$target pid=$($p.Id) attempt=$i RECT=$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom) MONITOR=$($mi.rcMonitor.Left),$($mi.rcMonitor.Top),$($mi.rcMonitor.Right),$($mi.rcMonitor.Bottom)"
                exit 0
            }
        }
    }
}
Write-Output "NOT_FOUND targets=$($targets -join ',') attempts=$maxAttempts"
exit 1
