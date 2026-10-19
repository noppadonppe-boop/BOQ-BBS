from pathlib import Path
import sys, json, hashlib, base64

root = Path(__file__).resolve().parents[1]
out = root / 'output/project-access-verification'
checkpoint = root / 'output/emulator-checkpoints/v0.25-verified-20261012'
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))

if '--default-copy' in sys.argv:
    default = root / '.emulator-data'
    assert default.resolve().parent == root.resolve()
    expected = {p.relative_to(checkpoint): p for p in checkpoint.rglob('*') if p.is_file()}
    actual = {p.relative_to(default): p for p in default.rglob('*') if p.is_file()}
    assert actual.keys() == expected.keys()
    for key, p in expected.items():
        assert hashlib.sha256(p.read_bytes()).digest() == hashlib.sha256(actual[key].read_bytes()).digest(), str(key)
    result = {'status': 'PASS', 'filesCompared': len(expected), 'allFileSha256Match': True,
              'checkpoint': str(checkpoint), 'default': str(default),
              'scope': 'Exact exported files copied into the default import folder; not production recovery acceptance.'}
    (out / 'default-copy-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('PASS default copy:', len(expected), 'SHA256-matching files')
else:
    assert checkpoint.resolve().parent == (root / 'output/emulator-checkpoints').resolve()
    meta = read(checkpoint / 'firebase-export-metadata.json')
    counts = {k: sum(p.is_file() for p in (checkpoint / meta[k]['path']).rglob('*')) for k in ['auth', 'firestore', 'storage']}
    folder = checkpoint / meta['storage']['path']
    hashes = {}
    for p in (folder / 'metadata').glob('*.json'):
        j = read(p)
        data = (folder / 'blobs' / p.stem).read_bytes()
        assert len(data) == int(j['size'])
        assert base64.b64encode(hashlib.md5(data).digest()).decode() == j['md5Hash']
        assert j['name'] not in hashes
        hashes[j['name']] = hashlib.sha256(data).hexdigest()
    old = root / 'output/emulator-checkpoints/v0.24-verified-20261012'
    prior = read(old / 'firebase-export-metadata.json')
    old_folder = old / prior['storage']['path']
    old_blobs = list((old_folder / 'metadata').glob('*.json'))
    assert len(old_blobs) == 3442
    for p in old_blobs:
        j = read(p)
        assert hashes[j['name']] == hashlib.sha256((old_folder / 'blobs' / p.stem).read_bytes()).hexdigest(), j['name']
    result = {'status': 'PASS', 'path': str(checkpoint), 'fileCounts': counts,
              'verifiedStorageBlobs': len(hashes), 'allBlobSizeAndMd5Match': True,
              'previousV24BlobBytesPreserved': len(old_blobs),
              'scope': 'Canonical Storage object-name/byte parity with v0.24. New Auth/Firestore records are not whole-database parity or production disaster recovery acceptance.'}
    (out / 'checkpoint-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('PASS checkpoint:', counts, len(hashes), 'verified blobs;', len(old_blobs), 'previous unchanged')
