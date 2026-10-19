import {onAuthStateChanged,User} from 'firebase/auth';
import {createContext,useCallback,useContext,useEffect,useMemo,useState,useRef} from 'react';
import type {UserProfile} from '../domain/auth';
import {auth,db} from '../data/firebase';
import {doc,onSnapshot} from 'firebase/firestore';
import {userDocPath} from '../domain/auth';
import {ensureProfileForUser} from './profileHelpers';
import {normalizeProfile,fetchProfile,loginWithEmail,loginWithGoogle,logout,registerWithEmail} from './authService';

type AuthContextValue={firebaseUser:User|null;userProfile:UserProfile|null;loading:boolean;profileError:string|null;refreshProfile:()=>Promise<UserProfile|null>;loginWithEmail:typeof loginWithEmail;loginWithGoogle:typeof loginWithGoogle;registerWithEmail:typeof registerWithEmail;logout:typeof logout;};
const AuthContext=createContext<AuthContextValue|undefined>(undefined);
function profileErrorMessage(error:unknown){
 const code=String((error as {code?:unknown})?.code||'');
 if(code.includes('not-found'))return 'ไม่พบ User Profile ของบัญชีนี้';
 if(code.includes('internal')||code.includes('unknown'))return 'ไม่สามารถสร้างหรืออ่าน User Profile ได้ กรุณาตรวจสอบ Firebase Rules และลองใหม่';
 if(code.includes('permission-denied'))return 'ไม่มีสิทธิ์อ่าน UserProfile กรุณาตรวจสอบ Firestore Rules และสิทธิ์ของบัญชี';
 if(code.includes('unauthenticated'))return 'เซสชันหมดอายุ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่';
 if(code.includes('unavailable')||code.includes('deadline-exceeded'))return 'เชื่อมต่อ Firebase ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
 const message=(error as {message?:unknown})?.message;
 return typeof message==='string'&&message.trim()?message:'โหลดข้อมูลโปรไฟล์ไม่สำเร็จ';
}
export function AuthProvider({children}:{children:React.ReactNode}){
 const [firebaseUser,setFirebaseUser]=useState<User|null>(null),[userProfile,setUserProfile]=useState<UserProfile|null>(null),[loading,setLoading]=useState(true),[profileError,setProfileError]=useState<string|null>(null);
 const generation=useRef(0);
 const loadProfile=useCallback(async(user:User|null)=>{
  const currentGeneration=generation.current;
  if(!user){setUserProfile(null);setProfileError(null);return null;}
  setProfileError(null);
  try{
   const current=await fetchProfile(user);
   if(current){if(generation.current===currentGeneration&&auth.currentUser?.uid===user.uid)setUserProfile(current);return current;}
   // Existing Auth accounts from before profile documents were introduced are
   // completed through the same first-user transaction as new registrations.
   const created=await ensureProfileForUser(user);
   if(generation.current===currentGeneration&&auth.currentUser?.uid===user.uid)setUserProfile(created);return created;
  }catch(error){if(generation.current===currentGeneration&&auth.currentUser?.uid===user.uid){setUserProfile(null);setProfileError(profileErrorMessage(error));}return null;}
 },[]);
 useEffect(()=>{
  let active=true;
  const unsubscribe=onAuthStateChanged(auth,async user=>{
   if(!active)return;
   generation.current++;setUserProfile(null);
   setFirebaseUser(user&&!user.isAnonymous?user:null);
   if(!user||user.isAnonymous){setUserProfile(null);setProfileError(null);setLoading(false);return;}
   setLoading(true);await loadProfile(user);if(active)setLoading(false);
  },error=>{if(active){setUserProfile(null);setProfileError(profileErrorMessage(error));setLoading(false);}});
  return()=>{active=false;unsubscribe();};
 },[loadProfile]);
 useEffect(()=>{
  if(!firebaseUser?.email)return;const uid=firebaseUser.uid;
  return onSnapshot(doc(db,userDocPath(firebaseUser.email)),snapshot=>{
   if(auth.currentUser?.uid!==uid)return;
   if(snapshot.exists()){const next=normalizeProfile(snapshot.data());if(next.uid===uid){setUserProfile(next);setProfileError(null);}else{setUserProfile(null);setProfileError('ข้อมูลบัญชีเปลี่ยนแล้ว ให้ผู้ดูแลตรวจสอบก่อนใช้งาน');}}
  },error=>{if(auth.currentUser?.uid===uid){setUserProfile(null);setProfileError(profileErrorMessage(error));}});
 },[firebaseUser?.uid,firebaseUser?.email]);
 // An auth form can still hold its pre-login callback after sign-in completes.
 // Resolve the live Auth user when invoked so it cannot clear a new profile.
 const refreshProfile=useCallback(async()=>{await auth.authStateReady();const current=auth.currentUser;return loadProfile(current&&!current.isAnonymous?current:null);},[loadProfile]);
 const value=useMemo(()=>({firebaseUser,userProfile,loading,profileError,refreshProfile,loginWithEmail,loginWithGoogle,registerWithEmail,logout}),[firebaseUser,userProfile,loading,profileError,refreshProfile]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(){const context=useContext(AuthContext);if(!context)throw new Error('useAuth ต้องอยู่ภายใน AuthProvider');return context;}
