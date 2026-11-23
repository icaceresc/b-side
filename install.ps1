<#
.SYNOPSIS
  Sets up B-Side: AIMP (Microsoft Store edition) ready to stream from the cloud, and the B-Side
  panel installed in Orca. Safe to run again; it only changes what is not set up yet.

.DESCRIPTION
  1. Installs AIMP from the Microsoft Store for the current user when it is missing (no admin).
  2. Fixes settings persistence of the Store edition: AIMP saves to AIMP.new but reads AIMP.ini
     and cannot rename one into the other inside the Store sandbox. A hard link makes both names
     the same file, so settings changed in AIMP survive a restart.
  3. Applies B-Side's recommended settings (unless -SkipSettings):
       My Clouds: streaming access (a track plays while it downloads), clear cache on close, album art on,
                  track duration probing off (it can download whole files).
       Output:    no fades, normalizer, loudness/bass effects, anti-clipping or dither.
                  (AIMP rewrites its Enhancer switch on every save, so it is left to AIMP's UI.)
     The first time, the original settings are kept as AIMP.ini.b-side.bak.
     Then, when Windows is signed in to a work or school account, it prints a short reminder to
     sign My Clouds in with a personal Microsoft account (a read-only check; it never stops the setup).
  4. Installs B-Side in Orca from GitHub (orca plugin install icaceresc/b-side), or updates it
     when it is already installed (unless -SkipPlugin). The first time, Orca asks you to approve
     B-Side and this script prints the exact command to run; it never approves on your behalf.

.PARAMETER SkipSettings
  Only install and fix persistence; leave AIMP's settings untouched.

.PARAMETER SkipPlugin
  Only prepare AIMP; do not install, update or load B-Side in Orca.

.PARAMETER Dev
  For B-Side development: load this folder into Orca as a development plugin
  (orca plugin dev load), which reloads when its files change, instead of installing it from GitHub.
#>
# The installer talks to a person in a console, so it writes with Write-Host on purpose.
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '', Justification = 'Interactive installer: messages are for the person running it.')]
param([switch]$SkipSettings, [switch]$SkipPlugin, [switch]$Dev)
$ErrorActionPreference = 'Stop'

$StoreId = '9PCLLLH15SMT'
$Family = '25018ArtemIzmaylov.AIMP_4hdg3aaevdv22'
$AimpProfile = Join-Path $env:LOCALAPPDATA "Packages\$Family\LocalCache\Roaming\AIMP"
$PluginDir = $PSScriptRoot
$PluginKey = 'icaceresc.b-side'   # Orca's key for B-Side: publisher (repository owner) . id
$PluginSource = 'icaceresc/b-side'  # GitHub repository Orca installs from
$Ini = Join-Path $AimpProfile 'AIMP.ini'
$New = Join-Path $AimpProfile 'AIMP.new'
$Backup = Join-Path $AimpProfile 'AIMP.ini.b-side.bak'

$Wanted = [ordered]@{
  'MyClouds' = [ordered]@{ UseStreamingAccessMode = '1'; ClearOnClosing = '1'; ClearOldFiles = '1'; ClearOldFilesAgeValue = '1'; AllowToGetAlbumArts = '1'; AllowToGetFileDuration = '0' }
  'AIMPSoundOut' = [ordered]@{ FadingEnabled = '0'; Normalizer = '0'; LoudnessCompensation = '0'; TrueBass = '0'; Anticlipping = '0'; Dither = '0' }
  'AIMPSoundOut.Fading.Automatic' = [ordered]@{ Enabled = '0' }
  'AIMPSoundOut.Fading.Manual' = [ordered]@{ Enabled = '0' }
}

