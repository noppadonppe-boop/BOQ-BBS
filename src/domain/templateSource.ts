import {z} from 'zod';

// T1: where a member came from when it was created from an element template (information only: nothing is locked,
// not part of the drawing status hash, kept when the member is copied to another project).
export const memberTemplateSourceSchema=z.object({
 scope:z.enum(['project','central']),
 templateId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
 version:z.number().int().min(1),
 name:z.string().max(120),
 projectCode:z.string().max(120).optional(),
}).strict();
export type MemberTemplateSource=z.infer<typeof memberTemplateSourceSchema>;

/** Project default template per element key (`Foundation`, `Foundation:pile`, `Beam:group`, `Slab:floor` …) → template id. */
export const templateDefaultsSchema=z.record(z.string().regex(/^[A-Za-z]{1,30}(:[a-z]{1,20})?$/),z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/))
 .refine(v=>Object.keys(v).length<=100,'ค่ามาตรฐานเกิน 100 รายการ');
export type TemplateDefaults=z.infer<typeof templateDefaultsSchema>;
