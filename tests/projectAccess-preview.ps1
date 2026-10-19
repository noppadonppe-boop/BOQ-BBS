param([switch]$BuildOnly)
$ErrorActionPreference='Stop'
$workspacePath=[IO.Path]::GetFullPath((Get-Location).Path)
if($workspacePath -ne 'F:\Project Code\BOQ_BBS'){throw 'Unexpected workspace'}
$env:VITE_USE_EMULATORS='true';$env:VITE_FIREBASE_PROJECT_ID='demo-boq-bbs';$env:VITE_FIREBASE_API_KEY='demo-api-key';$env:VITE_FIREBASE_AUTH_DOMAIN='demo-boq-bbs.firebaseapp.com';$env:VITE_FIREBASE_STORAGE_BUCKET='demo-boq-bbs.appspot.com';$env:VITE_FIREBASE_APP_ID='1:demo:web:demo'
$runtimePath='C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$ErrorActionPreference='Continue'
& $runtimePath node_modules/vite/bin/vite.js build --outDir output/project-access-verification/built-app *> tmp/project-access-qa-build.log
$ErrorActionPreference='Stop'
if($LASTEXITCODE -ne 0){Get-Content tmp/project-access-qa-build.log -Tail 20;throw 'QA build failed'}
if($BuildOnly){Write-Output 'Rebuilt isolated demo profile for existing preview';exit}
$started=Start-Process -FilePath $runtimePath -ArgumentList 'node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5177 --strictPort --outDir output/project-access-verification/built-app' -WorkingDirectory $workspacePath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $workspacePath 'tmp\project-access-preview.stdout.log') -RedirectStandardError (Join-Path $workspacePath 'tmp\project-access-preview.stderr.log') -PassThru
$started.Id | Set-Content -LiteralPath 'output/project-access-verification/preview-pid.txt'
Write-Output "Built isolated demo profile; preview PID $($started.Id), port5177"
