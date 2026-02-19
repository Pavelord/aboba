using System.Runtime.InteropServices;

namespace ConnSniffer.Interop;

public static class IpHelper
{
    private const int AfInet = 2;
    private const int TcpTableOwnerPidAll = 5;
    private const int UdpTableOwnerPid = 1;

    [DllImport("iphlpapi.dll", SetLastError = true)]
    private static extern uint GetExtendedTcpTable(IntPtr pTcpTable, ref int dwOutBufLen, bool sort, int ipVersion, int tableClass, uint reserved);

    [DllImport("iphlpapi.dll", SetLastError = true)]
    private static extern uint GetExtendedUdpTable(IntPtr pUdpTable, ref int dwOutBufLen, bool sort, int ipVersion, int tableClass, uint reserved);

    public static IReadOnlyList<MibTcpRowOwnerPid> GetAllTcpRows()
    {
        var size = 0;
        _ = GetExtendedTcpTable(IntPtr.Zero, ref size, true, AfInet, TcpTableOwnerPidAll, 0);
        var buffer = Marshal.AllocHGlobal(size);
        try
        {
            var result = GetExtendedTcpTable(buffer, ref size, true, AfInet, TcpTableOwnerPidAll, 0);
            if (result != 0)
            {
                return Array.Empty<MibTcpRowOwnerPid>();
            }

            var count = Marshal.ReadInt32(buffer);
            var rows = new List<MibTcpRowOwnerPid>(count);
            var rowPtr = buffer + 4;
            var rowSize = Marshal.SizeOf<MibTcpRowOwnerPid>();
            for (var i = 0; i < count; i++)
            {
                rows.Add(Marshal.PtrToStructure<MibTcpRowOwnerPid>(rowPtr + i * rowSize));
            }

            return rows;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    public static IReadOnlyList<MibUdpRowOwnerPid> GetAllUdpRows()
    {
        var size = 0;
        _ = GetExtendedUdpTable(IntPtr.Zero, ref size, true, AfInet, UdpTableOwnerPid, 0);
        var buffer = Marshal.AllocHGlobal(size);
        try
        {
            var result = GetExtendedUdpTable(buffer, ref size, true, AfInet, UdpTableOwnerPid, 0);
            if (result != 0)
            {
                return Array.Empty<MibUdpRowOwnerPid>();
            }

            var count = Marshal.ReadInt32(buffer);
            var rows = new List<MibUdpRowOwnerPid>(count);
            var rowPtr = buffer + 4;
            var rowSize = Marshal.SizeOf<MibUdpRowOwnerPid>();
            for (var i = 0; i < count; i++)
            {
                rows.Add(Marshal.PtrToStructure<MibUdpRowOwnerPid>(rowPtr + i * rowSize));
            }

            return rows;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }
}

[StructLayout(LayoutKind.Sequential)]
public struct MibTcpRowOwnerPid
{
    public uint State;
    public uint LocalAddr;
    public uint LocalPortRaw;
    public uint RemoteAddr;
    public uint RemotePortRaw;
    public uint OwningPid;

    public int LocalPort => ConvertPort(LocalPortRaw);
    public int RemotePort => ConvertPort(RemotePortRaw);

    private static int ConvertPort(uint value) => (int)(((value & 0xFF) << 8) | ((value & 0xFF00) >> 8));
}

[StructLayout(LayoutKind.Sequential)]
public struct MibUdpRowOwnerPid
{
    public uint LocalAddr;
    public uint LocalPortRaw;
    public uint OwningPid;

    public int LocalPort => (int)(((LocalPortRaw & 0xFF) << 8) | ((LocalPortRaw & 0xFF00) >> 8));
}
