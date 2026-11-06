import {z} from 'zod';
import {viewEditsSchema} from './drawingEdits';

/** Sheet Composer data (zod only, no runtime imports: `model.ts` imports it).
 * ViewKey = plan | plan-bottom | plan-top | sec:<section id> | notes. Boxes are sheet mm (frame of the view incl. its title band). */
export const viewKeySchema=z.string().regex(/^(plan|plan-bottom|plan-top|notes|revs|iso|schedule|legend|keyplan|stddet|sec:[a-zA-Z0-9_-]{1,80}|det:[a-zA-Z0-9_-]{1,40})$/,'รหัสรูปไม่ถูกต้อง');
export type ViewKey=z.infer<typeof viewKeySchema>;
export const viewScaleNSchema=z.union([z.literal('auto'),z.number().int().min(1).max(1000)]);
const showSchema=z.object({dims:z.boolean().optional(),marks:z.boolean().optional(),levels:z.boolean().optional(),allBars:z.boolean().optional()}).strict();
const placed=<K extends z.ZodTypeAny>(key:K)=>z.object({view:key,x:z.number().finite().min(-1000).max(2000),y:z.number().finite().min(-1000).max(2000),w:z.number().finite().min(10).max(2000),h:z.number().finite().min(10).max(2000),
 n:viewScaleNSchema,
 /** projection lock: keep the shared model axis on the same sheet x ('x') / y ('y') as view `to` (same scale), else centre lines */
 lock:z.object({to:key,axis:z.enum(['x','y'])}).strict().optional(),fixed:z.boolean().optional(),show:showSchema.optional()}).strict();
export const placedViewSchema=placed(viewKeySchema);
export type PlacedView=z.infer<typeof placedViewSchema>;
const sheetsOf=<V extends z.ZodTypeAny>(view:V)=>z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),views:z.array(view).max(16)}).strict()).min(1).max(20);
export const sheetLayoutSchema=z.object({version:z.literal(1),sheets:sheetsOf(placedViewSchema),unplaced:z.array(viewKeySchema).max(40)}).strict().superRefine((v,c)=>{
 const seen=new Set<string>();
 v.sheets.forEach((s,i)=>s.views.forEach((p,j)=>{if(seen.has(p.view))c.addIssue({code:'custom',path:['sheets',i,'views',j],message:`รูป ${p.view} วางซ้ำ`});seen.add(p.view);}));
 if(new Set(v.sheets.map(s=>s.id)).size!==v.sheets.length)c.addIssue({code:'custom',path:['sheets'],message:'รหัสแผ่นซ้ำ'});
});
export type SheetLayout=z.infer<typeof sheetLayoutSchema>;

/** Template roles: plan views / notes as is, sections by role (sec-x = X–X, sec-y = Y–Y, col-z = Z–Z, user-1 … = added cuts). */
/** Template roles: … `wall-…` = Wall Run views (`sec:wall-…`: elevations per storey group, details, section, opening detail). */
export const roleKeySchema=z.string().regex(/^(plan|plan-bottom|plan-top|notes|revs|iso|schedule|legend|keyplan|stddet|sec-x|sec-y|col-z|user-[0-9]{1,2}|wall-[a-z0-9-]{1,20})$/,'role ไม่ถูกต้อง');
export type RoleKey=z.infer<typeof roleKeySchema>;
export const sheetTemplateSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),name:z.string().trim().min(1).max(80),category:z.string().min(1).max(40),
 match:z.object({foundationType:z.string().max(20).optional(),layout:z.string().max(20).optional()}).strict().optional(),size:z.enum(['A3','A2','A1']),
 sheets:sheetsOf(placed(roleKeySchema)),
 /** added cuts: position = at × member size along the axis */
 sections:z.array(z.object({role:z.string().regex(/^user-[0-9]{1,2}$/),label:z.string().trim().regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?$/).max(12),axis:z.enum(['X','Y','Z']),at:z.number().min(0).max(1),
  look:z.enum(['+','-']),depth:z.number().positive().max(100000).optional()}).strict()).max(12),
 /** Drawing Edit layer per view role (overrides of automatic annotations + user objects), applied with the template */
 edits:z.record(roleKeySchema,viewEditsSchema).optional()}).strict();
export type SheetTemplate=z.infer<typeof sheetTemplateSchema>;
export const sheetTemplatesSchema=z.array(sheetTemplateSchema).max(60);
/** Project templates + default template per category (and foundation type) for members without their own layout. */
export const projectSheetTemplatesSchema=z.object({version:z.number().int().min(1),templates:sheetTemplatesSchema,
 defaults:z.array(z.object({category:z.string().min(1).max(40),foundationType:z.string().max(20).optional(),id:z.string().min(1).max(40)}).strict()).max(60)}).strict();
export type ProjectSheetTemplates=z.infer<typeof projectSheetTemplatesSchema>;
