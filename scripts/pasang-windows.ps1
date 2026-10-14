# Pemasang otomatis Meow Corner untuk Windows 10/11.
# Memasang Node.js, Visual Studio Build Tools (C++), dan Rust lewat winget bila
# belum ada, lalu memasang dependensi proyek dan membuat installer game.
# Jalankan lewat PASANG-WINDOWS.bat (klik dua kali).

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Write-Ok([string]$Text) {
    Write-Host "    $Text" -ForegroundColor Green
}

function Write-Note([string]$Text) {
    Write-Host "    $Text" -ForegroundColor Yellow
}

function Stop-WithError([string]$Text) {
    Write-Host ''
    Write-Host "GAGAL: $Text" -ForegroundColor Red
    Write-Host 'Salin pesan di atas dan kirim ke Claude bila butuh bantuan.'
    exit 1
}

# Program yang baru dipasang belum masuk PATH sesi ini; baca ulang dari registry.
function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $cargo = Join-Path $env:USERPROFILE '.cargo\bin'
    $env:Path = "$machine;$user;$cargo"
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-Package([string]$Id, [string[]]$Extra = @()) {
    $wingetArgs = @('install', '--id', $Id, '-e', '--accept-source-agreements', '--accept-package-agreements') + $Extra
    & winget @wingetArgs
    # Kode keluar winget tidak dipakai; keberhasilan dicek dari program yang tersedia.
    Update-SessionPath
}

# Build Tools C++ terdeteksi lewat vswhere, alat resmi Visual Studio Installer.
function Test-Msvc {
    $programFiles = ${env:ProgramFiles(x86)}
    if (-not $programFiles) { $programFiles = $env:ProgramFiles }
    $vswhere = Join-Path $programFiles 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path $vswhere)) { return $false }
    $found = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    return [bool]$found
}

# ---------------------------------------------------------------------------

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host ''
Write-Host '  Pemasang Meow Corner' -ForegroundColor Magenta
Write-Host "  Folder proyek: $projectRoot"

if (-not (Test-Path 'package.json')) {
    Stop-WithError 'package.json tidak ditemukan. Ekstrak dulu meow-corner.zip, lalu jalankan PASANG-WINDOWS.bat dari folder hasil ekstrak.'
}

Update-SessionPath
if (-not (Test-Command 'winget')) {
    Stop-WithError "winget tidak ditemukan. Pasang 'App Installer' dari Microsoft Store, lalu jalankan file ini lagi."
}

Write-Step '1/5  Node.js'
if (Test-Command 'node') {
    Write-Ok "Sudah terpasang: $(node -v)"
} else {
    Install-Package 'OpenJS.NodeJS.LTS'
    if (-not (Test-Command 'node')) { Stop-WithError 'Node.js gagal dipasang.' }
    Write-Ok "Terpasang: $(node -v)"
}

Write-Step '2/5  Visual Studio Build Tools (C++)'
if (Test-Msvc) {
    Write-Ok 'Sudah terpasang.'
} else {
    Write-Note 'Unduhan sekitar 2-6 GB dan bisa memakan waktu lama.'
    Write-Note 'Bila muncul jendela izin Windows (UAC), klik Yes.'
    Install-Package 'Microsoft.VisualStudio.2022.BuildTools' @(
        '--override',
        '--passive --wait --add Microsoft.VisualStudio.Workload.VCTools;includeRecommended'
    )
    if (-not (Test-Msvc)) {
        Stop-WithError "Build Tools C++ belum terpasang. Pasang manual dari visualstudio.microsoft.com/visual-cpp-build-tools dengan mencentang 'Desktop development with C++'."
    }
    Write-Ok 'Terpasang.'
}

Write-Step '3/5  Rust'
if (-not (Test-Command 'rustup')) {
    Install-Package 'Rustlang.Rustup'
}
if (-not (Test-Command 'rustup')) { Stop-WithError 'Rust gagal dipasang.' }
# Tauri di Windows butuh toolchain MSVC.
& rustup default stable-msvc
if ($LASTEXITCODE -ne 0) { Stop-WithError 'Gagal menyiapkan toolchain Rust (stable-msvc).' }
Write-Ok "Siap: $(rustc -V)"

Write-Step '4/5  Dependensi proyek'
& npm.cmd install
if ($LASTEXITCODE -ne 0) { Stop-WithError 'npm install gagal. Periksa koneksi internet lalu coba lagi.' }
Write-Ok 'Selesai.'

Write-Step '5/5  Pilih langkah berikutnya'
Write-Host '    [1] Buat installer lalu pasang Meow Corner  (disarankan, 10-20 menit)'
Write-Host '    [2] Langsung jalankan untuk mencoba         (mode pengembangan)'
$choice = Read-Host '    Ketik 1 atau 2 lalu tekan Enter'

if ($choice -eq '2') {
    Write-Note 'Build pertama butuh 5-15 menit. Tutup jendela ini untuk menghentikan game.'
    & npm.cmd run tauri dev
    exit $LASTEXITCODE
}

Write-Note 'Membuat installer. Build pertama butuh 10-20 menit, mohon tunggu.'
& npm.cmd run build:windows
if ($LASTEXITCODE -ne 0) { Stop-WithError 'Build gagal.' }

$bundleDir = Join-Path $projectRoot 'src-tauri\target\release\bundle\nsis'
$setup = Get-ChildItem -Path $bundleDir -Filter '*-setup.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $setup) { Stop-WithError "Installer tidak ditemukan di $bundleDir." }

Write-Ok "Installer siap: $($setup.FullName)"
Write-Ok 'Membuka installer. Ikuti langkahnya; setelah itu Meow Corner ada di Start Menu.'
Start-Process -FilePath $setup.FullName
