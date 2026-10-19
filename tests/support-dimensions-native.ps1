$ErrorActionPreference='Stop'
$supportRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/support-dimensions-verification'))
$supportFile=[IO.Path]::GetFullPath((Join-Path $supportRoot 'C1-Mark4-dimension-review.xlsx'))
if(-not $supportFile.StartsWith($supportRoot+[IO.Path]::DirectorySeparatorChar)){throw 'QA path escaped workspace'}
$supportHash=(Get-FileHash -LiteralPath $supportFile -Algorithm SHA256).Hash
$supportExcel=$null;$supportBook=$null;$supportPrints=@()
try{
 $supportExcel=New-Object -ComObject Excel.Application
 $supportExcel.Visible=$false;$supportExcel.DisplayAlerts=$false;$supportExcel.AutomationSecurity=3;$supportExcel.EnableEvents=$false
 $supportBook=$supportExcel.Workbooks.Open($supportFile,0,$true)
 if(-not $supportBook.ReadOnly){throw 'Source must remain readonly'}
 $supportExcel.CalculateFullRebuild()
 $supportInputs=$supportBook.Worksheets.Item('Path Input')
 if($supportInputs.Range('C4').Value2 -ne 'XY / support' -or $supportInputs.Range('H4').Value2 -ne 111 -or $supportInputs.Range('H5').Value2 -ne 600){throw 'Entered basis/dimensions changed'}
 $supportBBS=$supportBook.Worksheets.Item('BBS')
 if($supportBBS.Range('I4').Value2 -ne 800 -or $supportBBS.Range('K4').Value2 -ne 1){throw 'Captured cut/count changed'}
 $supportWeight=.8*[Math]::PI*144/4*7850/1000000
 if([Math]::Abs($supportBBS.Range('M4').Value2-$supportWeight) -gt .00000001){throw 'Native partial weight formula differs'}
 if($null -ne $supportBook.Worksheets.Item('BOQ Coverage').Range('E4').Value2){throw 'Incomplete steel must remain blank'}
 foreach($supportName in @('Path Input','Source BBS Print','Source Shapes Print','BBS Print')){
  $supportSheet=$supportBook.Worksheets.Item($supportName);$supportPrint='native-'+$supportName.ToLower().Replace(' ','-')+'.pdf'
  $supportSheet.ExportAsFixedFormat(0,(Join-Path $supportRoot $supportPrint),0,$true,$false)
  $supportPrints+=@{sheet=$supportName;file=$supportPrint}
 }
 $supportVersion=$supportExcel.Version;$supportBuild=$supportExcel.Build;$supportBook.Close($false);$supportBook=$null
 if((Get-FileHash -LiteralPath $supportFile -Algorithm SHA256).Hash -ne $supportHash){throw 'Original workbook changed'}
 @{status='PASS';readonly=$true;macrosDisabled=$true;linksDisabled=$true;version=$supportVersion;build=$supportBuild;sourceHash=$supportHash;partialWeight=$supportWeight;prints=$supportPrints}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $supportRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS native Excel: support inputs,800mm cut,one-bar partial weight,blank complete steel and4 print sheets'
}finally{if($supportBook){$supportBook.Close($false)};if($supportExcel){$supportExcel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($supportExcel)}}
