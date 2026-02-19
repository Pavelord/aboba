namespace ConnSniffer.Models;

public sealed record ProcessEntry(int Pid, string Name, string Path)
{
    public string Display => $"{Name} (PID: {Pid})";
}
