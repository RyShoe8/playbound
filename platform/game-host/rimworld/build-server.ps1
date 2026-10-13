param([Parameter(Mandatory = $true)][string]$WorkDirectory)
$ErrorActionPreference = 'Stop'
$work = [IO.Path]::GetFullPath($WorkDirectory)
$source = Join-Path $work 'source'
if (Test-Path -LiteralPath $source) { throw 'Choose a fresh work directory; this build never resets an existing checkout.' }
New-Item -ItemType Directory -Path $source -Force | Out-Null
git -C $source init --quiet
git -C $source fetch --depth 1 https://github.com/RimWorld-Together/Rimworld-Together.git bbd981f3b01255198a66bd8fb6c57ed0595c8db4
if ($LASTEXITCODE) { throw 'Upstream source fetch failed' }
git -C $source checkout --detach FETCH_HEAD --quiet
if ($LASTEXITCODE) { throw 'Upstream checkout failed' }
$project = Join-Path $source 'Source\Server'
$programFile = Join-Path $project 'Core\Program.cs'
$program = Get-Content -LiteralPath $programFile -Raw
if (!$program.Contains('static void Main()') -or !$program.Contains('ServerNetwork.StartFeature();')) { throw 'Pinned source no longer matches the bridge hooks' }
$program = $program.Replace('static void Main()', 'static void Main(string[] args)').Replace('ServerPrinter.CreateLogger();', 'if (args.Length == 1 && args[0] == "--playbound-browser-query") { try { RTServer.PlayBound.Bridge.QueryBrowser().GetAwaiter().GetResult(); } catch (Exception error) { Console.Error.WriteLine("RimWorld browser unavailable: " + error.Message); Environment.ExitCode = 1; } return; }' + "`n            ServerPrinter.CreateLogger();").Replace('ServerNetwork.StartFeature();', 'ServerNetwork.StartFeature();' + "`n            RTServer.PlayBound.Bridge.StartSnapshots();")
Set-Content -LiteralPath $programFile -Value $program
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'PlayBoundBridge.cs') -Destination (Join-Path $project 'PlayBoundBridge.cs')
dotnet publish (Join-Path $project 'RTServer.csproj') -c Release -r linux-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o (Join-Path $work 'publish')
if ($LASTEXITCODE) { throw 'RimWorld server bridge build failed' }
Copy-Item -LiteralPath (Join-Path $source 'LICENSE') -Destination (Join-Path $work 'publish\UPSTREAM-LICENSE') -ErrorAction SilentlyContinue
