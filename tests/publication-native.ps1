$ErrorActionPreference='Stop'
$publicationRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'output/publication-verification'));$publicationExcel=$null;$publicationBook=$null;$publicationResults=@()
try{
 $publicationExcel=New-Object -ComObject Excel.Application;$publicationExcel.Visible=$false;$publicationExcel.DisplayAlerts=$false;$publicationExcel.AutomationSecurity=3;$publicationExcel.EnableEvents=$false
 foreach($publicationName in @('Frozen-publication-QA.xlsx','Draft-register-QA.xlsx')){
  $publicationFile=Join-Path $publicationRoot $publicationName;$publicationHash=(Get-FileHash -LiteralPath $publicationFile -Algorithm SHA256).Hash;$publicationBook=$publicationExcel.Workbooks.Open($publicationFile,0,$true);if(-not $publicationBook.ReadOnly){throw 'Readonly required'};$publicationExcel.CalculateFullRebuild()
  if($publicationName -eq 'Frozen-publication-QA.xlsx'){if($publicationBook.Worksheets.Item('BOQ').Cells.Item(4,10).Value2 -ne 1){throw 'Concrete changed'};$publicationSheets=@('BOQ Print','BBS Print')}else{if($publicationBook.Worksheets.Item('Package Basis').Cells.Item(2,2).Value2 -ne 'DRAFT / NOT FOR CONSTRUCTION'){throw 'Packet status changed'};$publicationSheets=@('Document Register','Package Basis')}
  $publicationPrints=@();foreach($publicationSheet in $publicationSheets){$publicationOut=$publicationName.Replace('.xlsx','')+'-native-'+$publicationSheet.ToLower().Replace(' ','-')+'.pdf';$publicationBook.Worksheets.Item($publicationSheet).ExportAsFixedFormat(0,(Join-Path $publicationRoot $publicationOut),0,$true,$false);$publicationPrints+=@{sheet=$publicationSheet;file=$publicationOut}}
  $publicationBook.Close($false);$publicationBook=$null;if((Get-FileHash -LiteralPath $publicationFile -Algorithm SHA256).Hash -ne $publicationHash){throw 'Source changed'};$publicationResults+=@{file=$publicationName;sourceHash=$publicationHash;prints=$publicationPrints}
 }
 @{status='PASS';readonly=$true;version=$publicationExcel.Version;macrosDisabled=$true;linksDisabled=$true;workbooks=$publicationResults}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $publicationRoot 'native-results.json') -Encoding UTF8
 Write-Output 'PASS native Excel status, concrete, four print sheets and unchanged hashes'
}finally{if($publicationBook){$publicationBook.Close($false)};if($publicationExcel){$publicationExcel.Quit();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($publicationExcel)}}
