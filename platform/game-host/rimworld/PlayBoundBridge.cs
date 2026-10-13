// Compiled into the pinned upstream server by build-server.ps1. No client patch.
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using RTNetwork.Components;
using RTNetwork.Packets;
using RTNetwork.Packets.ServerBrowser;
using RTServer.Core;
using RTServer.Hooks.TCPNetwork;
using RTShared.Commands;
using RTShared.Files.Player;
using RTShared.Misc;

namespace RTServer.PlayBound;

public static class Bridge
{
    public static void StartSnapshots()
    {
        Task.Run(async () => {
            while (true)
            {
                try
                {
                    var players = ServerNetwork.GetConnectedClients().Select(client => {
                        var name = client.GetData<FL_Player>()?.Username;
                        return new { id = name == null ? null : Convert.ToBase64String(Encoding.UTF8.GetBytes(name)), name = name ?? "Connecting player", address = client.IP };
                    }).ToArray();
                    var snapshot = new { pid = Environment.ProcessId, updatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), maxPlayers = Master.ServerConfig.MaxPlayers, players };
                    var target = Path.Combine(Master.MainPath, "playbound-status.json");
                    await File.WriteAllTextAsync(target + ".tmp", JsonSerializer.Serialize(snapshot));
                    File.Move(target + ".tmp", target, true);
                }
                catch { /* A failed sample stays stale, never an invented empty list. */ }
                await Task.Delay(1000);
            }
        });
    }

    public static async Task QueryBrowser()
    {
        var answer = new TaskCompletionSource<PKT_ServerInformation>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var tcp = new TcpClient();
        await tcp.ConnectAsync(Network.MultipurposeIP, Network.BrowserClientPort).WaitAsync(TimeSpan.FromSeconds(8));
        Console.Error.WriteLine("RimWorld browser TCP connection established");
        var rules = new NetworkRuleset(null, _ => answer.TrySetException(new IOException("RimWorld browser disconnected")), (header, bytes, client) => {
            Console.Error.WriteLine($"RimWorld browser packet: {header}");
            if (header == PacketHeader.Handshake)
            {
                var handshake = Serializer.ConvertBytesToObject<PKT_Handshake>(bytes);
                if (handshake.CurrentMode == PKT_Handshake.StepMode.Deny) { answer.TrySetException(new IOException("Browser handshake rejected")); return; }
                client.VerifyClient();
            }
            else if (header == PacketHeader.ServerBrowserListing)
                answer.TrySetResult(Serializer.ConvertBytesToObject<PKT_ServerInformation>(bytes));
        }, null, false);
        var connection = new ServerClient(tcp, rules);
        connection.Listener.EnqueuePacket(PacketHeader.Handshake, new PKT_Handshake {
            IncomingManagers = new List<string> { "PM_Handshake", "PM_Listing", "PM_Report", "PM_Telemetry", "PM_ServerCode", "PM_Disconnect", "PM_KeepAlive" }
        });
        // Match the official client's handshake/listing packet order. The
        // browser can defer its reply until it receives the listing request.
        connection.Listener.EnqueuePacket(PacketHeader.ServerBrowserListing, new PKT_ServerInformation { ClientVersion = "dev" });
        var result = await answer.Task.WaitAsync(TimeSpan.FromSeconds(8));
        Console.WriteLine("PLAYBOUND_BROWSER=" + JsonSerializer.Serialize(result.Listings.Select(server => new {
            name = server.Name, host = server.Endpoint, port = server.Port,
            players = server.CurrentPopulation, maxPlayers = server.MaxPopulation,
            version = server.Version, passwordProtected = server.PasswordProtected, isPrivate = server.IsPrivate
        })));
        connection.Listener.MarkForDisconnect();
    }
}

// Native commands split on spaces. A base64 username handles names containing
// spaces without console injection or accidentally kicking a different user.
public class CMD_PlayBoundKick : CMD_Base
{
    public CMD_PlayBoundKick() { Prefix = "pbkick"; ParameterCount = 1; Description = "Kick a player by encoded username"; }
    public override void Action()
    {
        var name = Encoding.UTF8.GetString(Convert.FromBase64String(CommandParameters[0]));
        var client = ServerNetwork.GetConnectedClientFromUsername(name);
        if (client == null) Printer.Warning("Player has left");
        else { client.Listener.MarkForDisconnect(); Printer.Warning($"Kicked {name}"); }
    }
}
