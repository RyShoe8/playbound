# PlayBound.VigemHost.ps1 — line-delimited JSON stdin/stdout ViGEm bridge.
# Loads vendored Nefarius.ViGEm.Client.dll (no separate install for players).

$ErrorActionPreference = "Stop"
$lib = Join-Path $PSScriptRoot "lib\Nefarius.ViGEm.Client.dll"
if (-not (Test-Path $lib)) {
  Write-Output (@{ ok = $false; event = "error"; error = "ViGEm client DLL missing." } | ConvertTo-Json -Compress)
  exit 1
}

Add-Type -Path $lib

$script:Client = $null
$script:Pads = @{}

# Resolved once. These were resolved inside the update handler, which runs at
# pad refresh rate for every connected player; three type lookups per frame
# measured 0.07ms of the ~1.7ms an update cost.
$script:BtnType = [Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Button]
$script:AxisType = [Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Axis]
$script:SliderType = [Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Slider]

function Reply($ok, $event, $slot = $null, $error = $null) {
  $o = [ordered]@{ ok = [bool]$ok; event = $event }
  if ($null -ne $slot) { $o.slot = [int]$slot }
  if ($null -ne $error) { $o.error = [string]$error }
  Write-Output ($o | ConvertTo-Json -Compress)
  [Console]::Out.Flush()
}

function Ensure-Client {
  if ($null -eq $script:Client) {
    $script:Client = New-Object Nefarius.ViGEm.Client.ViGEmClient
  }
}

