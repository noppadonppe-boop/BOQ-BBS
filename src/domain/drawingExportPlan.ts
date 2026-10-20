import {fabricationInputReview} from './fabricationInputReview';
import type {Attachment,DrawingLayout,ExportKind,ExportLayout,ExportScope,ExportSize,Member,Project,SnapshotBundle} from './model';
import {normalizeScope,selectBundle} from './exportScope';
import {calculationEngine,supportsBundle} from './version';
import {quantityReport} from './quantityReport';
import {drawingReferences} from './drawingStandard';
import {validateExportFormat,validateScheduleBundle} from './cuttingSchedule';
import {sourceSheets} from './sourceDrawings';
import {publicationLabel} from './publication';

export const exportFormats: {id:string;label:string;kind:ExportKind;layout:ExportLayout}[] = [
  {id:'sheet-a3-v10',label:'แบบ BBS A3 · รูป + ตาราง BBS + ตาราง BOQ',kind:'drawing',layout:'sheet-a3-v10'},
  {id:'schedule-v1',label:'BBS · แปลน รูปตัด และตารางเหล็ก',kind:'drawing',layout:'schedule-v1'},
  {id:'source-v9',label:'BBS + แบบต้นทางพร้อมจุดชี้ Mark',kind:'drawing',layout:'source-v9'},
  {id:'excel',label:'Excel · BOQ และ BBS',kind:'excel',layout:'schedule-v1'},
  {id:'boq',label:'PDF · ตาราง BOQ',kind:'boq',layout:'schedule-v1'},
  {id:'cutting-a4-v1',label:'PDF · ตารางตัด/ดัด A4',kind:'schedule',layout:'cutting-a4-v1'},
  {id:'details-v2',label:'BBS · รูปดัดพร้อมมิติ',kind:'drawing',layout:'details-v2'},
  {id:'fabrication-v3',label:'BBS · ผิวเหล็กและมิติผิวนอก',kind:'drawing',layout:'fabrication-v3'},
  {id:'general-v4',label:'BBS · รูปพิเศษ',kind:'drawing',layout:'general-v4'},
  {id:'tangent-v5',label:'BBS · เส้นสัมผัสและมุม',kind:'drawing',layout:'tangent-v5'},
  {id:'spatial-v6',label:'BBS · Isometric',kind:'drawing',layout:'spatial-v6'},
  {id:'measurements-v7',label:'BBS · มิติอ้างอิงสามมิติ',kind:'drawing',layout:'measurements-v7'},
  {id:'projections-v8',label:'BBS · มุมมองเทียบแบบ',kind:'drawing',layout:'projections-v8'},
];

export function workingExportInput(project:Project,members:Member[],attachments:Attachment[]):SnapshotBundle {
  return structuredClone({schemaVersion:2,project,members,attachments,stock:[],stockLedger:[],cutPlans:[],createdAt:'',status:'Draft',version:project.version,engineVersion:calculationEngine(project.spec)});
}

/** Checks already supported input requirements; actual rendering and source byte checks still run at export. */
export function drawingExportPlan(input:SnapshotBundle,scope:ExportScope,formatId:string,paper:'A3'|'A1') {
  const publication=publicationLabel(input);
  const format=exportFormats.find(f=>f.id===formatId);
  if(!format)throw Error('เลือกรูปแบบไฟล์ที่รองรับ');
  if(!supportsBundle(input))throw Error('รุ่นคำนวณของฉบับนี้ไม่รองรับ ให้ดาวน์โหลดไฟล์เดิมจากประวัติ');
  const bundle=selectBundle(input,normalizeScope(scope));
  if(!bundle.members.length)throw Error('ไม่มีสมาชิกหรือตำแหน่งตรงกับตัวเลือกนี้');
  const size:ExportSize=format.kind==='schedule'?'A4':format.kind==='drawing'?paper:'A3';
  validateExportFormat(format.kind,size,format.layout);
  const report=quantityReport(bundle),quantityReview=fabricationInputReview(bundle);
  if(format.kind==='schedule')validateScheduleBundle(bundle);
  const references=format.kind==='drawing'?drawingReferences(bundle,format.layout as DrawingLayout):[];
  const sources=format.id==='source-v9'?sourceSheets(bundle,size as 'A3'|'A1'):[];
  return {bundle,format,size,report,quantityReview,references,sources,publication};
}
