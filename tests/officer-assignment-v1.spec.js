const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:90000});
async function open(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?test=officer-matching&view=iso');
 await page.waitForFunction(()=>window.__OFFICER_ASSIGNMENT_V1__&&window.__TROOPS_V1__&&window.__QUICK_REGIMENT_V1__&&window.__ISO_VIEW_V1__.stats().assets.ready);
 return errors;
}
test('infantry accepts only foot officers and cavalry only mounted officers on both sides',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(()=>{
  const out=[];
  for(const side of ['france','britain']){
   const mk=(type,x)=>createUnit(side,type,x,1600);
   const foot=mk('officer',4000),mounted=mk('officer',4030);window.__TROOPS_V1__.applyTroop(mounted,'mounted');
   const inf=Array.from({length:12},(_,i)=>mk('infantry',4100+i*18)),drum=mk('drummer',4080);
   const badInf=createRegiment(side,[...inf,mounted,drum]);
   const untouched=inf.every(u=>!u.regimentId)&&!mounted.regimentId;
   const goodInf=createRegiment(side,[...inf,mounted,foot,drum]);
   const cav=Array.from({length:4},(_,i)=>mk('cavalry',4500+i*30)),wrong=mk('officer',4480);
   const badCav=createCavalryRegimentV06(side,[...cav,wrong]);
   const goodCav=createCavalryRegimentV06(side,[...cav,wrong,mounted]);
   out.push({badInf:badInf===null,badCav:badCav===null,untouched,foot:goodInf?.officerId===foot.id,mounted:goodCav?.officerId===mounted.id,unusedFoot:!wrong.regimentId});
  }
  return out;
 });
 for(const r of result)expect(r).toEqual({badInf:true,badCav:true,untouched:true,foot:true,mounted:true,unusedFoot:true});
 expect(errors).toEqual([]);
});
test('selection shows cavalry creation only with the correct officer, including same-type selection changes',async({page})=>{
 const errors=await open(page);
 await page.evaluate(()=>{
  const cav=Array.from({length:4},(_,i)=>createUnit('france','cavalry',4000+i*30,1800));
  const foot=createUnit('france','officer',3980,1800),horse=createUnit('france','officer',3980,1830);window.__TROOPS_V1__.applyTroop(horse,'mounted');
  window.__officerTest={cav,foot,horse};selectedBuilding=null;selectedUnits.clear();[...cav,foot].forEach(u=>selectedUnits.add(u));updateHud(true);
 });
 await expect(page.locator('[data-action="create-cavalry-regiment"]')).toBeDisabled();
 await page.evaluate(()=>{selectedUnits.delete(__officerTest.foot);selectedUnits.add(__officerTest.horse);updateHud();});
 await expect(page.locator('[data-action="create-cavalry-regiment"]')).toBeEnabled();
 await page.locator('[data-action="create-cavalry-regiment"]').click();
 expect(await page.evaluate(()=>{const g=selectedRegiments()[0];return g?.kind==='cavalry'&&g.officerId===__officerTest.horse.id&&!__officerTest.foot.regimentId;})).toBe(true);
 expect(errors).toEqual([]);
});
test('quick and officer-led infantry formation never takes a mounted officer',async({page})=>{
 const errors=await open(page);
 const r=await page.evaluate(()=>{
  const inf=Array.from({length:12},(_,i)=>createUnit('france','infantry',4000+i*18,1800));
  const horse=createUnit('france','officer',4000,1810);window.__TROOPS_V1__.applyTroop(horse,'mounted');
  const drum=createUnit('france','drummer',4000,1820),foot=createUnit('france','officer',4050,1820);
  const plan=window.__QUICK_REGIMENT_V1__.plan('france',{x:4000,y:1800},[...inf,horse,drum],300);
  selectedUnits.clear();selectedUnits.add(horse);const draft=window.__OFFICER_REGIMENT_MOBILE_V1__.draft();
  foot.dead=true;const missing=window.__QUICK_REGIMENT_V1__.plan('france',{x:4000,y:1800},[...inf,horse,drum],300);
  return{right:plan.officer===foot,noMountedDraft:draft===null,missing:missing.missing.officer};
 });expect(r).toEqual({right:true,noMountedDraft:true,missing:1});expect(errors).toEqual([]);
});
test('an existing cavalry regiment accepts a replacement mounted officer while retaining its orders',async({page})=>{
 const errors=await open(page);
 await page.evaluate(()=>{
  const cav=Array.from({length:4},(_,i)=>createUnit('france','cavalry',4000+i*30,1800));
  const old=createUnit('france','officer',3980,1800),replacement=createUnit('france','officer',3980,1830),foot=createUnit('france','officer',3980,1860);
  for(const u of [old,replacement])window.__TROOPS_V1__.applyTroop(u,'mounted');
  const reg=createCavalryRegimentV06('france',[...cav,old]);reg.path=[{x:5000,y:2000}];
  window.__assignTest={reg,old,replacement,foot,path:reg.path};selectWholeRegiment(reg);selectedUnits.add(foot);updateHud(true);
 });
 await expect(page.locator('[data-action="assign-officer"]')).toBeDisabled();
 expect(await page.evaluate(()=>window.__OFFICER_ASSIGNMENT_V1__.assign())).toBe(false);
 await page.evaluate(()=>{selectedUnits.delete(__assignTest.foot);selectedUnits.add(__assignTest.replacement);updateHud(true);});
 await expect(page.locator('[data-action="assign-officer"]')).toBeEnabled();
 await page.locator('[data-action="assign-officer"]').click();
 const r=await page.evaluate(()=>{const t=__assignTest;return{right:t.reg.officerId===t.replacement.id,newAssigned:t.replacement.regimentId===t.reg.id,oldLoose:!t.old.regimentId,oldRemoved:!t.reg.memberIds.includes(t.old.id),orders:t.reg.path===t.path,unique:new Set(t.reg.memberIds).size===t.reg.memberIds.length};});
 expect(r).toEqual({right:true,newAssigned:true,oldLoose:true,oldRemoved:true,orders:true,unique:true});expect(errors).toEqual([]);
});
test('British cavalry recruits exactly one mounted officer at the stable and then forms its regiment',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(()=>{
  for(const unit of units)if(unit.side==='britain'&&['officer','cavalry'].includes(unit.type))unit.dead=true;
  for(const b of buildings)if(b.side==='britain')b.queue=[];
  const home=buildings.find(b=>!b.dead&&b.side==='britain'&&b.type==='towncenter');
  const stable=createBuilding('britain','stable',home.x-160,home.y+200,true);
  economies.britain.food=economies.britain.wood=10000;economies.britain.popCap=1000;
  for(let i=0;i<4;i++)createUnit('britain','cavalry',stable.x+100+i*28,stable.y);
  const cost=window.__TROOPS_V1__.costOf('mounted'),before={food:economies.britain.food,wood:economies.britain.wood};
  aiTryCavalryRegimentV06();aiTryCavalryRegimentV06();
  const queue=stable.queue.map(q=>({type:q.type,troop:q.troop}));
  const paid={food:before.food-economies.britain.food,wood:before.wood-economies.britain.wood};
  updateBuildings(TRAINING.officer.time*window.NRTS_CONFIG.troops.kinds.mounted.time+.1);
  const regiment=aiTryCavalryRegimentV06(),officer=regiment&&units.find(u=>u.id===regiment.officerId);
  return {queue,paid,cost:{food:cost.food||0,wood:cost.wood||0},formed:!!regiment,mounted:officer?.troop==='mounted'};
 });
 expect(result.queue).toEqual([{type:'officer',troop:'mounted'}]);expect(result.paid).toEqual(result.cost);
 expect(result.formed).toBe(true);expect(result.mounted).toBe(true);expect(errors).toEqual([]);
});
