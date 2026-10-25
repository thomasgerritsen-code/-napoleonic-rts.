'use strict';
// Wall-clock budget for one room. Work is bounded to 250 ms per dispatch,
// while brief IPC/scheduler delays remain owed until actually simulated.
// Cold marching orders can briefly queue several seconds of real work. Keep
// at most four seconds, still dispatching only 250 ms; pause drops the debt.
function createClock(now){
  let anchor=now;
  return {
    reset(now){anchor=now;},
    take(now){
      anchor=Math.max(anchor,now-4000);
      const seconds=Math.min(.25,Math.max(0,(now-anchor)/1000));
      anchor+=seconds*1000;return seconds;
    }
  };
}
module.exports={createClock};
