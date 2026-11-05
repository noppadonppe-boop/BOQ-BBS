import {z} from 'zod';

/** Drawing Edit mode (Tekla-style, phase 1): the user layer drawn over the automatic BBS sheet views.
 * Stored per sheet view (ViewKey plan | plan-bottom | plan-top | sec:<id>) in `member.drawingEdits`:
 * - `over`: changes to automatic annotations by their stable key (`renderView` tags each one: `mark:<bar id>`,
 *   `dim:<dir><side><n>`, `cover:<n>`, `ex:<id>`, `level:<n>`): hide, move (paper mm), text (dims: '<>' = measured value).
 * - `objs`: user text / leaders anchored at view model coordinates (u, v mm along the view axes), so they stay on the
 *   same spot of the member when the view is moved or rescaled; leader text offset in paper mm (like Tekla).
 * zod only, no runtime imports (model.ts imports it). */
export const annotationKeySchema=z.string().regex(/^(mark|dim|cover|ex|level):[A-Za-z0-9_.:\/+-]{1,120}$/,'รหัส annotation ไม่ถูกต้อง');
const paper=z.number().finite().min(-500).max(500);
const model=z.number().finite().min(-1e6).max(1e6);
const lines=z.array(z.string().max(200)).min(1).max(10);
export const annotationOverrideSchema=z.object({hidden:z.literal(true).optional(),
 /** leader / level: move of the text (paper mm, y down) */ dx:paper.optional(),dy:paper.optional(),
 /** dimension: move of the dimension line (paper mm, +x right / +y down) */ off:paper.optional(),
 /** text as drawn: dims '<>' = measured value; Mark leaders: lines */ text:z.string().max(200).optional()}).strict();
export type AnnotationOverride=z.infer<typeof annotationOverrideSchema>;
const userId=z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
export const userTextSchema=z.object({id:userId,kind:z.literal('text'),at:z.tuple([model,model]),lines,size:z.number().min(1.5).max(10).optional(),
 anchor:z.enum(['start','middle','end']).optional(),bold:z.boolean().optional()}).strict();
const barRef=z.string().regex(/^[A-Za-z0-9_.:\/+-]{1,120}$/);
export const userLeaderSchema=z.object({id:userId,kind:z.literal('leader'),
 /** arrow point (view model mm) */ at:z.tuple([model,model]),
 /** elbow = arrow + (dx, dy) paper mm; the text follows a 3 mm shoulder on the side of dx */ dx:paper,dy:paper,lines,
 size:z.number().min(1.5).max(10).optional(),arrow:z.enum(['dot','closed','none']),
 /** phase 2: bar (Mark row id) the arrow points at; `fromMark` = text from that bar (Mark n-DB@s as the automatic labels),
  * `lines` are then the fallback; a bar no longer in the view = anchor lost (drawn red, `lines`) */
 bar:barRef.optional(),fromMark:z.literal(true).optional(),
 /** arrow on the first / last bar of `bar` (as `anchorSchema`) */ pos:z.enum(['first','last']).optional(),t:z.number().min(0).max(1).optional()}).strict();
/** Phase 2 anchor: a view model point (u, v mm); `eu` / `ev` = the coordinate follows the min / max edge of the concrete in
 * the view (resized members keep the dimension on the corner); `bar` = Mark row id the point lies on (lost when it is gone). */
/** `pos` (with `bar`) = the point lies on the first / last bar of that Mark in the view (`t` = 0…1 along a bar line, absent on a
 * bar dot): it follows that edge bar when the count / spacing changes (`barExtremes()`); (u, v) stays the fallback. */
export const anchorSchema=z.object({u:model,v:model,eu:z.enum(['min','max']).optional(),ev:z.enum(['min','max']).optional(),bar:barRef.optional(),
 pos:z.enum(['first','last']).optional(),t:z.number().min(0).max(1).optional()}).strict();
