using System.Net;
using System.Text;

namespace ConnSniffer.Services;

public sealed class DnsParser
{
    public sealed record DnsRecord(string Domain, IReadOnlyList<string> Ips);

    public IReadOnlyList<DnsRecord> Parse(ReadOnlySpan<byte> msg)
    {
        var result = new List<DnsRecord>();
        if (msg.Length < 12)
        {
            return result;
        }

        var qdCount = ReadUInt16(msg, 4);
        var anCount = ReadUInt16(msg, 6);
        var offset = 12;

        var questions = new List<string>();
        for (var i = 0; i < qdCount; i++)
        {
            var domain = ReadDomain(msg, ref offset);
            if (offset + 4 > msg.Length)
            {
                return result;
            }

            offset += 4;
            questions.Add(domain);
        }

        for (var i = 0; i < anCount; i++)
        {
            var name = ReadDomain(msg, ref offset);
            if (offset + 10 > msg.Length)
            {
                return result;
            }

            var type = ReadUInt16(msg, offset);
            offset += 2;
            offset += 2; // class
            offset += 4; // ttl
            var rdLength = ReadUInt16(msg, offset);
            offset += 2;

            if (offset + rdLength > msg.Length)
            {
                return result;
            }

            if (type == 1 && rdLength == 4)
            {
                var ip = new IPAddress(msg.Slice(offset, 4));
                result.Add(new DnsRecord(string.IsNullOrWhiteSpace(name) ? questions.FirstOrDefault() ?? string.Empty : name, new[] { ip.ToString() }));
            }
            else if (type == 28 && rdLength == 16)
            {
                var ip = new IPAddress(msg.Slice(offset, 16));
                result.Add(new DnsRecord(string.IsNullOrWhiteSpace(name) ? questions.FirstOrDefault() ?? string.Empty : name, new[] { ip.ToString() }));
            }

            offset += rdLength;
        }

        return result;
    }

    private static ushort ReadUInt16(ReadOnlySpan<byte> data, int offset) => (ushort)((data[offset] << 8) | data[offset + 1]);

    private static string ReadDomain(ReadOnlySpan<byte> msg, ref int offset)
    {
        if (offset >= msg.Length)
        {
            return string.Empty;
        }

        var labels = new List<string>();
        var jumped = false;
        var originalOffset = offset;

        while (offset < msg.Length)
        {
            var len = msg[offset++];
            if (len == 0)
            {
                break;
            }

            if ((len & 0xC0) == 0xC0)
            {
                if (offset >= msg.Length)
                {
                    break;
                }

                var pointer = ((len & 0x3F) << 8) | msg[offset++];
                if (!jumped)
                {
                    originalOffset = offset;
                }

                offset = pointer;
                jumped = true;
                continue;
            }

            if (offset + len > msg.Length)
            {
                break;
            }

            labels.Add(Encoding.ASCII.GetString(msg.Slice(offset, len)));
            offset += len;
        }

        if (jumped)
        {
            offset = originalOffset;
        }

        return string.Join('.', labels);
    }
}
