const {expect}=require('@playwright/test');
async function readyPlayers(...pages){
  await Promise.all(pages.map(p=>expect(p.locator('#onlineReady')).toBeEnabled({timeout:30000})));
  for(const p of pages)await p.click('#onlineReady');
}
module.exports={readyPlayers};
