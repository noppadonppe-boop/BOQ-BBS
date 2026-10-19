import {describe,it,expect} from 'vitest';
import {assignedRoles,profileApproved,profileMaster,projectProfileRoles,hasRoles,AccessProfile} from '../src/domain/authAccess';
const p:AccessProfile={uid:'u1',email:'reader@example.com',roles:['qs','checker','approver'],status:'approved',assignedProjects:['p1']};
describe('merged account/project permission policy',()=>{
 it('preserves all assigned module roles instead of choosing one priority',()=>{const roles=assignedRoles(p,'p1');expect(roles).toEqual(['qs','checker','approver']);expect(hasRoles(roles,['qs'])).toBe(true);expect(hasRoles(roles,['checker'])).toBe(true);expect(hasRoles(roles,['approver'])).toBe(true);expect(hasRoles(roles,['admin'])).toBe(false);});
 it('does not grant roles in another project',()=>expect(assignedRoles(p,'p2')).toEqual([]));
 it.each(['pending','rejected'])('denies project permission for status%s',status=>{expect(assignedRoles({...p,status},'p1')).toEqual([]);expect(profileMaster({...p,status,roles:['MasterAdmin']})).toBe(false);});
 it('binds approval to both current Auth UID and normalized email',()=>{expect(profileApproved(p,'u1','READER@example.com')).toBe(true);expect(profileApproved(p,'replacement-uid',p.email)).toBe(false);expect(profileApproved(p,'u1','another@example.com')).toBe(false);});
 it('does not accept missing or unapproved profiles',()=>{expect(profileApproved(undefined,'u1',p.email)).toBe(false);expect(profileApproved({...p,status:'pending'},'u1',p.email)).toBe(false);});
 it('approved MasterAdmin has full modules across projects while pending MasterAdmin has none',()=>{expect(assignedRoles({...p,roles:['MasterAdmin'],assignedProjects:[]},'p2')).toEqual(['admin','qs','checker','approver','viewer']);expect(assignedRoles({...p,roles:['MasterAdmin'],status:'pending'},'p2')).toEqual([]);});
 it('per-project override narrows a broad global role set',()=>{expect(assignedRoles({...p,projectRoles:{p1:['viewer']}},'p1')).toEqual(['viewer']);expect(assignedRoles(p,'p1')).toEqual(['qs','checker','approver']);});
 it('deduplicates modules and maps approved administration aliases',()=>{expect(projectProfileRoles(['checker','qs','checker','Admin'])).toEqual(['admin','qs','checker']);expect(projectProfileRoles(['Staff'])).toEqual(['viewer']);});
 it('keeps input role/assignment maps unchanged',()=>{const before=JSON.stringify(p);assignedRoles(p,'p1');projectProfileRoles(p.roles);expect(JSON.stringify(p)).toBe(before);});
 it('supports scalar-role legacy profiles without treating inherited names as roles',()=>{expect(assignedRoles({...p,roles:undefined as any,role:'checker'},'p1')).toEqual(['checker']);expect(projectProfileRoles(['constructor','toString'])).toEqual(['viewer']);});
});
