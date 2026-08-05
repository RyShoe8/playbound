const { spawn } = require("child_process");
const path = require("path");
const Platform = require("../platform");

/**
 * GameLauncher abstraction that handles executing games based on capabilities
 * instead of hardcoded .exe assumptions.
 */
class GameLauncher {
  /**
   * Spawns a game process detached and returns the child process.
   * @param {string} targetPath - Path to the executable or .app bundle
   * @param {string[]} args - Additional arguments
   * @returns {import("child_process").ChildProcess}
   */
  static spawnGame(targetPath, args = []) {
    const launchCommand = Platform.getGameLaunchCommand(targetPath);
    
    // getGameLaunchCommand returns [cmd, ...implicitArgs]
    // For Windows, it returns [targetPath]
    // For Mac with .app, it returns ['open', '-a', targetPath]
    
    const cmd = launchCommand[0];
    const finalArgs = [...launchCommand.slice(1), ...args];

    const useShell = /\.(cmd|bat)$/i.test(targetPath);
    
    const child = spawn(cmd, finalArgs, {
      cwd: path.dirname(targetPath),
      detached: true,
      stdio: "ignore",
      shell: useShell,
    });

    return child;
  }
}

module.exports = GameLauncher;
