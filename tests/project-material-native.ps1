$ErrorActionPreference='Stop'
$materialRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/project-material-verification'))
$materialPath=Join-Path $materialRoot 'Material-X-Frozen-QA.xlsx'
$materialHash=(Get-FileHash -LiteralPath $materialPath -Algorithm SHA256).Hash
$materialExcel=$null;$materialBook=$null
try{
 $materialExcel=New-Object -ComObject Excel.Application;$materialExcel.Visible=$false;$materialExcel.DisplayAlerts=$false;$materialExcel.AutomationSecurity=3;$materialExcel.EnableEvents=$false
 $materialBook=$materialExcel.Workbooks.Open($materialPath,0,$true);if(-not $materialBook.ReadOnly){throw 'Readonly required'};$materialExcel.CalculateFullRebuild()
 $materialSheet=$materialBook.Worksheets.Item('Project Material X')
 if($materialSheet.Cells.Item(4,1).Value2 -ne 'SD40' -or $materialSheet.Cells.Item(4,2).Value2 -ne 12 -or $materialSheet.Cells.Item(4,3).Value2 -ne 24 -or $materialSheet.Cells.Item(4,4).Value2 -ne 48 -or $materialSheet.Cells.Item(4,5).Value2 -ne 125){throw 'Material limits changed'}
 if($materialSheet.Cells.Item(2,1).Value2 -notmatch 'NOT FOR CONSTRUCTION'){throw 'Publication label changed'}
 $materialSheet.ExportAsFixedFormat(0,(Join-Path $materialRoot 'Material-X-native-print.pdf'),0,$true,$false)
 $materialBook.Close($false);$materialBook=$null;if((Get-FileHash -LiteralPath $materialPath -Algorithm SHA256).Hash -ne $materialHash){throw 'Original workbook changed'}
 @{status='PASS';version=$materialExcel.Version;readonly=$true;linksDisabled=$true;macrosDisabled=$true;eventsDisabled=$true;sheet='Project Material X';sourceHash=$materialHash;sourceUnchanged=$true}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $materialRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS native Excel material values, readonly recalculation, print and unchanged source hash'
}finally{if($materialBook){$materialBook.Close($false)};if($materialExcel){$materialExcel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($materialExcel)}}
