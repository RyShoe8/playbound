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
}
"@
Add-Type -TypeDefinition $source

$targets = @($args)
if ($targets.Count -eq 0) { $targets = @("Pokemon Online", "PDoDLauncher") }

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
                exit 0
            }
        }
    }
}
