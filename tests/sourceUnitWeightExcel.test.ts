import {expect,it} from 'vitest';
import ExcelJS from 'exceljs';
import {blankMember,blankBar,currentStarterSpec,type SnapshotBundle} from '../src/domain/model';
import {takeoff} from '../src/domain/engine';
import {appendSourceUnitWeightSheet} from '../src/data/sourceUnitWeightExcel';

function fixture(){
 const member=blankMember('Custom','UNIT-QA');member.id='M';member.occurrences[0].quantity=5;
 member.bars=[{...blankBar('R'),id:'BAR',count:2,points:[[100,100,100],[900,100,100]]}];
 const bar=takeoff(member,currentStarterSpec).rows[0],sha='a'.repeat(64);
 member.sourceSchedule={version:1,attachmentId:'A',sha256:sha,page:1,basis:'allOccurrences',note:'Synthetic source-unit-weight export test',rows:[{id:'ROW',mark:'R',diameter:bar.diameter,grade:bar.grade,count:10,cutLength:bar.cutLength,barId:bar.id,note:'',unitWeight:.71,weight:7.1}]};
 const bundle={project:{code:'UNIT-QA'},members:[member],attachments:[{id:'A',name:'QA.pdf',sha256:sha,pageCount:1,contentType:'application/pdf'}]} as unknown as SnapshotBundle;
 const items=[{member,bar,sourceRow:5,quantity:5}],wb=new ExcelJS.Workbook();wb.addWorksheet('BBS');
 return {member,bar,bundle,items,wb};
}
it('Links computed per-piece weight to cut length and unit mass without count or occurrence multipliers',()=>{
 const {wb,bundle,items,bar}=fixture();appendSourceUnitWeightSheet(wb,bundle,items);const s=wb.getWorksheet('Source Unit Weight')!;
 expect(s.getCell('D5').value).toBe(.71);expect(s.getCell('E5').value).toEqual({formula:"'BBS'!I5*'BBS'!J5/1000",result:bar.eachWeight});
 expect(s.getCell('F5').value).toEqual({formula:'E5-D5',result:bar.eachWeight!-.71});expect(s.getCell('G5').value).toBe(10);
 expect(s.getCell('H5').value).toEqual({formula:'D5*G5',result:.71*10});expect((s.getCell('J5').value as ExcelJS.CellFormulaValue).formula).toBe('I5-H5');expect(s.getCell('J5').model.result).toBe(0);
 expect(s.pageSetup.printArea).toBe('A1:L5');expect(s.pageSetup.printTitlesRow).toBe('1:3');
});
it('Keeps printed zero numeric and missing inputs/output formulas truly blank',()=>{
 const {wb,bundle,member}=fixture();member.sourceSchedule!.rows[0].unitWeight=0;delete member.sourceSchedule!.rows[0].barId;
 member.sourceSchedule!.rows.push({...member.sourceSchedule!.rows[0],id:'MISSING',mark:'NO-WEIGHT',unitWeight:undefined,weight:undefined});
 appendSourceUnitWeightSheet(wb,bundle,[]);const s=wb.getWorksheet('Source Unit Weight')!;
 expect(s.getCell('D5').value).toBe(0);expect((s.getCell('H5').value as ExcelJS.CellFormulaValue).formula).toBe('D5*G5');expect(s.getCell('H5').model.result).toBe(0);expect(s.getCell('E5').value).toBeNull();expect(s.getCell('F5').value).toBeNull();
 for(const col of ['D','E','F','H','I','J'])expect(s.getCell(col+'6').value).toBeNull();
});
it('Does not add a supplemental worksheet to legacy source tables without kg/p',()=>{
 const {wb,bundle,items,member}=fixture();delete member.sourceSchedule!.rows[0].unitWeight;appendSourceUnitWeightSheet(wb,bundle,items);expect(wb.worksheets.map(s=>s.name)).toEqual(['BBS']);
});
