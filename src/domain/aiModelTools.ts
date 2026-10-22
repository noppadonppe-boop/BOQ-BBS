import {z} from 'zod';
import {blankMember,barSchema,memberSchema,memberFieldsSchema,categories,type Member,type Spec} from './model';
import {shapeModelSchema,shapePartSchema} from './shapeModelSchema';
import {applyShapeModel,shapeProblems} from './shapeApply';
import {prismGeometrySchema} from './prismSchema';
import {applyPrismGeometry} from './prismGeometry';
import {beamAssemblySchema,applyBeamAssembly} from './beamAssembly';
import {elementInputSchema,elementInputUnion,applyElementInput,defaultElementInput,inputCategories} from './elementInput';
import {meshBars,loopBars,verticalFaceBars,sketchBar} from './rebarSketch';
import {takeoff,validateMember,schedule} from './engine';
import {buildView,renderView} from './elementViews';
import {solidQuantities} from './solids';
import {provisionalQuantityBasis} from './quantityBasis';
import {applyPlacementContext,placementContextSchema} from './placementContext';
import {drawSheet,sheetPageCount} from './bbsSheet';

const mm=z.number().finite().min(0).max(200000),coord=z.number().finite().min(-200000).max(200000),positive=mm.positive();
const text=z.string().trim().min(1).max(500),point=z.tuple([coord,coord]);
const steel={diameter:z.number().positive().max(100),grade:z.string().min(1).max(40),spacing:positive,cover:mm,note:text};
type Tool={name:string;description:string;schema:z.ZodType;readOnly?:boolean;run:(member:Member,args:any,spec:Spec)=>{member:Member;output?:unknown}};
const edit=(name:string,description:string,schema:z.ZodType,run:Tool['run']):Tool=>({name,description,schema,run});
const addBars=(m:Member,bars:Member['bars'])=>{
 if(!bars.length)throw Error('คำสั่งไม่สร้างเหล็ก ตรวจระดับ รูปทรง และ cover');
 const all=[...m.bars,...bars].map(b=>barSchema.parse({...b,placementConfirmed:false,bsDimensionsConfirmed:false}));
 if(new Set(all.map(b=>b.id)).size!==all.length||new Set(all.map(b=>b.mark)).size!==all.length)throw Error('รหัสหรือ Mark เหล็กซ้ำ');
 return {member:{...m,bars:all}};
};
const shape=(m:Member,input:unknown)=>{
 const s=shapeModelSchema.parse(input),problems=shapeProblems(s);
 if(problems.blockers.length)throw Error(problems.blockers.join('\n'));
 return {member:applyShapeModel(m,{...s,confirmed:false}),output:{notes:problems.notes}};
};
const tools:Tool[]=[
 edit('member_metadata','Set member code, category, description and explicit cover in mm.',z.object({code:z.string().trim().min(1).max(50),category:z.enum(categories),description:z.string().max(500),cover:mm}).strict(),(m,a)=>({member:{...m,...a}})),
 edit('shape_set','Build 3D concrete from plan parts extruded vertically: boxes, polygons, circles/rings, shafts, voids, pour stages, piles and earthwork. All coordinates mm; pile length m. Supply only resolved dimensions and source evidence.',z.object({model:shapeModelSchema}).strict(),(m,a)=>shape(m,a.model)),
 edit('shape_part_put','Add or replace a concrete/void part by id in the current shape.',z.object({part:shapePartSchema}).strict(),(m,a)=>{if(!m.shapeModel)throw Error('ใช้ shape_set ก่อน');return shape(m,{...m.shapeModel,parts:[...m.shapeModel.parts.filter(p=>p.id!==a.part.id),a.part]});}),
 edit('shape_part_remove','Remove one part from the working draft by id.',z.object({id:z.string().min(1).max(40)}).strict(),(m,a)=>{if(!m.shapeModel||!m.shapeModel.parts.some(p=>p.id===a.id))throw Error('ไม่พบชิ้นส่วน');return shape(m,{...m.shapeModel,parts:m.shapeModel.parts.filter(p=>p.id!==a.id)});}),
 edit('prism_set','Build extruded polygon/hole, inclined, tapered or circular prism using the app prism schema.',z.object({geometry:prismGeometrySchema}).strict(),(m,a)=>({member:applyPrismGeometry(m,a.geometry)})),
 edit('beam_assembly_set','Build a multi-span beam using the app assembly engine.',z.object({assembly:beamAssemblySchema}).strict(),(m,a)=>({member:applyBeamAssembly(m,a.assembly)})),
 edit('element_input_set','Apply the existing Foundation/Beam/Column/Slab/Wall structured form with generated reinforcement. No inferred defaults from unread dimensions.',z.object({input:elementInputUnion,withBars:z.boolean()}).strict(),(m,a,s)=>{const r=applyElementInput(m,elementInputSchema.parse(a.input),{withBars:a.withBars,rounding:s.rounding});return {member:r.member,output:r.warnings};}),
 edit('rebar_mesh','Place X/Y mesh clipped to concrete at explicit z, spacing, cover and signed end leg in mm.',z.object({...steel,z:coord,dirs:z.array(z.enum(['X','Y'])).min(1).max(2),leg:coord}).strict(),(m,a)=>addBars(m,meshBars(m,a))),
 edit('rebar_loops','Place horizontal perimeter hoops between explicit z and zTop with lap mm.',z.object({...steel,z:coord,zTop:coord,lap:mm,mark:z.string().min(1).max(32)}).strict(),(m,a)=>addBars(m,loopBars(m,a))),
 edit('rebar_vertical_faces','Place vertical bars around concrete faces between z0 and z1; explicit spacing and leg mm.',z.object({...steel,z0:coord,z1:coord,leg:coord,mark:z.string().min(1).max(32)}).strict(),(m,a)=>addBars(m,verticalFaceBars(m,a))),
 edit('rebar_sketch','Draw a bar polyline in plan (XY), sx (XZ) or sy (YZ); distribute along the view normal. All coordinates mm.',z.object({mark:z.string().min(1).max(32),view:z.object({kind:z.enum(['plan','sx','sy']),at:coord}).strict(),points:z.array(point).min(2).max(100),diameter:z.number().positive().max(100),grade:z.string().min(1).max(40),layout:z.object({rule:z.enum(['spacing','count','single']),spacing:positive,count:z.number().int().min(1).max(2000),from:mm,to:mm}).strict(),note:text}).strict(),(m,a)=>addBars(m,[sketchBar(a)])),
 edit('rebar_put','Add a fully specified app Bar (straight/L/U/link/polyline/arc/helix, shape code, bending dimensions, distribution and offsets). Replace an existing bar only with the same id.',z.object({bar:barSchema}).strict(),(m,a)=>addBars({...m,bars:m.bars.filter(b=>b.id!==a.bar.id)},[a.bar])),
 edit('rebar_remove','Remove one bar by id from this draft.',z.object({id:z.string().min(1).max(80)}).strict(),(m,a)=>{if(!m.bars.some(b=>b.id===a.id))throw Error('ไม่พบเหล็ก');return {member:{...m,bars:m.bars.filter(b=>b.id!==a.id)}};}),
 edit('drawing_setup','Set drawing number/revision/title and plan/section view configuration.',z.object({drawingSetup:memberFieldsSchema.shape.drawingSetup,drawingViews:memberFieldsSchema.shape.drawingViews}).strict(),(m,a)=>({member:{...m,...a}})),
 edit('placement_context_set','Define adjacent concrete reference regions/openings for reinforcement continuity without adding their concrete to this member.',z.object({context:placementContextSchema}).strict(),(m,a)=>({member:applyPlacementContext(m,a.context)})),
 edit('schedule_setup','Set BBS schedule configuration and bending schedule options.',z.object({setup:memberFieldsSchema.shape.scheduleSetup.unwrap()}).strict(),(m,a)=>({member:{...m,scheduleSetup:a.setup}})),
 edit('member_occurrences','Set explicitly known locations and quantities. Do not infer quantity from the number of detail views.',z.object({occurrences:memberFieldsSchema.shape.occurrences}).strict(),(m,a)=>({member:{...m,occurrences:a.occurrences}})),
 {name:'element_input_template',description:'Return an editable template for a structured element. Template values are examples, not evidence from a drawing.',schema:z.object({category:z.enum(inputCategories)}).strict(),readOnly:true,run:(m,a,s)=>({member:m,output:defaultElementInput(a.category,'drawing',s)})},
 {name:'drawing_sheet',description:'Generate A3 plan/sections + BBS + BOQ + title block primitives in mm. Page is zero-based. Uses the application sheet layout.',schema:z.object({projectCode:z.string().max(80),projectName:z.string().max(200),page:z.number().int().min(0).max(300)}).strict(),readOnly:true,run:(m,a,s)=>{const q=takeoff(m,s),data={member:m,rows:q.rows,input:m.elementInput,project:{id:'mcp',code:a.projectCode,name:a.projectName,location:'',owner:'',notes:'',acl:{},version:0,createdAt:'',spec:s,titleBlock:{company:'',drawnBy:'',checkedBy:'',drawingPrefix:''}},quantity:m.occurrences.reduce((n,o)=>n+o.quantity,0),takeoff:q,status:'DRAFT',revision:'',date:'',provisional:true};const pages=sheetPageCount(data);if(a.page>=pages)throw Error('หน้าเกินจำนวนแผ่น');return {member:m,output:{pages,width:420,height:297,primitives:drawSheet(data,a.page)}};}},
 {name:'model_inspect',description:'Return current member, dimension checks, concrete/formed surfaces, takeoff and BBS calculated by the application.',schema:z.object({}).strict(),readOnly:true,run:(m,_a,s)=>({member:m,output:{member:m,errors:validateMember(m,s),geometry:solidQuantities(m),takeoff:takeoff(m,s),schedule:schedule(m,s)}})},
 {name:'drawing_view',description:'Generate renderer-independent plan/section drawing primitives with reinforcement for preview. axes [0,1]=plan, [0,2]=XZ, [1,2]=YZ.',schema:z.object({axes:z.tuple([z.number().int().min(0).max(2),z.number().int().min(0).max(2)]),normal:z.number().int().min(0).max(2),cut:coord}).strict(),readOnly:true,run:(m,a,s)=>{if(new Set([...a.axes,a.normal]).size!==3)throw Error('แกนรูปตัดต้องต่างกัน');const rows=schedule(m,s);return {member:m,output:renderView(buildView(m,rows,m.elementInput,a),{x:0,y:0,w:800,h:600},{colors:new Map()})};}},
];

