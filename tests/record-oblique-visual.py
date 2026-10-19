from pathlib import Path
import json, hashlib

root = Path(__file__).resolve().parents[1]
out = root / 'output/oblique-shape-verification'
data = json.loads((out / 'pdf-verification.json').read_text(encoding='utf-8'))
names = {'A3': 'BS8666-2000-oblique-shapes-A3-draft.pdf',
         'A1': 'BS8666-2000-oblique-shapes-A1-draft.pdf',
         'A4': 'BS8666-2000-oblique-schedule-A4-draft.pdf'}
results = []
for item in data['results']:
    delivered = root / 'output/pdf' / names[item['size']]
    assert hashlib.sha256(delivered.read_bytes()).hexdigest() == item['sha256']
    renders = [out / 'pdf-render' / f"final-{item['size']}-{n}.png" for n in range(1, item['pages'] + 1)]
    assert all(p.is_file() for p in renders)
    results.append({'status': 'PASS', 'size': item['size'], 'pages': item['pages'],
                    'sha256': item['sha256'], 'delivered': str(delivered),
                    'visuallyInspectedPages': list(range(1, item['pages'] + 1)),
                    'inspectionMethod': 'All actual final Poppler page images opened at original resolution with view_image.',
                    'checks': ['frame/page references', 'dimensions/free dimension', 'both code46 B labels',
                               'local inside-radius leader and legibility', 'Note1 comparison/selected basis',
                               'schedule/cut quantities', 'appendix/source/footer fit', 'Draft caption']})
result = {'status': 'PASS', 'results': results, 'allFinalPagesVisuallyInspected': 22,
          'issuesCorrected': ['Initial long radius leader moved to local callout.',
                              'Code26 radius line crossing its label corrected with text background.'],
          'scope': 'Final actual synthetic Frozen app PDFs only. Intermediate and restored archived PDFs remain original. Not real-project engineering, owner layout approval or manufacturing acceptance.'}
(out / 'visual-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print('PASS final PDF delivery hashes and recorded manual visual inspection:22pages')
