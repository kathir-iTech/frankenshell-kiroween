"""Execute reviewed source and evaluate independent behavioral contracts.
Local use executes trusted Python. This module is not an OS sandbox.
"""
import copy
import io
import json
import re
import traceback
from contextlib import redirect_stdout, redirect_stderr

class BoundedOutput(io.StringIO):
    def write(self, value):
        if self.tell() + len(value) > 65536:
            raise ValueError("Program output exceeded 64 KiB")
        return super().write(value)

def validate_input(case_id, data):
    if len(json.dumps(data).encode()) > 65536:
        raise ValueError("Input exceeds 64 KiB")
    if not isinstance(data,list) or not 1 <= len(data) <= 100:
        raise ValueError("Provide between 1 and 100 records")
    if case_id == 'vanishing-order':
        ids=[]
        for r in data:
            if not isinstance(r,dict) or set(r) != {'id','quantity','unit_cents'}:
                raise ValueError('Each order needs id, quantity, unit_cents')
            if not isinstance(r['id'],str) or not 1<=len(r['id'])<=80 or r['id'] in ids:
                raise ValueError('Order identifiers must be nonempty and unique')
            ids.append(r['id'])
            if not isinstance(r['quantity'],str) or not re.fullmatch(r'[0-9]{0,6}',r['quantity']):
                raise ValueError('Quantity must be blank or up to six decimal digits')
            if type(r['unit_cents']) is not int or not 0<=r['unit_cents']<=1000000:
                raise ValueError('unit_cents must be an integer between 0 and 1000000')
    elif case_id == 'haunted-cache':
        for r in data:
            if not isinstance(r,dict) or set(r)!={'key','multiplier'} or not isinstance(r['key'],str) or not 1<=len(r['key'])<=80 or type(r['multiplier']) is not int or not 0<=r['multiplier']<=1000:
                raise ValueError('Each request needs a key (1–80 characters) and an integer multiplier (0–1000)')
    else:
        raise ValueError('Unsupported case contract')

def check_contract(case_id, before, after, output, error):
    checks=[]
    def check(id,label,passed,expected,actual):
        checks.append({'id':id,'label':label,'status':'passed' if passed else 'failed','expected':expected,'actual':actual})
    check('completes','Program completes',error is None,'No exception',error)
    check('input','Input remains unchanged',before==after,before,after)
    if case_id=='vanishing-order':
        expected_ids=[r['id'] for r in before]
        actual_ids=[r.get('id') if isinstance(r,dict) else None for r in output] if isinstance(output,list) else None
        check('records','Every order survives in the same order',actual_ids==expected_ids,expected_ids,actual_ids)
        # Independent oracle: explicit loop and default assignment, no candidate imports.
        expected=[]
        for row in before:
            count=1
            if row['quantity']!='':count=int(row['quantity'])
            expected.append({'id':row['id'],'total_cents':count*row['unit_cents']})
        check('values','Blank means one; zero stays zero',output==expected,expected,output)
        total=sum(r['total_cents'] for r in expected)
        actual_total=sum(r.get('total_cents',0) for r in output if isinstance(r,dict) and type(r.get('total_cents')) is int) if isinstance(output,list) else None
        check('total','Aggregate matches the contract',actual_total==total,total,actual_total)
    else:
        expected_values=[];seen=set()
        for r in before:
            expected_values.append(len(r['key'])*r['multiplier']);seen.add((r['key'],r['multiplier']))
        values=output.get('values') if isinstance(output,dict) else None
        calls=output.get('calls') if isinstance(output,dict) else None
        check('values','Values reflect each configuration',values==expected_values,expected_values,values)
        check('reuse','Identical requests reuse a result',type(calls) is int and calls==len(seen),len(seen),calls)
    return checks

def execute_variant(case_id,source,data):
    before=copy.deepcopy(data);working=copy.deepcopy(data);output=None;error=None;trace=None
    captured=BoundedOutput()
    try:
        namespace={'__name__':'__frankenshell_case__'}
        with redirect_stdout(captured),redirect_stderr(captured):
            exec(compile(source,'case.py','exec'),namespace)
            output=namespace['transform'](working)
        if len(json.dumps(output,allow_nan=False).encode())>65536:raise ValueError('Result exceeds 64 KiB')
    except Exception as exc:
        error={'type':type(exc).__name__,'message':str(exc)}
        trace=traceback.format_exc(limit=8)
    checks=check_contract(case_id,before,working,output,error)
    return {'output':output,'error':error,'traceback':trace,'stdout':captured.getvalue(),'checks':checks,'passed':all(c['status']=='passed' for c in checks),'counterexample':next((c for c in checks if c['status']=='failed'),None)}

def run_pack(pack,data,variants=None):
    if pack.get('schemaVersion')!=1:raise ValueError('Unsupported case schema')
    contract_id=pack.get('contractId',pack['id'])
    validate_input(contract_id,data)
    selected=variants if variants is not None else ['original','shortcut','corrected']
    if not selected or any(v not in {'original','shortcut','corrected'} for v in selected):raise ValueError('Unknown candidate')
    results={v:execute_variant(contract_id,pack['sources'][v],data) for v in selected}
    original=results.get('original')
    reproduced=original is not None and not original['passed']
    return {'schemaVersion':1,'caseId':pack['id'],'input':data,'candidateOrigin':'prepared','executionOrigin':'executed_now','failureReproduced':reproduced,'results':results,'verifiedCandidates':[v for v,r in results.items() if v!='original' and r['passed'] and reproduced]}


def find_counterexample(pack, data):
    """Search contract-specific mutations, then remove unnecessary rows."""
    contract = pack.get("contractId", pack["id"])
    validate_input(contract, data)
    checked = 0

    def fails(rows):
        nonlocal checked
        checked += 1
        result = execute_variant(contract, pack["sources"]["shortcut"], rows)
        return not result["passed"] and result["error"] is None

    def variations():
        yield data
        for index, row in enumerate(data):
            if contract == "vanishing-order":
                for quantity in ("", "0", "1"):
                    if quantity != row["quantity"]:
                        yield data[:index] + [{**row, "quantity": quantity}] + data[index + 1:]
            else:
                # A repeated request exposes the shortcut's loss of reuse.
                if len(data) < 100:
                    yield data + [row]

    witness = next((rows for rows in variations() if fails(rows)), None)
    if witness is None:
        raise ValueError(f"No counterexample found in {checked} inputs")

    # Restart the pass after a successful deletion. A fixed budget keeps the UI responsive.
    while len(witness) > 1 and checked < 384:
        for index in range(len(witness)):
            smaller = witness[:index] + witness[index + 1:]
            if fails(smaller):
                witness = smaller
                break
            if checked >= 384:
                break
        else:
            break
    report = run_pack(pack, witness)
    report["search"] = {"inputsChecked": checked, "startingRows": len(data), "witnessRows": len(witness)}
    return report
