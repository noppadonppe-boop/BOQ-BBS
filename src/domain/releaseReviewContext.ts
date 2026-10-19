import type {Project,Revision} from './model';
import type {ReleaseReport} from './releaseReview';

export function releaseReviewContextKey(project:Project,revision:Revision|undefined,uid:string){
 return JSON.stringify([project.id,project.version,uid,revision?.id,revision?.digest,revision?.engineVersion]);
}

export function releaseReportIsCurrent(report:ReleaseReport|undefined,project:Project,revision:Revision|undefined){
 return !!report&&!!revision&&report.projectId===project.id&&report.projectVersion===project.version&&report.revisionId===revision.id&&report.revisionDigest===revision.digest&&report.engineVersion===revision.engineVersion;
}
