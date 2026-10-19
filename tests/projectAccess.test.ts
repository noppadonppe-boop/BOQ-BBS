import {describe,it,expect} from 'vitest';
import {planProjectAccess,roleLabel} from '../src/domain/projectAccess';

describe('per-project access policy',()=>{
 const original={owner:'admin',checker:'checker',reader:'viewer'};
 it('adds and changes only the selected user without mutating the original ACL',()=>{const a=planProjectAccess(original,'owner','qs','qs');expect(a.changed).toBe(true);expect(a.beforeRole).toBeNull();expect(a.afterRole).toBe('qs');expect(a.acl).toEqual({...original,qs:'qs'});expect(original).toEqual({owner:'admin',checker:'checker',reader:'viewer'});});
 it('removes only selected access and preserves the acting administrator',()=>{const a=planProjectAccess(original,'owner','reader','remove');expect(a.acl).toEqual({owner:'admin',checker:'checker'});expect(a.beforeRole).toBe('viewer');expect(a.afterRole).toBeNull();});
 it('does not invent a change for an identical role or already absent removal',()=>{expect(planProjectAccess(original,'owner','reader','viewer').changed).toBe(false);expect(planProjectAccess(original,'owner','absent','remove').changed).toBe(false);});
 it.each(['qs','checker','approver','viewer'])('refuses actor role%s',role=>{expect(()=>planProjectAccess({...original,actor:role},'actor','reader','qs')).toThrow('เฉพาะผู้ดูแล');});
 it('forbids self-demotion and self-removal even with another administrator',()=>{const acl={...original,second:'admin'};expect(()=>planProjectAccess(acl,'owner','owner','viewer')).toThrow('ผู้ดูแลอีกคน');expect(()=>planProjectAccess(acl,'owner','owner','remove')).toThrow('ผู้ดูแลอีกคน');});
 it('allows a second administrator to change a peer while preserving an administrator',()=>{expect(planProjectAccess({...original,second:'admin'},'second','owner','viewer').acl).toEqual({...original,owner:'viewer',second:'admin'});});
 it('refuses unsupported target IDs and roles',()=>{expect(()=>planProjectAccess(original,'owner','outside/user','viewer')).toThrow('รหัสบัญชี');expect(()=>planProjectAccess(original,'owner','reader','superuser' as any)).toThrow('บทบาท');});
 it('labels absent and unknown historical roles without granting permissions',()=>{expect(roleLabel(null)).toBe('ไม่มีสิทธิ์');expect(roleLabel('admin')).toBe('ผู้ดูแลโครงการ');expect(roleLabel('legacy')).toBe('บทบาทไม่รองรับ');});
 it('stores custom Auth UIDs that collide with object property names as literal entries',()=>{for(const uid of ['__proto__','constructor','toString']){const a=planProjectAccess(original,'owner',uid,'viewer');expect(a.beforeRole).toBeNull();expect(Object.hasOwn(a.acl,uid)).toBe(true);expect(a.acl[uid]).toBe('viewer');expect(JSON.parse(JSON.stringify(a.acl))[uid]).toBe('viewer');expect(Object.getPrototypeOf(a.acl)).toBe(Object.prototype);expect(planProjectAccess(a.acl,'owner',uid,'remove').afterRole).toBeNull();}});
 it('does not authorize administrator roles inherited from an object prototype',()=>{expect(()=>planProjectAccess(Object.create({intruder:'admin'}),'intruder','reader','viewer')).toThrow('เฉพาะผู้ดูแล');});
});
