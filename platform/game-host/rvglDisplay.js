import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const DISPLAY_ROOT = "/var/lib/playbound-host/rvgl-displays";
const KEYS = new Set(["Up", "Down", "Left", "Right", "Return", "Escape", "BackSpace", "Tab", "space"]);

export function rvglDisplayForPort(port) {
  if (!Number.isInteger(port) || port < 2310 || port > 2330) throw new Error("Invalid RVGL room port");
  return { display: `:${port}`, authFile: `${DISPLAY_ROOT}/${port}.xauth` };
}

export function validateRvglInput(input) {
  if (input?.type === "click" && Number.isInteger(input.x) && Number.isInteger(input.y)
      && input.x >= 0 && input.x < 640 && input.y >= 0 && input.y < 480) {
    return { type: "click", x: input.x, y: input.y };
  }
  if (input?.type === "key" && KEYS.has(input.key)) return { type: "key", key: input.key };
  throw new Error("Invalid RVGL lobby input");
}

function envFor(port) {
  const { display, authFile } = rvglDisplayForPort(port);
  return { ...process.env, DISPLAY: display, XAUTHORITY: authFile };
}

export async function captureRvglLobby(port) {
  const { stdout } = await run("import", ["-window", "root", "-quality", "68", "jpeg:-"], {
    env: envFor(port), encoding: "buffer", timeout: 5000, maxBuffer: 2 * 1024 * 1024,
  });
  if (!Buffer.isBuffer(stdout) || stdout.length < 4 || stdout[0] !== 0xff || stdout[1] !== 0xd8) {
    throw new Error("RVGL lobby capture did not return a JPEG");
  }
  return stdout.toString("base64");
}

export async function sendRvglLobbyInput(port, rawInput) {
  const input = validateRvglInput(rawInput);
  const options = { env: envFor(port), timeout: 3000, maxBuffer: 1024 };
  await run("xdotool", ["mousemove", String(input.type === "click" ? input.x : 320),
    String(input.type === "click" ? input.y : 240)], options);
  const { stdout } = await run("xdotool", ["getmouselocation", "--shell"], options);
  const windowId = /^WINDOW=(\d+)$/m.exec(stdout)?.[1];
  if (!windowId || windowId === "0") throw new Error("RVGL lobby window is not visible");
  await run("xdotool", ["windowfocus", windowId], options);
  await run("xdotool", input.type === "click" ? ["click", "1"] : ["key", "--clearmodifiers", input.key], options);
}
