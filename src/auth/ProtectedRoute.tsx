import {useEffect} from 'react';
import {useAuth} from './AuthContext';

export function ProtectedRoute({children,requireApproved=true,requireRoles}:{children:React.ReactNode;requireApproved?:boolean;requireRoles?:string[]}){
 const {firebaseUser,userProfile,loading}=useAuth();
 useEffect(()=>{
  if(loading)return;
  const target=!firebaseUser?'/login':userProfile?.status==='pending'?'/pending':userProfile?.status==='rejected'?'/login':requireRoles&&!requireRoles.some(role=>userProfile?.roles.includes(role as never))?'/':null;
  if(target&&window.location.pathname!==target)window.history.replaceState({},'',target);
 },[firebaseUser,userProfile,loading,requireRoles]);
 if(loading||(!firebaseUser)||(firebaseUser&&(!userProfile||requireApproved&&userProfile.status!=='approved'))){return <div className="loading">กำลังตรวจสอบสิทธิ์…</div>;}
 if(requireRoles&&userProfile&&!requireRoles.some(role=>userProfile.roles.includes(role as never)))return <div className="loading">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
 return <>{children}</>;
}
