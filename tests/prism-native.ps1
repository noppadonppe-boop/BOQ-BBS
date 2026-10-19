$ErrorActionPreference='Stop'
$prismNativeRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/prism-verification'))
$prismExcel=$null
$prismBook=$null
$prismRows=New-Object System.Collections.Generic.List[object]
$prismCurrent='startup'
try{
 $prismExcel=New-Object -ComObject Excel.Application
 $prismExcel.Visible=$false
 $prismExcel.DisplayAlerts=$false
 $prismExcel.AutomationSecurity=3
 $prismExcel.EnableEvents=$false
 foreach($prismFile in @('PRISM-draft','PRISM-zoneA')){
  $prismCurrent=$prismFile
  $prismPath=[IO.Path]::GetFullPath((Join-Path $prismNativeRoot ($prismFile+'.xlsx')))
  if(-not $prismPath.StartsWith($prismNativeRoot+[IO.Path]::DirectorySeparatorChar)){throw 'Native QA escaped output directory'}
  $prismOriginal=(Get-FileHash -LiteralPath $prismPath -Algorithm SHA256).Hash
  $prismBook=$prismExcel.Workbooks.Open($prismPath,0,$true)
  if(-not $prismBook.ReadOnly){throw 'Original workbook must stay read-only'}
  $prismExcel.CalculateFullRebuild()
  $prismCheck=$prismBook.Worksheets.Item('Prism Check')
  $prismEdges=$prismBook.Worksheets.Item('Prism Edges')
  $prismQty=if($prismFile -eq 'PRISM-draft'){3}else{2}
  $prismRow=0
  for($prismScan=4;$prismScan -le $prismCheck.UsedRange.Rows.Count;$prismScan++){if($prismCheck.Cells.Item($prismScan,1).Value2 -eq 'P-Custom'){$prismRow=$prismScan;break}}
  if(-not $prismRow){throw 'Captured polygon member not found'}
  if($prismFile -eq 'PRISM-draft'){
   if($prismCheck.Range('F7').Value2 -ne 1000000 -or $prismCheck.Range('K7').Value2 -ne 19){throw 'Native through-hole area/formwork mismatch'}
   if($prismBook.Worksheets.Item('BOQ').Range('J10').Value2 -ne 24 -or $prismBook.Worksheets.Item('BOQ').Range('K10').Value2 -ne 145){throw 'Native all-category total mismatch'}
  }
  if($prismCheck.Range("E$prismRow").Value2 -ne 6000000){throw 'Native shoelace area mismatch'}
  if($prismCheck.Range("F$prismRow").Value2 -ne 0){throw 'Native zero-hole area mismatch'}
  if($prismCheck.Range("H$prismRow").Value2 -ne 12000){throw 'Native 3-4-5 perimeter mismatch'}
  if($prismCheck.Range("J$prismRow").Value2 -ne 3){throw 'Native prism volume mismatch'}
  if($prismCheck.Range("K$prismRow").Value2 -ne 18){throw 'Native prism formwork mismatch'}
  if($prismCheck.Range("L$prismRow").Value2 -ne $prismQty -or $prismCheck.Range("O$prismRow").Value2 -ne 3*$prismQty){throw 'Native scoped quantity multiplied incorrectly'}
  if($prismBook.Worksheets.Item('BBS').Range('K4').Value2 -ne 2*$prismQty){throw 'Native BBS quantity mismatch'}
  $prismDepth=$prismCheck.Range("D$prismRow").Value2
  $prismCheck.Range("D$prismRow").Value2=1000
  $prismExcel.CalculateFullRebuild()
  if($prismCheck.Range("J$prismRow").Value2 -ne 6 -or $prismCheck.Range("K$prismRow").Value2 -ne 24){throw 'Native in-memory formula sensitivity mismatch'}
  if($prismBook.Worksheets.Item('BOQ').Range("D$prismRow").Value2 -ne 3){throw 'Diagnostic reference edited captured BOQ'}
  $prismCheck.Range("D$prismRow").Value2=$prismDepth
  $prismExcel.CalculateFullRebuild()
  foreach($prismSheet in @($prismCheck,$prismEdges)){
   if($prismSheet.PageSetup.PaperSize -ne 8 -or $prismSheet.PageSetup.Orientation -ne 2){throw 'Native prism print must be A3 landscape'}
   $prismSheet.Select()
   $prismSheet.ExportAsFixedFormat(0,(Join-Path $prismNativeRoot ($prismFile+'-'+$prismSheet.Name.Replace(' ','-')+'-native.pdf')),0,$true,$false)
  }
  $prismRows.Add(@{file=$prismFile+'.xlsx';status='PASS';area=6000000;perimeter=12000;volume=3;formwork=18;quantity=$prismQty;editedInMemoryAndRestored=$true;capturedBoqUnchanged=$true;readOnly=$true;sha256=$prismOriginal})
  $prismBook.Close($false)
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($prismBook)|Out-Null
  $prismBook=$null
  if((Get-FileHash -LiteralPath $prismPath -Algorithm SHA256).Hash -ne $prismOriginal){throw 'Original workbook changed'}
 }
 @{status='PASS';version=$prismExcel.Version;build=$prismExcel.Build;checks=$prismRows.ToArray()}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $prismNativeRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS two native Excel formula checks, in-memory sensitivity, four print sheets, original files unchanged'
}catch{
 @{status='FAIL';current=$prismCurrent;message=$_.Exception.Message;checks=$prismRows.ToArray()}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $prismNativeRoot 'native-results.json') -Encoding UTF8
 throw
}finally{
 if($null -ne $prismBook){$prismBook.Close($false);[Runtime.InteropServices.Marshal]::FinalReleaseComObject($prismBook)|Out-Null}
 if($null -ne $prismExcel){$prismExcel.Quit();[Runtime.InteropServices.Marshal]::FinalReleaseComObject($prismExcel)|Out-Null}
}
