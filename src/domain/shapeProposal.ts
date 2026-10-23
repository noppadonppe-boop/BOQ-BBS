import type {RebarNoteFace,ShapeModel,ShapePart} from './shapeModelSchema';

// AI shape proposal (gateway task "shape"): values may be null when not found in the drawings.
type N=number|null;
export type ProposalPart={label:string;role:'solid'|'void';shape:ShapePart['shape'];z0:N;height:N;stage:number;source:string;x?:N;y?:N;w?:N;d?:N;wall?:N;cx?:N;cy?:N;diameter?:N;inner?:N;points?:[number,number][]};
export type ShapeProposal={version:1;task:'shape';analysisId:string;provider?:string;model?:string;attachmentId:string;fileName:string;confidence:'High'|'Medium'|'Low';
 parts:ProposalPart[];piles:{type:'round'|'square';size:N;length:N;cutoff:number;embed:number;positions:[number,number][]}|null;
 site:{leanThickness:N;leanProjection:N;excavationDepth:N;workingSpace:N;slope:N}|null;
 references:{label:string;source:string}[];rebarNotes:ProposalNote[];missing:{kind?:'shape'|'rebar';part:string;field:string;question:string}[];conflicts:string[];warnings:string[];
 /** gateway v2: sheet inventory, level table and arithmetic checks (absent from older gateways) */
 views?:{name:string;kind:string;note:string}[];levels?:{name:string;elevation:N;z:N;source:string}[];checks?:string[];
 /** concrete cover read from the drawings (mm); null / absent = not given, the standard cover is used */
 cover?:N};
/** AI inventory of one drawing file (gateway task "inventory"): element marks and whether each can be modelled. */
export type InventoryElement={mark:string;kind:'beam'|'footing'|'pilecap'|'column'|'slab'|'wall'|'pit'|'stair'|'other';title:string;quantity:number|null;pages:number[];views:{name:string;page:number|null}[];
 size:string;levels:string;rebar:string[];status:'ready'|'partial'|'insufficient';missing:string[];note:string};
export type ElementInventory={version:1;task:'inventory';provider?:string;model?:string;attachmentId:string;fileName:string;sheet:string;notes:string[];elements:InventoryElement[];warnings:string[]};
/** Cover questions are not asked: a standard cover is applied and can be edited later. */
export const isCoverQuestion=(m:{field:string;question:string})=>/cover/i.test(m.field)||/ระยะหุ้ม|คอนกรีตหุ้ม|cover/i.test(m.question);
/** User reply to one AI question, sent back with the next read of the drawings. */
export type ShapeAnswer={part:string;question:string;answer:string};
export type ProposalNote={text:string;meaning:string;source:string;part?:string;face?:RebarNoteFace|'';dir?:'X'|'Y'|'XY'|'V'|'';level?:string};

