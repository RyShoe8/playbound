/** Only runtime configuration crosses from the control agent into a game.
 * Filtering after recipe overrides also prevents a spread of process.env in a
 * recipe from reintroducing credentials. This is not OS/process isolation. */
const RUNTIME_KEYS = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE", "TZ", "TERM",
  "TMPDIR", "TMP", "TEMP", "DISPLAY", "XAUTHORITY",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR",
  "LD_LIBRARY_PATH", "LIBRARY_PATH", "SSL_CERT_FILE", "SSL_CERT_DIR",
  "WINEPREFIX", "WINEARCH", "WINEDEBUG", "WINEDLLOVERRIDES",
  "DOTNET_ROOT", "DOTNET_BUNDLE_EXTRACT_BASE_DIR", "DOTNET_EnableDiagnostics", "MONO_PATH",
  "SDL_VIDEODRIVER", "SDL_AUDIODRIVER", "SDL_GAMECONTROLLERCONFIG",
  "STEAM_RUNTIME", "SteamAppId", "SteamGameId", "SteamClientLaunch", "STEAM_COMPAT_CLIENT_INSTALL_PATH",
  "APPIMAGE_EXTRACT_AND_RUN", "DOTNET_SYSTEM_GLOBALIZATION_INVARIANT",
  "ALSOFT_DRIVERS", "VELOREN_ASSETS", "DOOMWADDIR", "DOOMWADPATH",
  "BOT_COMMENT", "BOT_NAME", "BOT_PORT", "BOT_LOBBY_URI", "MAPS_FOLDER",
]);

export function gameEnvironment(parent = {}, overrides = {}) {
  const output = {};
  for (const [key, value] of Object.entries({ ...parent, ...overrides })) {
    if (RUNTIME_KEYS.has(key) && typeof value === "string" && !value.includes("\0")) output[key] = value;
  }
  if (!output.PATH) output.PATH = "/usr/local/bin:/usr/bin:/bin:/usr/games";
  return output;
}
