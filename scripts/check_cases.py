"""Hook check: corrected cases must pass; known shortcut regressions must fail."""
from pathlib import Path
import json,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'python'))
from frankenshell.runner import run_pack
root=Path(__file__).resolve().parents[1]
records=[]
for path in sorted((root/'cases').glob('*/case.json')):
    pack=json.loads(path.read_text(encoding='utf-8'));report=run_pack(pack,pack['input'])
    ok=report['verifiedCandidates']==['corrected'] and not report['results']['shortcut']['passed']
    records.append({'case':pack['id'],'correctedPassed':report['results']['corrected']['passed'],'shortcutRejected':not report['results']['shortcut']['passed'],'ok':ok})
print(json.dumps({'hook':'frankenshell-regression-check','cases':records}))
if not all(r['ok'] for r in records):sys.exit(1)
