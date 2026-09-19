param(
    [string]$TargetName = "Castlevania ReVamped",
    [int]$TargetWidth = 1280,
    [int]$TargetHeight = 720
)

$source = @"
using System;
using System.Runtime.InteropServices;
public class WindowResizeHelper {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WindowResizeHelper').Type) {
    Add-Type -TypeDefinition $source
}

$screenW = [WindowResizeHelper]::GetSystemMetrics(0) # SM_CXSCREEN
$screenH = [WindowResizeHelper]::GetSystemMetrics(1) # SM_CYSCREEN
$posX = [Math]::Max(0, [int](($screenW - $TargetWidth) / 2))
$posY = [Math]::Max(0, [int](($screenH - $TargetHeight) / 2))

# Poll for window to appear and resize
$maxAttempts = 50
$resized = $false
for ($i = 0; $i -lt $maxAttempts; $i++) {
    Start-Sleep -Milliseconds 200
    $procs = Get-Process -Name $TargetName -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
            # 0x0004 = SWP_NOZORDER, 0x0040 = SWP_SHOWWINDOW
            [WindowResizeHelper]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, $posX, $posY, $TargetWidth, $TargetHeight, 0x0044)
            [WindowResizeHelper]::SetForegroundWindow($p.MainWindowHandle)
            $resized = $true
            break
        }
    }
    if ($resized) {
        # Keep reinforcing the window size across splash/init room transitions
        for ($j = 0; $j -lt 4; $j++) {
            Start-Sleep -Milliseconds 500
            $pCheck = Get-Process -Name $TargetName -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($pCheck -and $pCheck.MainWindowHandle -ne [IntPtr]::Zero) {
                [WindowResizeHelper]::SetWindowPos($pCheck.MainWindowHandle, [IntPtr]::Zero, $posX, $posY, $TargetWidth, $TargetHeight, 0x0044)
            }
        }
        exit 0
    }
}
