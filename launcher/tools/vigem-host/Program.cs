using System.Runtime.InteropServices;
using System.Text.Json;
using Nefarius.ViGEm.Client;
using Nefarius.ViGEm.Client.Targets;
using Nefarius.ViGEm.Client.Targets.Xbox360;

namespace PlayBound.VigemHost;

/// <summary>
/// Line-delimited JSON stdin/stdout bridge to ViGEm X360 pads, plus
/// PlayBound Controls' keyboard/mouse synthesis (SendInput). Both live in
/// this one process because it is already the signed, vendored native
/// sidecar the launcher spawns and IPCs with — adding SendInput here avoids
/// standing up a second native toolchain just for keyboard/mouse output.
/// Spawned by the Electron launcher — no node-gyp required.
/// </summary>
internal static class Program
{
    private static ViGEmClient? _client;
    private static readonly Dictionary<int, IXbox360Controller> Pads = new();
    private static double _mouseRemainderX;
    private static double _mouseRemainderY;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private static int Main()
    {
        Console.InputEncoding = System.Text.Encoding.UTF8;
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            line = line.Trim();
            if (line.Length == 0) continue;
            try
            {
                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;
                var cmd = root.GetProperty("cmd").GetString() ?? "";
                switch (cmd)
                {
                    case "probe":
                        Probe();
                        break;
                    case "create":
                        Create(root.GetProperty("slot").GetInt32());
                        break;
                    case "remove":
                        Remove(root.GetProperty("slot").GetInt32());
                        break;
                    case "update":
                        Update(root);
                        break;
                    case "key":
                        SendKey(root.GetProperty("vk").GetInt32(), root.GetProperty("action").GetString() ?? "");
                        break;
                    case "mouseMove":
                        SendMouseMove(RawNumber(root, "dx"), RawNumber(root, "dy"));
                        break;
                    case "mouseButton":
                        SendMouseButton(root.GetProperty("button").GetString() ?? "", root.GetProperty("action").GetString() ?? "");
                        break;
                    case "quit":
                        DisposeAll();
                        Reply(true, "quit");
                        return 0;
                    default:
                        Reply(false, "error", error: $"unknown cmd: {cmd}");
                        break;
                }
            }
            catch (Exception ex)
            {
                Reply(false, "error", error: ex.Message);
            }
        }

