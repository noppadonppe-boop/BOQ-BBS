import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
const out='output/area-change-verification',file='Area-change-BOQ-QA.xlsx',bytes=await fs.readFile(out+'/'+file),w=new ExcelJS.Workbook();
await w.xlsx.load(bytes);const value=c=>c.value&&typeof c.value==='object'&&'formula'in c.value?(c.value.result??0):c.value;
const boq=w.getWorksheet('BOQ'),summary=w.getWorksheet('BOQ Summary'),print=w.getWorksheet('BOQ Print');
assert.equal(boq.rowCount-4,57);assert.equal(value(boq.getCell('J61')),176);assert.equal(value(summary.getCell('D10')),176);assert.equal(value(print.getCell('D11')),176);assert.equal(value(print.getCell('C11')),172);
assert.match(print.getCell('A3').value,/Zone: "West" \/ Floor: "Roof"/);assert.match(print.getCell('A3').value,/NOT FOR CONSTRUCTION/);
const info={file,sha256:createHash('sha256').update(bytes).digest('hex'),memberCount:57,concrete:176,occurrences:172,scope:{zone:'West',floor:'Roof',group:'Category'},sheets:{}};
for(const s of w.worksheets){const empty=[];s.eachRow(r=>r.eachCell(c=>{if(c.value==='')empty.push(c.address);if(c.type===ExcelJS.ValueType.Error)throw Error(c.address+' '+c.value.error);}));info.sheets[s.name]={range:`A1:${s.getRow(1).worksheet.getColumn(s.columnCount).letter}${s.rowCount}`,emptyTextCells:empty};}
assert.ok([null,''].includes(print.getCell('J11').value));
await fs.writeFile(out+'/xlsx-checks.json',JSON.stringify(info,null,2));const ctx=JSON.parse(await fs.readFile(out+'/context.json','utf8'));
await fs.writeFile(out+'/artifacts.json',JSON.stringify(ctx.artifacts,null,2));console.log('PASS: 57 members, scoped concrete 176, occurrences 172, scope/status and source formulas');
