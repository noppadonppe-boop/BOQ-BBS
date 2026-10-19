import type {Project} from './model';
export function reconciledProject(incoming:Project,verified?:Project):Project{
 if(!verified||incoming.id!==verified.id)return incoming;if(incoming.version<verified.version)return verified;
 if(incoming.version===verified.version&&incoming.specChangeState?.id===verified.specChangeState?.id&&['Complete','Cancelled'].includes(verified.specChangeState?.status||'')&&['Applying','RollingBack'].includes(incoming.specChangeState?.status||''))return verified;
 if(incoming.version===verified.version&&incoming.specChangeState?.id===verified.specChangeState?.id){const a=incoming.specChangeState,b=verified.specChangeState;if(a&&b&&(a.status===b.status&&a.completed<b.completed||a.status==='Applying'&&b.status==='RollingBack'))return verified;}
 return incoming;
}
