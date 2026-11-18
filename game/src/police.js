// police.js — pursuit AI, 5-star ladder, helicopter (4+ stars only), arrest.
// Roster rows expose {id,tactic,distance,threat} for the HUD police list.
import {starsFromHeat} from "./wanted.js";
import {spawnVehicle} from "./vehicles.js";
export const LADDER={
 1:{cruisers:1,radius:80,escape:15,weapon:"pistol"},
 2:{cruisers:2,radius:100,escape:20,weapon:"pistol"},
 3:{cruisers:3,radius:120,escape:25,weapon:"smg"},
 4:{cruisers:4,radius:150,escape:30,weapon:"smg",heli:true},
 5:{cruisers:6,radius:180,escape:35,weapon:"smg",heli:true,spawnAhead:true}};
export const TACTICS=["PURSUIT","RAMMING","ROADBLOCK","SEARCHLIGHT"];
export function createPolice(rng){return{rng,units:[],heli:null,heliTimer:0,heliGone:0,
 nextUnit:1,seen:0,unseen:0,sight:false}}
export function spawnPoliceCruiser(pol,pool,x,z,heading,tactic){
 const v=spawnVehicle(pool,"Enforcer",x,z,heading,{occupied:true});
 const u={id:pol.nextUnit++,vehicle:v,tactic:tactic||"PURSUIT",threat:50,
  state:"pursue",blocked:0,ramCd:0,lightPhase:pol.rng()*6.283};
 pol.units.push(u);return u}
export function policeRoster(pol,player){
 return pol.units.map(u=>{
  const dx=u.vehicle.x-player.x,dz=u.vehicle.z-player.z;
  const dist=Math.round(Math.sqrt(dx*dx+dz*dz));
  const stars=starsFromHeat(player.heat||0);
  return{id:u.id,tactic:u.tactic,distance:dist,
   threat:Math.round(stars*1000/Math.max(1,dist)+ (u.tactic==="RAMMING"?20:0)),
   state:u.state}}).sort((a,b)=>b.threat-a.threat||a.id-b.id)}
export function desiredCruisers(stars){return stars<=0?0:(LADDER[stars]||LADDER[5]).cruisers}
export function updatePolice(pol,pool,player,heat,dt,route){
 const d=dt||1/60,stars=starsFromHeat(heat);
 const want=desiredCruisers(stars);
 // spawn / despawn to ladder count; 5 stars spawn ahead on arterials
 while(pol.units.length<want){
  const ahead=stars>=5&&route?route(player.x,player.z,player.heading,150):null;
  const a=pol.rng()*6.283,r=40+pol.rng()*40;
  const x=ahead?ahead.x:player.x+Math.sin(a)*r,z=ahead?ahead.z:player.z+Math.cos(a)*r;
  spawnPoliceCruiser(pol,pool,x,z,Math.atan2(player.x-x,player.z-z),
   pol.units.length===0?"PURSUIT":TACTICS[Math.floor(pol.rng()*3)])}
 while(pol.units.length>want){const u=pol.units.pop();
  const k=pool.list.indexOf(u.vehicle);if(k>=0)pool.list.splice(k,1)}
 // sight: any unit within ladder radius
 const lad=LADDER[stars]||LADDER[1];
 pol.sight=pol.units.some(u=>{const dx=u.vehicle.x-player.x,dz=u.vehicle.z-player.z;
  return dx*dx+dz*dz<lad.radius*lad.radius});
 pol.seen=pol.sight?pol.seen+d:0;pol.unseen=pol.sight?0:pol.unseen+d;
 for(const u of pol.units){
  const v=u.vehicle,dx=player.x-v.x,dz=player.z-v.z,dist=Math.sqrt(dx*dx+dz*dz)||1;
  u.lightPhase+=d*6; // light-bar pulse (seeded tick, not wall clock)
  // tactic assignment by distance
  if(dist<8&&u.ramCd<=0){u.tactic="RAMMING";u.ramCd=6}
  else if(dist>120&&stars>=3){u.tactic="ROADBLOCK"}
  else if(pol.heli&&u===pol.units[0]){u.tactic="SEARCHLIGHT"}
  else if(u.ramCd<=0)u.tactic="PURSUIT";
  u.ramCd=Math.max(0,u.ramCd-d);
  const wantH=Math.atan2(dx,dz);
  let dh=wantH-v.heading;while(dh>Math.PI)dh-=2*Math.PI;while(dh<-Math.PI)dh+=2*Math.PI;
  const ram=u.tactic==="RAMMING"?1.15:1;
  v.heading+=Math.max(-1.6,Math.min(1.6,dh*2))*d;
  const top=44*ram;
  v.speed=Math.min(top,v.speed+12*d);
  v.x+=Math.sin(v.heading)*v.speed*d;v.z+=Math.cos(v.heading)*v.speed*d;
  // ram contact slows player-side handled by main via onRam callback
  if(dist<2.5&&u.tactic==="RAMMING"){u.ramCd=6;v.speed*=0.6}
 }
 updateHeli(pol,player,stars,d);
 return{stars,units:pol.units.length,heli:!!pol.heli,sight:pol.sight}}
function updateHeli(pol,player,stars,d){
 if(stars>=4){
  if(!pol.heli){
   pol.heliTimer+=d;
   if(pol.heliTimer>=5){ // spawns 5 s after reaching 4 stars
    pol.heli={x:player.x+120,z:player.z+80,y:38,angle:0,spotLOS:false};pol.heliTimer=0}}
  else{pol.heli.angle+=d*0.35;
   pol.heli.x=player.x+Math.sin(pol.heli.angle)*45;
   pol.heli.z=player.z+Math.cos(pol.heli.angle)*45;
   pol.heli.spotLOS=true; // spotlight tracks player; LOS set by render raycast in main
   pol.heliGone=0}
 }else{
  pol.heliTimer=0;
  if(pol.heli){pol.heliGone+=d;if(pol.heliGone>=10)pol.heli=null} // despawn 10 s below 4
 }}
export function heliState(pol){return pol.heli?{active:true,x:pol.heli.x,y:pol.heli.y,z:pol.heli.z,
 spotLOS:pol.heli.spotLOS,altitude:38}:{active:false,spotLOS:false}}
// ARRESTED: on foot, surrounded (unit <3 m) and player hp <20% of max.
export function checkArrest(pol,player){
 if(player.inVehicle||player.hp>=20)return false;
 return pol.units.some(u=>{const dx=u.vehicle.x-player.x,dz=u.vehicle.z-player.z;
  return dx*dx+dz*dz<9})}
export function clearPolice(pol,pool){
 for(const u of pol.units){const k=pool.list.indexOf(u.vehicle);if(k>=0)pool.list.splice(k,1)}
 pol.units.length=0;pol.heli=null;pol.heliTimer=0;pol.heliGone=0}
export function policeSearchRadius(stars){return stars<=0?0:(LADDER[stars]||LADDER[5]).radius}
export function policeEscapeTime(stars){return stars<=0?0:(LADDER[stars]||LADDER[5]).escape}
