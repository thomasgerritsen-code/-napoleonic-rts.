'use strict';
// Wall-clock budget for one room. Work is bounded to 250 ms per dispatch,
// while brief IPC/scheduler delays remain owed until actually simulated.
// Never accumulate more than one second; pause/resume resets the anchor.
function createClock(now){
  let anchor=now;
  return {
    reset(now){anchor=now;},
    take(now){
      anchor=Math.max(anchor,now-1000);
      const seconds=Math.min(.25,Math.max(0,(now-anchor)/1000));
      anchor+=seconds*1000;return seconds;
    }
  };
}
module.exports={createClock};
