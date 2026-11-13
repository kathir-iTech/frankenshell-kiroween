import asyncio,sys,json
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
 root=Path(__file__).resolve().parents[1]
 params=StdioServerParameters(command=sys.executable,args=[str(root/'scripts/mcp_stdio.py')],cwd=str(root))
 async with stdio_client(params) as (read,write):
  async with ClientSession(read,write) as session:
   await session.initialize()
   tools=await session.list_tools();assert {t.name for t in tools.tools}=={'list_cases','run_case','get_incident','get_benchmark'}
   result=await session.call_tool('run_case',{'case_id':'vanishing-order'})
   assert not result.isError
   data=json.loads(result.content[0].text);assert data['verifiedCandidates']==['corrected']
   invalid=await session.call_tool('run_case',{'case_id':'../../outside'})
   assert invalid.isError
   benchmark=await session.call_tool('get_benchmark',{'case_id':'quantiles'})
   assert not benchmark.isError
   evidence=json.loads(benchmark.content[0].text)
   assert evidence['execution_origin']=='recorded_run'
   assert evidence['regression']['verification']=={'before':False,'alternative':False,'reference':True}
   print('MCP stdio initialization, tool listing, actual execution and invalid-case rejection passed.')
asyncio.run(main())
