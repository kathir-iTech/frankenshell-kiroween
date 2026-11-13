from pathlib import Path
import json, shutil
root=Path(__file__).resolve().parents[1]
public=root/'apps/web/public';public.mkdir(parents=True,exist_ok=True)
cases=[json.loads(p.read_text(encoding='utf-8')) for p in sorted((root/'cases').glob('*/case.json'))]
cases.sort(key=lambda c: 0 if c['id']=='vanishing-order' else 1)
(public/'cases.json').write_text(json.dumps(cases),encoding='utf-8')
shutil.copyfile(root/'python/frankenshell/runner.py',public/'runner.py')
shutil.copyfile(root/'evidence/benchmarks.json',public/'benchmarks.json')
shutil.copytree(root/'evidence/browser-sources',public/'benchmark-sources',dirs_exist_ok=True)
shutil.copytree(root/'docs/licenses/cpython',public/'licenses',dirs_exist_ok=True)
runtime=public/'runtime';runtime.mkdir(exist_ok=True)
for name in ['pyodide.mjs','pyodide.asm.mjs','pyodide.asm.wasm','python_stdlib.zip','pyodide-lock.json']:
    shutil.copyfile(root/'node_modules/pyodide'/name,runtime/name)
shutil.copyfile(root/'docs/licenses/PYODIDE-LICENSE',runtime/'PYODIDE-LICENSE')
shutil.copyfile(root/'docs/third-party-notices.md',public/'THIRD_PARTY_NOTICES.txt')
print('Prepared reviewed case packs, shared Python runner, and pinned Pyodide runtime.')
