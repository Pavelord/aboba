using ConnSniffer.Models;
using ConnSniffer.Services;
using ConnSniffer.Utils;
using System.Diagnostics;

namespace ConnSniffer;

public sealed class MainForm : Form
{
    private readonly ComboBox _processCombo = new() { DropDownStyle = ComboBoxStyle.DropDownList };
    private readonly TextBox _pathTextBox = new() { PlaceholderText = "C:\\Path\\to\\app.exe" };
    private readonly RadioButton _selectProcessRadio = new() { Text = "Select running process", Checked = true };
    private readonly RadioButton _selectPathRadio = new() { Text = "Use executable path" };
    private readonly CheckBox _backgroundBox = new() { Text = "Run in background when minimized" };

    private readonly TextBox _outputDirText = new() { Text = OutputOptions.Default.DirectoryPath };
    private readonly Button _browseOutputDirBtn = new() { Text = "Browse..." };
    private readonly TextBox _domainFileText = new() { Text = OutputOptions.Default.DomainFilePattern };
    private readonly TextBox _ipFileText = new() { Text = OutputOptions.Default.IpFilePattern };

    private readonly Button _refreshBtn = new() { Text = "Refresh" };
    private readonly Button _startBtn = new() { Text = "Start" };
    private readonly Button _stopBtn = new() { Text = "Stop", Enabled = false };
    private readonly Label _selectedLbl = new() { AutoSize = true, Text = "Selected: -" };
    private readonly Label _adminLbl = new() { AutoSize = true };
    private readonly ListBox _eventsBox = new();
    private readonly NotifyIcon _tray = new() { Text = "ConnSniffer", Visible = false };

    private readonly CaptureService _captureService;
    private readonly ResultStore _store;
    private ProcessSelectorResult? _selected;

    public MainForm()
    {
        Text = "ConnSniffer";
        Width = 1100;
        Height = 720;

        _store = new ResultStore();
        _captureService = new CaptureService();
        _captureService.ConnectionObserved += OnConnectionObserved;
        _captureService.DomainObserved += OnDomainObserved;
        _captureService.TargetExited += OnTargetExited;

        BuildUi();
        LoadProcesses();
        ShowAdminStatus();

        Resize += (_, _) =>
        {
            if (_backgroundBox.Checked && WindowState == FormWindowState.Minimized)
            {
                Hide();
                _tray.Visible = true;
                _tray.ShowBalloonTip(1000, "ConnSniffer", "Monitoring continues in background.", ToolTipIcon.Info);
            }
        };

        _tray.DoubleClick += (_, _) =>
        {
            Show();
            WindowState = FormWindowState.Normal;
            _tray.Visible = false;
        };

        FormClosing += (_, _) =>
        {
            _captureService.Stop();
            _store.Flush();
            _tray.Visible = false;
            _tray.Dispose();
        };
    }

