'use strict';
const {chromium}=require('playwright');

// One hidden, non-rendering legacy simulation per room. No GPU or sprite assets
// are loaded here. This keeps the current movement/combat rules intact while
// they are gradually extracted into DOM-independent modules.
async function createSimulationHost({baseURL,executablePath=process.env.CHROMIUM_EXECUTABLE_PATH}={}) {
  let closing=false;
  const browser=await chromium.launch({headless:true,chromiumSandbox:process.env.CHROMIUM_NO_SANDBOX!=='1',...(executablePath?{executablePath}:process.env.CI_SYSTEM_CHROME==='1'?{channel:'chrome'}:{}),args:['--disable-gpu','--disable-dev-shm-usage',...(process.env.CHROMIUM_NO_SANDBOX==='1'?['--no-sandbox']:[])]});
  browser.on('disconnected',()=>{ if(!closing)console.error('Simulation browser disconnected'); });
  return {
    async create(){
      const context=await browser.newContext({viewport:{width:800,height:600}});
      await context.addInitScript(()=>{window.__NRTS_SERVER__=true;window.__NRTS_HUMAN_BRITAIN__=true;});
      await context.route('**/*',route=>{
        const url=new URL(route.request().url());
        return url.origin===new URL(baseURL).origin && !/\.(png|jpg|jpeg|webp|svg|mp3|ogg|wav|woff2?)(\?|$)/i.test(url.pathname)?route.continue():route.abort();
      });
      const page=await context.newPage();
      const bootErrors=[];
      page.on('pageerror',e=>{bootErrors.push(e.message);console.error('Simulation error:',e.message);});
      page.on('response',r=>{if(r.request().resourceType()==='script'&&!r.ok())bootErrors.push(`Script ${new URL(r.url()).pathname}: ${r.status()}`);});
      try {
        await page.goto(`${baseURL}/play.html?view=iso&test=net&gpu=off`,{waitUntil:'load',timeout:60000});
        await page.waitForFunction(()=>!!window.__ONLINE_SIM_V1__,null,{timeout:15000});
        if(bootErrors.length)throw Error(`Incomplete simulation boot: ${bootErrors.join('; ')}`);
        // Playwright's object bridge recursively wraps every snapshot property.
        // Use the same JSON representation as the network protocol, so its
        // native encoder carries one string across the browser/Node boundary.
        // Encode per-connection deltas before IPC as well. Unchanged map and
        // entity rows never need to cross this boundary or be parsed by Node.
        return {advance:async(commands,advance=true,snapshot=true,seconds=.05,epochs={france:1,britain:1})=>JSON.parse(await page.evaluate(({commands,advance,snapshot,seconds,epochs})=>JSON.stringify(window.__ONLINE_SIM_V1__.advanceTransport(commands,advance,snapshot,seconds,epochs)),{commands,advance,snapshot,seconds,epochs})),
          close:()=>context.close()};
      } catch(e){await context.close();throw e;}
    },
    healthy:()=>browser.isConnected(),
    close:()=>{closing=true;return browser.close();}
  };
}
module.exports={createSimulationHost};
