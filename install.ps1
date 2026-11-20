<#
.SYNOPSIS
  Sets up B-Side: AIMP (Microsoft Store edition) ready to stream from the cloud, and the B-Side
  panel loaded in Orca. Safe to run again; it only changes what is not set up yet.

.DESCRIPTION
  1. Installs AIMP from the Microsoft Store for the current user when it is missing (no admin).
  2. Fixes settings persistence of the Store edition: AIMP saves to AIMP.new but reads AIMP.ini
     and cannot rename one into the other inside the Store sandbox. A hard link makes both names
     the same file, so settings changed in AIMP survive a restart.
  3. Applies B-Side's recommended settings (unless -SkipSettings):
       My Clouds: streaming access (no full downloads), clear cache on close, album art on,
                  track duration probing off (it can download whole files).
       Output:    no fades, normalizer, loudness/bass effects, anti-clipping or dither.
                  (AIMP rewrites its Enhancer switch on every save, so it is left to AIMP's UI.)
     The first time, the original settings are kept as AIMP.ini.b-side.bak.
  4. Loads the plugin folder into Orca. Orca asks for approval the first time and prints the
     command to approve it.

.PARAMETER SkipSettings
  Only install and fix persistence; leave AIMP's settings untouched.
#>
param([switch]$SkipSettings)
$ErrorActionPreference = 'Stop'

$StoreId = '9PCLLLH15SMT'
$Family = '25018ArtemIzmaylov.AIMP_4hdg3aaevdv22'
$AimpProfile = Join-Path $env:LOCALAPPDATA "Packages\$Family\LocalCache\Roaming\AIMP"
$PluginDir = Join-Path $PSScriptRoot 'plugin'
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

function Step($text) { Write-Host "-> $text" }

# Asks AIMP to quit and waits until its process is gone, so its own save on exit is finished.
function Stop-Aimp {
  $aimpPid = [BSideSetup]::ProcessId()
  if (-not $aimpPid) { return }
  [BSideSetup]::Quit()
  try { Wait-Process -Id $aimpPid -Timeout 30 -ErrorAction Stop } catch [System.Management.Automation.ActionPreferenceStopException] { }
  if (Get-Process -Id $aimpPid -ErrorAction SilentlyContinue) { throw 'AIMP did not close. Close it and run this again.' }
}

function Test-Linked { (Test-Path $Ini) -and (Test-Path $New) -and (@(fsutil hardlink list $Ini).Count -ge 2) }

function Test-Utf16([string]$path) {
  $bytes = [IO.File]::ReadAllBytes($path)
  return $bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE
}

# Returns the settings text with the wanted values, adding missing keys and sections.
function Set-IniValues([string]$text) {
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

function Test-SettingsApplied([string]$text) { (Set-IniValues $text) -eq $text }

# 1. AIMP
if (-not (Get-AppxPackage -Name '25018ArtemIzmaylov.AIMP')) {
  Step 'Installing AIMP from the Microsoft Store (current user)'
  winget install --id $StoreId --source msstore --accept-package-agreements --accept-source-agreements
  if (-not (Get-AppxPackage -Name '25018ArtemIzmaylov.AIMP')) { throw 'AIMP did not install. Install "AIMP" from the Microsoft Store and run this again.' }
} else { Step 'AIMP is installed' }

# AIMP writes its settings file the first time it closes.
if (-not (Test-Path $New) -and -not (Test-Path $Ini)) {
  Step 'Starting AIMP once to create its settings'
  Start-Process "shell:AppsFolder\$Family!AIMP"
  $deadline = (Get-Date).AddSeconds(40)
  while (-not [BSideSetup]::Running() -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if (-not [BSideSetup]::Running()) { throw 'AIMP did not start.' }
  Start-Sleep -Seconds 2
  Stop-Aimp
}

# 2 + 3. Decide first, so AIMP is only closed when something has to change.
$needsLink = -not (Test-Linked)
$current = if (Test-Path $Ini) { $Ini } elseif (Test-Path $New) { $New } else { $null }
if (-not $current) { throw "AIMP's settings file was not found in $AimpProfile. Open and close AIMP once, then run this again." }
$needsSettings = (-not $SkipSettings) -and -not (Test-SettingsApplied ([IO.File]::ReadAllText($current)))

if ($needsLink -or $needsSettings) {
  if ([BSideSetup]::Running()) { Step 'Closing AIMP to update its settings (it saves on exit)'; Stop-Aimp }

  if ($needsLink) {
    Step 'Linking AIMP.ini to AIMP.new so AIMP keeps its settings'
    $source = @($Ini, $New) | Where-Object { Test-Path $_ } | Sort-Object { (Get-Item $_).LastWriteTime } | Select-Object -Last 1
    if (-not (Test-Path $Backup) -and (Test-Path $Ini)) { Copy-Item $Ini $Backup }
    if ($source -ne $New) { [IO.File]::WriteAllBytes($New, [IO.File]::ReadAllBytes($source)) }
    # Build the link under a temporary name first: AIMP.ini is never missing.
    $tmp = "$Ini.b-side.tmp"
    if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Force }
    New-Item -ItemType HardLink -Path $tmp -Target $New | Out-Null
    Move-Item -LiteralPath $tmp -Destination $Ini -Force
    if (-not (Test-Linked)) { throw 'Could not link AIMP.ini to AIMP.new.' }
  } else { Step 'AIMP settings persistence is already fixed' }

  if ($needsSettings) {
    if (-not (Test-Utf16 $Ini)) {
      Write-Warning 'AIMP.ini is not in the format this script expects (UTF-16). Settings left unchanged; set them in AIMP (see README).'
    } else {
      Step 'Applying streaming and clean-output settings'
      if (-not (Test-Path $Backup)) { Copy-Item $Ini $Backup }
      $updated = Set-IniValues ([IO.File]::ReadAllText($Ini))
      # Write in place so the hard link stays; UTF-16 LE with BOM, as AIMP writes it.
      [IO.File]::WriteAllText($Ini, $updated, (New-Object Text.UnicodeEncoding($false, $true)))
      if (-not (Test-SettingsApplied ([IO.File]::ReadAllText($New)))) { throw 'The settings could not be verified after writing them.' }
      foreach ($section in $Wanted.Keys) { Step ("  [$section] " + (($Wanted[$section].GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ')) }
    }
  }
} else {
  Step 'AIMP is already set up (persistence fixed, settings applied)'
}

# 4. Orca plugin
$orca = Get-Command orca -ErrorAction SilentlyContinue
if (-not $orca) {
  Write-Warning "Orca's CLI was not found. In Orca, load the folder $PluginDir as a development plugin."
} else {
  Step 'Loading the B-Side panel into Orca'
  $result = & orca plugin dev load $PluginDir --json | Out-String | ConvertFrom-Json
  if ($result.ok) { Step 'B-Side is loaded. Open it from the right sidebar (B-Side).' }
  elseif ($result.error.code -eq 'approval_required') {
    Write-Host ''
    Write-Host $result.error.message
    Write-Host ''
    Write-Host "To approve, run: orca plugin dev load `"$PluginDir`" --approve $($result.error.data.approvalFingerprint)"
  } else { throw "Orca could not load the plugin: $($result.error.message)" }
}
Step 'Done'
