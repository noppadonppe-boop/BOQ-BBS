$ErrorActionPreference='Stop'
$workspacePath=[IO.Path]::GetFullPath((Get-Location).Path)
if($workspacePath -ne 'F:\Project Code\BOQ_BBS'){throw 'Unexpected workspace'}
$checkpointPath=[IO.Path]::GetFullPath((Join-Path $workspacePath 'output\emulator-checkpoints\v0.25-verified-20261012'))
$defaultPath=[IO.Path]::GetFullPath((Join-Path $workspacePath '.emulator-data'))
$archivePath=[IO.Path]::GetFullPath((Join-Path $workspacePath 'output\emulator-checkpoints\pre-v25-default-data-20261012'))
foreach($targetPath in @($checkpointPath,$defaultPath,$archivePath)){
    if(!$targetPath.StartsWith($workspacePath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Target outside workspace'}
}
if(!(Test-Path -LiteralPath $checkpointPath) -or !(Test-Path -LiteralPath $defaultPath) -or (Test-Path -LiteralPath $archivePath)){throw 'Missing source/default or archive already exists'}
foreach($targetPath in @($checkpointPath,$defaultPath)){
    if((Get-Item -LiteralPath $targetPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse directory'}
    if(Get-ChildItem -LiteralPath $targetPath -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Nested reparse entry'}
}
$verified=Get-Content -LiteralPath 'output/project-access-verification/checkpoint-verification.json' -Raw | ConvertFrom-Json
if($verified.status -ne 'PASS' -or !$verified.allBlobSizeAndMd5Match -or $verified.previousV24BlobBytesPreserved -ne 3442){throw 'Checkpoint not verified'}
$cli=Get-CimInstance Win32_Process -Filter 'ProcessId=41296'
if(!$cli -or $cli.CommandLine -notmatch 'firebase.js emulators:start --project demo-boq-bbs --import=.emulator-data --export-on-exit=.emulator-data'){throw 'Original emulator identity changed'}
$inventory=Get-CimInstance Win32_Process
$tree=@([pscustomobject]@{Process=$cli;Depth=0})
for($i=0;$i -lt $tree.Count;$i++){
    foreach($child in $inventory | Where-Object {$_.ParentProcessId -eq $tree[$i].Process.ProcessId}){
        $tree+= [pscustomobject]@{Process=$child;Depth=$tree[$i].Depth+1}
    }
}
@($tree | ForEach-Object {[pscustomobject]@{pid=$_.Process.ProcessId;parent=$_.Process.ParentProcessId;command=$_.Process.CommandLine}}) | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'output/project-access-verification/restart-stopped-processes.json'
foreach($entry in ($tree | Sort-Object Depth -Descending)){
    $current=Get-CimInstance Win32_Process -Filter "ProcessId=$($entry.Process.ProcessId)"
    if($current){
        if($current.CommandLine -ne $entry.Process.CommandLine){throw 'Process identity changed'}
        Stop-Process -Id $current.ProcessId -Force
    }
}
Move-Item -LiteralPath $defaultPath -Destination $archivePath
Copy-Item -LiteralPath $checkpointPath -Destination $defaultPath -Recurse
& 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' tests/projectAccess-checkpoint.py --default-copy
if($LASTEXITCODE -ne 0){throw 'Default copy verification failed'}
$runtimePath='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$argsLine='node_modules/firebase-tools/lib/bin/firebase.js emulators:start --project demo-boq-bbs --import=.emulator-data --export-on-exit=.emulator-data'
# Local SDK discovery exceeded the CLI's default10s after the full build. This
# override only affects this emulator process; the configured cloud runtime stays unchanged.
$env:FUNCTIONS_DISCOVERY_TIMEOUT='30'
$started=Start-Process -FilePath $runtimePath -ArgumentList $argsLine -WorkingDirectory $workspacePath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $workspacePath 'tmp\emulator-v25.stdout.log') -RedirectStandardError (Join-Path $workspacePath 'tmp\emulator-v25.stderr.log') -PassThru
$started.Id | Set-Content -LiteralPath 'output/project-access-verification/restart-emulator-pid.txt'
Write-Output "Started verified-default local emulator PID $($started.Id); previous default retained at $archivePath"
