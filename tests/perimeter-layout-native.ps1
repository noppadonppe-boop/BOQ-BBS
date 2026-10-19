$ErrorActionPreference='Stop'
$c1Root=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/perimeter-layout-verification'))
$c1File=[IO.Path]::GetFullPath((Join-Path $c1Root 'C1-main-bar-draft.xlsx'))
if(-not $c1File.StartsWith($c1Root+[IO.Path]::DirectorySeparatorChar)){throw 'QA path escaped workspace'}
$c1Hash=(Get-FileHash -LiteralPath $c1File -Algorithm SHA256).Hash;$c1Excel=$null;$c1Book=$null;$c1Prints=@()
try{
 $c1Excel=New-Object -ComObject Excel.Application;$c1Excel.Visible=$false;$c1Excel.DisplayAlerts=$false;$c1Excel.AutomationSecurity=3;$c1Excel.EnableEvents=$false
 $c1Book=$c1Excel.Workbooks.Open($c1File,0,$true);if(-not $c1Book.ReadOnly){throw 'Source must remain readonly'}
 $c1Excel.CalculateFullRebuild()
 if($c1Book.Worksheets.Item('Path Frame').Range('E4').Value2 -ne -45){throw 'Template rotation changed'}
 if($c1Book.Worksheets.Item('Path Input').Range('H4').Value2 -ne 6400 -or $c1Book.Worksheets.Item('Path Input').Range('H5').Value2 -ne 203){throw 'Source input dimensions changed'}
 if($null -ne $c1Book.Worksheets.Item('BOQ Coverage').Range('E4').Value2){throw 'Pending complete steel must remain blank'}
 foreach($c1Name in @('Path Frame','Path Input','Source BBS Print','Source Shapes Print','BBS Print','BOQ Print')){$s=$c1Book.Worksheets.Item($c1Name);$file='native-'+$c1Name.ToLower().Replace(' ','-')+'.pdf';$s.ExportAsFixedFormat(0,(Join-Path $c1Root $file),0,$true,$false);$c1Prints+=@{sheet=$c1Name;file=$file}}
 $version=$c1Excel.Version;$build=$c1Excel.Build;$c1Book.Close($false);$c1Book=$null
 if((Get-FileHash -LiteralPath $c1File -Algorithm SHA256).Hash -ne $c1Hash){throw 'Original workbook changed'}
 @{status='PASS';readonly=$true;macrosDisabled=$true;linksDisabled=$true;version=$version;build=$build;sourceHash=$c1Hash;prints=$c1Prints}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $c1Root 'native-results.json') -Encoding UTF8
 Write-Output 'PASS native Excel C1 inputs, rotation, pending complete steel,6 printed tabs and original hash'
}finally{if($c1Book){$c1Book.Close($false)};if($c1Excel){$c1Excel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($c1Excel)}}
