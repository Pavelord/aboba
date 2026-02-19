using ConnSniffer.Interop;
using PacketDotNet;
using SharpPcap;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;

namespace ConnSniffer.Services;

public sealed class CaptureService
{
    public event EventHandler<string>? DomainObserved;
    public event EventHandler<string>? ConnectionObserved;
    public event EventHandler? TargetExited;

    private readonly List<ICaptureDevice> _devices = new();
    private readonly ProcessConnectionResolver _resolver = new();
    private readonly DnsParser _dnsParser = new();
    private readonly TlsSniParser _tlsSniParser = new();
    private readonly ConcurrentDictionary<string, DateTime> _dnsToIp = new();
    private readonly TimeSpan _correlationWindow = TimeSpan.FromMinutes(5);

    private Process? _targetProcess;
    private int _targetPid;
    private bool _running;

    public void Start(int targetPid, string targetName)
    {
        Stop();

        _targetPid = targetPid;
        _targetProcess = Process.GetProcessById(targetPid);
        _targetProcess.EnableRaisingEvents = true;
        _targetProcess.Exited += (_, _) => TargetExited?.Invoke(this, EventArgs.Empty);

        var list = CaptureDeviceList.Instance;
        foreach (var dev in list)
        {
            dev.OnPacketArrival += OnPacket;
            dev.Open(DeviceModes.Promiscuous | DeviceModes.NoCaptureLocal, 1000);
            dev.Filter = "ip or ip6";
            dev.StartCapture();
            _devices.Add(dev);
        }

        _running = true;
    }

    public void Stop()
    {
        if (!_running)
        {
            return;
        }

        foreach (var dev in _devices)
        {
            try
            {
                dev.OnPacketArrival -= OnPacket;
                dev.StopCapture();
                dev.Close();
            }
            catch
            {
                // best effort
            }
        }

        _devices.Clear();
        _running = false;
    }

    private void OnPacket(object sender, PacketCapture capture)
    {
        var raw = capture.GetPacket();
        var packet = Packet.ParsePacket(raw.LinkLayerType, raw.Data);
        var ts = raw.Timeval.Date;

        if (TryHandleDns(packet, ts))
        {
            return;
        }

        TryHandleConnection(packet, ts);
    }

    private bool TryHandleDns(Packet packet, DateTime timestamp)
    {
        var udp = packet.Extract<UdpPacket>();
        var ip4 = packet.Extract<IPv4Packet>();
        var ip6 = packet.Extract<IPv6Packet>();
        if (udp is null || (udp.SourcePort != 53 && udp.DestinationPort != 53))
        {
            return false;
        }

        var payload = udp.PayloadData;
        if (payload.Length < 12)
        {
            return false;
        }

        var records = _dnsParser.Parse(payload);
        foreach (var rec in records)
        {
            DomainObserved?.Invoke(this, rec.Domain);
            foreach (var ip in rec.Ips)
            {
                _dnsToIp[$"{ip}|{rec.Domain}"] = timestamp;
            }
        }

        return true;
    }

    private void TryHandleConnection(Packet packet, DateTime timestamp)
    {
        var tcp = packet.Extract<TcpPacket>();
        var udp = packet.Extract<UdpPacket>();
        var ip4 = packet.Extract<IPv4Packet>();
        var ip6 = packet.Extract<IPv6Packet>();

        if (ip4 is null && ip6 is null)
        {
            return;
        }

        var src = ip4?.SourceAddress ?? ip6!.SourceAddress;
        var dst = ip4?.DestinationAddress ?? ip6!.DestinationAddress;

        int? srcPort = tcp?.SourcePort ?? udp?.SourcePort;
        int? dstPort = tcp?.DestinationPort ?? udp?.DestinationPort;
        if (srcPort is null || dstPort is null)
        {
            return;
        }

        var ownerPid = _resolver.ResolveOwningPid(src, dst, srcPort.Value, dstPort.Value, tcp is not null);
        if (ownerPid != _targetPid)
        {
            return;
        }

        ConnectionObserved?.Invoke(this, dst.ToString());

        if (tcp?.PayloadData?.Length > 0)
        {
            var sni = _tlsSniParser.TryParseSni(tcp.PayloadData);
            if (!string.IsNullOrWhiteSpace(sni))
            {
                DomainObserved?.Invoke(this, sni);
            }
        }

        foreach (var pair in _dnsToIp)
        {
            var split = pair.Key.Split('|');
            if (split.Length != 2)
            {
                continue;
            }

            if (IPAddress.TryParse(split[0], out var dnsIp) && dnsIp.Equals(dst) && timestamp - pair.Value <= _correlationWindow)
            {
                DomainObserved?.Invoke(this, split[1]);
            }
        }
    }
}
