'use strict';
if (window.__RTS_DEBUG__) {
  window.__RTS_DEBUG__.batteryCohesion = function batteryCohesion(id) {
    const reg = regiments.find(r => r.id === id && !r.destroyed && groupKindV06(r) === 'artillery');
    if (!reg) return null;
    const cannon = artilleryForGroupV06(reg);
    const crew = artilleryCrewV06(reg);
    if (!cannon || crew.length < 2) return null;
    const facing = cannon.facing || reg.facing || 0;
    const cos = Math.cos(-facing), sin = Math.sin(-facing);
    const toLocal = member => {
      const dx = member.x - cannon.x, dy = member.y - cannon.y;
      return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    };
    return {
      moving: !!cannon.batteryMovingV061,
      cannon: { id: cannon.id, x: cannon.x, y: cannon.y },
      crew: crew.slice(0, 2).map(member => ({ id: member.id, x: member.x, y: member.y, local: toLocal(member) })),
      crewSpread: Math.hypot(crew[0].x - crew[1].x, crew[0].y - crew[1].y)
    };
  };
}
