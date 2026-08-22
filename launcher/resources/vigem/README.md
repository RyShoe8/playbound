# ViGEmBus redistributable (Nefarius) + Couch Mode controller host

| File | Role |
| --- | --- |
| `ViGEmBus_Setup.exe` | Silent driver install (`/quiet`), pinned in `VERSION` |
| `LICENSE` | ViGEmBus MIT license |
| `PlayBound.VigemHost.ps1` | Line-JSON host that creates virtual Xbox pads |
| `lib/Nefarius.ViGEm.Client.dll` | Vendored from NuGet `Nefarius.ViGEm.Client` |

Players never download these separately. PlayBound Setup and/or **Start Couch Mode** install the driver automatically.

Maintainers: `node scripts/vendor-vigem.js` and `node scripts/vendor-vigem-client.js`.
Optional: `node scripts/build-vigem-host.js` when a .NET SDK is available.
