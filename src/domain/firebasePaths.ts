import type {Role} from './model';
// Project IDs always retain their own document path and explicit per-user ACL.
export function workspacePath(id: string): string { return `projects/${id}`; }

export function workspaceRole(project: {id?: string; acl?: Record<string, string>} | undefined, uid: string): Role | undefined {
  const role=project?.acl?.[uid];
  return role&&['admin','qs','checker','approver','viewer'].includes(role)?role as Role:undefined;
}

