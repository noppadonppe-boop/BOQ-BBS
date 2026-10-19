$ErrorActionPreference='Stop'
$pathRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/planar-path-verification'))
$pathFile=[IO.Path]::GetFullPath((Join-Path $pathRoot 'planar-path-study.xlsx'))
if(-not $pathFile.StartsWith($pathRoot+[IO.Path]::DirectorySeparatorChar)){throw 'QA path escaped workspace'}
$pathHash=(Get-FileHash -LiteralPath $pathFile -Algorithm SHA256).Hash
$pathExcel=$null;$pathBook=$null;$pathPrints=@()
try{
 $pathExcel=New-Object -ComObject Excel.Application
 $pathExcel.Visible=$false;$pathExcel.DisplayAlerts=$false;$pathExcel.AutomationSecurity=3;$pathExcel.EnableEvents=$false
 $pathBook=$pathExcel.Workbooks.Open($pathFile,0,$true)
 if(-not $pathBook.ReadOnly){throw 'Source must stay readonly'}
 $pathExcel.CalculateFullRebuild();$pathInput=$pathBook.Worksheets.Item('Path Input')
 if($pathInput.Range('H4').Value2 -ne 6400 -or $pathInput.Range('H5').Value2 -ne 203 -or $pathInput.Range('I5').Value2 -ne 7 -or $pathInput.Range('I6').Value2 -ne -7){throw 'Entered path values changed'}
 if($null -ne $pathBook.Worksheets.Item('BOQ Coverage').Range('E4').Value2){throw 'Complete unreviewed steel must remain blank'}
 foreach($pathSheetName in @('Path Input','Source BBS Print','Source Shapes Print','BBS Print')){
  $pathSheet=$pathBook.Worksheets.Item($pathSheetName);$pathName='native-'+$pathSheetName.ToLower().Replace(' ','-')+'.pdf'
  $pathSheet.ExportAsFixedFormat(0,(Join-Path $pathRoot $pathName),0,$true,$false)
  $pathPrints+=@{sheet=$pathSheetName;file=$pathName}
 }
 $pathVersion=$pathExcel.Version;$pathBuild=$pathExcel.Build
 $pathBook.Close($false);$pathBook=$null
 if((Get-FileHash -LiteralPath $pathFile -Algorithm SHA256).Hash -ne $pathHash){throw 'Source XLSX changed'}
 @{status='PASS';readonly=$true;macrosDisabled=$true;linksDisabled=$true;sourceHash=$pathHash;version=$pathVersion;build=$pathBuild;prints=$pathPrints}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $pathRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS native Excel typed path inputs, blank complete steel,4 printed tabs and original hash'
}finally{if($pathBook){$pathBook.Close($false)};if($pathExcel){$pathExcel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($pathExcel)}}