export type Anchor=z.infer<typeof anchorSchema>;
export const userDimSchema=z.object({id:userId,kind:z.literal('dim'),pts:z.array(anchorSchema).min(2).max(20),dir:z.enum(['h','v']),
 /** dimension line: paper mm from the first point (+y down for 'h', +x right for 'v') */ off:paper,
 text:z.string().max(200).optional(),size:z.number().min(1.5).max(10).optional()}).strict();
export const userLevelSchema=z.object({id:userId,kind:z.literal('level'),at:anchorSchema,
 /** symbol: paper mm right (+) / left (−) of the point */ dx:paper,label:z.string().max(40)}).strict();
/** Phase 4: revision cloud (polygon of view points, scalloped) tagged with a revision of `revisions` */
export const userCloudSchema=z.object({id:userId,kind:z.literal('cloud'),pts:z.array(z.tuple([model,model])).min(3).max(40),rev:z.string().regex(/^[A-Z0-9]{1,3}$/)}).strict();
export const userAnnotationSchema=z.discriminatedUnion('kind',[userTextSchema,userLeaderSchema,userDimSchema,userLevelSchema,userCloudSchema]);
export type UserAnnotation=z.infer<typeof userAnnotationSchema>;
/** whole groups of automatic annotations hidden in a view (edit mode “แสดง”: dimensions incl. covers / EX, Mark labels, levels) */
export const viewHideSchema=z.object({dims:z.literal(true).optional(),marks:z.literal(true).optional(),levels:z.literal(true).optional()}).strict();
export const viewEditsSchema=z.object({over:z.record(annotationKeySchema,annotationOverrideSchema).optional(),objs:z.array(userAnnotationSchema).max(100).optional(),hide:viewHideSchema.optional()}).strict()
 .superRefine((v,c)=>{if(Object.keys(v.over||{}).length>300)c.addIssue({code:'custom',path:['over'],message:'แก้ annotation ได้ไม่เกิน 300 รายการต่อรูป'});
  const ids=new Set<string>();(v.objs||[]).forEach((o,i)=>{if(ids.has(o.id))c.addIssue({code:'custom',path:['objs',i],message:'รหัสวัตถุซ้ำ'});ids.add(o.id);});});
export type ViewEdits=z.infer<typeof viewEditsSchema>;
const editViewKey=/^(plan|plan-bottom|plan-top|iso|sec:[a-zA-Z0-9_-]{1,80}|det:[a-zA-Z0-9_-]{1,40})$/;
/** Phase 4: revisions of the drawing (table placed as ViewKey `revs`; clouds refer to them) */
export const drawingRevisionSchema=z.object({rev:z.string().regex(/^[A-Z0-9]{1,3}$/,'Rev: ตัวพิมพ์ใหญ่ / ตัวเลข ≤ 3 ตัว'),date:z.string().max(20),desc:z.string().max(200),by:z.string().max(60)}).strict();
export type DrawingRevision=z.infer<typeof drawingRevisionSchema>;
/** Phase 3: Detail (enlarged) views of the drawing = a parent view drawn around (u, v) within r mm at their own scale; ViewKey
 * `det:<id>`; drawing data only (no member change), so they are saved with the layout. */
export const detailViewSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),label:z.string().trim().regex(/^[A-Za-z0-9-]{1,8}$/,'ชื่อ Detail: ตัวอักษร / ตัวเลข'),
 parent:z.string().regex(editViewKey,'รหัสรูปไม่ถูกต้อง'),u:model,v:model,r:z.number().finite().min(20).max(20000),circle:z.boolean().optional()}).strict();
