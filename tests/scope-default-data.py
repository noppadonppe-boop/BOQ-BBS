from pathlib import Path
import hashlib, json

root = Path(__file__).resolve().parents[1]
source = root / 'output/emulator-checkpoints/v0.16-verified-20261012'
target = root / '.emulator-data'
archive = root / 'output/emulator-checkpoints/pre-v16-default-data-20261012'
assert archive.is_dir()
files = [p for p in source.rglob('*') if p.is_file()]
assert {p.relative_to(source) for p in files} == {p.relative_to(target) for p in target.rglob('*') if p.is_file()}
for p in files:
    assert hashlib.sha256(p.read_bytes()).digest() == hashlib.sha256((target / p.relative_to(source)).read_bytes()).digest(), p
result = {'status': 'PASS', 'fileCount': len(files), 'allFileSha256Match': True,
          'previousDataPreserved': True, 'previousDataPath': str(archive)}
(root / 'output/scope-verification/default-data-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print('PASS default-data matches', len(files), 'checkpoint files; previous default preserved')
