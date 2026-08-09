const os = require("os");

/**
 * @typedef {Object} PlatformService
 * @property {function(): string} getOS - Returns 'windows', 'macos', or 'linux'.
 * @property {function(): string} getOSVersion
 * @property {function(): string} getArchitecture - e.g. 'x64', 'arm64'
 * @property {function(): string} getExecutableExtension - e.g. '.exe', '.app', ''
 * @property {function(string): string} getInstallDirectory - Returns default install path.
 * @property {function(): string} getDownloadsDirectory - Returns downloads path.
 * @property {function(): string} getTempDirectory - Returns temporary directory.
 * @property {function(string): Promise<void>} openFolder - Opens a folder in the native file manager.
 * @property {function(string): Promise<void>} openFile - Opens a file with default native application.
 * @property {function(string): boolean} fileExists - Synchronous file exists check.
 * @property {function({title: string, targetPath: string, args?: string, icon?: string, description?: string}): Promise<void>} createShortcut - Creates OS-specific shortcut.
 * @property {function(string): Promise<void>} removeShortcut
 * @property {function(): boolean} supportsDesktopShortcuts
 * @property {function(): boolean} supportsStartMenuShortcuts
 * @property {function(): boolean} supportsDock
 * @property {function(number): void} killProcess - Kills a process by PID.
 * @property {function(string): string[]} getGameLaunchCommand - Gets array of command + args to launch game.
 */

let platformImpl = null;

if (process.platform === "win32") {
  platformImpl = require("./windows");
} else if (process.platform === "darwin") {
  platformImpl = require("./macos");
} else {
  platformImpl = require("./linux");
}

/** @type {PlatformService} */
module.exports = platformImpl;
