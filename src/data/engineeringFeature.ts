// Opt in only after the database owner has configured collection permissions.
// The flag is feature availability, not authorization; Firebase Rules remain
// the security boundary. Existing projects/backup/restore keep their old paths.
export const engineeringFixturesEnabled=import.meta.env.VITE_ENABLE_ENGINEERING_FIXTURES==='true';
export function engineeringHistoryProblem(project:{engineeringFixtureEpoch?:string},enabled=engineeringFixturesEnabled){
 return !enabled&&project.engineeringFixtureEpoch?'โครงการนี้มีประวัติกรณีตรวจ ต้องเปิดสิทธิ์และการอ่านประวัติกรณีตรวจก่อน Backup หรือ Restore':'';
}