# To-Short / To-Byte used to live here as functions. They are inlined in the
# update handler below instead: a PowerShell function call is ~0.047ms of pure
# dispatch overhead, and six of them per frame measured 0.28ms against 0.03ms
# for the identical arithmetic inline.
#
# The rounding is written as Floor(x + 0.5) rather than [Math]::Round on
# purpose. [Math]::Round is banker's rounding — it breaks exact .5 ties toward
# even — while JavaScript's Math.round always rounds a tie up. windowsVigem.js
# reproduces this conversion to decide whether a frame changed anything, so the
# two must agree exactly or it could skip a frame the pad would have rendered
# differently. Measured across 200k random values the two rules never diverged,
# but they disagree on half of all exact midpoints, and "a real input never
# lands there" is not a property worth depending on. Floor(x + 0.5) is exactly
# JavaScript's rule, which makes the two provably identical instead.

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if ($line.Length -eq 0) { continue }
  try {
    $msg = $line | ConvertFrom-Json
    switch ($msg.cmd) {
      "probe" {
        Ensure-Client
        Reply $true "probe"
      }
      "create" {
        Ensure-Client
        $slot = [int]$msg.slot
        if (-not $script:Pads.ContainsKey($slot)) {
          $pad = $script:Client.CreateXbox360Controller()
          $pad.Connect()
          $script:Pads[$slot] = $pad
        }
        Reply $true "created" $slot
      }
      "remove" {
        $slot = [int]$msg.slot
        if ($script:Pads.ContainsKey($slot)) {
          try { $script:Pads[$slot].Disconnect() } catch {}
          $script:Pads.Remove($slot)
        }
        Reply $true "removed" $slot
      }
      "update" {
        $slot = [int]$msg.slot
        if (-not $script:Pads.ContainsKey($slot)) {
          Ensure-Client
          $padNew = $script:Client.CreateXbox360Controller()
          $padNew.Connect()
          $script:Pads[$slot] = $padNew
        }
        $pad = $script:Pads[$slot]
        $buttons = [uint32]0
        if ($null -ne $msg.buttons) { $buttons = [uint32]$msg.buttons }

        $btnType = $script:BtnType
        $axisType = $script:AxisType
        $sliderType = $script:SliderType

        $pad.SetButtonState($btnType::A, (($buttons -band (1 -shl 0)) -ne 0))
        $pad.SetButtonState($btnType::B, (($buttons -band (1 -shl 1)) -ne 0))
        $pad.SetButtonState($btnType::X, (($buttons -band (1 -shl 2)) -ne 0))
        $pad.SetButtonState($btnType::Y, (($buttons -band (1 -shl 3)) -ne 0))
        $pad.SetButtonState($btnType::LeftShoulder, (($buttons -band (1 -shl 4)) -ne 0))
        $pad.SetButtonState($btnType::RightShoulder, (($buttons -band (1 -shl 5)) -ne 0))
        $pad.SetButtonState($btnType::Back, (($buttons -band (1 -shl 6)) -ne 0))
        $pad.SetButtonState($btnType::Start, (($buttons -band (1 -shl 7)) -ne 0))
        $pad.SetButtonState($btnType::LeftThumb, (($buttons -band (1 -shl 8)) -ne 0))
        $pad.SetButtonState($btnType::RightThumb, (($buttons -band (1 -shl 9)) -ne 0))
        $pad.SetButtonState($btnType::Up, (($buttons -band (1 -shl 10)) -ne 0))
        $pad.SetButtonState($btnType::Down, (($buttons -band (1 -shl 11)) -ne 0))
        $pad.SetButtonState($btnType::Left, (($buttons -band (1 -shl 12)) -ne 0))
        $pad.SetButtonState($btnType::Right, (($buttons -band (1 -shl 13)) -ne 0))
        $pad.SetButtonState($btnType::Guide, (($buttons -band (1 -shl 14)) -ne 0))

        $lx = 0.0; if ($null -ne $msg.lx) { $lx = [double]$msg.lx }
        $ly = 0.0; if ($null -ne $msg.ly) { $ly = [double]$msg.ly }
        $rx = 0.0; if ($null -ne $msg.rx) { $rx = [double]$msg.rx }
        $ry = 0.0; if ($null -ne $msg.ry) { $ry = [double]$msg.ry }
        $lt = 0.0; if ($null -ne $msg.lt) { $lt = [double]$msg.lt }
        $rt = 0.0; if ($null -ne $msg.rt) { $rt = [double]$msg.rt }

        $alx = [Math]::Max(-1.0, [Math]::Min(1.0, $lx))
        $aly = [Math]::Max(-1.0, [Math]::Min(1.0, (-1.0 * $ly)))
        $arx = [Math]::Max(-1.0, [Math]::Min(1.0, $rx))
        $ary = [Math]::Max(-1.0, [Math]::Min(1.0, (-1.0 * $ry)))
        $alt = [Math]::Max(0.0, [Math]::Min(1.0, $lt))
        $art = [Math]::Max(0.0, [Math]::Min(1.0, $rt))

        $pad.SetAxisValue($axisType::LeftThumbX, [int16][Math]::Floor($alx * 32767 + 0.5))
        $pad.SetAxisValue($axisType::LeftThumbY, [int16][Math]::Floor($aly * 32767 + 0.5))
        $pad.SetAxisValue($axisType::RightThumbX, [int16][Math]::Floor($arx * 32767 + 0.5))
        $pad.SetAxisValue($axisType::RightThumbY, [int16][Math]::Floor($ary * 32767 + 0.5))
        $pad.SetSliderValue($sliderType::LeftTrigger, [byte][Math]::Floor($alt * 255.0 + 0.5))
        $pad.SetSliderValue($sliderType::RightTrigger, [byte][Math]::Floor($art * 255.0 + 0.5))
        $pad.SubmitReport()
      }
      "quit" {
        foreach ($k in @($script:Pads.Keys)) {
          try { $script:Pads[$k].Disconnect() } catch {}
        }
        $script:Pads.Clear()
        try { if ($script:Client) { $script:Client.Dispose() } } catch {}
        Reply $true "quit"
        break
      }
      default {
        Reply $false "error" $null "unknown cmd"
      }
    }
  } catch {
    Reply $false "error" $null $_.Exception.Message
  }
}
