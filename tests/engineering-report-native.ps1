$ErrorActionPreference='Stop'
$reportNativeRoot=[System.IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/engineering-report-verification'))
$reportNativeApp=$null
$reportNativeBook=$null
$reportNativeRows=New-Object System.Collections.Generic.List[object]
$reportNativeCurrent='startup'
try{
 $reportNativeApp=New-Object -ComObject Excel.Application
 $reportNativeApp.Visible=$false
 $reportNativeApp.DisplayAlerts=$false
 $reportNativeApp.AutomationSecurity=3
 $reportNativeApp.EnableEvents=$false
 $reportNativeRuntime=@{version=$reportNativeApp.Version;build=$reportNativeApp.Build;visible=$false;macroDisabled=$true;readOnlyOriginals=$true;method='New owned Excel COM / CalculateFullRebuild / two readable print areas / no save'}
 foreach($reportNativeProfile in @('gulf-reference','bbs-qa','partial-qa','negative-qa')){
  $reportNativeCurrent=$reportNativeProfile
  $reportNativePath=[System.IO.Path]::GetFullPath((Join-Path $reportNativeRoot ($reportNativeProfile+'.xlsx')))
  if(-not $reportNativePath.StartsWith($reportNativeRoot+[System.IO.Path]::DirectorySeparatorChar)){throw 'Native QA path escaped output directory'}
  $reportNativeBefore=(Get-FileHash -LiteralPath $reportNativePath -Algorithm SHA256).Hash
  $reportNativeBook=$reportNativeApp.Workbooks.Open($reportNativePath,0,$true)
  if(-not $reportNativeBook.ReadOnly){throw 'Native QA original must stay read-only'}
  $reportNativeApp.CalculateFullRebuild()
  $reportNativeMain=$reportNativeBook.Worksheets.Item('Comparison')
  if($reportNativeProfile -eq 'partial-qa'){
   if($null -ne $reportNativeMain.Range('C16').Value2){throw 'Missing expectation became a number'}
   if($reportNativeMain.Range('C17').Value2 -ne 0){throw 'Explicit zero changed'}
   if($reportNativeMain.Range('E16').Value2 -ne ''){throw 'Missing delta must remain blank'}
  }
  if($reportNativeProfile -eq 'gulf-reference'){
   if($null -ne $reportNativeMain.Range('D19').Value2){throw 'Unentered steel became zero'}
   if($reportNativeMain.Range('E19').Value2 -ne ''){throw 'Unavailable steel delta must remain blank'}
  }
  if($reportNativeProfile -eq 'bbs-qa'){
   if($reportNativeMain.Range('D20').Value2 -ne 800 -or $reportNativeMain.Range('D21').Value2 -ne 15){throw 'BBS cut/count multiplied incorrectly'}
   $reportNativeCapturedDecision=$reportNativeMain.Range('G14').Value2
   $reportNativeMain.Range('C14').Value2=25
   $reportNativeApp.CalculateFullRebuild()
   if($reportNativeMain.Range('E14').Value2 -ne -20){throw 'Live delta did not recalculate'}
   if($reportNativeMain.Range('G14').Value2 -ne $reportNativeCapturedDecision){throw 'Captured decision changed after an Excel-only edit'}
   $reportNativeMain.Range('C14').Value2=5
   $reportNativeApp.CalculateFullRebuild()
  }
  foreach($reportNativeSheetName in @('Comparison','Captured Input')){
   $reportNativeSheet=$reportNativeBook.Worksheets.Item($reportNativeSheetName)
   try{$reportNativeErrors=$reportNativeSheet.UsedRange.SpecialCells(-4123,16);if($null -ne $reportNativeErrors){throw 'Native formula error cells found'}}catch{if($_.Exception.Message -notlike '*No cells were found*'){throw}}
   # Raw JSON remains available but is outside the readable print area.
   if($reportNativeSheet.PageSetup.FitToPagesWide -ne 1){throw 'Report print width must be one page'}
  }
  $reportNativeBook.Worksheets.Item('Comparison').Select()
  $reportNativeBook.Worksheets.Item('Captured Input').Select($false)
  $reportNativePdf=Join-Path $reportNativeRoot ($reportNativeProfile+'-native-print.pdf')
  $reportNativeBook.ActiveSheet.ExportAsFixedFormat(0,$reportNativePdf,0,$true,$false)
  $reportNativeRows.Add(@{profile=$reportNativeProfile;file=$reportNativeProfile+'.xlsx';status='PASS';pdf=$reportNativeProfile+'-native-print.pdf';sheetCount=2;printAreas=@($reportNativeMain.PageSetup.PrintArea,$reportNativeBook.Worksheets.Item('Captured Input').PageSetup.PrintArea);deltaEditedAndRestored=$reportNativeProfile -eq 'bbs-qa';sourceShaBefore=$reportNativeBefore;originalUnchanged=$true})
  $reportNativeBook.Close($false)
  [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($reportNativeBook)|Out-Null
  $reportNativeBook=$null
  if((Get-FileHash -LiteralPath $reportNativePath -Algorithm SHA256).Hash -ne $reportNativeBefore){throw 'Original workbook SHA changed'}
 }
 @{status='PASS';runtime=$reportNativeRuntime;checks=$reportNativeRows.ToArray()}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $reportNativeRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS native Excel read-only recalculation, four workbook prints and original SHAs unchanged'
}catch{
 @{status='FAIL';current=$reportNativeCurrent;message=$_.Exception.Message;completed=$reportNativeRows.ToArray()}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $reportNativeRoot 'native-results.json') -Encoding UTF8
 throw
}finally{
 if($null -ne $reportNativeBook){$reportNativeBook.Close($false);[System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($reportNativeBook)|Out-Null}
 if($null -ne $reportNativeApp){$reportNativeApp.Quit();[System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($reportNativeApp)|Out-Null}
}
