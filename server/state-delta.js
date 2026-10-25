'use strict';
const collections=['units','buildings','groups','resources'];
// Per-connection baselines. A reconnect always starts with a full view, so lost
// connections cannot apply deltas against an old or another player's baseline.
function delta(previous,view){
  if(!previous)return {type:'snapshot',view};
  const state={...view.state};
  for(const key of collections){
    const old=new Map(previous.state[key].map(e=>[e.id,JSON.stringify(e)]));
    const next=new Set(view.state[key].map(e=>e.id));
    state[key]={put:view.state[key].filter(e=>old.get(e.id)!==JSON.stringify(e)),remove:previous.state[key].filter(e=>!next.has(e.id)).map(e=>e.id)};
  }
  return {type:'delta',view:{...view,state}};
}
function merge(previous,message){
  if(message.type==='snapshot')return message.view;
  if(!previous||message.type!=='delta')throw Error('Missing snapshot baseline');
  const state={...message.view.state};
  for(const key of collections){const rows=new Map(previous.state[key].map(e=>[e.id,e]));for(const id of state[key].remove)rows.delete(id);for(const e of state[key].put)rows.set(e.id,e);state[key]=[...rows.values()];}
  return {...message.view,state};
}
module.exports={delta,merge};
