// combat.js — 3 weapons only: Fists / Dockside 9 / Kite-45 SMG. Reserves 60/60.
// Hitscan, aim spread, reload, muzzle flash + hitmarker events. Seeded only.
export const WEAPONS=[
 {id:"fists",name:"Fists",dmg:12,swing:0.6,range:1.6,mag:Infinity,reserve:Infinity,auto:false},
 {id:"pistol",name:"Dockside 9",dmg:18,mag:10,reload:1.8,range:35,reserve:60,auto:false},
 {id:"smg",name:"Kite-45",dmg:10,mag:30,reload:2.4,range:25,reserve:60,auto:true}];
export function createLoadout(rng){return{slot:0,unlocked:[true,true,false],
 mag:[Infinity,10,0],reserve:[Infinity,60,60],reloading:0,cooldown:0,
 spread:0,rng:rng||null,events:[]}}
export function currentWeapon(l){return WEAPONS[l.slot]}
export function selectSlot(l,i){
 if(i<0||i>2||!l.unlocked[i])return false;
 l.slot=i;l.reloading=0;return true}
export function cycleSlot(l,dir){for(let k=1;k<=3;k++){const i=(l.slot+dir*k+3)%3;
 if(l.unlocked[i]){l.slot=i;return i}}return l.slot}
export function unlockSmg(l){l.unlocked[2]=true;l.mag[2]=30;l.reserve[2]=60}
export function ammoLine(l){const w=WEAPONS[l.slot];
 return w.id==="fists"?"Fists  --/--":w.name+" "+l.mag[l.slot]+"/"+l.reserve[l.slot]}
export function startReload(l){
 const w=WEAPONS[l.slot];
 if(w.id==="fists"||l.reloading>0||l.mag[l.slot]>=w.mag||l.reserve[l.slot]<=0)return false;
 l.reloading=w.reload;return true}
export function updateCombat(l,dt){
 const d=dt||1/60;l.cooldown=Math.max(0,l.cooldown-d);
 if(l.reloading>0){l.reloading-=d;
  if(l.reloading<=0){const w=WEAPONS[l.slot],need=w.mag-l.mag[l.slot],
   take=Math.min(need,l.reserve[l.slot]);
   l.mag[l.slot]+=take;l.reserve[l.slot]-=take;l.reloading=0}}
 return l}
// Fire one hitscan shot. target: {dist,hp,apply(dmg)} or null (miss).
// aiming=true (RMB) tightens spread; hip-fire large spread penalty.
// Returns {hit, dmg, outOfAmmo, reloaded?} and pushes flash/hitmarker events.
export function fireWeapon(l,aiming,target,dist){
 const w=WEAPONS[l.slot],out=l.events;
 if(l.cooldown>0||l.reloading>0)return{hit:false,blocked:true};
 if(w.id==="fists"){
  l.cooldown=w.swing;
  const hit=target&&dist<=w.range;
  if(hit)out.push({type:"hitmarker",dmg:w.dmg});
  return{hit:!!hit,dmg:hit?w.dmg:0,melee:true}}
 if(l.mag[l.slot]<=0){startReload(l);return{hit:false,empty:true}}
 l.mag[l.slot]--;l.cooldown=w.auto?0.09:0.22;
 out.push({type:"muzzle",weapon:w.id});
 // spread: aim 0.02 rad, hip 0.12 rad; seeded jitter via rng if present
 const spread=aiming?0.02:0.12,jit=l.rng?(l.rng()-0.5)*2*spread:0;
 const effDist=(dist||0)+Math.abs(jit)*40;
 const hit=target&&effDist<=w.range&&Math.abs(jit)<spread*0.9;
 if(hit){out.push({type:"hitmarker",dmg:w.dmg});return{hit:true,dmg:w.dmg}}
 return{hit:false,dmg:0}}
export function addAmmo(l,weaponId,amt){
 const i=WEAPONS.findIndex(w=>w.id===weaponId);if(i<1)return false;
 l.reserve[i]=Math.min(60,l.reserve[i]+amt);return true}
export function takeEvents(l){const e=l.events.slice();l.events.length=0;return e}
export function isReloading(l){return l.reloading>0}
