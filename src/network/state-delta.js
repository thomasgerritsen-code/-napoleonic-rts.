'use strict';
(function expose(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.NRTS_STATE_DELTA=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function createStateDelta(){
const collections=['units','buildings','groups','resources'];
// Per-connection baselines. A reconnect always starts with a full view, so lost
// connections cannot apply deltas against an old or another player's baseline.
function indexCollections(view){
  const index={};
  for(const key of collections)index[key]=new Map(view.state[key].map(e=>[e.id,JSON.stringify(e)]));
  return index;
}
function difference(previous,next,view){
  const state={...view.state};
  for(const key of collections){
    const old=previous[key],current=next[key];
    state[key]={put:view.state[key].filter(e=>old.get(e.id)!==current.get(e.id)),remove:[...old.keys()].filter(id=>!current.has(id))};
  }
  return {type:'delta',view:{...view,state}};
}
function delta(previous,view){
  if(!previous)return {type:'snapshot',view};
  return difference(indexCollections(previous),indexCollections(view),view);
}
// One encoder per connection. Retain only the last serialized rows, so the
// next update never has to serialize its baseline again. A new connection or
// resume always starts with an independent full snapshot.
function createEncoder(){
  let previous=null;
  return {encode(view){
    const next=indexCollections(view);
    const message=previous?difference(previous,next,view):{type:'snapshot',view};
    previous=next;return message;
  }};
}
function merge(previous,message){
  if(message.type==='snapshot')return message.view;
  if(!previous||message.type!=='delta')throw Error('Missing snapshot baseline');
  const state={...message.view.state};
  for(const key of collections){const rows=new Map(previous.state[key].map(e=>[e.id,e]));for(const id of state[key].remove)rows.delete(id);for(const e of state[key].put)rows.set(e.id,e);state[key]=[...rows.values()];}
  return {...message.view,state};
}
return {delta,merge,createEncoder};
});
