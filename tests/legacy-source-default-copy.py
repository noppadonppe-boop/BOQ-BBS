from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1]
checkpoint=root/'output/emulator-checkpoints/v0.23-verified-20261012'
default=root/'.emulator-data'
assert default.resolve().parent==root.resolve()
files=[p for p in checkpoint.rglob('*') if p.is_file()]
actual=[p for p in default.rglob('*') if p.is_file()]
assert len(actual)==len(files)
for p in files:
 q=default/p.relative_to(checkpoint)
 assert q.is_file() and hashlib.sha256(q.read_bytes()).digest()==hashlib.sha256(p.read_bytes()).digest(),str(q)
result={'status':'PASS','filesCompared':len(files),'allFileSha256Match':True,'checkpoint':str(checkpoint),'default':str(default),'scope':'Exact exported checkpoint files copied into default import folder; not full database or production recovery acceptance'}
(root/'output/legacy-source-verification/default-copy-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('PASS default checkpoint copy',len(files),'SHA256-matching files')
