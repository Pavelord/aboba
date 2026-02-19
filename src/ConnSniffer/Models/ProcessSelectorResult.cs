using System.Text.RegularExpressions;

namespace ConnSniffer.Models;

public sealed record ProcessSelectorResult(int Pid, string Name, string Path, string CleanName)
{
    private static readonly Regex Sanitizer = new("[^A-Za-z0-9_-]", RegexOptions.Compiled);

    public static ProcessSelectorResult FromProcess(ProcessEntry entry)
    {
        var clean = Sanitizer.Replace(entry.Name, "_");
        clean = string.IsNullOrWhiteSpace(clean) ? "unknown_app" : clean;
        return new ProcessSelectorResult(entry.Pid, entry.Name, entry.Path, clean);
    }
}
