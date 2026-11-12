import copy,json,random,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'python'))
from frankenshell.runner import run_pack,execute_variant,validate_input

def load(name):return json.loads((ROOT/'cases'/name/'case.json').read_text(encoding='utf-8'))

class LabTests(unittest.TestCase):
 def test_original_fails_and_shortcut_loses_record(self):
  p=load('vanishing-order');r=run_pack(p,p['input'])
  self.assertEqual(r['results']['original']['error']['type'],'ValueError')
  self.assertEqual([x['id'] for x in r['results']['shortcut']['output']],['A','C'])
  self.assertEqual(r['verifiedCandidates'],['corrected'])
  self.assertEqual(sum(x['total_cents'] for x in r['results']['corrected']['output']),550)
 def test_no_false_verification_without_reproduction(self):
  p=load('vanishing-order');data=[{'id':'A','quantity':'2','unit_cents':2}]
  r=run_pack(p,data);self.assertFalse(r['failureReproduced']);self.assertEqual(r['verifiedCandidates'],[])
 def test_cache_shortcut_breaks_reuse(self):
  p=load('haunted-cache');r=run_pack(p,p['input'])
  self.assertEqual(r['results']['original']['output']['values'],[8,8,8])
  self.assertEqual(r['results']['shortcut']['output']['values'],[8,12,12])
  self.assertEqual(r['results']['shortcut']['counterexample']['id'],'reuse')
  self.assertEqual(r['verifiedCandidates'],['corrected'])
 def test_generated_order_contracts(self):
  p=load('vanishing-order');rng=random.Random(26)
  for trial in range(60):
   data=[{'id':str(i),'quantity':rng.choice(['','0','1','2','17']),'unit_cents':rng.randrange(1000)} for i in range(rng.randrange(1,20))]
   before=copy.deepcopy(data)
   r=execute_variant(p['id'],p['sources']['corrected'],data)
   self.assertTrue(r['passed']);self.assertEqual(data,before)
   expected=sum((1 if row['quantity']=='' else int(row['quantity']))*row['unit_cents'] for row in data)
   self.assertEqual(sum(x['total_cents'] for x in r['output']),expected)
 def test_independent_oracle_detects_mutation(self):
  p=load('vanishing-order');source='def transform(rows):\n    rows.clear()\n    return []'
  r=execute_variant(p['id'],source,p['input']);self.assertFalse(r['passed']);self.assertEqual(r['checks'][1]['status'],'failed')
 def test_invalid_inputs(self):
  for data in [[],{},[{'id':'A','quantity':'-1','unit_cents':1}],[{'id':'A','quantity':'0','unit_cents':True}]]:
   with self.assertRaises(ValueError):validate_input('vanishing-order',data)
 def test_invalid_case_and_candidate(self):
  p=load('vanishing-order')
  with self.assertRaises(ValueError):run_pack(p,p['input'],['unknown'])
  with self.assertRaises(ValueError):validate_input('other',p['input'])
 def test_output_cap(self):
  p=load('vanishing-order');r=execute_variant(p['id'],"def transform(rows):\n    print('x'*70000)\n    return []",p['input'])
  self.assertEqual(r['error']['type'],'ValueError')
 def test_authored_pack_uses_shared_contract(self):
  p=load('vanishing-order');p['contractId']=p['id'];p['id']='my-order-tool'
  r=run_pack(p,p['input']);self.assertEqual(r['caseId'],'my-order-tool');self.assertEqual(r['verifiedCandidates'],['corrected'])
 def test_repeated_cache_runs_are_independent(self):
  p=load('haunted-cache');a=run_pack(p,p['input']);run_pack(p,[{'key':'other','multiplier':99}]);b=run_pack(p,p['input']);self.assertEqual(a,b)

if __name__=='__main__':unittest.main()
