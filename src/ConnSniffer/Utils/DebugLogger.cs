using System.Text;

namespace ConnSniffer.Utils;

public static class DebugLogger
{
    private static readonly object Gate = new();
    private static StreamWriter? _writer;
    private static string _logPath = string.Empty;
    private const long MaxBytes = 1_000_000;

    public static void Initialize()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "logs");
        Directory.CreateDirectory(dir);
        _logPath = Path.Combine(dir, "connsniffer.log");
        _writer = new StreamWriter(new FileStream(_logPath, FileMode.Append, FileAccess.Write, FileShare.Read), new UTF8Encoding(false)) { AutoFlush = true };
        RotateIfNeeded();
    }

    public static void Log(string message)
    {
        lock (Gate)
        {
            _writer?.WriteLine($"[{DateTime.Now:O}] {message}");
            RotateIfNeeded();
        }
    }

    private static void RotateIfNeeded()
    {
        if (string.IsNullOrWhiteSpace(_logPath) || !File.Exists(_logPath))
        {
            return;
        }

        var fi = new FileInfo(_logPath);
        if (fi.Length < MaxBytes)
        {
            return;
        }

        _writer?.Dispose();
        var backup = _logPath + ".1";
        if (File.Exists(backup))
        {
            File.Delete(backup);
        }

        File.Move(_logPath, backup);
        _writer = new StreamWriter(new FileStream(_logPath, FileMode.Create, FileAccess.Write, FileShare.Read), new UTF8Encoding(false)) { AutoFlush = true };
    }

    public static void FlushAndClose()
    {
        lock (Gate)
        {
            _writer?.Flush();
            _writer?.Dispose();
            _writer = null;
        }
    }
}