const fieldsOf:Record<ShapePart['shape'],string[]>={box:['x','y','w','d'],shaft:['x','y','w','d','wall'],circle:['cx','cy','diameter','inner'],polygon:[]};
const fieldLabel:Record<string,string>={x:'มุม X',y:'มุม Y',w:'กว้าง X',d:'ยาว Y',wall:'ผนังหนา',cx:'ศูนย์กลาง X',cy:'ศูนย์กลาง Y',diameter:'Ø นอก',inner:'Ø ใน',z0:'ระดับล่าง',height:'ความสูง'};
/** Values the AI could not read: one entry per part field left null (to be answered by the user). */
export function proposalGaps(p:ShapeProposal){
 const gaps:{part:number;field:string;label:string}[]=[];
 p.parts.forEach((q,i)=>{for(const f of ['z0','height',...fieldsOf[q.shape]])if((q as any)[f]===null||(q as any)[f]===undefined)gaps.push({part:i,field:f,label:`${q.label}: ${fieldLabel[f]||f}`});if(q.shape==='polygon'&&(q.points?.length||0)<3)gaps.push({part:i,field:'points',label:`${q.label}: จุดยอดแปลน`});});
 if(p.piles&&p.piles.size===null)gaps.push({part:-1,field:'size',label:'เสาเข็ม: ขนาด'});
 if(p.piles&&p.piles.length===null)gaps.push({part:-1,field:'length',label:'เสาเข็ม: ความยาว (m)'});
 return gaps;
}
/** Converts a proposal (gaps answered) to a shape model; unanswered gaps get placeholders and stay listed in the source. */
export function proposalToShape(p:ShapeProposal):ShapeModel{
 const v=(x:N|undefined,d:number)=>x===null||x===undefined||!Number.isFinite(x)?d:x;
 const parts:ShapePart[]=p.parts.map((q,i)=>{
  const gap=proposalGaps({...p,parts:[q],piles:null}).length>0,base={id:`ai${i+1}`,label:q.label.slice(0,80)||`ชิ้นส่วน ${i+1}`,role:q.role,stage:Math.max(1,Math.min(9,q.stage||1)),z0:v(q.z0,0),height:Math.max(1,v(q.height,500)),formSides:true,formBottom:false,source:`${gap?'⚠ มีค่าที่ AI อ่านไม่ได้ · ':''}${q.source}`.slice(0,200)};
  if(q.shape==='circle')return {...base,shape:'circle',cx:v(q.cx,0),cy:v(q.cy,0),diameter:Math.max(1,v(q.diameter,1000)),inner:Math.max(0,v(q.inner,0))};
  if(q.shape==='polygon'&&(q.points?.length||0)>=3)return {...base,shape:'polygon',points:q.points!.slice(0,64)};
  if(q.shape==='shaft')return {...base,shape:'shaft',x:v(q.x,0),y:v(q.y,0),w:Math.max(1,v(q.w,2000)),d:Math.max(1,v(q.d,2000)),wall:Math.max(1,v(q.wall,200))};
  return {...base,shape:'box',x:v(q.x,0),y:v(q.y,0),w:Math.max(1,v(q.w,1000)),d:Math.max(1,v(q.d,1000))};
 });
 const pl=p.piles,st=p.site;
 const partId=(label?:string)=>{const k=(label||'').trim().toLowerCase();return k?parts.find(q=>q.label.trim().toLowerCase()===k)?.id:undefined;};
 const notes=p.rebarNotes.filter(n=>n.text.trim()).slice(0,60).map(n=>{const id=partId(n.part);return {text:n.text.trim().slice(0,120),meaning:n.meaning.slice(0,200),source:n.source.slice(0,200),
  ...(id?{partId:id}:{}),...(n.face?{face:n.face}:{}),...(n.dir?{dir:n.dir}:{})};});
 const questions=p.missing.filter(m=>m.kind==='rebar'&&!isCoverQuestion(m)).slice(0,30).map(m=>`${m.part?`${m.part}: `:''}${m.question}`.slice(0,300));
 return {version:1,confirmed:false,note:`อ่านด้วย AI (${p.fileName}) · ${p.confidence}`.slice(0,1000),...(notes.length?{rebarNotes:notes}:{}),...(questions.length?{rebarQuestions:questions}:{}),
  parts:parts.length?parts:[{id:'ai1',label:'ชิ้นส่วนหลัก',role:'solid',stage:1,z0:0,height:1000,formSides:true,formBottom:false,source:'⚠ AI ไม่พบชิ้นส่วน',shape:'box',x:0,y:0,w:1000,d:1000}],
  ...(pl&&pl.positions.length?{piles:{type:pl.type,size:Math.max(1,v(pl.size,600)),length:Math.max(0,v(pl.length,0)),cutoff:Math.max(0,pl.cutoff),embed:Math.max(0,pl.embed),positions:pl.positions.slice(0,100)}}:{}),
  ...(st?{site:{leanThickness:Math.max(0,v(st.leanThickness,0)),leanProjection:Math.max(0,v(st.leanProjection,0)),excavationDepth:Math.max(0,v(st.excavationDepth,0)),workingSpace:Math.max(0,v(st.workingSpace,300)),slope:Math.max(0,Math.min(5,v(st.slope,0)))}}:{})};
}
