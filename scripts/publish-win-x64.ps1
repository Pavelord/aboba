$ErrorActionPreference = "Stop"

Write-Host "Publishing ConnSniffer for Windows x64..."
dotnet restore ConnSniffer.sln
dotnet publish src/ConnSniffer/ConnSniffer.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true

$publishDir = "src/ConnSniffer/bin/Release/net7.0-windows/win-x64/publish"
Copy-Item README.md "$publishDir/README.txt" -Force
Compress-Archive -Path "$publishDir/*" -DestinationPath "ConnSniffer-win-x64.zip" -Force

Write-Host "Done. Archive: ConnSniffer-win-x64.zip"
