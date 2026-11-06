import type {Project} from '../domain/model';
import type {SlabTemplate} from '../domain/slabWallTemplates';
import type {BeamTemplate} from '../domain/beamTemplates';
import {specWithTemplates} from '../domain/scheduleImport';
import {changeSpec} from './specChanges';

/** S4b: ticked schedule rows → the project spec through the existing spec-change job (old / new spec in its manifest,
 * members re-checked / regenerated); never a direct spec write. `job` is replaceable for tests. */
export async function importTemplatesViaSpecJob(project:Project,kind:'slab'|'beam',list:(SlabTemplate|BeamTemplate)[],names:Set<string>,progress:(m:string)=>void=()=>{},job:typeof changeSpec=changeSpec){
 if(!names.size)throw Error('ไม่ได้เลือกรายการ');
 const next=specWithTemplates(project.spec,kind,list,names);
 return job(project.id,next,project.version,progress);
}
