$ErrorActionPreference='Stop'
$tableRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/source-table-intake-isolated-verification'))
$tablePath=[IO.Path]::GetFullPath((Join-Path $tableRoot 'GULF-source-table.xlsx'))
if(-not $tablePath.StartsWith($tableRoot+[IO.Path]::DirectorySeparatorChar)){throw 'QA path escaped workspace'}
$tableHash=(Get-FileHash -LiteralPath $tablePath -Algorithm SHA256).Hash
$tableExcel=$null;$tableBook=$null;$tablePrints=@()
try{
 $tableExcel=New-Object -ComObject Excel.Application
 $tableExcel.Visible=$false;$tableExcel.DisplayAlerts=$false;$tableExcel.AutomationSecurity=3;$tableExcel.EnableEvents=$false
 $tableBook=$tableExcel.Workbooks.Open($tablePath,0,$true)
 if(-not $tableBook.ReadOnly){throw 'Original must stay readonly'}
 $tableExcel.CalculateFullRebuild();$tableCheck=$tableBook.Worksheets.Item('Source BBS Check')
 if($tableCheck.Range('B4').Value2 -ne '4' -or $tableCheck.Range('I4').Value2 -ne 148 -or $tableCheck.Range('K4').Value2 -ne 790 -or $tableCheck.Range('P4').Value2 -ne 'Unmapped'){throw 'Source inputs/status changed'}
 if($null -ne $tableBook.Worksheets.Item('BOQ Coverage').Range('E4').Value2){throw 'Unentered complete steel must remain blank'}
 foreach($tableSheetName in @('Source BBS Print','Source Shapes Print','BOQ Print')){
  $tableSheet=$tableBook.Worksheets.Item($tableSheetName);$tableName='native-'+$tableSheetName.ToLower().Replace(' ','-')+'.pdf'
  $tableSheet.ExportAsFixedFormat(0,(Join-Path $tableRoot $tableName),0,$true,$false)
  $tablePrints+=@{sheet=$tableSheetName;file=$tableName}
 }
 $tableVersion=$tableExcel.Version;$tableBuild=$tableExcel.Build
 $tableBook.Close($false);$tableBook=$null
 if((Get-FileHash -LiteralPath $tablePath -Algorithm SHA256).Hash -ne $tableHash){throw 'Source XLSX changed'}
 @{status='PASS';readonly=$true;macrosDisabled=$true;linksDisabled=$true;sourceHash=$tableHash;version=$tableVersion;build=$tableBuild;prints=$tablePrints}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $tableRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS native Excel source cells, blank complete steel,3 printed tabs and original hash'
}finally{if($tableBook){$tableBook.Close($false)};if($tableExcel){$tableExcel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($tableExcel)}}