Add-Type @'
using System; using System.Runtime.InteropServices;
public static class BSideSetup {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string c, string t);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out int pid);
  static IntPtr Window() { return FindWindow("AIMP2_RemoteInfo", null); }
  public static bool Running() { return Window() != IntPtr.Zero; }
  public static int ProcessId() { IntPtr h = Window(); int pid = 0; if (h != IntPtr.Zero) GetWindowThreadProcessId(h, out pid); return pid; }
  public static void Quit() { IntPtr h = Window(); IntPtr r; if (h != IntPtr.Zero) SendMessageTimeout(h, 0x475, (IntPtr)21, IntPtr.Zero, 0x0002, 3000, out r); }
}
'@

function Write-Step($text) { Write-Host "-> $text" }

# Asks AIMP to quit and waits until its process is gone, so its own save on exit is finished.
function Close-Aimp {
  $aimpPid = [BSideSetup]::ProcessId()
  if (-not $aimpPid) { return }
  [BSideSetup]::Quit()
  # A timeout (or a process already gone) is fine here: the check below decides.
  Wait-Process -Id $aimpPid -Timeout 30 -ErrorAction SilentlyContinue
  if (Get-Process -Id $aimpPid -ErrorAction SilentlyContinue) { throw 'AIMP did not close. Close it and run this again.' }
}

function Test-Linked { (Test-Path $Ini) -and (Test-Path $New) -and (@(fsutil hardlink list $Ini).Count -ge 2) }

function Test-Utf16([string]$path) {
  $bytes = [IO.File]::ReadAllBytes($path)
  return $bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE
}

# Returns the settings text with the wanted values, adding missing keys and sections.
function ConvertTo-WantedIni([string]$text) {
  $lines = [Collections.Generic.List[string]]::new()
  foreach ($l in ($text -split "`r`n")) { $lines.Add($l) }
  foreach ($section in $Wanted.Keys) {
    $start = $lines.IndexOf("[$section]")
    if ($start -lt 0) {
      if ($lines.Count -and $lines[$lines.Count - 1] -ne '') { $lines.Add('') }
      $lines.Add("[$section]"); $start = $lines.Count - 1
    }
    $end = $start + 1
    while ($end -lt $lines.Count -and $lines[$end] -notmatch '^\[') { $end++ }
    foreach ($key in $Wanted[$section].Keys) {
      $value = "$key=$($Wanted[$section][$key])"
      $found = -1
      for ($i = $start + 1; $i -lt $end; $i++) { if ($lines[$i] -like "$key=*") { $found = $i; break } }
      if ($found -ge 0) { $lines[$found] = $value }
      else {
        $at = $end
        while ($at -gt $start + 1 -and $lines[$at - 1] -eq '') { $at-- }
        $lines.Insert($at, $value); $end++
      }
    }
  }
  return ($lines -join "`r`n")
}

function Test-SettingsApplied([string]$text) { (ConvertTo-WantedIni $text) -eq $text }

# Runs the orca CLI with --json in the arguments and returns its answer as an object.
function Invoke-Orca {
  $text = & orca @args | Out-String
  $exit = $LASTEXITCODE
  try { $answer = $text | ConvertFrom-Json } catch { throw "Orca gave an answer this script does not understand (exit $exit): $text" }
  $answer | Add-Member -NotePropertyName exitCode -NotePropertyValue $exit -Force
  return $answer
}

# Orca never runs a plugin's code until the person approves it. Show what Orca says and the exact
# command that approves it; never approve on the person's behalf.
function Write-Approval($answer) {
  Write-Host ''
  Write-Host $answer.error.message
  Write-Host ''
  Write-Host 'Orca needs your OK before it runs this version of B-Side.'
  if ($answer.error.data.command) {
    Write-Host 'If you trust it, copy and run this command, then open B-Side from the right sidebar in Orca:'
    Write-Host ''
    Write-Host "  $($answer.error.data.command)"
  } else {
    foreach ($s in @($answer.error.data.nextSteps)) { if ($s) { Write-Host $s } }
  }
  Write-Host ''
}

