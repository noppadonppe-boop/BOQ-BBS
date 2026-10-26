import {z} from 'zod';
import type {Member,Project,SnapshotBundle,DrawingLayout} from './model';
const text=(n:number)=>z.string().trim().max(n);
// BBS sheet paper (landscape, mm) and view scale: 'auto' = largest standard 1:N that fits, a number = fixed 1:N
export const sheetSizes={A3:{w:420,h:297},A2:{w:594,h:420}} as const;
export type SheetSize=keyof typeof sheetSizes;
export const sheetSizeSchema=z.enum(['A3','A2']);
export const viewScaleSchema=z.union([z.literal('auto'),z.number().int().min(1).max(1000)]);
export type ViewScale=z.infer<typeof viewScaleSchema>;
// plan drawing style: one representative bar per Mark + distribution line, or every bar; split = separate bottom / top
// plans; gutter = Mark labels in a column beside each view (leader lines)
export const barDisplaySchema=z.enum(['representative','all']);
export type BarDisplay=z.infer<typeof barDisplaySchema>;
const sheetStyle={sheetSize:sheetSizeSchema.optional(),viewScale:viewScaleSchema.optional(),barDisplay:barDisplaySchema.optional(),planSplit:z.boolean().optional(),markGutter:z.boolean().optional()};
export const standardScales=[1,2,5,10,15,20,25,30,40,50,75,100,125,150,200,250,300,400,500,750,1000];
export const viewScaleChoices=[20,25,50,75,100];
// run / rev = automatic drawing number parts (…segments-Run 001–999-R0–9); number is kept composed for keys and registers
// sheetSize / viewScale = this member's override of the project default (titleBlock.sheetSize / viewScale)
export const drawingSetupSchema=z.object({number:text(80),revision:text(16),title:text(120),numberKey:text(200).optional(),run:z.number().int().min(1).max(999).optional(),rev:z.number().int().min(0).max(9).optional(),...sheetStyle});
export type DrawingSetup=z.infer<typeof drawingSetupSchema>;
export const drawingProfileSchema=z.object({template:z.literal('owner-v1'),language:z.enum(['th','en']),projectName:text(80).min(1),company:text(80),owner:text(80),location:text(80),contract:text(50),discipline:text(50),preparedBy:text(60),checkedBy:text(60),indexNumber:text(80),indexRevision:text(16)});
export type DrawingProfile=z.infer<typeof drawingProfileSchema>;
export const titleBlockSchema=z.object({company:z.string().max(300),drawnBy:z.string().max(200),checkedBy:z.string().max(200),approvedBy:z.string().max(200).optional(),drawingPrefix:z.string().max(80),drawingSuffix:z.string().max(80).optional(),drawingParts:z.array(z.string().max(50)).max(8).optional(),sheetLanguage:z.enum(['th','en','zh']).optional(),...sheetStyle});
export const sheetStyleSchema=z.object(sheetStyle);
export type SheetStyle=z.infer<typeof sheetStyleSchema>;
export type SheetSetup={size:SheetSize;scale:ViewScale;bars:BarDisplay;split:boolean;gutter:boolean};
/** BBS sheet setup of a member: member override, else project default, else A3 / auto / representative / one plan / gutter. */
export function sheetSetupOf(p:{titleBlock?:SheetStyle},m?:{drawingSetup?:SheetStyle}):SheetSetup{
 const o=m?.drawingSetup,d=p.titleBlock;
 return {size:o?.sheetSize||d?.sheetSize||'A3',scale:o?.viewScale??d?.viewScale??'auto',bars:o?.barDisplay||d?.barDisplay||'representative',split:o?.planSplit??d?.planSplit??false,gutter:o?.markGutter??d?.markGutter??true};
}
/** Member drawingSetup fields that override the project sheet style. */
export const sheetStyleKeys=['sheetSize','viewScale','barDisplay','planSplit','markGutter'] as const;
export const viewScaleLabel=(v:ViewScale)=>v==='auto'?'Auto':`1:${v}`;
export const drawingNumberKey=(s:string)=>s.normalize('NFC').trim().toLowerCase();
export const MAX_DRAWING_PARTS=8;
export const drawingRunText=(run:number)=>String(run).padStart(3,'0');
export const drawingRevText=(rev:number)=>'R'+rev;
/** Text segments before the run (user can add / remove / reorder), default Prefix-Suffix-BBS; older projects
 * without `drawingParts` use drawingPrefix (or the project code) + drawingSuffix + BBS. */
export function drawingParts(p:Pick<Project,'code'|'titleBlock'>){return p.titleBlock.drawingParts??[p.titleBlock.drawingPrefix||p.code,p.titleBlock.drawingSuffix||'','BBS'];}
/** Segment1-Segment2-…-Run(001–999)-R(0–9); empty segments are left out, no segment at all falls back to the project code. */
export function composeDrawingNumber(p:Pick<Project,'code'|'titleBlock'>,run:number|undefined,rev=0){const parts=drawingParts(p).map(s=>s.trim()).filter(Boolean);return [...(parts.length?parts:[p.code]),run?drawingRunText(run):'XXX',drawingRevText(rev)].join('-');}
export function drawingReferences(b:SnapshotBundle,layout:DrawingLayout){
 if(!b.project.drawingProfile)return [];
 const refs=b.members.map(m=>({memberId:m.id,memberCode:m.code,number:m.drawingSetup?.number||'',revision:m.drawingSetup?.revision||'',title:m.drawingSetup?.title||''}));
 if(layout==='source-v9')refs.push({memberId:'',memberCode:'Source index',number:b.project.drawingProfile.indexNumber,revision:b.project.drawingProfile.indexRevision,title:'Source Mark index'});
 for(const r of refs)if(!r.number||!r.revision||!r.title)throw Error(`${r.memberCode}: ระบุเลขแบบ BBS, Revision และชื่อแบบให้ครบ`);
 const used=new Set<string>();for(const r of refs){const key=drawingNumberKey(r.number);if(used.has(key))throw Error(`เลขแบบ BBS ซ้ำ: ${r.number}`);used.add(key);}return refs;
}
export function validateDrawingNumbers(members:Member[]){const used=new Map<string,string>();for(const m of members){if(!m.drawingSetup?.number)continue;const key=drawingNumberKey(m.drawingSetup.number);if(used.has(key))throw Error(`เลขแบบ BBS ซ้ำ: ${used.get(key)} / ${m.code}`);used.set(key,m.code);}}
export function drawingProfileDraft(p:Project):DrawingProfile{return {template:'owner-v1',language:'th',projectName:p.name,company:p.titleBlock.company,owner:p.owner,location:p.location,contract:'',discipline:'Civil / Reinforcement',preparedBy:p.titleBlock.drawnBy,checkedBy:p.titleBlock.checkedBy,indexNumber:'',indexRevision:''};}
export type DrawingReference=ReturnType<typeof drawingReferences>[number];

export function drawingLabels(language:'th'|'en'){return language==='en'?{owner:'Owner',site:'Site',contract:'Contract',discipline:'Discipline',title:'Drawing title',number:'Drawing No.',rev:'Drawing Rev.',by:'Prepared',check:'Checked name',sheet:'Sheet',qty:'Member qty'}:{owner:'เจ้าของ',site:'ที่ตั้ง',contract:'สัญญา',discipline:'งาน',title:'ชื่อแบบ',number:'เลขแบบ',rev:'Revision แบบ',by:'เขียนแบบ',check:'ชื่อผู้ตรวจ',sheet:'แผ่น',qty:'จำนวนสมาชิก'};}
