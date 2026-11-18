// peds.js — pedestrian AI: Wander/Idle/Chat/Flee/Cower/Knocked, spatial hash 20 m.
// Pool 100, active 35-60 in 120 m bubble, recycle outside 180 m. 100 HP.
export const POOL=100,BUBBLE=120,RECYCLE=180,CELL=20;
export const OUTFITS=["#c94f4f","#4f7ac9","#e8c84f","#4fc98a","#9a6bc9","#e88a4f","#6bc9c9","#c94f9a","#8a8a7a","#4f4f6b"];
export const SHOT_PEDS={chase:[16,24],play:[24,32],mission:[10,16],depot:[12,20],roam:[35,60]};
export function createPeds(rng){return{rng,list:[],nextId:1,hash:new Map,events:[]}}
export function spawnPed(peds,x,z,district){
 const r=peds.rng;
 const p={id:peds.nextId++,x,z,heading:r()*6.283,speed:0,hp:100,
  state:"wander",timer:2+r()*4,walk:1.2+r()*0.4,outfit:OUTFITS[Math.floor(r()*OUTFITS.length)],
  pair:0,panic:0,district:district||"Palmera Row",dead:false};
 peds.list.push(p);return p}
export function spawnPedPair(peds,x,z,district){
 const a=spawnPed(peds,x,z,district),b=spawnPed(peds,x+1.2,z+0.5,district);
 a.state="chat";b.state="chat";a.pair=b.id;b.pair=a.id;a.timer=6+peds.rng()*8;b.timer=a.timer;
 return[a,b]}
function cellKey(x,z){return Math.floor(x/CELL)+","+Math.floor(z/CELL)}
export function rebuildHash(peds){
 peds.hash.clear();
 for(const p of peds.list){const k=cellKey(p.x,p.z);
  if(!peds.hash.has(k))peds.hash.set(k,[]);peds.hash.get(k).push(p)}}
export function queryNear(peds,x,z,radius){
 const out=[],c=Math.ceil(radius/CELL);
 for(let cx=Math.floor((x-radius)/CELL);cx<=Math.floor((x+radius)/CELL);cx++)
  for(let cz=Math.floor((z-radius)/CELL);cz<=Math.floor((z+radius)/CELL);cz++){
   const cell=peds.hash.get(cx+","+cz);if(!cell)continue;
   for(const p of cell){const dx=p.x-x,dz=p.z-z;if(dx*dx+dz*dz<=radius*radius)out.push(p)}}
 return out}
// threat: {x,z,radius,type:"gunfire"|"explosion"|"combat"|"vehicle",speed}
export function pedReact(peds,threat){
 const near=queryNear(peds,threat.x,threat.z,threat.radius||25);
 for(const p of near){
  if(p.dead)continue;
  const d=Math.sqrt((p.x-threat.x)*(p.x-threat.x)+(p.z-threat.z)*(p.z-threat.z));
  if(d<4&&threat.type!=="vehicle"){p.state="cower";p.timer=3+peds.rng()*2;p.speed=0}
  else{p.state="flee";p.timer=6+peds.rng()*4;p.panic=1;
   p.heading=Math.atan2(p.x-threat.x,p.z-threat.z)}}
 return near.length}
export function updatePeds(peds,player,dt,events){
 const d=dt||1/60,out=events||peds.events;
 rebuildHash(peds);
 for(let i=peds.list.length-1;i>=0;i--){
  const p=peds.list[i];
  if(p.dead)continue;
  const dx=p.x-player.x,dz=p.z-player.z;
  if(Math.sqrt(dx*dx+dz*dz)>RECYCLE){peds.list.splice(i,1);continue}
  p.timer-=d;
  if(p.state==="flee"){
   p.speed=4.5;
   if(p.timer<=0){p.state="wander";p.timer=2+peds.rng()*4}}
  else if(p.state==="cower"){p.speed=0;if(p.timer<=0){p.state="flee";p.timer=6}}
  else if(p.state==="knocked"){p.speed=0;if(p.timer<=0){p.state="flee";p.timer=6}}
  else if(p.state==="chat"){p.speed=0;if(p.timer<=0){p.state="wander";p.timer=2+peds.rng()*4}}
  else{ // wander: 1.2-1.6 m/s, pause 2-6 s
   if(p.timer<=0){if(p.speed>0){p.speed=0;p.timer=2+peds.rng()*4}
    else{p.speed=p.walk;p.heading=peds.rng()*6.283;p.timer=3+peds.rng()*5}}}
  p.x+=Math.sin(p.heading)*p.speed*d;p.z+=Math.cos(p.heading)*p.speed*d;
  // vehicle hit >5 m/s = knockdown/lethal
  if(player.inVehicle&&Math.abs(player.speed||0)>5){
   const pd=Math.sqrt((p.x-player.x)*(p.x-player.x)+(p.z-player.z)*(p.z-player.z));
   if(pd<1.8){knockPed(peds,p,player.speed>8);out.push({type:"pedHit",id:p.id,lethal:player.speed>8})}}
 }
 return peds.list.length}
export function knockPed(peds,p,lethal){
 if(lethal){p.hp=0;p.dead=true;p.state="knocked"}
 else{p.state="knocked";p.timer=2;p.hp=Math.max(0,p.hp-40)}return p}
export function damagePed(peds,p,amt){
 p.hp-=amt;if(p.hp<=0){p.hp=0;p.dead=true;p.state="knocked";return true}
 pedReact(peds,{x:p.x,z:p.z,radius:12,type:"combat"});return false}
export function pedCount(peds){return peds.list.length}
export function pedTarget(mode){const r=SHOT_PEDS[mode]||SHOT_PEDS.roam;return Math.round((r[0]+r[1])/2)}