# Installs B-Side in Orca from GitHub, or updates it when Orca already has it. With -Dev, loads
# this folder as a development plugin instead.
function Install-BSidePlugin([switch]$Dev) {
  if (-not (Get-Command orca -ErrorAction SilentlyContinue)) {
    Write-Warning "Orca's command line (orca) was not found. Install Orca and open it once, then run this again, or run in a terminal: orca plugin install $PluginSource"
    return
  }
  if ($Dev) {
    Write-Step 'Loading this folder into Orca as a development plugin'
    $answer = Invoke-Orca plugin dev load $PluginDir --json
    $done = 'B-Side is loaded from this folder and reloads when its files change. Open it from the right sidebar in Orca.'
  } else {
    $list = Invoke-Orca plugin list --json
    if (-not $list.ok) { $answer = $list }
    elseif (@($list.result.plugins | Where-Object { $_.pluginKey -eq $PluginKey }).Count) {
      Write-Step 'Updating B-Side in Orca'
      $answer = Invoke-Orca plugin update $PluginKey --json
      $done = 'B-Side is up to date. Open it from the right sidebar in Orca.'
    } else {
      Write-Step "Installing B-Side in Orca from GitHub ($PluginSource)"
      $answer = Invoke-Orca plugin install $PluginSource --json
      $done = 'B-Side is installed. Open it from the right sidebar in Orca.'
    }
  }
  if ($answer.ok) { Write-Step $done }
  elseif ($answer.exitCode -eq 3 -or $answer.error.code -in 'approval_required', 'approval_stale') { Write-Approval $answer }
  else { throw "Orca could not set up B-Side: $($answer.error.message)" }
}

# Is Windows signed in to a work or school account? dsregcmd /status, Microsoft's tool for a PC's
# join state, prints these flags as YES/NO: AzureAdJoined (Windows signs in with a work account),
# WorkplaceJoined (one was added under Settings > Accounts > Access work or school), DomainJoined
# and EnterpriseJoined (company domain). Any of them means the Microsoft sign-in page may offer
# that account by itself. Only those flags are read: dsregcmd also prints tenant and account
# details, which are never kept or shown. Without dsregcmd, the keys Windows keeps for those joins
# answer. Read-only; returns $true, $false, or $null when it cannot tell; it never throws.
function Test-WorkAccount {
  param(
    [string]$Command = 'dsregcmd.exe',
    [string[]]$JoinKeys = @(
      'HKLM:\SYSTEM\CurrentControlSet\Control\CloudDomainJoin\JoinInfo',
      'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\WorkplaceJoin\JoinInfo')
  )
  try {
    if (Get-Command $Command -ErrorAction SilentlyContinue) {
      $status = @(& $Command /status | ForEach-Object { "$_" })
      if (@($status -match '^\s*AzureAdJoined\s*:').Count) {
        return [bool]@($status -match '^\s*(AzureAdJoined|WorkplaceJoined|DomainJoined|EnterpriseJoined)\s*:\s*YES\s*$').Count
      }
    }
  } catch { Write-Verbose "dsregcmd could not be read: $($_.Exception.Message)" }
  try {
    foreach ($key in $JoinKeys) {
      if (@(Get-ChildItem -LiteralPath $key -ErrorAction SilentlyContinue).Count) { return $true }
    }
    return $false
  } catch { return $null }
}

# A short, non-blocking warning: My Clouds must sign in with the person's own Microsoft account.
function Write-WorkAccountWarning {
  if (-not (Test-WorkAccount)) { return }
  Write-Host ''
  Write-Warning 'Windows on this PC is signed in to a work or school account.'
  Write-Host '   When you add OneDrive in AIMP (My Clouds > Add Storage... > OneDrive > Get Token), the'
  Write-Host '   Microsoft sign-in page may pick that work account by itself. Choose "Use another account"'
  Write-Host '   and sign in with your personal Microsoft account ("Personal account" if it asks).'
  Write-Host '   B-Side guide, "Work or school PC": https://github.com/icaceresc/b-side/blob/main/docs/guide.md#work-account'
  Write-Host ''
}

