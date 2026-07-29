using ConnSniffer.Utils;

namespace ConnSniffer;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        DebugLogger.Initialize();
        Application.ApplicationExit += (_, _) => DebugLogger.FlushAndClose();
        Application.Run(new MainForm());
    }
}
