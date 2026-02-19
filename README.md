# ConnSniffer

ConnSniffer is a Windows 11 desktop app (.NET 7 WinForms) that monitors network activity of a selected process and writes unique domains/IPs to text files.

## What is now fixed

- Ready-to-run Windows build pipeline (`.github/workflows/windows-release.yml`) that produces `ConnSniffer-win-x64.zip`.
- UI now lets you choose:
  - save directory
  - domains file name pattern
  - IPs file name pattern
- File patterns support `{app}` placeholder (sanitized target app name).

Examples:
- Domains file: `domains-{app}.txt`
- IP file: `ips-{app}.txt`

If target process is `chrome.exe`, output might become:
- `domains-chrome_exe.txt`
- `ips-chrome_exe.txt`

## Features

- Select target by running process or executable path.
- Shows PID and process name.
- Start/Stop monitoring buttons.
- DNS parser (A + AAAA answers).
- TCP/UDP capture + process ownership correlation using:
  - `GetExtendedTcpTable`
  - `GetExtendedUdpTable`
- TLS ClientHello SNI parser for hostname extraction.
- Unique output entries only (deduped).
- Atomic writes for output files.
- Admin privilege check with clear message.
- Handles process exit and flushes data on shutdown.
- Rotating debug log (`logs/connsniffer.log`).
- Optional background mode (minimize to tray).

## Requirements

1. Windows 11
2. Npcap installed with **WinPcap API-compatible mode**:
   - https://nmap.org/npcap/
3. Run ConnSniffer as Administrator.
4. .NET SDK 7.0+ (only needed to build from source).

Optional WinDivert docs (not required for current build):
- https://reqrypt.org/windivert.html

## Build from source

```powershell
dotnet restore ConnSniffer.sln
dotnet build ConnSniffer.sln -c Release
```

## Create runnable package locally (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\publish-win-x64.ps1
```

This generates:
- `ConnSniffer-win-x64.zip`

## Use GitHub Actions to get downloadable ZIP

1. Push repository to GitHub.
2. Open **Actions** tab.
3. Run workflow **Build Windows Release**.
4. Download artifact `ConnSniffer-win-x64`.

## Upload this repo to your GitHub

Run these commands in repository root (replace values):

```bash
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin work
```

If you want `main` instead:

```bash
git push -u origin work:main
```

## Usage demo

1. Start app as Administrator.
2. Select `chrome.exe`.
3. Choose output directory and file names (for example `list-{app}.txt` and `ipset-{app}.txt`).
4. Click **Start**.
5. Visit `https://example.com` in Chrome.
6. Click **Stop**.
7. Verify files in your selected folder contain `example.com` and corresponding IPs.

## Default output location

If unchanged, output directory defaults to:
- `C:\zapret\lists`

Default file patterns:
- `list-{app}.txt`
- `ipset-{app}.txt`
