const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:90000});

for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:844,height:390}]){
  test(`start menu fits ${viewport.width}x${viewport.height} and does not load or run the battlefield`,async({browser})=>{
    const context=await browser.newContext({viewport,isMobile:viewport.width!==1440,hasTouch:viewport.width!==1440});
    try{
      const page=await context.newPage(),requests=[],sockets=[],errors=[];
      page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('websocket',ws=>sockets.push(ws.url()));page.on('pageerror',e=>errors.push(e.message));
      await page.goto('/?view=iso&v=146');
      await expect(page.locator('#startSingleplayer')).toBeVisible();await expect(page.locator('#startMultiplayer')).toBeVisible();
      await page.waitForTimeout(250);
      expect(await page.evaluate(()=>({simulation:!!window.RTS_SIM,canvas:!!document.querySelector('canvas'),overflow:document.documentElement.scrollWidth>innerWidth}))).toEqual({simulation:false,canvas:false,overflow:false});
      expect(requests.filter(p=>p.includes('graphics-lab/')||p==='/src/core.js'||p.includes('/rendering/'))).toEqual([]);expect(sockets).toEqual([]);expect(errors).toEqual([]);
      const a=await page.locator('#startSingleplayer').boundingBox(),b=await page.locator('#startMultiplayer').boundingBox();
      expect(a.height).toBeGreaterThanOrEqual(150);expect(b.height).toBeGreaterThanOrEqual(150);
      if(viewport.width===390)expect(b.y).toBeGreaterThanOrEqual(a.y+a.height);
      await page.screenshot({path:test.info().outputPath('start-menu.png')});
    }finally{await context.close();}
  });
}

test('singleplayer starts the live battle without a socket and can return to the start menu',async({page})=>{
  const sockets=[],errors=[];page.on('websocket',ws=>sockets.push(ws.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?view=iso&server=wss%3A%2F%2Fexample.invalid%2Fmultiplayer');
  await page.locator('#startSingleplayer').focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/play\.html\?.*mode=singleplayer/);
  expect(new URL(page.url()).searchParams.has('server')).toBe(false);
  await page.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().assets.ready);
  await expect.poll(()=>page.evaluate(()=>elapsed)).toBeGreaterThan(0);
  expect(sockets).toEqual([]);await page.getByRole('link',{name:'Hoofdmenu',exact:true}).click();
  await expect(page.locator('#startSingleplayer')).toBeVisible();expect(await page.locator('canvas').count()).toBe(0);expect(errors).toEqual([]);
});

test('multiplayer opens a frozen lobby and closing or escaping it returns to the start menu',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try{
    const page=await context.newPage(),sockets=[],errors=[];page.on('websocket',ws=>sockets.push(ws.url()));page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/?view=iso');await page.click('#startMultiplayer');
    await expect(page.locator('#onlineLobby')).toBeVisible();await page.waitForFunction(()=>window.__ISO_ASSETS_READY__===true);
    const before=await page.evaluate(()=>elapsed);await page.waitForTimeout(350);expect(await page.evaluate(()=>elapsed)).toBe(before);expect(before).toBe(0);expect(sockets).toEqual([]);
    await page.click('#onlineClose');await expect(page.locator('#startSingleplayer')).toBeVisible();
    await page.click('#startMultiplayer');await expect(page.locator('#onlineLobby')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#startSingleplayer')).toBeVisible();expect(errors).toEqual([]);
  }finally{await context.close();}
});
