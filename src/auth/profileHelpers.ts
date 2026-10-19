import type {User} from 'firebase/auth';
import type {UserProfile} from '../domain/auth';
import {ensureProfile,fetchProfile} from './authService';
export async function ensureProfileForUser(user:User){
 const existing=await fetchProfile(user);if(existing)return existing;
 const names=(user.displayName||'').trim().split(/\s+/).filter(Boolean);
 return ensureProfile(user,{firstName:names[0]||'',lastName:names.slice(1).join(' '),photoURL:user.photoURL||''});
}
