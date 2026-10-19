import {expect,it} from 'vitest';
import {currentStarterSpec} from '../src/domain/model';
import type {Project,Revision} from '../src/domain/model';
import type {ReleaseReport} from '../src/domain/releaseReview';
import {releaseReportIsCurrent,releaseReviewContextKey} from '../src/domain/releaseReviewContext';
const project={id:'project-A',version:7,spec:currentStarterSpec} as Project;
const revision={id:'revision-A',digest:'a'.repeat(64),engineVersion:'geometry-2.2'} as Revision;
const report={projectId:project.id,projectVersion:project.version,revisionId:revision.id,revisionDigest:revision.digest,engineVersion:revision.engineVersion} as ReleaseReport;
it('Only the complete selected project/revision basis is current',()=>{
 expect(releaseReportIsCurrent(report,project,revision)).toBe(true);
 for(const patch of [{projectId:'other'},{projectVersion:8},{revisionId:'other'},{revisionDigest:'b'.repeat(64)},{engineVersion:'other'}])expect(releaseReportIsCurrent({...report,...patch},project,revision)).toBe(false);
 expect(releaseReportIsCurrent(undefined,project,revision)).toBe(false);
 expect(releaseReportIsCurrent(report,project,undefined)).toBe(false);
});
it('Changing account, project, version, revision, digest or engine resets the review scope',()=>{
 const original=releaseReviewContextKey(project,revision,'alice');
 const keys=[releaseReviewContextKey(project,revision,'bob'),releaseReviewContextKey({...project,id:'other'},revision,'alice'),releaseReviewContextKey({...project,version:8},revision,'alice'),releaseReviewContextKey(project,{...revision,id:'other'},'alice'),releaseReviewContextKey(project,{...revision,digest:'b'.repeat(64)},'alice'),releaseReviewContextKey(project,{...revision,engineVersion:'other'},'alice'),releaseReviewContextKey(project,undefined,'alice')];
 expect(keys.every(key=>key!==original)).toBe(true);
 expect(releaseReviewContextKey(project,revision,'alice')).toBe(original);
});
