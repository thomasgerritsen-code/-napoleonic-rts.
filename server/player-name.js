'use strict';
function playerName(value,side){
  if(typeof value!=='string')return side==='france'?'Speler 1':'Speler 2';
  const clean=value.slice(0,128).normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
  return Array.from(clean).slice(0,24).join('')||(side==='france'?'Speler 1':'Speler 2');
}
module.exports={playerName};
