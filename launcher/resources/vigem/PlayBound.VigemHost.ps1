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

function To-Short([double]$v) {
  $c = [Math]::Max(-1.0, [Math]::Min(1.0, $v))
  return [int16][Math]::Round($c * [int16]::MaxValue)
}

function To-Byte([double]$v) {
  $c = [Math]::Max(0.0, [Math]::Min(1.0, $v))
  return [byte][Math]::Round($c * 255.0)
}

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

        $btnType = [Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Button]
        $axisType = [Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Axis]
        $sliderType = [Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Slider]

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

        $pad.SetAxisValue($axisType::LeftThumbX, (To-Short $lx))
        $pad.SetAxisValue($axisType::LeftThumbY, (To-Short (-1.0 * $ly)))
        $pad.SetAxisValue($axisType::RightThumbX, (To-Short $rx))
        $pad.SetAxisValue($axisType::RightThumbY, (To-Short (-1.0 * $ry)))
        $pad.SetSliderValue($sliderType::LeftTrigger, (To-Byte $lt))
        $pad.SetSliderValue($sliderType::RightTrigger, (To-Byte $rt))
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
