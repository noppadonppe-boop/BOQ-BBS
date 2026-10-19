import React,{Component,ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {WorkspaceGate} from './components/WorkspaceGate';
import './styles.css';
import {AuthProvider} from './auth/AuthContext';

class AppErrorBoundary extends Component<{children:ReactNode},{error:Error|null}> {
 state={error:null as Error|null};
 static getDerivedStateFromError(error:Error){return {error};}
 render(){
  if(this.state.error)return <main className="page-content"><section className="panel padded"><h1>เปิด FORM ไม่สำเร็จ</h1><p className="notice danger">{this.state.error.message}</p><button className="primary" onClick={()=>location.reload()}>โหลดหน้าใหม่</button></section></main>;
  return this.props.children;
 }
}

const root=document.getElementById('root');
if(!root)throw new Error('ไม่พบพื้นที่แสดงผลของแอป');
createRoot(root).render(<React.StrictMode><AppErrorBoundary><AuthProvider><WorkspaceGate/></AuthProvider></AppErrorBoundary></React.StrictMode>);
