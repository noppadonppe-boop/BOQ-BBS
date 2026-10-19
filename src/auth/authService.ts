import {browserLocalPersistence,createUserWithEmailAndPassword,GoogleAuthProvider,sendPasswordResetEmail,setPersistence,signInWithEmailAndPassword,signInWithPopup,signOut,User} from 'firebase/auth';
import {addDoc,collection,doc,getDoc,getDocFromServer,runTransaction,serverTimestamp,Firestore} from 'firebase/firestore';
import type {UserProfile} from '../domain/auth';
import {activityLogsPath,APP_NAME,appMetaConfigPath,userDocPath} from '../domain/auth';
import {auth,db} from '../data/firebase';

export type RegistrationInput={firstName?:string;lastName?:string;position?:string;department?:string;photoURL?:string};
export const normalizeProfile=(value:any):UserProfile=>({
 uid:String(value.uid),email:String(value.email||''),firstName:String(value.firstName||''),lastName:String(value.lastName||''),
 position:String(value.position||''),department:value.department?String(value.department):undefined,
 role:value.role||value.roles?.[0]||'Staff',roles:Array.isArray(value.roles)?value.roles:(value.role?[value.role]:['Staff']),status:value.status||'pending',
 assignedProjects:Array.isArray(value.assignedProjects)?value.assignedProjects:[],projectRoles:value.projectRoles||{},createdAt:value.createdAt,
 profileVersion:Number(value.profileVersion||1),photoURL:value.photoURL||undefined,isFirstUser:!!value.isFirstUser
});

