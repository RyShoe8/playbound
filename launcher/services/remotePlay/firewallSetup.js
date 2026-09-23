"use strict";

/**
 * A one-click, UAC-gated host setup. Rules are limited to the current program
 * binaries, inbound traffic from LocalSubnet, and Remote Play's known ports.
 * Nothing changes until the player clicks the Settings button and accepts UAC.
 */
function quoted(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function firewallScript(playboundExe, sunshineExe) {
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    `$playbound = ${quoted(playboundExe)}`,
    "if (-not (Test-Path -LiteralPath $playbound)) { throw 'PlayBound executable is missing' }",
    "$rules = @(",
    "  @{ Name='PlayBound Remote Host TCP'; Program=$playbound; Protocol='TCP'; Ports='47998' },",
    "  @{ Name='PlayBound Remote Discovery UDP'; Program=$playbound; Protocol='UDP'; Ports='5353' }",
    ")",
  ];
  if (sunshineExe) {
    lines.push(`$sunshine = ${quoted(sunshineExe)}`);
    lines.push("if (Test-Path -LiteralPath $sunshine) {");
    lines.push("  $rules += @{ Name='PlayBound Remote Stream TCP'; Program=$sunshine; Protocol='TCP'; Ports='47984,47989,48010' }");
    lines.push("  $rules += @{ Name='PlayBound Remote Stream UDP'; Program=$sunshine; Protocol='UDP'; Ports='47998-48000' }");
    lines.push("}");
  }
  lines.push("foreach ($rule in $rules) {");
  lines.push("  if (-not (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue)) {");
  lines.push("    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Program $rule.Program -Protocol $rule.Protocol -LocalPort ($rule.Ports -split ',') -RemoteAddress LocalSubnet -Profile Private,Public | Out-Null");
  lines.push("  }");
  lines.push("}");
  return lines.join("\n");
}

function encodedCommand(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function allowRemotePlayOnLan(playboundExe, sunshineExe, execFile) {
  const elevated = encodedCommand(firewallScript(playboundExe, sunshineExe));
  const outer = `$p = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile -NonInteractive -EncodedCommand ${elevated}' -Wait -PassThru; exit $p.ExitCode`;
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand(outer)],
      { windowsHide: true, timeout: 180_000 },
      (error) => resolve(error ? { ok: false, error: "Windows permission was declined or the firewall rule could not be added." } : { ok: true })
    );
  });
}

module.exports = { firewallScript, allowRemotePlayOnLan };
