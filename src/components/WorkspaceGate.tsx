import {lazy, Suspense, useEffect, useState} from 'react';
import {useAuth} from '../auth/AuthContext';
import {Auth, PendingApproval, RejectedApproval, ProfileLoadFailure} from './AuthenticationScreens';

const Workspace = lazy(() => import('../App'));

export function WorkspaceGate() {
  const {firebaseUser: user, userProfile, loading: authLoading, profileError, refreshProfile, loginWithEmail, loginWithGoogle, registerWithEmail, logout} = useAuth();
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  useEffect(() => {
    if (authLoading) return;
    const path = window.location.pathname;
    if (!user) {
      if (path !== '/register' && path !== '/login') window.history.replaceState({}, '', '/login');
      return;
    }
    if (userProfile?.status === 'pending') {
      if (path !== '/pending') window.history.replaceState({}, '', '/pending');
      return;
    }
    if (userProfile?.status === 'approved' && ['/login', '/register', '/pending'].includes(path)) window.history.replaceState({}, '', '/dashboard');
  }, [authLoading, user, userProfile]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setFailure('');
    try { await action(); } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  if (authLoading) return <div className="loading">กำลังตรวจสอบสถานะการเข้าสู่ระบบ…</div>;
  if (!user) return <Auth run={run} failure={failure} busy={busy} onLogin={loginWithEmail} onGoogle={loginWithGoogle} onRegister={registerWithEmail} refreshProfile={refreshProfile}/>;
  if (userProfile?.status === 'pending') return <PendingApproval profile={userProfile} onLogout={logout}/>;
  if (userProfile?.status === 'rejected') return <RejectedApproval profile={userProfile} onLogout={logout}/>;
  if (!userProfile) return <ProfileLoadFailure error={profileError} onRetry={refreshProfile} onGoogle={loginWithGoogle} onLogout={logout}/>;
  return <Suspense fallback={<div className="loading" role="status">กำลังเปิดโครงการที่ได้รับสิทธิ์…</div>}><Workspace/></Suspense>;
}
