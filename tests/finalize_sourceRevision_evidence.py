from pathlib import Path
import json,hashlib,shutil
root=Path(__file__).resolve().parents[1];out=root/'output/source-revision-verification'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
p=out/'pdf-verification.json';j=read(p)
assert all(r['status']=='PASS' for r in j['results']) and sum(r['pages'] for r in j['results'])==24
j['visualReview']='PASS: agent inspected all three primary A3 pages at full size, unique B A3/A1 and C A3 contact layouts, combined Plan/Section and checker UI, and restored 390px mobile screenshot; remaining duplicate pages are text/pixel identical.'
j['popplerWarning']='Symbol display-font warning occurred on six PDF renders; inspected used source content and labels render correctly in these fixtures. No arbitrary-font or arbitrary-PDF claim.'
p.write_text(json.dumps(j,indent=2),encoding='utf-8')
primary=root/'output/pdf/source-revision-B-mark-review-draft.pdf';shutil.copyfile(out/'downloads/frozen-source-B-A3.pdf',primary)
package=read(root/'package.json');lock=read(root/'package-lock.json');fpackage=read(root/'functions/package.json');flock=read(root/'functions/package-lock.json')
assert package['version']==lock['version']==lock['packages']['']['version']=='0.17.0'
assert fpackage['dependencies']['pdf-lib']==flock['packages']['']['dependencies']['pdf-lib']=='1.17.1'
assert flock['packages']['node_modules/pdf-lib']['version']==lock['packages']['node_modules/pdf-lib']['version']=='1.17.1'
for stem in ['root','functions']:
 assert 'up to date' in (out/(stem+'-dependency-dry-run.log')).read_text(encoding='utf-8-sig')
result={'status':'PASS','rootVersion':package['version'],'rootAndFunctionsOfflineDryRunExitCode':0,'functionsNewDependency':'pdf-lib 1.17.1 / five dependency packages for verified PDF page count','cache':'tmp/npm-cache','productionNode22':'NOT TESTED; local Node24.18/24.19, functions EBADENGINE warning retained','primaryPdf':str(primary),'primarySha256':hashlib.sha256(primary.read_bytes()).hexdigest()}
(out/'lockfile-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('PASS primary PDF and dependency/visual evidence saved',result['primarySha256'])
