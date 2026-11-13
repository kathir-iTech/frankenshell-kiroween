"""Read and run bundled, reviewed cases. No arbitrary source/path/shell tool."""
from pathlib import Path
import json
from mcp.server.fastmcp import FastMCP
from .runner import run_pack

ROOT=Path(__file__).resolve().parents[2]
server=FastMCP('frankenshell')
REPORTS={}

def load(case_id):
    if case_id not in {'vanishing-order','haunted-cache'}:
        raise ValueError('Unknown bundled case')
    return json.loads((ROOT/'cases'/case_id/'case.json').read_text(encoding='utf-8'))

@server.tool()
def list_cases() -> list[dict]:
    """List reviewed Python failure/repair experiments."""
    return [{'id':i,'title':load(i)['title'],'contract':load(i)['contract']} for i in ['vanishing-order','haunted-cache']]

@server.tool()
def run_case(case_id: str) -> dict:
    """Execute the bundled original and both candidates with independent checks."""
    pack=load(case_id)
    report=run_pack(pack,pack['input']);REPORTS[case_id]=report
    return report

@server.tool()
def get_incident(case_id: str) -> dict:
    """Get real recorded results from a previous run in this server session."""
    load(case_id)
    if case_id not in REPORTS:raise ValueError('Run this case first')
    return REPORTS[case_id]


@server.tool()
def get_benchmark(case_id: str) -> dict:
    """Read recorded CPython evidence for 'quantiles' or 'dedent', including the verified regression test."""
    if case_id not in {"quantiles", "dedent"}:
        raise ValueError("Unknown CPython benchmark")
    report = json.loads((ROOT / "evidence" / "benchmarks.json").read_text(encoding="utf-8"))
    case = next(item for item in report["cases"] if item["id"] == case_id)
    return {"execution_origin": "recorded_run", **case}


if __name__=='__main__':server.run(transport='stdio')
