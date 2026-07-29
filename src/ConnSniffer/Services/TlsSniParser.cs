using System.Buffers.Binary;
using System.Text;

namespace ConnSniffer.Services;

public sealed class TlsSniParser
{
    public string? TryParseSni(ReadOnlySpan<byte> payload)
    {
        if (payload.Length < 5 || payload[0] != 0x16)
        {
            return null;
        }

        var recordLength = BinaryPrimitives.ReadUInt16BigEndian(payload.Slice(3, 2));
        if (payload.Length < 5 + recordLength)
        {
            return null;
        }

        var p = payload.Slice(5, recordLength);
        if (p.Length < 4 || p[0] != 0x01)
        {
            return null;
        }

        var hsLength = (p[1] << 16) | (p[2] << 8) | p[3];
        if (p.Length < 4 + hsLength)
        {
            return null;
        }

        var o = 4;
        o += 2; // client version
        o += 32; // random
        if (o >= p.Length)
        {
            return null;
        }

        var sessionIdLen = p[o++];
        o += sessionIdLen;
        if (o + 2 > p.Length)
        {
            return null;
        }

        var cipherLen = BinaryPrimitives.ReadUInt16BigEndian(p.Slice(o, 2));
        o += 2 + cipherLen;
        if (o >= p.Length)
        {
            return null;
        }

        var compressionLen = p[o++];
        o += compressionLen;
        if (o + 2 > p.Length)
        {
            return null;
        }

        var extLen = BinaryPrimitives.ReadUInt16BigEndian(p.Slice(o, 2));
        o += 2;
        var extEnd = Math.Min(p.Length, o + extLen);

        while (o + 4 <= extEnd)
        {
            var type = BinaryPrimitives.ReadUInt16BigEndian(p.Slice(o, 2));
            var len = BinaryPrimitives.ReadUInt16BigEndian(p.Slice(o + 2, 2));
            o += 4;
            if (o + len > extEnd)
            {
                break;
            }

            if (type == 0x0000 && len >= 5)
            {
                var listLen = BinaryPrimitives.ReadUInt16BigEndian(p.Slice(o, 2));
                var s = o + 2;
                var limit = Math.Min(o + 2 + listLen, o + len);
                while (s + 3 <= limit)
                {
                    var nameType = p[s++];
                    var nameLen = BinaryPrimitives.ReadUInt16BigEndian(p.Slice(s, 2));
                    s += 2;
                    if (nameType == 0 && s + nameLen <= limit)
                    {
                        return Encoding.ASCII.GetString(p.Slice(s, nameLen));
                    }

                    s += nameLen;
                }
            }

            o += len;
        }

        return null;
    }
}
