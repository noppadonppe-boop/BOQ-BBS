import {z} from 'zod';
import {layerRoles,type LayerRole} from './drawingPrims';
import {defaultLabelRules,type LabelRules} from './labelQa';

/** CAD standard of the DXF export (General Spec `spec.cadStandard`; absent = the app's S-* set below).
 * Every exported entity is ByLayer: colour / linetype / lineweight come from the layer of its role. */
const layerSchema=z.object({name:z.string().trim().min(1).max(60).regex(/^[^<>/\\":;?*|=,`]+$/,'ชื่อ Layer มีอักขระที่ CAD ไม่รับ'),aci:z.number().int().min(1).max(255),
 linetype:z.enum(['Continuous','HIDDEN2','DASHED','CENTER2']),lineweight:z.number().min(0).max(2.11),plot:z.boolean()}).strict();
export const cadFonts=['tahoma.ttf','THSarabunNew.ttf','arial.ttf','simsun.ttc'] as const;
export const cadStandardSchema=z.object({version:z.literal(1),
 layers:z.object(Object.fromEntries(layerRoles.map(r=>[r,layerSchema])) as Record<LayerRole,typeof layerSchema>).strict(),
 dim:z.object({textHeight:z.number().min(.5).max(10),arrow:z.enum(['tick','closed','dot']),extOffset:z.number().min(0).max(10),extBeyond:z.number().min(0).max(10),precision:z.number().int().min(0).max(3)}).strict(),
 text:z.object({font:z.enum(cadFonts),height:z.number().min(.5).max(10)}).strict(),
 mark:z.object({blockName:z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9_-]+$/),useBlock:z.boolean()}).strict(),
 /** Mark label check of the sheet (absent = defaultLabelRules) */
 labelQa:z.object({enabled:z.boolean(),minGap:z.number().min(0).max(10),maxLeader:z.number().min(10).max(500),lines:z.boolean()}).strict().optional()}).strict()
 .refine(c=>new Set(Object.values(c.layers).map(l=>l.name.toUpperCase())).size===layerRoles.length,'ชื่อ Layer ซ้ำกัน');
export type CadStandard=z.infer<typeof cadStandardSchema>;
export type CadLayer=CadStandard['layers'][LayerRole];

export const layerRoleLabels:Record<LayerRole,string>={concrete:'เส้นขอบคอนกรีต',concreteHidden:'เส้นคอนกรีตที่ซ่อนอยู่ / อ้างอิง',barMain:'เหล็กเสริมหลัก',barLink:'เหล็กปลอก / Link',barRef:'เหล็กอ้างอิง (ชิ้นอื่น)',
 dim:'Dimension',mark:'Leader + ป้าย Mark',text:'ข้อความ / Note',symbol:'ระดับ / แนวตัด / Grid',titleBlock:'Title block / ตาราง',viewport:'กรอบ Viewport'};
const L=(name:string,aci:number,linetype:CadLayer['linetype'],lineweight:number,plot=true):CadLayer=>({name,aci,linetype,lineweight,plot});
export function defaultCadStandard():CadStandard{
 return {version:1,layers:{concrete:L('S-CONC-OTLN',8,'Continuous',.35),concreteHidden:L('S-CONC-HIDN',8,'HIDDEN2',.18),barMain:L('S-REBR-MAIN',5,'Continuous',.5),
  barLink:L('S-REBR-LINK',4,'Continuous',.35),barRef:L('S-REBR-REFR',9,'DASHED',.18),dim:L('S-ANNO-DIMS',3,'Continuous',.18),mark:L('S-ANNO-MARK',2,'Continuous',.25),
  text:L('S-ANNO-TEXT',7,'Continuous',.25),symbol:L('S-ANNO-SYMB',6,'CENTER2',.18),titleBlock:L('S-ANNO-TTLB',7,'Continuous',.35),viewport:L('S-ANNO-VPRT',1,'Continuous',.09,false)},
  dim:{textHeight:2.5,arrow:'tick',extOffset:1.5,extBeyond:1.25,precision:0},text:{font:'tahoma.ttf',height:2.5},mark:{blockName:'BBS-MARK',useBlock:true}};
}
/** The spec's CAD standard, else the default (an invalid stored value also falls back to the default). */
export function cadStandardOf(spec:{cadStandard?:unknown}):CadStandard{const r=cadStandardSchema.safeParse(spec.cadStandard);return r.success?r.data:defaultCadStandard();}
/** Rules of the Mark label check (`labelQa.ts`) from the spec's CAD standard. */
export const labelRulesOf=(spec:{cadStandard?:unknown}):LabelRules=>({...defaultLabelRules,...cadStandardOf(spec).labelQa});
/** Standard DXF lineweights (1/100 mm): a lineweight is written as the nearest one. */
export const dxfLineweights=[0,5,9,13,15,18,20,25,30,35,40,50,53,60,70,80,90,100,106,120,140,158,200,211];
export const lineweightCode=(mm:number)=>dxfLineweights.reduce((b,v)=>Math.abs(v-mm*100)<Math.abs(b-mm*100)?v:b,0);
/** ACI colours shown in the editor (approximate RGB of the standard palette). */
export const aciHex=(aci:number)=>({1:'#ff0000',2:'#ffff00',3:'#00ff00',4:'#00ffff',5:'#0000ff',6:'#ff00ff',7:'#000000',8:'#808080',9:'#c0c0c0'} as Record<number,string>)[aci]||'#888888';
