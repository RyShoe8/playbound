using System.Text.Json;
using Nefarius.ViGEm.Client;
using Nefarius.ViGEm.Client.Targets;
using Nefarius.ViGEm.Client.Targets.Xbox360;

namespace PlayBound.VigemHost;

/// <summary>
/// Line-delimited JSON stdin/stdout bridge to ViGEm X360 pads.
/// Spawned by the Electron launcher — no node-gyp required.
/// </summary>
internal static class Program
{
    private static ViGEmClient? _client;
    private static readonly Dictionary<int, IXbox360Controller> Pads = new();

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

    private static float Trigger(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var el)) return 0f;
        var v = el.GetDouble();
        if (double.IsNaN(v) || double.IsInfinity(v)) return 0f;
        return (float)Math.Clamp(v, 0.0, 1.0);
    }

    private static short ToShort(float v) => (short)Math.Clamp(Math.Round(v * short.MaxValue), short.MinValue, short.MaxValue);

    private static byte ToByte(float v) => (byte)Math.Clamp(Math.Round(v * 255.0), 0, 255);

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
