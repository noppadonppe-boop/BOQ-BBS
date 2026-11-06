# deploy-backup

Copies of what is **live before a deploy**, kept so each step of `docs/DEPLOY_0_121.md` can be undone.

| File | What | How it gets here |
|---|---|---|
| `firestore.rules.live-<yyyymmdd>` | Firestore rules published before the deploy | Firebase Console › Firestore Database › Rules › copy the whole text (the owner) |
| `storage.rules.live-<yyyymmdd>` | Storage rules published before the deploy | Firebase Console › Storage › Rules › copy the whole text (the owner) |

Never put migration backups here: `migrateApiKeys` backups hold API keys. Those go to a folder outside the repository
(the guide uses `C:\Users\Administrator\boq-deploy-backup\`).
