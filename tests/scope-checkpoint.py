from pathlib import Path
import json, hashlib, base64

root = Path(__file__).resolve().parents[1]
out = root / 'output/scope-verification'
checkpoint = root / 'output/emulator-checkpoints/v0.16-verified-20261012'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
meta = read(checkpoint / 'firebase-export-metadata.json')
counts = {}
for name in ['auth', 'firestore', 'storage']:
    counts[name] = sum(p.is_file() for p in (checkpoint / meta[name]['path']).rglob('*'))
    assert counts[name] > 0

folder = checkpoint / meta['storage']['path']
hashes = {}
for p in (folder / 'metadata').glob('*.json'):
    j = read(p)
    data = (folder / 'blobs' / p.stem).read_bytes()
    assert len(data) == int(j['size']), j['name']
    assert base64.b64encode(hashlib.md5(data).digest()).decode() == j['md5Hash'], j['name']
    assert j['name'] not in hashes, j['name']
    hashes[j['name']] = hashlib.sha256(data).hexdigest()

old = root / 'output/emulator-checkpoints/v0.15-verified-20261012'
old_meta = read(old / 'firebase-export-metadata.json')
old_folder = old / old_meta['storage']['path']
old_blobs = list((old_folder / 'metadata').glob('*.json'))
for p in old_blobs:
    j = read(p)
    assert hashes[j['name']] == hashlib.sha256((old_folder / 'blobs' / p.stem).read_bytes()).hexdigest(), j['name']

(out / 'checkpoint-verification.json').write_text(json.dumps({
    'status': 'PASS', 'path': str(checkpoint), 'fileCounts': counts,
    'verifiedStorageBlobs': len(hashes), 'allBlobSizeAndMd5Match': True,
    'previousV15BlobBytesPreserved': len(old_blobs),
    'scope': 'Storage objects compared by canonical object name and byte hash, not random checkpoint blob names. Firestore/Auth exports contain new data; not whole-database parity or production DR acceptance.'
}, indent=2), encoding='utf-8')
print('PASS checkpoint', counts, 'verified blobs', len(hashes), 'previous blobs unchanged', len(old_blobs))
