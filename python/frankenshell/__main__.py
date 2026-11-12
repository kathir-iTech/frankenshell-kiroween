import argparse, hashlib, json, sys
from pathlib import Path
from .runner import run_pack

def main():
    parser=argparse.ArgumentParser(description='Verify reviewed, trusted FrankenShell Python case packs. This executes Python; it is not a sandbox.')
    parser.add_argument('command',choices=['run','compare','verify'])
    parser.add_argument('path',type=Path)
    args=parser.parse_args()
    if args.command=='verify':
        bundle=json.loads(args.path.read_text(encoding='utf-8'))
        for artifact in bundle['artifacts']:
            actual=hashlib.sha256(artifact['content'].encode('utf-8')).hexdigest()
            if actual!=artifact['sha256']:raise ValueError('Artifact hash mismatch: '+artifact['name'])
        artifacts={a['name']:a['content'] for a in bundle['artifacts']}
        pack=json.loads(artifacts['case.json']);data=json.loads(artifacts['input.json'])
        previous=json.loads(artifacts['report.json'])
        report=run_pack(pack,data,list(previous['results']))
        for variant,result in report['results'].items():
            old=previous['results'][variant]
            for key in ['output','error','checks','passed']:
                if result[key]!=old[key]:raise ValueError('Reproduction mismatch: '+variant+'/'+key)
        print(json.dumps({'integrity':'matches supplied manifest','reproduction':'passed','report':report},indent=2));return
    path=args.path/'case.json' if args.path.is_dir() else args.path
    pack=json.loads(path.read_text(encoding='utf-8'))
    print(json.dumps(run_pack(pack,pack['input'],['original'] if args.command=='run' else None),indent=2))

if __name__=='__main__':
    try:main()
    except Exception as exc:print(str(exc),file=sys.stderr);sys.exit(1)
