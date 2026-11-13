import {chromium} from '@playwright/test';
const browser=await chromium.launch(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.argv[2]??'http://127.0.0.1:4173');
 await page.getByRole('navigation',{name:'Project'}).getByRole('link',{name:'CPython cases'}).click();
 await page.getByRole('heading',{name:'A fix that only works for quartiles'}).waitFor();
 const alternative=page.getByRole('row').filter({hasText:'Controlled alternative'});
 await alternative.getByText('5/5 pass',{exact:true}).waitFor();
 await alternative.getByText('Fails',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Run in Python',exact:true}).click();
 await page.getByRole('status').filter({hasText:'EXECUTED IN THIS BROWSER'}).waitFor({timeout:130000});
 await alternative.getByText('[7,7,7]',{exact:true}).waitFor();
 const official=page.getByRole('row').filter({hasText:'Official fix'});
 await official.getByText('[7]',{exact:true}).waitFor();
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download regression test',exact:true}).click();
 if((await download).suggestedFilename()!=='test_quantiles_regression.py')throw Error('Unexpected download');
 await page.evaluate(()=>window.scrollTo(0,0));
 const output=process.argv[3]??'evidence/production-preview.png';
 await page.screenshot({path:output,fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({productionExecution:'passed',consoleErrors:errors,screenshot:output}));
}finally{await browser.close();}
