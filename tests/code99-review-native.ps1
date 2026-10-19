$ErrorActionPreference='Stop'
$reviewRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/code99-review-verification'))
$reviewFile=Join-Path $reviewRoot 'Code99-user-review-QA.xlsx'
$reviewHash=(Get-FileHash -LiteralPath $reviewFile -Algorithm SHA256).Hash
$reviewExcel=$null;$reviewBook=$null
try{
 $reviewExcel=New-Object -ComObject Excel.Application;$reviewExcel.Visible=$false;$reviewExcel.DisplayAlerts=$false;$reviewExcel.AutomationSecurity=3;$reviewExcel.EnableEvents=$false
 $reviewBook=$reviewExcel.Workbooks.Open($reviewFile,0,$true);if(-not $reviewBook.ReadOnly){throw 'Readonly workbook required'}
 $reviewExcel.CalculateFullRebuild()
 $reviewBBS=$reviewBook.Worksheets.Item('BBS');$reviewContext=Get-Content -LiteralPath (Join-Path $reviewRoot 'context.json') -Raw | ConvertFrom-Json
 foreach($reviewMember in $reviewContext.frozen.members){
  $reviewFound=$false
  for($reviewRow=4;$reviewRow -le $reviewBBS.UsedRange.Rows.Count;$reviewRow++){
   if($reviewBBS.Cells.Item($reviewRow,1).Value2 -eq $reviewMember.code){
    $reviewCut=$reviewContext.frozen.calculations.($reviewMember.id).bars[0].cutLength
    if($reviewBBS.Cells.Item($reviewRow,9).Value2 -ne $reviewCut -or $reviewBBS.Cells.Item($reviewRow,11).Value2 -ne 1){throw 'Frozen cut/count changed'}
    if([Math]::Abs($reviewBBS.Cells.Item($reviewRow,13).Value2-$reviewContext.frozen.calculations.($reviewMember.id).bars[0].weight) -gt .000000001){throw 'Frozen weight changed'}
    $reviewFound=$true
   }
  }
  if(-not $reviewFound){throw 'Frozen member omitted'}
 }
 $reviewSheet=$reviewBook.Worksheets.Item('Code99 Review');$reviewModes=@();for($reviewRow=4;$reviewRow -le $reviewSheet.UsedRange.Rows.Count;$reviewRow++){if($reviewSheet.Cells.Item($reviewRow,1).Value2 -eq 'Mode / purpose'){$reviewModes+= $reviewSheet.Cells.Item($reviewRow,2).Value2}}
 if($reviewModes.Count -ne 2 -or $reviewModes -notcontains 'computed / bar' -or $reviewModes -notcontains 'external / bar'){throw 'Captured review records omitted'}
 $reviewPrints=@();foreach($reviewName in @('Code99 Review','Code99 Details','Code99 Coordinates','BBS Print')){
  $reviewOut='native-'+$reviewName.ToLower().Replace(' ','-')+'.pdf'
  $reviewBook.Worksheets.Item($reviewName).ExportAsFixedFormat(0,(Join-Path $reviewRoot $reviewOut),0,$true,$false)
  $reviewPrints+=@{sheet=$reviewName;file=$reviewOut}
 }
 $reviewBook.Close($false);$reviewBook=$null;if((Get-FileHash -LiteralPath $reviewFile -Algorithm SHA256).Hash -ne $reviewHash){throw 'Source workbook changed'}
 @{status='PASS';version=$reviewExcel.Version;readonly=$true;macrosDisabled=$true;linksDisabled=$true;sourceHash=$reviewHash;capturedRecords=$reviewModes.Count;prints=$reviewPrints}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $reviewRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS native readonly Excel recalculation: both captured reviews, unchanged cuts/counts/weights and four printed sheets'
}finally{if($reviewBook){$reviewBook.Close($false)};if($reviewExcel){$reviewExcel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($reviewExcel)}}
