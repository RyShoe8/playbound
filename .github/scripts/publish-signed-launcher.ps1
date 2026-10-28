param([switch]$VerifyOnly)

$ErrorActionPreference = 'Stop'
$feedUrl = 'https://playbound.club/api/launcher/updates/latest.yml'
$feed = (Invoke-WebRequest -Uri $feedUrl -UseBasicParsing).Content

$versionMatch = [regex]::Match($feed, '(?m)^version:\s*(\d+\.\d+\.\d+)\s*$')
$urlMatch = [regex]::Match($feed, '(?m)^\s*- url:\s*(https://playbound\.club/api/launcher/download/PlayBound-Setup-(\d+\.\d+\.\d+)\.exe)\s*$')
$hashMatch = [regex]::Match($feed, '(?m)^\s+sha512:\s*([A-Za-z0-9+/=]+)\s*$')
$sizeMatch = [regex]::Match($feed, '(?m)^\s+size:\s*(\d+)\s*$')
if (-not ($versionMatch.Success -and $urlMatch.Success -and $hashMatch.Success -and $sizeMatch.Success)) {
  throw 'The public signed launcher feed is incomplete or has an unexpected format.'
}
$version = $versionMatch.Groups[1].Value
if ($version -ne $urlMatch.Groups[2].Value) { throw 'Feed and installer versions differ.' }
$tag = "launcher-v$version"

if (-not $VerifyOnly) {
  & gh release view $tag --json id --jq '.id' 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "GitHub release $tag already exists."
    exit 0
  }
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("playbound-release-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  $installer = Join-Path $work "PlayBound-Setup-$version.exe"
  Invoke-WebRequest -Uri $urlMatch.Groups[1].Value -OutFile $installer
  $file = Get-Item -LiteralPath $installer
  if ($file.Length -ne [long]$sizeMatch.Groups[1].Value) { throw 'Installer size differs from the public signed feed.' }
  $actualHash = [Convert]::ToBase64String([Convert]::FromHexString((Get-FileHash -LiteralPath $installer -Algorithm SHA512).Hash))
  if ($actualHash -ne $hashMatch.Groups[1].Value) { throw 'Installer SHA-512 differs from the public signed feed.' }

  $signature = Get-AuthenticodeSignature -LiteralPath $installer
  if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
      $signature.SignerCertificate.Subject -notmatch 'The Media Shop, LLC') {
    throw "Installer signature is not valid for The Media Shop, LLC (status: $($signature.Status))."
  }
  Write-Host "Verified $tag, $($file.Length) bytes, signer $($signature.SignerCertificate.Subject)."
  if ($VerifyOnly) { exit 0 }

  # A newer promotion during the download must not publish a stale release as Latest.
  $currentFeed = (Invoke-WebRequest -Uri $feedUrl -UseBasicParsing).Content
  if ($currentFeed -ne $feed) { throw 'Public signed feed changed during verification; retry the job.' }

  $notes = @"
Signed PlayBound launcher for Windows, version $version.

This is the public signed release. [Download from PlayBound](https://playbound.club/api/launcher/download/PlayBound-Setup-$version.exe) for the R2/VPS mirror and automatic updates.
"@
  $notesPath = Join-Path $work 'notes.md'
  Set-Content -LiteralPath $notesPath -Value $notes -Encoding utf8
  & gh release create $tag $installer --target main --title "PlayBound $version" --notes-file $notesPath --latest
  if ($LASTEXITCODE -ne 0) { throw "Could not create GitHub release $tag." }
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force
}
