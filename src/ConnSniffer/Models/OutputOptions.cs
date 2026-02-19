using System.Text.RegularExpressions;

namespace ConnSniffer.Models;

public sealed record OutputOptions(string DirectoryPath, string DomainFilePattern, string IpFilePattern)
{
    private static readonly Regex AppNameSanitizer = new("[^A-Za-z0-9_-]", RegexOptions.Compiled);

    public string BuildDomainFileName(string appName) => ExpandPattern(DomainFilePattern, appName);

    public string BuildIpFileName(string appName) => ExpandPattern(IpFilePattern, appName);

    private static string ExpandPattern(string pattern, string appName)
    {
        var cleanApp = AppNameSanitizer.Replace(appName, "_");
        cleanApp = string.IsNullOrWhiteSpace(cleanApp) ? "unknown_app" : cleanApp;

        var value = pattern.Replace("{app}", cleanApp, StringComparison.OrdinalIgnoreCase);
        foreach (var c in Path.GetInvalidFileNameChars())
        {
            value = value.Replace(c, '_');
        }

        return string.IsNullOrWhiteSpace(value) ? $"list-{cleanApp}.txt" : value;
    }

    public static OutputOptions Default => new(@"C:\zapret\lists", "list-{app}.txt", "ipset-{app}.txt");
}