// Keep this call synchronous from the auth-flow point of view: it is intentionally
// invoked immediately after sign-in and before profile/activity awaits.
export function setSessionExpiry(user:User){
 const expiresAt=Date.now()+1000*60*60*24*30;
 try{localStorage.setItem(`${APP_NAME}:session-expires-at`,String(expiresAt));}catch{}
 return user;
}
export async function prepareAuthPersistence(){await setPersistence(auth,browserLocalPersistence);}
export async function ensureProfile(user:Pick<User,'uid'|'email'>,input:RegistrationInput={},database:Firestore=db):Promise<UserProfile>{
 const email=user.email?.trim().toLowerCase();if(!email)throw new Error('บัญชีต้องมีอีเมล');
 let attemptedBootstrap=false;
 const register=()=>runTransaction(database,async tx=>{
  const ref=doc(database,userDocPath(email)),metaRef=doc(database,appMetaConfigPath),existing=await tx.get(ref),metaSnap=await tx.get(metaRef);
  const directoryRef=doc(database,`${APP_NAME}/root/directory/${user.uid}`),emailRef=doc(database,`${APP_NAME}/root/directoryEmails/${email}`);
  if(existing.exists()){
   const old=existing.data();if(old.uid!==user.uid)throw new Error('ข้อมูลบัญชีนี้เปลี่ยนแล้ว ให้ MasterAdmin ตรวจสอบก่อนใช้งาน');
   // AuthContext may create the profile before the registration form finishes.
   // Fill only empty optional fields, preserving an existing user's edits.
   const patch=Object.fromEntries((['firstName','lastName','position','department','photoURL'] as const).filter(k=>input[k]&&!old[k]).map(k=>[k,input[k]]));
   const next=Object.keys(patch).length?{...old,...patch,profileVersion:(old.profileVersion||1)+1}:old;
   if(Object.keys(patch).length)tx.update(ref,{...patch,profileVersion:next.profileVersion,updatedAt:new Date().toISOString()});
   tx.set(directoryRef,{uid:next.uid,email:next.email,firstName:next.firstName,lastName:next.lastName,status:next.status,profileVersion:next.profileVersion||1});tx.set(emailRef,{uid:next.uid,email:next.email});return next;
  }
  const meta=metaSnap.exists()?metaSnap.data() as any:{};const first=!meta.firstUserRegistered&&Number(meta.totalUsers||0)===0;attemptedBootstrap=first;const createdAt=serverTimestamp();
  const profile={uid:user.uid,email,firstName:input.firstName||'',lastName:input.lastName||'',position:input.position||'',department:input.department||'',role:first?'MasterAdmin':'Staff',roles:first?['MasterAdmin']:['Staff'],status:first?'approved':'pending',assignedProjects:[],projectRoles:{},profileVersion:1,createdAt,photoURL:input.photoURL||'',isFirstUser:first};
  tx.set(ref,profile);tx.set(metaRef,{firstUserRegistered:true,firstUid:first?user.uid:(meta.firstUid||''),totalUsers:Number(meta.totalUsers||0)+1,createdAt:meta.createdAt||createdAt},{merge:true});tx.set(directoryRef,{uid:profile.uid,email:profile.email,firstName:profile.firstName,lastName:profile.lastName,status:profile.status,profileVersion:1});tx.set(emailRef,{uid:profile.uid,email:profile.email});return profile;
 });
 let result;
 try{result=await register();}catch(error:any){
  // Rules can reject the losing first-admin claim before Firestore returns its
  // transaction conflict. Re-read the committed winner and register as Staff.
  if(error.code!=='permission-denied'||!attemptedBootstrap)throw error;
  const meta=await getDocFromServer(doc(database,appMetaConfigPath));
  if(!meta.exists()||!meta.data().firstUserRegistered||meta.data().totalUsers<1)throw error;
  result=await register();
 }
 return normalizeProfile(result);
}
export async function fetchProfile(user:User):Promise<UserProfile|null>{
 const email=user.email?.trim().toLowerCase();
 if(!email)return null;
 const snap=await getDoc(doc(db,userDocPath(email)));
 if(snap.exists()&&snap.data().uid!==user.uid)throw Object.assign(new Error('ข้อมูลบัญชีนี้เปลี่ยนแล้ว ให้ MasterAdmin ตรวจสอบก่อนใช้งาน'),{code:'permission-denied'});
 return snap.exists()?normalizeProfile(snap.data()):null;
}
export async function registerWithEmail(email:string,password:string,firstName:string,lastName:string,position:string,department=''){
 await prepareAuthPersistence();
 const credential=await createUserWithEmailAndPassword(auth,email.trim().toLowerCase(),password);
 const user=credential.user;
 setSessionExpiry(user);
 const profile=await ensureProfile(user,{firstName,lastName,position,department});
 logActivity('REGISTER',user,profile).catch(()=>{});
 return profile;
}
export async function loginWithEmail(email:string,password:string){
 await prepareAuthPersistence();
 const credential=await signInWithEmailAndPassword(auth,email.trim().toLowerCase(),password);
 const user=credential.user;
 setSessionExpiry(user);
 const profile=await ensureProfile(user,{photoURL:user.photoURL||''});
 logActivity('LOGIN',user,profile).catch(()=>{});
 return profile;
}
export async function loginWithGoogle(){
 await prepareAuthPersistence();
 const credential=await signInWithPopup(auth,new GoogleAuthProvider());
 const user=credential.user;
 setSessionExpiry(user);
 const names=(user.displayName||'').trim().split(/\s+/).filter(Boolean);
 const profile=await ensureProfile(user,{firstName:names[0]||'',lastName:names.slice(1).join(' '),photoURL:user.photoURL||''});
 logActivity('LOGIN',user,profile).catch(()=>{});
 return profile;
}
export async function logout(){await signOut(auth);}
export async function sendReset(email:string){await prepareAuthPersistence();await sendPasswordResetEmail(auth,email.trim().toLowerCase());}
export async function logActivity(action:'REGISTER'|'LOGIN',user:User,profile?:UserProfile){
 await addDoc(collection(db,activityLogsPath),{action,uid:user.uid,email:user.email||'',profileStatus:profile?.status||null,createdAt:new Date().toISOString()});
}