        DisposeAll();
        return 0;
    }

    private static void Probe()
    {
        try
        {
            EnsureClient();
            Reply(true, "probe");
        }
        catch (Exception ex)
        {
            Reply(false, "probe", error: ex.Message);
        }
    }

    private static void EnsureClient()
    {
        _client ??= new ViGEmClient();
    }

    private static void Create(int slot)
    {
        EnsureClient();
        if (Pads.ContainsKey(slot))
        {
            Reply(true, "created", slot);
            return;
        }
        var pad = _client!.CreateXbox360Controller();
        pad.Connect();
        Pads[slot] = pad;
        Reply(true, "created", slot);
    }

    private static void Remove(int slot)
    {
        if (Pads.TryGetValue(slot, out var pad))
        {
            try { pad.Disconnect(); } catch { /* ignore */ }
            Pads.Remove(slot);
        }
        Reply(true, "removed", slot);
    }

    private static void Update(JsonElement root)
    {
        var slot = root.GetProperty("slot").GetInt32();
        if (!Pads.TryGetValue(slot, out var pad))
        {
            Create(slot);
            pad = Pads[slot];
        }

        var buttons = root.TryGetProperty("buttons", out var b) ? b.GetUInt32() : 0u;
        SetButton(pad, Xbox360Button.A, (buttons & (1u << 0)) != 0);
        SetButton(pad, Xbox360Button.B, (buttons & (1u << 1)) != 0);
        SetButton(pad, Xbox360Button.X, (buttons & (1u << 2)) != 0);
        SetButton(pad, Xbox360Button.Y, (buttons & (1u << 3)) != 0);
        SetButton(pad, Xbox360Button.LeftShoulder, (buttons & (1u << 4)) != 0);
        SetButton(pad, Xbox360Button.RightShoulder, (buttons & (1u << 5)) != 0);
        SetButton(pad, Xbox360Button.Back, (buttons & (1u << 6)) != 0);
        SetButton(pad, Xbox360Button.Start, (buttons & (1u << 7)) != 0);
        SetButton(pad, Xbox360Button.LeftThumb, (buttons & (1u << 8)) != 0);
        SetButton(pad, Xbox360Button.RightThumb, (buttons & (1u << 9)) != 0);
        SetButton(pad, Xbox360Button.Up, (buttons & (1u << 10)) != 0);
        SetButton(pad, Xbox360Button.Down, (buttons & (1u << 11)) != 0);
        SetButton(pad, Xbox360Button.Left, (buttons & (1u << 12)) != 0);
        SetButton(pad, Xbox360Button.Right, (buttons & (1u << 13)) != 0);
        SetButton(pad, Xbox360Button.Guide, (buttons & (1u << 14)) != 0);

        var lx = Axis(root, "lx");
        var ly = Axis(root, "ly");
        var rx = Axis(root, "rx");
        var ry = Axis(root, "ry");
        // ViGEm Y: up is positive; our protocol uses down-positive like Gamepad API.
        pad.SetAxisValue(Xbox360Axis.LeftThumbX, ToShort(lx));
        pad.SetAxisValue(Xbox360Axis.LeftThumbY, ToShort(-ly));
        pad.SetAxisValue(Xbox360Axis.RightThumbX, ToShort(rx));
        pad.SetAxisValue(Xbox360Axis.RightThumbY, ToShort(-ry));

        var lt = Trigger(root, "lt");
        var rt = Trigger(root, "rt");
        pad.SetSliderValue(Xbox360Slider.LeftTrigger, ToByte(lt));
        pad.SetSliderValue(Xbox360Slider.RightTrigger, ToByte(rt));

        pad.SubmitReport();
        // High-frequency path: no per-update reply (caller does not wait).
    }

    private static void SetButton(IXbox360Controller pad, Xbox360Button button, bool down)
    {
        pad.SetButtonState(button, down);
    }

    private static float Axis(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el)) return 0f;
        var v = el.GetDouble();
        if (double.IsNaN(v) || double.IsInfinity(v)) return 0f;
        return (float)Math.Clamp(v, -1.0, 1.0);
    }

    /// <summary>Unclamped double read — for mouse deltas (pixels), not stick axes.</summary>
    private static double RawNumber(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el)) return 0.0;
        var v = el.GetDouble();
        return double.IsNaN(v) || double.IsInfinity(v) ? 0.0 : v;
    }

    private static float Trigger(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el)) return 0f;
        var v = el.GetDouble();
        if (double.IsNaN(v) || double.IsInfinity(v)) return 0f;
        return (float)Math.Clamp(v, 0.0, 1.0);
    }

    private static short ToShort(float v) => (short)Math.Clamp(Math.Round(v * short.MaxValue), short.MinValue, short.MaxValue);

    private static byte ToByte(float v) => (byte)Math.Clamp(Math.Round(v * 255.0), 0, 255);

    // ── PlayBound Controls: keyboard/mouse synthesis (Win32 SendInput) ─────
    //
    // A minimal SendInput wrapper — just the three shapes the Input Engine
    // actually emits (see launcher/services/inputEngine/index.js). No
    // scan-code fallback, no Unicode text input: PlayBound Controls only
    // ever synthesizes discrete key up/down and relative mouse motion.

    private const int InputKeyboard = 1;
    private const int InputMouse = 0;
    private const uint KeyeventfKeyup = 0x0002;
    private const uint MouseeventfMove = 0x0001;
    private const uint MouseeventfLeftdown = 0x0002;
    private const uint MouseeventfLeftup = 0x0004;
    private const uint MouseeventfRightdown = 0x0008;
    private const uint MouseeventfRightup = 0x0010;
    private const uint MouseeventfMiddledown = 0x0020;
    private const uint MouseeventfMiddleup = 0x0040;

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInputData
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeybdInputData
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MouseInputData mi;
        [FieldOffset(0)] public KeybdInputData ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public int type;
        public InputUnion u;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, Input[] pInputs, int cbSize);

    private static void SendKey(int vk, string action)
    {
        var input = new Input
        {
            type = InputKeyboard,
            u = new InputUnion
            {
                ki = new KeybdInputData
                {
                    wVk = (ushort)vk,
                    wScan = 0,
                    dwFlags = action == "up" ? KeyeventfKeyup : 0,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero,
                },
            },
        };
        SendInput(1, new[] { input }, Marshal.SizeOf<Input>());
    }

    private static void SendMouseMove(double dx, double dy)
    {
        // Preserve sub-pixel motion across 120 Hz frames. Rounding each frame
        // independently makes low sensitivity look input feel like zero motion.
        _mouseRemainderX += dx;
        _mouseRemainderY += dy;
        var pixelsX = (int)Math.Truncate(_mouseRemainderX);
        var pixelsY = (int)Math.Truncate(_mouseRemainderY);
        _mouseRemainderX -= pixelsX;
        _mouseRemainderY -= pixelsY;
        if (pixelsX == 0 && pixelsY == 0) return;
        // Relative motion only — PlayBound Controls never warps the cursor
        // to an absolute position, so MOUSEEVENTF_ABSOLUTE is never set.
        var input = new Input
        {
            type = InputMouse,
            u = new InputUnion
            {
                mi = new MouseInputData
                {
                    dx = pixelsX,
                    dy = pixelsY,
                    mouseData = 0,
                    dwFlags = MouseeventfMove,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero,
                },
            },
        };
        SendInput(1, new[] { input }, Marshal.SizeOf<Input>());
    }

    private static void SendMouseButton(string button, string action)
    {
        var down = action != "up";
        uint flag = button switch
        {
            "right" => down ? MouseeventfRightdown : MouseeventfRightup,
            "middle" => down ? MouseeventfMiddledown : MouseeventfMiddleup,
            _ => down ? MouseeventfLeftdown : MouseeventfLeftup,
        };
        var input = new Input
        {
            type = InputMouse,
            u = new InputUnion
            {
                mi = new MouseInputData
                {
                    dx = 0,
                    dy = 0,
                    mouseData = 0,
                    dwFlags = flag,
                    time = 0,
                    dwExtraInfo = IntPtr.Zero,
                },
            },
        };
        SendInput(1, new[] { input }, Marshal.SizeOf<Input>());
    }

    private static void DisposeAll()
    {
        foreach (var kv in Pads)
        {
            try { kv.Value.Disconnect(); } catch { /* ignore */ }
        }
        Pads.Clear();
        try { _client?.Dispose(); } catch { /* ignore */ }
        _client = null;
    }

    private static void Reply(bool ok, string eventName, int? slot = null, string? error = null)
    {
        var payload = new Dictionary<string, object?>
        {
            ["ok"] = ok,
            ["event"] = eventName,
        };
        if (slot != null) payload["slot"] = slot.Value;
        if (error != null) payload["error"] = error;
        Console.WriteLine(JsonSerializer.Serialize(payload));
        Console.Out.Flush();
    }
}
