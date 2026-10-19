import {it,expect} from 'vitest';
import {adminProfilePatchSchema,ownProfilePatchSchema,setProfileProjectRoles} from '../src/domain/profilePatch';
const valid={email:'reviewer@qa.local',profileVersion:1,status:'approved',roles:['qs','checker'],assignedProjects:['project-a','project-b'],projectRoles:{'project-a':['viewer'],'project-b':['qs','checker']}};
it('Allows explicit multi-role and different per-project assignments without changing them',()=>{expect(adminProfilePatchSchema.parse(valid)).toEqual(valid);});
it.each(['member#tag@form.local','member?tag@form.local','member%tag@form.local','member+tag@form.local'])('Accepts Firebase-compatible reserved characters in a single profile key: %s',email=>{expect(adminProfilePatchSchema.parse({...valid,email}).email).toBe(email);});
it.each(['member/sub@form.local','member\\sub@form.local','.member@form.local','member.@form.local','member..tag@form.local','member@localhost'])('Still rejects a path or malformed profile address: %s',email=>{expect(adminProfilePatchSchema.safeParse({...valid,email}).success).toBe(false);});
it.each([
 {roles:'qs'}, {roles:['Root']}, {roles:[]}, {roles:['qs','qs']}, {status:'accepted'},
 {assignedProjects:'project-a'}, {assignedProjects:['../project-a']},
 {projectRoles:{'project-a':['Staff']}}, {projectRoles:{'project-a':[]}},
 {projectRoles:{'project-a':['viewer','viewer']}}, {projectRoles:{'../project-a':['viewer']}},
 {profileVersion:0}, {profileVersion:1.5}, {firstName:7}, {email:'../users/another'},
])('Rejects malformed permission patch before its transaction: %j',patch=>{expect(adminProfilePatchSchema.safeParse({...valid,...patch}).success).toBe(false);});
it('Retains identity/Timestamp context for compatibility but does not cast invalid access fields into valid roles',()=>{const context={...valid,uid:'original',createdAt:{seconds:1,nanoseconds:2}};expect(adminProfilePatchSchema.parse(context)).toEqual(context);expect(adminProfilePatchSchema.safeParse({...context,roles:['admin',null]}).success).toBe(false);});
it('Own-profile patch accepts valid mutable fields and historical context; own permissions remain ignored by the command',()=>{expect(ownProfilePatchSchema.parse({profileVersion:1,firstName:'Name',uid:'original',roles:['MasterAdmin']})).toEqual({profileVersion:1,firstName:'Name',uid:'original',roles:['MasterAdmin']});});

it.each(['__proto__','__name__','__reserved__'])('Rejects reserved Firestore project id%s before any transaction',id=>{const projectRoles=Object.fromEntries([[id,['viewer']]]);expect(adminProfilePatchSchema.safeParse({...valid,assignedProjects:[id],projectRoles}).success).toBe(false);});
it.each(['constructor','prototype','toString'])('Preserves literal scope%s as an own serialized Viewer property rather than broader fallback',id=>{const requested=Object.fromEntries([[id,['viewer']]]),parsed=adminProfilePatchSchema.parse({...valid,assignedProjects:[id],projectRoles:requested}),target={};setProfileProjectRoles(target,id,parsed.projectRoles![id]);expect(Object.getPrototypeOf(target)).toBe(Object.prototype);expect(Object.hasOwn(target,id)).toBe(true);expect(JSON.parse(JSON.stringify(target))[id]).toEqual(['viewer']);});
it.each([[],[['project-a',['viewer']]],null,new Date()])('Rejects non-object project-role maps rather than interpreting them as absent scopes',projectRoles=>expect(adminProfilePatchSchema.safeParse({...valid,projectRoles}).success).toBe(false));
