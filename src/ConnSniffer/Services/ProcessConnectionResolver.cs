using ConnSniffer.Interop;
using System.Net;
using System.Runtime.InteropServices;

namespace ConnSniffer.Services;

public sealed class ProcessConnectionResolver
{
    public int ResolveOwningPid(IPAddress srcIp, IPAddress dstIp, int srcPort, int dstPort, bool tcp)
    {
        return tcp ? ResolveTcpPid(srcIp, dstIp, srcPort, dstPort) : ResolveUdpPid(srcIp, dstIp, srcPort, dstPort);
    }

    private static int ResolveTcpPid(IPAddress srcIp, IPAddress dstIp, int srcPort, int dstPort)
    {
        foreach (var row in IpHelper.GetAllTcpRows())
        {
            if (row.LocalPort == srcPort && row.RemotePort == dstPort)
            {
                return (int)row.OwningPid;
            }

            // fallback direction
            if (row.LocalPort == dstPort && row.RemotePort == srcPort)
            {
                return (int)row.OwningPid;
            }
        }

        return -1;
    }

    private static int ResolveUdpPid(IPAddress srcIp, IPAddress dstIp, int srcPort, int dstPort)
    {
        foreach (var row in IpHelper.GetAllUdpRows())
        {
            if (row.LocalPort == srcPort || row.LocalPort == dstPort)
            {
                return (int)row.OwningPid;
            }
        }

        return -1;
    }
}