# 1. AIMP
if (-not (Get-AppxPackage -Name '25018ArtemIzmaylov.AIMP')) {
  Write-Step 'Installing AIMP from the Microsoft Store (current user)'
  winget install --id $StoreId --source msstore --accept-package-agreements --accept-source-agreements
  if (-not (Get-AppxPackage -Name '25018ArtemIzmaylov.AIMP')) { throw 'AIMP did not install. Install "AIMP" from the Microsoft Store and run this again.' }
} else { Write-Step 'AIMP is installed' }

# AIMP writes its settings file the first time it closes.
if (-not (Test-Path $New) -and -not (Test-Path $Ini)) {
  Write-Step 'Starting AIMP once to create its settings'
  Start-Process "shell:AppsFolder\$Family!AIMP"
  $deadline = (Get-Date).AddSeconds(40)
  while (-not [BSideSetup]::Running() -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (-not [BSideSetup]::Running()) { throw 'AIMP did not start.' }
  Start-Sleep -Seconds 2
  Close-Aimp
}

# 2 + 3. Decide first, so AIMP is only closed when something has to change.
$needsLink = -not (Test-Linked)
$current = if (Test-Path $Ini) { $Ini } elseif (Test-Path $New) { $New } else { $null }
if (-not $current) { throw "AIMP's settings file was not found in $AimpProfile. Open and close AIMP once, then run this again." }
$needsSettings = (-not $SkipSettings) -and -not (Test-SettingsApplied ([IO.File]::ReadAllText($current)))

if ($needsLink -or $needsSettings) {
  if ([BSideSetup]::Running()) { Write-Step 'Closing AIMP to update its settings (it saves on exit)'; Close-Aimp }

  if ($needsLink) {
    Write-Step 'Linking AIMP.ini to AIMP.new so AIMP keeps its settings'
    $source = @($Ini, $New) | Where-Object { Test-Path $_ } | Sort-Object { (Get-Item $_).LastWriteTime } | Select-Object -Last 1
    if (-not (Test-Path $Backup) -and (Test-Path $Ini)) { Copy-Item $Ini $Backup }
    if ($source -ne $New) { [IO.File]::WriteAllBytes($New, [IO.File]::ReadAllBytes($source)) }
    # Build the link under a temporary name first: AIMP.ini is never missing.
    $tmp = "$Ini.b-side.tmp"
    if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force }
    New-Item -ItemType HardLink -Path $tmp -Target $New | Out-Null
    Move-Item -LiteralPath $tmp -Destination $Ini -Force
    if (-not (Test-Linked)) { throw 'Could not link AIMP.ini to AIMP.new.' }
  } else { Write-Step 'AIMP settings persistence is already fixed' }

  if ($needsSettings) {
    if (-not (Test-Utf16 $Ini)) {
      Write-Warning 'AIMP.ini is not in the format this script expects (UTF-16). Settings left unchanged; set them in AIMP (see docs/guide.md).'
    } else {
      Write-Step 'Applying streaming and clean-output settings'
      if (-not (Test-Path $Backup)) { Copy-Item $Ini $Backup }
      $updated = ConvertTo-WantedIni ([IO.File]::ReadAllText($Ini))
      # Write in place so the hard link stays; UTF-16 LE with BOM, as AIMP writes it.
      [IO.File]::WriteAllText($Ini, $updated, (New-Object Text.UnicodeEncoding($false, $true)))
      if (-not (Test-SettingsApplied ([IO.File]::ReadAllText($New)))) { throw 'The settings could not be verified after writing them.' }
      foreach ($section in $Wanted.Keys) { Write-Step ("  [$section] " + (($Wanted[$section].GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ')) }
    }
  }
} else {
  Write-Step 'AIMP is already set up (persistence fixed, settings applied)'
}

# A work or school account on Windows can take over the OneDrive sign-in in My Clouds.
Write-WorkAccountWarning

# 4. Orca plugin
if ($SkipPlugin) { Write-Step 'Skipping the Orca plugin (-SkipPlugin)' }
else { Install-BSidePlugin -Dev:$Dev }
Write-Step 'Done'
