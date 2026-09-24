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

$targets = @($args)
if ($targets.Count -eq 0) { $targets = @("Pokemon Online", "PDoDLauncher") }

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
                # SW_MAXIMIZE = 3
                [WindowHelper]::ShowWindowAsync($p.MainWindowHandle, 3)
                [WindowHelper]::SetForegroundWindow($p.MainWindowHandle)
                # Give the engine a moment to actually respond to the resize (or not —
                # this is exactly what tells us whether it did) before reading bounds.
                Start-Sleep -Milliseconds 400

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