export const aiToolCatalog=()=>tools.map(t=>({name:t.name,description:t.description,inputSchema:z.toJSONSchema(t.schema,{io:'input',unrepresentable:'any'}),annotations:{readOnlyHint:!!t.readOnly,destructiveHint:false,openWorldHint:false}}));
export function executeModelTool(member:Member,spec:Spec,name:string,args:unknown){
 const t=tools.find(t=>t.name===name);if(!t)throw Error(`ไม่รู้จักคำสั่ง ${name}`);
 const result=t.run(structuredClone(member),t.schema.parse(args),spec);
 const next=memberSchema.parse({...result.member,status:'Draft',bars:result.member.bars.map(b=>({...b,placementConfirmed:false,bsDimensionsConfirmed:false}))});
 return {...result,member:next};
}
export const aiCommandSchema=z.object({name:z.string().min(1).max(80),arguments:z.record(z.string(),z.unknown())}).strict();
export type AiModelCommand=z.infer<typeof aiCommandSchema>;
export function buildAiDraft(code:string,commands:AiModelCommand[],spec:Spec){
 if(!commands.length||commands.length>80)throw Error('ต้องมีคำสั่ง 1–80 รายการ');
 let member:Member={...blankMember('Custom',code),quantityBasis:provisionalQuantityBasis()};
 member.occurrences=member.occurrences.map(o=>({...o,zone:'',floor:''}));
 const log:{name:string;output?:unknown}[]=[];
 let geometryReady=false;
 for(const c of commands){const parsed=aiCommandSchema.parse(c);if(parsed.name.startsWith('rebar_')&&!geometryReady)throw Error('ต้องสร้างรูปทรงก่อนวางเหล็ก');const r=executeModelTool(member,spec,parsed.name,parsed.arguments);member=r.member;log.push({name:c.name,output:r.output});if(['shape_set','prism_set','beam_assembly_set','element_input_set'].includes(c.name))geometryReady=true;}
 if(!commands.some(c=>['shape_set','prism_set','beam_assembly_set','element_input_set'].includes(c.name)))throw Error('ยังไม่มีคำสั่งสร้างรูปทรง');
 member.code=code;
 const errors=validateMember(member,spec);if(errors.length)throw Error(errors.join('\n'));
 return {member,log};
}
