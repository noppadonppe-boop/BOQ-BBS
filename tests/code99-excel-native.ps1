$ErrorActionPreference='Stop'
$code99Root=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/code99-excel-verification'))
$code99Excel=$null;$code99Book=$null;$code99Results=@()
try{
 $code99Excel=New-Object -ComObject Excel.Application;$code99Excel.Visible=$false;$code99Excel.DisplayAlerts=$false;$code99Excel.AutomationSecurity=3;$code99Excel.EnableEvents=$false
 foreach($code99Name in @('Code99-drawing-cases.xlsx','C1-Mark4-Excel-drawing-review.xlsx')){
  $code99File=[IO.Path]::GetFullPath((Join-Path $code99Root $code99Name));if(-not $code99File.StartsWith($code99Root+[IO.Path]::DirectorySeparatorChar)){throw 'QA path escaped workspace'}
  $code99Hash=(Get-FileHash -LiteralPath $code99File -Algorithm SHA256).Hash;$code99Book=$code99Excel.Workbooks.Open($code99File,0,$true);if(-not $code99Book.ReadOnly){throw 'Source must remain readonly'}
  $code99Excel.CalculateFullRebuild();$code99Details=$code99Book.Worksheets.Item('Code99 Details');$code99Coordinates=$code99Book.Worksheets.Item('Code99 Coordinates');$code99Found=$false
  for($code99Row=5;$code99Row -le $code99Details.UsedRange.Rows.Count;$code99Row++){
   if($code99Details.Cells.Item($code99Row,2).Value2 -eq '4' -and $code99Details.Cells.Item($code99Row,3).Value2 -eq 'L02'){
    if([Math]::Abs($code99Details.Cells.Item($code99Row,4).Value2-600) -gt .000001 -or $code99Details.Cells.Item($code99Row,8).Value2 -ne 800 -or $code99Details.Cells.Item($code99Row,9).Value2 -ne 1){throw 'Source dimension/cut/count changed'}
    $code99Found=$true
   }
  }
  if(-not $code99Found){throw 'Source dimension row missing'}
  $code99PointsFound=$false;for($code99Row=5;$code99Row -le $code99Coordinates.UsedRange.Rows.Count;$code99Row++){
   if($code99Coordinates.Cells.Item($code99Row,2).Value2 -eq '4' -and $code99Coordinates.Cells.Item($code99Row,3).Value2 -eq 'P00'){
    if($code99Coordinates.Cells.Item($code99Row,4).Value2 -ne 56 -or $code99Coordinates.Cells.Item($code99Row,5).Value2 -ne 170 -or $code99Coordinates.Cells.Item($code99Row,6).Value2 -ne 3500){throw 'Physical first vertex changed'}
    $code99PointsFound=$true
   }
  }
  if(-not $code99PointsFound){throw 'Physical vertex missing'}
  $code99All=$code99Name.StartsWith('Code99');$code99BOQ=$code99Book.Worksheets.Item('BOQ');$code99Total=0
  for($code99Row=4;$code99Row -le $code99BOQ.UsedRange.Rows.Count;$code99Row++){if($code99BOQ.Cells.Item($code99Row,3).Value2 -is [double]){$code99Total+=$code99BOQ.Cells.Item($code99Row,10).Value2}}
  $code99Expected=if($code99All){128.234}else{3.234};if([Math]::Abs($code99Total-$code99Expected) -gt .000000001){throw 'Native owned concrete total changed'}
  $code99Prints=@();foreach($code99Sheet in @('Code99 Details','Code99 Coordinates','BBS Print')){
   $code99Out=($code99Name.Replace('.xlsx','')+'-native-'+$code99Sheet.ToLower().Replace(' ','-')+'.pdf');$code99Book.Worksheets.Item($code99Sheet).ExportAsFixedFormat(0,(Join-Path $code99Root $code99Out),0,$true,$false);$code99Prints+=@{sheet=$code99Sheet;file=$code99Out}
  }
  $code99Book.Close($false);$code99Book=$null;if((Get-FileHash -LiteralPath $code99File -Algorithm SHA256).Hash -ne $code99Hash){throw 'Source workbook changed'}
  $code99Results+=@{file=$code99Name;status='PASS';sourceHash=$code99Hash;concrete=$code99Total;readonly=$true;prints=$code99Prints}
 }
 @{status='PASS';version=$code99Excel.Version;build=$code99Excel.Build;readonly=$true;macrosDisabled=$true;linksDisabled=$true;workbooks=$code99Results}|ConvertTo-Json -Depth 7|Set-Content -LiteralPath (Join-Path $code99Root 'native-results.json') -Encoding UTF8
 Write-Output 'PASS native Excel: typed Code99 dimensions,physical vertices,captured quantities and6 print sheets; source hashes unchanged'
}finally{if($code99Book){$code99Book.Close($false)};if($code99Excel){$code99Excel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($code99Excel)}}
