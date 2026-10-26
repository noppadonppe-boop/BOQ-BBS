import type {Category,Project} from './model';
import {civilCategories,quantityOnlyCategories} from './civilInputSchema';
import {archCategories} from './archInputSchema';
import {steelCategories} from './steelInputSchema';

// Work disciplines (หมวดงาน) above the element categories. A member's discipline follows its category, so existing
// members are RC without any migration. Steel / Civil / Architecture get their categories in later phases.
export const disciplines=['RC','Steel','Civil','Arch'] as const;
export type Discipline=typeof disciplines[number];
export type DisciplineInfo={label:string;short:string;deliverable:string;categories:readonly Category[];planned:string[]};
export const disciplineInfo:Record<Discipline,DisciplineInfo>={
 RC:{label:'RC Structure',short:'RC',deliverable:'แบบ BBS',categories:['Foundation','Beam','Column','Slab','Wall','Stair','Lift','Custom'],planned:[]},
 Steel:{label:'Steel Structure',short:'Steel',deliverable:'Material / Bolt list (Shop drawing ระยะถัดไป)',categories:steelCategories,planned:['Assembly drawing: Elevation · Section · มิติ · สัญลักษณ์เชื่อม (ระยะ 4b)']},
 Civil:{label:'Civil Work',short:'Civil',deliverable:'แบบ BBS + ปริมาณ',categories:civilCategories,planned:[]},
 Arch:{label:'Architecture Work',short:'Arch',deliverable:'ปริมาณ + ตาราง Door / Window',categories:archCategories,planned:[]},
};
export const disciplineOf=(c:Category):Discipline=>disciplines.find(d=>disciplineInfo[d].categories.includes(c))||'RC';
/** Disciplines shown in the project: chosen in Settings (default RC) plus any that already have members. */
export function projectDisciplines(p:Pick<Project,'disciplines'>|undefined,used:Category[]=[]):Discipline[]{
 const chosen=new Set<Discipline>(p?.disciplines?.length?p.disciplines:['RC']);for(const c of used)chosen.add(disciplineOf(c));
 return disciplines.filter(d=>chosen.has(d));
}
/** Categories edited with the free-form tools (shape model, prisms, rebar sketch) instead of a structured input form. */
export const freeFormCategory=(c:Category)=>c==='Custom'||c==='Stair'||c==='Lift'||(!quantityOnlyCategories.includes(c)&&(civilCategories as readonly string[]).includes(c));
export const disciplineLabel=(raw:string)=>disciplineInfo[raw as Discipline]?.label||raw;