    private void BuildUi()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            RowCount = 11,
            Padding = new Padding(12),
        };

        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 30));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 30));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 20));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 20));

        panel.Controls.Add(_adminLbl, 0, 0);
        panel.SetColumnSpan(_adminLbl, 4);

        panel.Controls.Add(_selectProcessRadio, 0, 1);
        panel.Controls.Add(_selectPathRadio, 1, 1);
        panel.Controls.Add(_refreshBtn, 2, 1);
        panel.Controls.Add(_backgroundBox, 3, 1);

        panel.Controls.Add(_processCombo, 0, 2);
        panel.SetColumnSpan(_processCombo, 2);
        panel.Controls.Add(_pathTextBox, 2, 2);
        panel.SetColumnSpan(_pathTextBox, 2);

        panel.Controls.Add(new Label { Text = "Save directory", AutoSize = true }, 0, 3);
        panel.Controls.Add(_outputDirText, 1, 3);
        panel.SetColumnSpan(_outputDirText, 2);
        panel.Controls.Add(_browseOutputDirBtn, 3, 3);

        panel.Controls.Add(new Label { Text = "Domains file name (use {app})", AutoSize = true }, 0, 4);
        panel.Controls.Add(_domainFileText, 1, 4);
        panel.SetColumnSpan(_domainFileText, 3);

        panel.Controls.Add(new Label { Text = "IPs file name (use {app})", AutoSize = true }, 0, 5);
        panel.Controls.Add(_ipFileText, 1, 5);
        panel.SetColumnSpan(_ipFileText, 3);

        panel.Controls.Add(_selectedLbl, 0, 6);
        panel.SetColumnSpan(_selectedLbl, 4);

        panel.Controls.Add(_startBtn, 0, 7);
        panel.Controls.Add(_stopBtn, 1, 7);

        panel.Controls.Add(_eventsBox, 0, 8);
        panel.SetColumnSpan(_eventsBox, 4);
        panel.SetRowSpan(_eventsBox, 3);

        Controls.Add(panel);

        _refreshBtn.Click += (_, _) => LoadProcesses();
        _startBtn.Click += (_, _) => StartMonitoring();
        _stopBtn.Click += (_, _) => StopMonitoring();
        _processCombo.SelectedIndexChanged += (_, _) => UpdateSelectedProcess();
        _selectProcessRadio.CheckedChanged += (_, _) => ToggleSelectMode();
        _browseOutputDirBtn.Click += (_, _) => BrowseOutputDirectory();
    }

    private void BrowseOutputDirectory()
    {
        using var dialog = new FolderBrowserDialog();
        dialog.SelectedPath = _outputDirText.Text;
        if (dialog.ShowDialog() == DialogResult.OK)
        {
            _outputDirText.Text = dialog.SelectedPath;
        }
    }

    private void ShowAdminStatus()
    {
        if (WindowsPrivilegeChecker.IsAdministrator())
        {
            _adminLbl.Text = "Running as Administrator: packet capture available.";
            _adminLbl.ForeColor = Color.DarkGreen;
        }
        else
        {
            _adminLbl.Text = "Not running as Administrator. Restart elevated. Install Npcap in WinPcap API-compatible mode. WinDivert optional.";
            _adminLbl.ForeColor = Color.DarkRed;
        }
    }

    private void ToggleSelectMode()
    {
        _processCombo.Enabled = _selectProcessRadio.Checked;
        _pathTextBox.Enabled = _selectPathRadio.Checked;
    }

    private void LoadProcesses()
    {
        var entries = Process.GetProcesses()
            .OrderBy(p => p.ProcessName)
            .Select(p =>
            {
                try
                {
                    return new ProcessEntry(p.Id, p.ProcessName, p.MainModule?.FileName ?? string.Empty);
                }
                catch
                {
                    return new ProcessEntry(p.Id, p.ProcessName, string.Empty);
                }
            })
            .ToList();

        _processCombo.DataSource = entries;
        _processCombo.DisplayMember = nameof(ProcessEntry.Display);
        if (entries.Count > 0)
        {
            _processCombo.SelectedIndex = 0;
            UpdateSelectedProcess();
        }
    }

    private void UpdateSelectedProcess()
    {
        if (_processCombo.SelectedItem is ProcessEntry entry)
        {
            _selected = ProcessSelectorResult.FromProcess(entry);
            _selectedLbl.Text = $"Selected PID={entry.Pid}, Name={entry.Name}, Path={entry.Path}";
        }
    }

    private void StartMonitoring()
    {
        if (_selectPathRadio.Checked)
        {
            if (!File.Exists(_pathTextBox.Text))
            {
                MessageBox.Show("Executable path does not exist.");
                return;
            }

            var proc = Process.GetProcesses().FirstOrDefault(p =>
            {
                try { return string.Equals(p.MainModule?.FileName, _pathTextBox.Text, StringComparison.OrdinalIgnoreCase); }
                catch { return false; }
            });

            if (proc is null)
            {
                MessageBox.Show("No running process matches that path.");
                return;
            }

            _selected = ProcessSelectorResult.FromProcess(new ProcessEntry(proc.Id, proc.ProcessName, _pathTextBox.Text));
        }

        if (_selected is null)
        {
            MessageBox.Show("Select a process first.");
            return;
        }

        if (string.IsNullOrWhiteSpace(_outputDirText.Text))
        {
            MessageBox.Show("Choose a valid output directory.");
            return;
        }

        var options = new OutputOptions(_outputDirText.Text.Trim(), _domainFileText.Text.Trim(), _ipFileText.Text.Trim());
        _store.Configure(options, _selected.CleanName);

        _captureService.Start(_selected.Pid, _selected.Name);
        _startBtn.Enabled = false;
        _stopBtn.Enabled = true;
        AddEvent($"Monitoring started. Output: {_outputDirText.Text}");
    }

    private void StopMonitoring()
    {
        _captureService.Stop();
        _store.Flush();
        _startBtn.Enabled = true;
        _stopBtn.Enabled = false;
        AddEvent("Monitoring stopped and results flushed.");
    }

    private void OnDomainObserved(object? sender, string domain)
    {
        if (_store.AddDomain(domain))
        {
            AddEvent($"Domain: {domain}");
        }
    }

    private void OnConnectionObserved(object? sender, string ip)
    {
        if (_store.AddIp(ip))
        {
            AddEvent($"IP: {ip}");
        }
    }

    private void OnTargetExited(object? sender, EventArgs e)
    {
        if (InvokeRequired)
        {
            BeginInvoke(OnTargetExited, sender, e);
            return;
        }

        AddEvent("Target process exited. Monitoring stopped.");
        StopMonitoring();
    }

    private void AddEvent(string message)
    {
        if (InvokeRequired)
        {
            BeginInvoke(AddEvent, message);
            return;
        }

        _eventsBox.Items.Insert(0, $"[{DateTime.Now:HH:mm:ss}] {message}");
        DebugLogger.Log(message);
    }
}
