'use strict';
(function expose(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.NRTS_TERRITORY_PLACEMENT=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  // Solve once per new battle. The bisector gives each army equal geographic
  // access; map-sized bands create separate fronts instead of one small cluster.
  function place({homes,world,sites,radius=160,minSeparation=1700,searchRadius=240,isOpen,roadDistance=()=>0}){
    const[a,b]=homes,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(!len)throw Error('Hoofdkwartieren moeten uit elkaar liggen');
    const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    let axis={x:-dy/len,y:dx/len};if(axis.y<0||(axis.y===0&&axis.x<0))axis={x:-axis.x,y:-axis.y};
    const margin=radius+180;let low=-Infinity,high=Infinity;
    for(const key of['x','y']){
      const size=key==='x'?world.width:world.height;
      if(Math.abs(axis[key])<1e-9){if(mid[key]<margin||mid[key]>size-margin)throw Error('Geen ruimte voor bevoorradingsposten');continue;}
      const ends=[(margin-mid[key])/axis[key],(size-margin-mid[key])/axis[key]].sort((x,y)=>x-y);
      low=Math.max(low,ends[0]);high=Math.min(high,ends[1]);
    }
    if(!(high>low))throw Error('Geen ruimte voor bevoorradingsposten');
    const inset=(high-low)*.07,start=low+inset,end=high-inset;
    const gap=sites.length>1?(end-start)/(sites.length-1):0;
    if(sites.length>1&&gap<minSeparation)throw Error('Slagveld te klein voor gescheiden fronten');
    const band=sites.length>1?Math.min(searchRadius,(gap-minSeparation)/2):searchRadius;
    return sites.map((site,index)=>{
      const target=sites.length>1?start+gap*index:(low+high)/2;let best=null;
      const count=Math.floor(band/12);
      for(let i=-count;i<=count;i++){
        const t=target+i*12,p={x:mid.x+axis.x*t,y:mid.y+axis.y*t};
        if(!isOpen(p))continue;
        const score=Math.abs(t-target)*.35+roadDistance(p);
        if(!best||score<best.score)best={...p,score};
      }
      if(!best)throw Error('Geen veilig terrein voor '+site.label);
      return{...site,x:best.x,y:best.y};
    });
  }
  return Object.freeze({place});
});