export type DetailView=z.infer<typeof detailViewSchema>;
export const drawingEditsSchema=z.object({version:z.literal(1),
 views:z.record(z.string().regex(editViewKey,'รหัสรูปไม่ถูกต้อง'),viewEditsSchema),details:z.array(detailViewSchema).max(8).optional(),
 revisions:z.array(drawingRevisionSchema).max(20).optional(),
 /** drawing checked against the model: `drawingModelHash()` of the member when the drawing was last saved / confirmed */
 check:z.object({hash:z.string().max(40),at:z.string().max(40)}).strict().optional()}).strict()
 .superRefine((v,c)=>{if(Object.keys(v.views).length>20)c.addIssue({code:'custom',path:['views'],message:'แก้ได้ไม่เกิน 20 รูป'});
  const ids=new Set<string>(),labels=new Set<string>();(v.details||[]).forEach((d,i)=>{if(ids.has(d.id)||labels.has(d.label.toUpperCase()))c.addIssue({code:'custom',path:['details',i],message:'Detail ซ้ำ'});ids.add(d.id);labels.add(d.label.toUpperCase());
   if(d.parent.startsWith('det:'))c.addIssue({code:'custom',path:['details',i,'parent'],message:'Detail ซ้อน Detail ไม่ได้'});});
  const revs=new Set<string>();(v.revisions||[]).forEach((r,i)=>{if(revs.has(r.rev))c.addIssue({code:'custom',path:['revisions',i],message:'Rev ซ้ำ'});revs.add(r.rev);});});
export type DrawingEdits=z.infer<typeof drawingEditsSchema>;

/** Drops empty overrides / views; undefined when nothing is left (the member then draws exactly as before). */
export function cleanDrawingEdits(e:DrawingEdits|undefined):DrawingEdits|undefined{
 if(!e)return;const views:DrawingEdits['views']={};
 for(const [k,v] of Object.entries(e.views)){
  const over=Object.fromEntries(Object.entries(v.over||{}).map(([a,o])=>[a,Object.fromEntries(Object.entries(o).filter(([,x])=>x!==undefined&&x!==0&&x!==''))]).filter(([,o])=>Object.keys(o).length));
  const objs=(v.objs||[]).filter(o=>o.kind==='dim'||o.kind==='level'||o.kind==='cloud'||o.kind==='leader'&&o.fromMark||o.lines.some(l=>l.trim()));
  const hide=v.hide&&Object.keys(v.hide).length?v.hide:undefined;
  if(Object.keys(over).length||objs.length||hide)views[k]={...(Object.keys(over).length?{over}:{}),...(objs.length?{objs}:{}),...(hide?{hide}:{})};}
 const details=e.details?.length?e.details:undefined,revisions=e.revisions?.length?e.revisions:undefined;
 if(!Object.keys(views).length&&!details&&!revisions)return;
 return {version:1,views,...(details?{details}:{}),...(revisions?{revisions}:{}),...(e.check?{check:e.check}:{})};
}
/** Fingerprint of everything a BBS drawing is made from (geometry, input, bars, sections), not the drawing layer itself
 * (layout, edits, drawing setup) nor review / version data: a change means the edited drawing should be checked again. */
export function drawingModelHash(m:Record<string,unknown>):string{
 const skip=new Set(['sheetLayout','drawingEdits','drawingSetup','review','version','status','updatedAt','inputEpoch','pricing','copySource','occurrences','quantityBasis','description','code']);
 const keys=Object.keys(m).filter(k=>!skip.has(k)).sort(),bars=(m.bars as {placementConfirmed?:boolean;bsDimensionsConfirmed?:boolean}[]|undefined)?.map(b=>({...b,placementConfirmed:undefined,bsDimensionsConfirmed:undefined}));
 const text=JSON.stringify(keys.map(k=>[k,k==='bars'?bars:m[k]]));let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
 return h.toString(16).padStart(8,'0')+'-'+text.length.toString(36);
}
/** Next revision letter (A, B … Z, then numbers). */
export const nextRevision=(revs:{rev:string}[]|undefined)=>{const used=new Set((revs||[]).map(r=>r.rev));for(const c of 'ABCDEFGHJKLMNPQRSTUVWXYZ')if(!used.has(c))return c;let n=1;while(used.has(String(n)))n++;return String(n);};
/** Kind of an annotation key, for labels. */
export const annotationKind=(key:string)=>key.split(':')[0] as 'mark'|'dim'|'cover'|'ex'|'level';
