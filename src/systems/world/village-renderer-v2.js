'use strict';
// ---------- Village renderer v2: strict orthographic roofs + lived-in farmyards ----------
(function installVillageRendererV2(global) {
  const nrts = global.NRTS;
  if (!nrts) throw new Error('NRTS foundation runtime must load before village rendering.');

  function hash01(seed) {
    let x = (seed >>> 0) || 1;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  }

  function seedFor(house, index) {
    return (house.yardSeed || (((Math.round(house.x) * 73856093) ^ (Math.round(house.y) * 19349663) ^ ((index + 1) * 83492791)) >>> 0));
  }

  const PALETTES = Object.freeze({
    cottage:['#8d5d43','#a06a4c','#704633'],
    farmhouse:['#7d503b','#936047','#633d30'],
    barn:['#5c493d','#6d5748','#46372f'],
    inn:['#955e40','#ad704c','#75452f'],
    chapel:['#5d5b57','#72706a','#474642']
  });

  function drawRoofRect(w, h, seed, kind, options = {}) {
    const palette = PALETTES[kind] || PALETTES.cottage;
    const [base, light, dark] = palette;
    const horizontal = w >= h;
    const ox = options.x || 0, oy = options.y || 0;
    const chimneyCount = options.chimneys ?? (kind === 'barn' || kind === 'chapel' ? 0 : 1);

    ctx.save();
    ctx.translate(ox, oy);

    // Only a small ground shadow is visible. There is no wall/facade layer at all.
    ctx.fillStyle = 'rgba(25,22,19,.24)';
    ctx.fillRect(-w/2 + 3.2, -h/2 + 3.8, w, h);

    ctx.fillStyle = base;
    ctx.fillRect(-w/2, -h/2, w, h);
    ctx.fillStyle = light;
    if (horizontal) ctx.fillRect(-w/2, -h/2, w, h/2);
    else ctx.fillRect(-w/2, -h/2, w/2, h);
    ctx.fillStyle = dark;
    if (horizontal) ctx.fillRect(-w/2, 0, w, h/2);
    else ctx.fillRect(0, -h/2, w/2, h);

    ctx.strokeStyle = 'rgba(48,32,25,.88)';
    ctx.lineWidth = Math.max(.75, 1.1 / camera.zoom);
    ctx.strokeRect(-w/2, -h/2, w, h);
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(-w*.44, 0); ctx.lineTo(w*.44, 0);
    } else {
      ctx.moveTo(0, -h*.44); ctx.lineTo(0, h*.44);
    }
    ctx.stroke();

    // Roof courses remain parallel in plan view so the roof reads clearly from the camera above.
    ctx.strokeStyle = kind === 'chapel' ? 'rgba(220,220,210,.10)' : 'rgba(240,206,164,.16)';
    ctx.lineWidth = Math.max(.4, .62 / camera.zoom);
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      ctx.beginPath();
      if (horizontal) {
        const y = -h/2 + h*t;
        ctx.moveTo(-w/2 + 2, y); ctx.lineTo(w/2 - 2, y);
      } else {
        const x = -w/2 + w*t;
        ctx.moveTo(x, -h/2 + 2); ctx.lineTo(x, h/2 - 2);
      }
      ctx.stroke();
    }

    for (let i = 0; i < chimneyCount; i++) {
      const t = chimneyCount === 1 ? .20 : (i ? .24 : -.24);
      const cx = horizontal ? w*t : (i ? 2 : -2);
      const cy = horizontal ? (i ? 2 : -2) : h*t;
      const s = Math.max(3, Math.min(5.2, Math.min(w,h)*.17));
      ctx.fillStyle = '#4f4035';
      ctx.fillRect(cx-s/2, cy-s/2, s, s);
      ctx.fillStyle = 'rgba(215,199,170,.34)';
      ctx.fillRect(cx-s*.25, cy-s*.25, s*.5, s*.5);
    }

    ctx.restore();
  }

  function yardGeometry(house, kind) {
    const multipliers = {
      cottage:[2.0,2.35],
      farmhouse:[2.15,2.65],
      barn:[1.8,2.0],
      inn:[2.0,2.15],
      chapel:[1.8,2.5]
    }[kind] || [2,2.3];
    return {w:house.w*multipliers[0], h:house.h*multipliers[1]};
  }

  function drawBoundary(yard, kind) {
    ctx.save();
    if (kind === 'chapel') {
      ctx.strokeStyle = 'rgba(114,107,91,.72)';
      ctx.lineWidth = Math.max(1.2, 2.1 / camera.zoom);
      ctx.setLineDash([]);
    } else if (kind === 'inn') {
      ctx.strokeStyle = 'rgba(83,72,51,.58)';
      ctx.lineWidth = Math.max(.8, 1.3 / camera.zoom);
      ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
    } else {
      ctx.strokeStyle = kind === 'barn' ? 'rgba(94,75,49,.70)' : 'rgba(57,82,45,.72)';
      ctx.lineWidth = Math.max(.8, 1.45 / camera.zoom);
      ctx.setLineDash(kind === 'barn' ? [5 / camera.zoom, 3 / camera.zoom] : []);
    }
    ctx.strokeRect(-yard.w/2, -yard.h/2, yard.w, yard.h);
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawGardenRows(x, y, w, h, seed) {
    ctx.fillStyle = 'rgba(88,72,45,.38)';
    ctx.fillRect(x-w/2, y-h/2, w, h);
    ctx.strokeStyle = 'rgba(52,83,41,.68)';
    ctx.lineWidth = Math.max(.55, .85 / camera.zoom);
    const rows = 4 + Math.floor(hash01(seed ^ 0x811) * 3);
    for (let i = 1; i <= rows; i++) {
      const ry = y-h/2 + i*h/(rows+1);
      ctx.beginPath();
      ctx.moveTo(x-w*.43, ry);
      ctx.lineTo(x+w*.43, ry);
      ctx.stroke();
    }
  }

  function drawOrchard(x, y, w, h, seed) {
    for (let i = 0; i < 5; i++) {
      const px = x + (hash01(seed ^ (0x901+i*19))-.5)*w*.82;
      const py = y + (hash01(seed ^ (0xa01+i*23))-.5)*h*.78;
      const r = 2.5 + hash01(seed ^ (0xb01+i*29))*2.1;
      ctx.fillStyle = 'rgba(37,69,37,.82)';
      ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(74,105,56,.55)';
      ctx.beginPath(); ctx.arc(px-1,py-1,r*.55,0,Math.PI*2); ctx.fill();
    }
  }

  function drawAccessPath(house, yard, roadDirection, kind) {
    const startY = roadDirection * (yard.h*.48);
    const endY = roadDirection * (house.h*.46);
    ctx.strokeStyle = kind === 'inn' ? 'rgba(186,165,123,.68)' : 'rgba(161,137,93,.55)';
    ctx.lineWidth = Math.max(kind === 'inn' ? 5 : 3, (kind === 'inn' ? 7 : 4.5) / camera.zoom);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0,startY);
    ctx.lineTo(0,endY);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function drawShed(x, y, w, h, seed) {
    drawRoofRect(w,h,seed,'barn',{x,y,chimneys:0});
  }

  function drawYard(house, index) {
    const kind = house.kind || 'cottage';
    const seed = seedFor(house,index);
    const yard = yardGeometry(house,kind);
    const roadDirection = house.side > 0 ? -1 : 1;
    const rearDirection = -roadDirection;

    ctx.fillStyle = kind === 'barn'
      ? 'rgba(126,103,69,.24)'
      : kind === 'inn'
        ? 'rgba(157,139,100,.20)'
        : 'rgba(98,123,71,.20)';
    ctx.fillRect(-yard.w/2,-yard.h/2,yard.w,yard.h);
    drawBoundary(yard,kind);
    drawAccessPath(house,yard,roadDirection,kind);

    if (kind === 'cottage') {
      drawGardenRows(-yard.w*.18,rearDirection*yard.h*.31,yard.w*.45,yard.h*.24,seed);
      if (hash01(seed ^ 0x111) > .45) drawShed(yard.w*.30,rearDirection*yard.h*.18,house.w*.28,house.h*.32,seed ^ 0x112);
    } else if (kind === 'farmhouse') {
      drawGardenRows(-yard.w*.22,rearDirection*yard.h*.30,yard.w*.42,yard.h*.25,seed);
      drawOrchard(yard.w*.26,rearDirection*yard.h*.29,yard.w*.32,yard.h*.28,seed);
      drawShed(yard.w*.31,rearDirection*yard.h*.03,house.w*.34,house.h*.40,seed ^ 0x221);
    } else if (kind === 'barn') {
      // Muddy working yard with hay/wood stacks.
      for (let i=0;i<3;i++) {
        const x=(hash01(seed^(0x310+i*17))-.5)*yard.w*.62;
        const y=(hash01(seed^(0x410+i*13))-.5)*yard.h*.58;
        const r=3+hash01(seed^(0x510+i*11))*2.5;
        ctx.fillStyle='rgba(174,143,73,.62)';
        ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='rgba(101,76,42,.55)';ctx.lineWidth=Math.max(.5,.8/camera.zoom);ctx.stroke();
      }
    } else if (kind === 'inn') {
      const fy=roadDirection*yard.h*.27;
      ctx.fillStyle='rgba(178,158,117,.27)';
      ctx.fillRect(-yard.w*.38,fy-yard.h*.14,yard.w*.76,yard.h*.28);
      drawShed(yard.w*.30,rearDirection*yard.h*.22,house.w*.36,house.h*.34,seed ^ 0x621);
      for(let i=0;i<3;i++){
        ctx.fillStyle='rgba(83,61,39,.76)';
        const bx=-yard.w*.23+i*yard.w*.13, by=fy+yard.h*.04;
        ctx.fillRect(bx-1.5,by-1.5,3,3);
      }
    } else if (kind === 'chapel') {
      // Tiny graveyard markers are rectangles from above, not upright headstones.
      ctx.fillStyle='rgba(120,119,105,.55)';
      for(let i=0;i<8;i++){
        const gx=(hash01(seed^(0x710+i*29))-.5)*yard.w*.68;
        const gy=rearDirection*(yard.h*.12+hash01(seed^(0x810+i*31))*yard.h*.27);
        ctx.save();ctx.translate(gx,gy);ctx.rotate((hash01(seed^(0x910+i*37))-.5)*.3);
        ctx.fillRect(-1.6,-3,3.2,6);ctx.restore();
      }
      drawOrchard(yard.w*.30,roadDirection*yard.h*.24,yard.w*.22,yard.h*.25,seed ^ 0xa11);
    }

    // Irregular shrubs soften the otherwise rectangular plots.
    for(let i=0;i<4;i++){
      const px=(hash01(seed^(0xb10+i*41))-.5)*yard.w*.86;
      const py=(hash01(seed^(0xc10+i*43))-.5)*yard.h*.84;
      if(Math.abs(px)<house.w*.55 && Math.abs(py)<house.h*.65) continue;
      const r=2+hash01(seed^(0xd10+i*47))*2.4;
      ctx.fillStyle='rgba(42,77,42,.78)';ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fill();
    }
  }

  function drawVillageRoof(house, index) {
    const kind = house.kind || 'cottage';
    const seed = seedFor(house,index);
    const rearDirection = house.side > 0 ? 1 : -1;

    if (kind === 'farmhouse') {
      drawRoofRect(house.w,house.h,seed,'farmhouse',{chimneys:2});
      drawRoofRect(house.w*.43,house.h*.78,seed^0x121,'farmhouse',{
        x:-house.w*.27,y:rearDirection*house.h*.53,chimneys:0
      });
    } else if (kind === 'inn') {
      drawRoofRect(house.w,house.h,seed,'inn',{chimneys:2});
      drawRoofRect(house.w*.46,house.h*.66,seed^0x231,'inn',{
        x:house.w*.20,y:rearDirection*house.h*.51,chimneys:1
      });
    } else if (kind === 'chapel') {
      drawRoofRect(house.w,house.h,seed,'chapel',{chimneys:0});
      drawRoofRect(house.w*.34,house.h*1.45,seed^0x341,'chapel',{chimneys:0});
      const s=Math.max(7,house.h*.34);
      ctx.fillStyle='#44433f';ctx.fillRect(-s/2,-s/2,s,s);
      ctx.fillStyle='rgba(198,194,179,.22)';ctx.fillRect(-s*.27,-s*.27,s*.54,s*.54);
    } else if (kind === 'barn') {
      drawRoofRect(house.w,house.h,seed,'barn',{chimneys:0});
      // Central longitudinal weather strip makes barns read differently at gameplay zoom.
      ctx.fillStyle='rgba(39,31,27,.30)';
      ctx.fillRect(-house.w*.34,-1.2,house.w*.68,2.4);
    } else {
      drawRoofRect(house.w,house.h,seed,'cottage',{chimneys:1});
    }
  }

  drawHouseV069 = function drawHouseVillageV2(house,index) {
    ctx.save();
    ctx.translate(house.x,house.y);
    ctx.rotate(house.angle);
    drawYard(house,index);
    drawVillageRoof(house,index);
    ctx.restore();
  };

  const api=Object.freeze({
    version:'village-renderer-v2',
    projection:'orthographic-top-down',
    visibleFacades:false,
    structureKinds:Object.freeze(['cottage','farmhouse','barn','inn','chapel']),
    yardDetails:true
  });
  nrts.subsystems.register('village-renderer-v2',api,{
    phase:'architecture-v2',
    legacyBridge:false,
    responsibility:'high-contrast roof-only settlement rendering, distinct building types and farmyard detail'
  });
  global.__VILLAGE_RENDERER_V2__=api;
})(window);
