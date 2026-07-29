using ConnSniffer.Models;
using System.Text;

namespace ConnSniffer.Services;

public sealed class ResultStore
{
    private readonly HashSet<string> _domains = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _ips = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _gate = new();

    private string _directoryPath = OutputOptions.Default.DirectoryPath;
    private string _domainFileName = "list-unknown_app.txt";
    private string _ipFileName = "ipset-unknown_app.txt";

    public void Configure(OutputOptions options, string cleanAppName)
    {
        lock (_gate)
        {
            _directoryPath = options.DirectoryPath;
            _domainFileName = options.BuildDomainFileName(cleanAppName);
            _ipFileName = options.BuildIpFileName(cleanAppName);
            Directory.CreateDirectory(_directoryPath);
        }
    }

    public bool AddDomain(string domain)
    {
        if (string.IsNullOrWhiteSpace(domain))
        {
            return false;
        }

        lock (_gate)
        {
            var added = _domains.Add(domain.Trim().ToLowerInvariant());
            if (added)
            {
                FlushDomainsLocked();
            }

            return added;
        }
    }

    public bool AddIp(string ip)
    {
        if (string.IsNullOrWhiteSpace(ip))
        {
            return false;
        }

        lock (_gate)
        {
            var added = _ips.Add(ip.Trim());
            if (added)
            {
                FlushIpsLocked();
            }

            return added;
        }
    }

    public void Flush()
    {
        lock (_gate)
        {
            FlushDomainsLocked();
            FlushIpsLocked();
        }
    }

    private void FlushDomainsLocked()
    {
        var path = Path.Combine(_directoryPath, _domainFileName);
        AtomicWrite(path, _domains);
    }

    private void FlushIpsLocked()
    {
        var path = Path.Combine(_directoryPath, _ipFileName);
        AtomicWrite(path, _ips);
    }

    private static void AtomicWrite(string path, IEnumerable<string> lines)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + ".tmp";

        using (var fs = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None))
        using (var sw = new StreamWriter(fs, new UTF8Encoding(false)))
        {
            foreach (var line in lines.OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
            {
                sw.WriteLine(line);
            }
        }

        if (File.Exists(path))
        {
            File.Replace(temp, path, null);
        }
        else
        {
            File.Move(temp, path);
        }
    }
}
