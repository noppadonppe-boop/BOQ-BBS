$ErrorActionPreference='Stop'
$taperNativeRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/tapered-prism-verification'))
$taperExcel=$null
$taperBook=$null
$taperRows=New-Object System.Collections.Generic.List[object]
$taperCurrent='startup'
try{
 $taperExcel=New-Object -ComObject Excel.Application
 $taperExcel.Visible=$false
 $taperExcel.DisplayAlerts=$false
 $taperExcel.AutomationSecurity=3
 $taperExcel.EnableEvents=$false
 foreach($taperFile in @('TAPER-project','TAPER-zoneA')){
  $taperCurrent=$taperFile
  $taperPath=[IO.Path]::GetFullPath((Join-Path $taperNativeRoot ($taperFile+'.xlsx')))
  if(-not $taperPath.StartsWith($taperNativeRoot+[IO.Path]::DirectorySeparatorChar)){throw 'Native QA path escaped output directory'}
  $taperHash=(Get-FileHash -LiteralPath $taperPath -Algorithm SHA256).Hash
  $taperBook=$taperExcel.Workbooks.Open($taperPath,0,$true)
  if(-not $taperBook.ReadOnly){throw 'Original must remain read-only'}
  $taperExcel.CalculateFullRebuild()
  $taperCheck=$taperBook.Worksheets.Item('Taper Check')
  $taperInputs=$taperBook.Worksheets.Item('Taper Inputs')
  $taperEdges=$taperBook.Worksheets.Item('Taper Edges')
  $taperRow=if($taperFile -eq 'TAPER-project'){9}else{4}
  $taperQty=if($taperRow -eq 9){3}else{2}
  $taperForm=1.25+3*[Math]::Sqrt(1.0625)
  if([Math]::Abs($taperCheck.Range("J$taperRow").Value2-7/12) -gt 0.000000001 -or [Math]::Abs($taperCheck.Range("K$taperRow").Value2-$taperForm) -gt 0.000000001){throw 'Native prismoidal volume / sloping face area mismatch'}
  if($taperCheck.Range("L$taperRow").Value2 -ne $taperQty){throw 'Scoped quantity mismatch'}
  if($taperBook.Worksheets.Item('BBS').Range('I4').Value2 -ne 850 -or $taperBook.Worksheets.Item('BBS').Range('K4').Value2 -ne 2*$taperQty){throw 'BBS length/count mismatch'}
  if($taperRow -eq 9){
   $taperTotalForm=7*$taperForm-.2+1.2*[Math]::Sqrt(1.01)+4+[Math]::Sqrt(1.25)
   if([Math]::Abs($taperBook.Worksheets.Item('BOQ').Range('J10').Value2-4.74) -gt 0.000000001 -or [Math]::Abs($taperBook.Worksheets.Item('BOQ').Range('K10').Value2-$taperTotalForm) -gt 0.000000001){throw 'Whole-project quantity mismatch'}
  }
  $taperOriginal=$taperInputs.Range("E$taperRow").Value2
  $taperInputs.Range("E$taperRow").Value2=.75
  $taperExcel.CalculateFullRebuild()
  $taperEditedForm=2.125+2.5*[Math]::Sqrt(1.0625)
  if([Math]::Abs($taperCheck.Range("J$taperRow").Value2-2/3) -gt 0.000000001 -or [Math]::Abs($taperCheck.Range("K$taperRow").Value2-$taperEditedForm) -gt 0.000000001){throw 'Shared end-scale driver did not propagate to area/volume/formwork'}
  if([Math]::Abs($taperBook.Worksheets.Item('BOQ').Range("D$taperRow").Value2-7/12) -gt 0.000000001){throw 'Diagnostic driver changed captured BOQ'}
  $taperInputs.Range("E$taperRow").Value2=$taperOriginal
  $taperExcel.CalculateFullRebuild()
  foreach($taperSheet in @($taperInputs,$taperEdges,$taperCheck)){
   if($taperSheet.PageSetup.PaperSize -ne 8 -or $taperSheet.PageSetup.Orientation -ne 2){throw 'Expected A3 landscape print'}
   $taperSheet.Select()
   $taperSheet.ExportAsFixedFormat(0,(Join-Path $taperNativeRoot ($taperFile+'-'+$taperSheet.Name.Replace(' ','-')+'-native.pdf')),0,$true,$false)
  }
  $taperRows.Add(@{file=$taperFile+'.xlsx';status='PASS';quantity=$taperQty;volume=7/12;formwork=$taperForm;editedEndScaleU=.75;editedVolume=2/3;editedForm=$taperEditedForm;readOnly=$true;capturedBoqUnchanged=$true;originalSha256=$taperHash})
  $taperBook.Close($false)
  [Runtime.InteropServices.Marshal]::FinalReleaseComObject($taperBook)|Out-Null
  $taperBook=$null
  if((Get-FileHash -LiteralPath $taperPath -Algorithm SHA256).Hash -ne $taperHash){throw 'Original workbook changed'}
 }
 @{status='PASS';version=$taperExcel.Version;build=$taperExcel.Build;checks=$taperRows.ToArray()}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $taperNativeRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS two native Excel calculations, scale sensitivity, six print sheets, original workbooks unchanged'
}catch{
 @{status='FAIL';current=$taperCurrent;message=$_.Exception.Message;checks=$taperRows.ToArray()}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $taperNativeRoot 'native-results.json') -Encoding UTF8
 throw
}finally{
 if($null -ne $taperBook){$taperBook.Close($false);[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taperBook)|Out-Null}
 if($null -ne $taperExcel){$taperExcel.Quit();[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taperExcel)|Out-Null}
}
