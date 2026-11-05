// Opening another member of the current project from deep inside an editor (S3: slab floor ↔ its beam groups):
// a window event the App turns into the member detail (the same as clicking the member in the register).
export const OPEN_MEMBER_EVENT='boq:open-member';
export function openMember(id:string){window.dispatchEvent(new CustomEvent<string>(OPEN_MEMBER_EVENT,{detail:id}));}
