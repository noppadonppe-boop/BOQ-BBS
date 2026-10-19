$ErrorActionPreference='Stop'
$ovalRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/oval-link-verification'))
$ovalExcel=$null;$ovalBook=$null;$ovalChecks=New-Object System.Collections.Generic.List[object]
try{
 $ovalExcel=New-Object -ComObject Excel.Application
 $ovalExcel.Visible=$false;$ovalExcel.DisplayAlerts=$false;$ovalExcel.AutomationSecurity=3;$ovalExcel.EnableEvents=$false
 foreach($ovalFile in @('OVAL-v7','OVAL-v8')){
  $ovalPath=[IO.Path]::GetFullPath((Join-Path $ovalRoot ($ovalFile+'.xlsx')))
  if(-not $ovalPath.StartsWith($ovalRoot+[IO.Path]::DirectorySeparatorChar)){throw 'QA path escaped output folder'}
  $ovalHash=(Get-FileHash -LiteralPath $ovalPath -Algorithm SHA256).Hash
  $ovalBook=$ovalExcel.Workbooks.Open($ovalPath,0,$true)
  if(-not $ovalBook.ReadOnly){throw 'Original must stay readonly'}
  $ovalExcel.CalculateFullRebuild();$ovalBbs=$ovalBook.Worksheets.Item('BBS')
  if($ovalBbs.Range('B5').Value2 -ne 'O01' -or $ovalBbs.Range('B4').Value2 -ne 'O02'){throw 'Mark lookup changed'}
  $ovalCut=if($ovalFile -eq 'OVAL-v7'){1800}else{1825}
  if($ovalBbs.Range('I5').Value2 -ne $ovalCut -or $ovalBbs.Range('K5').Value2 -ne 6 -or $ovalBbs.Range('K4').Value2 -ne 1){throw 'Captured cut/count mismatch'}
  if($ovalFile -eq 'OVAL-v8'){
   $ovalSheet=$ovalBook.Worksheets.Item('Oval Link Geometry')
   $ovalProjected=900+3*[Math]::PI*94
   if($ovalSheet.Range('K5').Value2 -ne 1804 -or [Math]::Abs($ovalSheet.Range('L5').Value2-$ovalProjected) -gt 0.000000001 -or $ovalSheet.Range('F4').Value2 -ne 320){throw 'Source formula / projected centreline / asymmetric return mismatch'}
   $ovalOriginal=$ovalSheet.Range('E5').Value2;$ovalSheet.Range('E5').Value2=300;$ovalExcel.CalculateFullRebuild()
   if($ovalSheet.Range('K5').Value2 -ne 1804 -or [Math]::Abs($ovalSheet.Range('L5').Value2-$ovalProjected-50) -gt 0.000000001){throw 'C sensitivity did not preserve Table formula while changing projected length'}
   if($ovalSheet.Range('M5').Value2 -ne 1825 -or $ovalBbs.Range('I5').Value2 -ne 1825){throw 'Reference edits changed captured cut'}
   $ovalSheet.Range('E5').Value2=$ovalOriginal;$ovalExcel.CalculateFullRebuild()
   $ovalSheet.Select();$ovalSheet.ExportAsFixedFormat(0,(Join-Path $ovalRoot 'OVAL-v8-Oval-Link-Geometry-native.pdf'),0,$true,$false)
  }
  $ovalPrint=$ovalBook.Worksheets.Item('BBS Print');$ovalPrint.Select();$ovalPrint.ExportAsFixedFormat(0,(Join-Path $ovalRoot ($ovalFile+'-BBS-Print-native.pdf')),0,$true,$false)
  $ovalChecks.Add(@{file=$ovalFile+'.xlsx';status='PASS';baseCut=$ovalCut;baseCount=6;asymmetricCount=1;tableReference=if($ovalFile -eq 'OVAL-v8'){1804}else{$null};freeCSensitivity=($ovalFile -eq 'OVAL-v8');sourceReadonly=$true;sha256=$ovalHash})
  $ovalBook.Close($false);[Runtime.InteropServices.Marshal]::FinalReleaseComObject($ovalBook)|Out-Null;$ovalBook=$null
  if((Get-FileHash -LiteralPath $ovalPath -Algorithm SHA256).Hash -ne $ovalHash){throw 'Original workbook changed'}
 }
 @{status='PASS';version=$ovalExcel.Version;build=$ovalExcel.Build;checks=$ovalChecks.ToArray()}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $ovalRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS two native Excel calculations, freeC sensitivity, three print sheets and original hashes unchanged'
}finally{
 if($null -ne $ovalBook){$ovalBook.Close($false);[Runtime.InteropServices.Marshal]::FinalReleaseComObject($ovalBook)|Out-Null}
 if($null -ne $ovalExcel){$ovalExcel.Quit();[Runtime.InteropServices.Marshal]::FinalReleaseComObject($ovalExcel)|Out-Null}
}
