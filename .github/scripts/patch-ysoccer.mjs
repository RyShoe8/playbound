import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "upstream");
function edit(relative, edits) {
  const file = path.join(root, relative);
  let text = fs.readFileSync(file, "utf8");
  for (const [before, after] of edits) {
    if (!text.includes(before)) throw new Error(`Upstream shape changed in ${relative}`);
    text = text.replace(before, after);
  }
  fs.writeFileSync(file, text);
}

edit("java/core/src/main/java/com/ygames/ysoccer/YSoccer.java", [
  ["import com.ygames.ysoccer.framework.GLGame;", "import com.ygames.ysoccer.framework.GLGame;\nimport com.ygames.ysoccer.framework.Settings;"],
  ["import com.ygames.ysoccer.screens.Main;", "import com.ygames.ysoccer.screens.Main;\nimport com.ygames.ysoccer.screens.OnlineMatchConnect;"],
  ["public class YSoccer extends GLGame {", `public class YSoccer extends GLGame {
    private final String connectHost;
    private final int tcpPort;
    private final int udpPort;

    public YSoccer() { this(null, 0, 0); }
    public YSoccer(String connectHost, int tcpPort, int udpPort) {
        this.connectHost = connectHost;
        this.tcpPort = tcpPort;
        this.udpPort = udpPort;
    }`],
  ["        if (settings.showIntro) {", `        if (connectHost != null && !connectHost.isEmpty()) {
            Settings.serverAddress = connectHost;
            Settings.tcpPort = tcpPort;
            Settings.udpPort = udpPort;
            settings.save();
            this.setScreen(new OnlineMatchConnect(this, true));
            return;
        }

        if (settings.showIntro) {`],
]);

edit("java/core/src/main/java/com/ygames/ysoccer/screens/OnlineMatchConnect.java", [
  ["    public OnlineMatchConnect(GLGame game) {", "    public OnlineMatchConnect(GLGame game) { this(game, false); }\n\n    public OnlineMatchConnect(GLGame game, boolean connectImmediately) {"],
  ["        widgets.add(w);\n    }\n\n    private class ServerLabel", `        widgets.add(w);

        if (connectImmediately) connectToServer();
    }

    private void connectToServer() {
        game.settings.save();
        try {
            errorLabel.setText("");
            client.connect(5000, Settings.serverAddress, Settings.tcpPort, Settings.udpPort);
        } catch (IOException e) {
            errorLabel.setText(e.getMessage().toUpperCase());
        }
    }

    private class ServerLabel`],
  [`            game.settings.save();
            try {
                errorLabel.setText("");
                client.connect(5000, Settings.serverAddress, Settings.tcpPort, Settings.udpPort);
            } catch (IOException e) {
                errorLabel.setText(e.getMessage().toUpperCase());
            }`, "            connectToServer();"],
]);

edit("java/lwjgl3/src/main/java/com/ygames/ysoccer/lwjgl3/Lwjgl3Launcher.java", [
  ["        createApplication();", "        createApplication(args);"],
  [`    private static Lwjgl3Application createApplication() {
        return new Lwjgl3Application(new YSoccer(), getDefaultConfiguration());
    }`, `    private static String value(String[] args, String key, String fallback) {
        for (String arg : args) if (arg.startsWith(key + "=")) return arg.substring(key.length() + 1);
        return fallback;
    }

    private static int port(String[] args, String key, int fallback) {
        try { return Integer.parseInt(value(args, key, String.valueOf(fallback))); }
        catch (NumberFormatException ignored) { return fallback; }
    }

    private static Lwjgl3Application createApplication(String[] args) {
        String host = value(args, "--connect", "");
        int tcp = port(args, "--tcp-port", 54555);
        int udp = port(args, "--udp-port", 54777);
        return new Lwjgl3Application(new YSoccer(host, tcp, udp), getDefaultConfiguration());
    }`],
]);

edit("java/server/src/main/java/com/ygames/ysoccer/server/ServerGame.java", [
  ["public class ServerGame extends Game {", `public class ServerGame extends Game {
    private final int tcpPort;
    private final int udpPort;

    public ServerGame(int tcpPort, int udpPort) {
        this.tcpPort = tcpPort;
        this.udpPort = udpPort;
    }`],
  ["        Settings settings = new Settings();", "        Settings settings = new Settings();\n        Settings.tcpPort = tcpPort;\n        Settings.udpPort = udpPort;"],
]);

edit("java/server/src/main/java/com/ygames/ysoccer/server/ServerLauncher.java", [
  ["        createApplication();", "        int tcp = args.length > 0 ? Integer.parseInt(args[0]) : 54555;\n        int udp = args.length > 1 ? Integer.parseInt(args[1]) : 54777;\n        createApplication(tcp, udp);"],
  ["    private static Application createApplication() {", "    private static Application createApplication(int tcpPort, int udpPort) {"],
  ["return new HeadlessApplication(new ServerGame(), getDefaultConfiguration());", "return new HeadlessApplication(new ServerGame(tcpPort, udpPort), getDefaultConfiguration());"],
]);
