$ErrorActionPreference='Stop'
$inclinedNativeRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/inclined-prism-verification'))
$inclinedExcel=$null
$inclinedBook=$null
$inclinedRows=New-Object System.Collections.Generic.List[object]
$inclinedCurrent='startup'
try{
 $inclinedExcel=New-Object -ComObject Excel.Application
 $inclinedExcel.Visible=$false
 $inclinedExcel.DisplayAlerts=$false
 $inclinedExcel.AutomationSecurity=3
 $inclinedExcel.EnableEvents=$false
 foreach($inclinedFile in @('INCLINED-project','INCLINED-zoneA')){
  $inclinedCurrent=$inclinedFile
  $inclinedPath=[IO.Path]::GetFullPath((Join-Path $inclinedNativeRoot ($inclinedFile+'.xlsx')))
  if(-not $inclinedPath.StartsWith($inclinedNativeRoot+[IO.Path]::DirectorySeparatorChar)){throw 'Native QA path escaped output directory'}
  $inclinedHash=(Get-FileHash -LiteralPath $inclinedPath -Algorithm SHA256).Hash
  $inclinedBook=$inclinedExcel.Workbooks.Open($inclinedPath,0,$true)
  if(-not $inclinedBook.ReadOnly){throw 'Original must remain read-only'}
  $inclinedExcel.CalculateFullRebuild()
  $inclinedCheck=$inclinedBook.Worksheets.Item('Prism Check')
  $inclinedEdges=$inclinedBook.Worksheets.Item('Prism Edges')
  $inclinedRow=if($inclinedFile -eq 'INCLINED-project'){9}else{4}
  $inclinedStart=if($inclinedRow -eq 9){28}else{4}
  $inclinedQty=if($inclinedRow -eq 9){3}else{2}
  if($inclinedCheck.Range("D$inclinedRow").Value2 -ne 1000 -or $inclinedCheck.Range("J$inclinedRow").Value2 -ne 1){throw 'Volume incorrectly used inclined run instead of axis advance'}
  if($inclinedCheck.Range("K$inclinedRow").Value2 -ne 6.5){throw 'Native3D surface area mismatch'}
  if($inclinedCheck.Range("L$inclinedRow").Value2 -ne $inclinedQty){throw 'Scoped quantity mismatch'}
  if($inclinedBook.Worksheets.Item('BBS').Range('I4').Value2 -ne 1150 -or $inclinedBook.Worksheets.Item('BBS').Range('K4').Value2 -ne 2*$inclinedQty){throw 'BBS length/count mismatch'}
  if($inclinedRow -eq 9){
   if([Math]::Abs($inclinedCheck.Range('K7').Value2-7.98) -gt 0.00000001 -or $inclinedEdges.Range('M16').Value2 -ne -750){throw 'Negative hole vector/formwork mismatch'}
   if([Math]::Abs($inclinedBook.Worksheets.Item('BOQ').Range('J10').Value2-7.84) -gt 0.00000001 -or [Math]::Abs($inclinedBook.Worksheets.Item('BOQ').Range('K10').Value2-53.48) -gt 0.00000001){throw 'Whole-project quantity mismatch'}
  }
  $inclinedOriginalAdvance=$inclinedEdges.Range("O$inclinedStart").Value2
  $inclinedEdges.Range("O$inclinedStart").Value2=1500
  $inclinedExcel.CalculateFullRebuild()
  $inclinedExpectedForm=2+3+2*[Math]::Sqrt(1500*1500+750*750)/1000
  if($inclinedCheck.Range("J$inclinedRow").Value2 -ne 1.5 -or [Math]::Abs($inclinedCheck.Range("K$inclinedRow").Value2-$inclinedExpectedForm) -gt 0.00000001){throw 'Shared vector driver did not propagate to volume and3D area'}
  if($inclinedBook.Worksheets.Item('BOQ').Range("D$inclinedRow").Value2 -ne 1){throw 'Diagnostic driver changed captured BOQ'}
  $inclinedEdges.Range("O$inclinedStart").Value2=$inclinedOriginalAdvance
  $inclinedExcel.CalculateFullRebuild()
  foreach($inclinedSheet in @($inclinedCheck,$inclinedEdges)){
   if($inclinedSheet.PageSetup.PaperSize -ne 8 -or $inclinedSheet.PageSetup.Orientation -ne 2){throw 'Expected A3 landscape print'}
   $inclinedSheet.Select()
   $inclinedSheet.ExportAsFixedFormat(0,(Join-Path $inclinedNativeRoot ($inclinedFile+'-'+$inclinedSheet.Name.Replace(' ','-')+'-native.pdf')),0,$true,$false)
  }
  $inclinedRows.Add(@{file=$inclinedFile+'.xlsx';status='PASS';quantity=$inclinedQty;volume=1;formwork=6.5;editedAdvance=1500;editedVolume=1.5;editedForm=$inclinedExpectedForm;readOnly=$true;capturedBoqUnchanged=$true;originalSha256=$inclinedHash})
  $inclinedBook.Close($false)
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($inclinedBook)|Out-Null
  $inclinedBook=$null
  if((Get-FileHash -LiteralPath $inclinedPath -Algorithm SHA256).Hash -ne $inclinedHash){throw 'Original workbook changed'}
 }
 @{status='PASS';version=$inclinedExcel.Version;build=$inclinedExcel.Build;checks=$inclinedRows.ToArray()}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $inclinedNativeRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS two native Excel calculations, shared-driver sensitivity, four print sheets, original workbooks unchanged'
}catch{
 @{status='FAIL';current=$inclinedCurrent;message=$_.Exception.Message;checks=$inclinedRows.ToArray()}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $inclinedNativeRoot 'native-results.json') -Encoding UTF8
 throw
}finally{
 if($null -ne $inclinedBook){$inclinedBook.Close($false);[Runtime.InteropServices.Marshal]::FinalReleaseComObject($inclinedBook)|Out-Null}
 if($null -ne $inclinedExcel){$inclinedExcel.Quit();[Runtime.InteropServices.Marshal]::FinalReleaseComObject($inclinedExcel)|Out-Null}
}
