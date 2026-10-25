'use strict';
// The start page loads no battlefield, renderer, sprites or network connection.
(function installStartMenu(){
  const params=new URLSearchParams(location.search);
  for(const [id,mode] of [['startSingleplayer','singleplayer'],['startMultiplayer','multiplayer']]){
    const link=document.getElementById(id),url=new URL('play.html',location.href);
    for(const key of ['gpu','hd'])if(params.has(key))url.searchParams.set(key,params.get(key));
    if(mode==='multiplayer'&&params.has('server'))url.searchParams.set('server',params.get('server'));
    url.searchParams.set('view','iso');url.searchParams.set('mode',mode);url.searchParams.set('v','147');
    link.href=url.href;
  }
})();
