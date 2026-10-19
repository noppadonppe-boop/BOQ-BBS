param([switch]$ReuseGenerated)
$ErrorActionPreference='Stop'
$nativeOut=Join-Path (Get-Location) 'output/native-excel-verification'
$nativeInputs=$nativeOut
$nativeArtifacts=Get-Content -LiteralPath (Join-Path $nativeInputs 'artifacts.json') -Raw | ConvertFrom-Json
$nativeContext=Get-Content -LiteralPath (Join-Path $nativeInputs 'context.json') -Raw | ConvertFrom-Json
$nativeExcel=$null
$nativeBook=$null
$nativeResults=New-Object System.Collections.Generic.List[object]
$nativePdfFiles=New-Object System.Collections.Generic.List[object]
$nativeCurrent='startup'
$nativeSheetNames=@('Drawing Views','BOQ Print','Rebar Summary','BBS Print')
function Assert-Native([bool]$condition,[string]$message){if(-not $condition){throw $message}}
try {
 $nativeExcel=New-Object -ComObject Excel.Application
 $nativeExcel.Visible=$false
 $nativeExcel.DisplayAlerts=$false
 $nativeExcel.AutomationSecurity=3
 $nativeExcel.EnableEvents=$false
 $nativeRuntime=@{version=$nativeExcel.Version;build=$nativeExcel.Build;visible=$nativeExcel.Visible;method='Microsoft Excel COM / read-only originals / CalculateFullRebuild / selected sheets ExportAsFixedFormat';configuredSheets=$nativeSheetNames}
 foreach($nativeArtifact in @($nativeArtifacts | Where-Object {$_.file.EndsWith('.xlsx')})){
  $nativeCurrent=$nativeArtifact.file
  $nativePath=Join-Path $nativeInputs $nativeArtifact.file
  $nativeBefore=(Get-FileHash -LiteralPath $nativePath -Algorithm SHA256).Hash.ToLowerInvariant()
  Assert-Native ($nativeBefore -eq $nativeArtifact.sha256) 'Original source bytes do not match app export evidence'
  $nativeBook=$nativeExcel.Workbooks.Open($nativePath,0,$true)
  Assert-Native ($nativeBook.ReadOnly) 'Native source must be read-only'
  $nativeExcel.CalculateFullRebuild()
  $nativeBbs=$nativeBook.Worksheets.Item('BBS Print')
  $nativeBoq=$nativeBook.Worksheets.Item('BOQ Print')
  $nativeViews=$nativeBook.Worksheets.Item('Drawing Views')
  $nativeExpectedPosition=if($nativeArtifact.frozen){1000}else{1200}
  Assert-Native ($nativeViews.Range('E5').Value2 -eq $nativeExpectedPosition) 'Native saved section position differs'
  Assert-Native ($nativeBbs.Range('D5').Value2 -ceq '00') 'Native Code00 text not retained'
  Assert-Native ($nativeBbs.Range('I10').Value2 -eq 5) 'Native BBS total pieces not5'
  Assert-Native ([Math]::Abs($nativeBbs.Range('K10').Value2-$nativeContext.calc.rebar) -lt 0.000000001) 'Native BBS total weight differs'
  Assert-Native ([Math]::Abs($nativeBoq.Range('D6').Value2-3.234) -lt 0.000000001) 'Native concrete differs'
  Assert-Native ([Math]::Abs($nativeBoq.Range('E6').Value2-18.48) -lt 0.000000001) 'Native formwork differs'
  Assert-Native ([Math]::Abs($nativeBoq.Range('I6').Value2-$nativeContext.calc.rebar) -lt 0.000000001) 'Native BOQ rebar differs'
  Assert-Native ($nativeBbs.Shapes.Count -eq 5) 'Native BBS must retain all5 embedded bar shapes'
  $nativeChecks=@()
  $nativeFirst=$true
  foreach($nativeName in $nativeSheetNames){
   $nativeSheet=$nativeBook.Worksheets.Item($nativeName)
   $nativeArea=$nativeSheet.PageSetup.PrintArea
   Assert-Native ($nativeSheet.PageSetup.PaperSize -eq 8) ('Native paper must be A3: '+$nativeName)
   Assert-Native ($nativeSheet.PageSetup.Orientation -eq 2) ('Native paper must be landscape: '+$nativeName)
   Assert-Native ($nativeArea.Length -gt 0) ('Native print area missing: '+$nativeName)
   $nativeChecks+=@{name=$nativeName;printArea=$nativeArea;paperSize=$nativeSheet.PageSetup.PaperSize;orientation=$nativeSheet.PageSetup.Orientation;zoom=$nativeSheet.PageSetup.Zoom;printTitleRows=$nativeSheet.PageSetup.PrintTitleRows;fontRequested=$nativeSheet.Range('A1').Font.Name}
   $nativeSheet.Select($nativeFirst)
   $nativeFirst=$false
   [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($nativeSheet)|Out-Null
  }
  Assert-Native ($nativeExcel.ActiveWindow.SelectedSheets.Count -eq 4) 'Native selected print sheet group must contain4 sheets'
  $nativePdfName=$nativeArtifact.file.Replace('.xlsx','-native-a3.pdf')
  $nativePdfPath=Join-Path $nativeOut $nativePdfName
  $nativeActive=$nativeBook.ActiveSheet
  if(-not $ReuseGenerated){$nativeActive.ExportAsFixedFormat(0,$nativePdfPath,0,$true,$false,[Type]::Missing,[Type]::Missing,$false)}
  [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($nativeActive)|Out-Null
  Assert-Native (Test-Path -LiteralPath $nativePdfPath) 'Native PDF was not written'
  $nativePdfFiles.Add(@{file=$nativePdfName;bytes=(Get-Item -LiteralPath $nativePdfPath).Length;sha256=(Get-FileHash -LiteralPath $nativePdfPath -Algorithm SHA256).Hash.ToLowerInvariant();source=$nativeArtifact.file;sourceSha256=$nativeBefore;frozen=$nativeArtifact.frozen;sheets=$nativeChecks})
  foreach($nativeComSheet in @($nativeBbs,$nativeBoq,$nativeViews)){[System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($nativeComSheet)|Out-Null}
  $nativeBook.Close($false)
  [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($nativeBook)|Out-Null
  $nativeBook=$null
  Assert-Native ((Get-FileHash -LiteralPath $nativePath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $nativeBefore) 'Native read/print changed original source bytes'
  $nativeResults.Add(@{name='Microsoft Excel recalculates/read-only prints '+$nativeArtifact.file+' with three section records, five shapes, Code00, exact quantities and unchanged original SHA';status='PASS'})
  Write-Output ('PASS native Excel '+$nativeArtifact.file)
 }
} catch {
 $nativeResults.Add(@{name=$nativeCurrent;status='FAIL';message=$_.Exception.Message})
 throw
} finally {
 if($null -ne $nativeBook){$nativeBook.Close($false);[System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($nativeBook)|Out-Null}
 if($null -ne $nativeExcel){$nativeExcel.Quit();[System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($nativeExcel)|Out-Null}
 [GC]::Collect();[GC]::WaitForPendingFinalizers()
 @{results=$nativeResults.ToArray();runtime=$nativeRuntime;artifacts=$nativePdfFiles.ToArray();reusedGeneratedPdf=[bool]$ReuseGenerated;rulesChanged=$false;deployed=$false}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $nativeOut 'native-results.json') -Encoding UTF8
}
