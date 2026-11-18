// traffic.js — traffic AI: lane follow, lights, following, avoidance, panic.
// Bubble 220 m, recycle outside 300 m. Counts per DENSITY §8 / RESOLVED §1.13.
import {spawnVehicle,pickTrafficType} from "./vehicles.js";
export const BUBBLE=220,RECYCLE=300,FOLLOW=8;
export const DENSITY={chase:[22,28],play:[12,18],mission:[8,12],depot:[10,16],roam:[18,28]};
export const DISTRICT_MOD={"Port Lumen":1.2,"Palmera Row":1.2,"Las Salinas":0.7};
export function createTraffic(rng){return{rng,list:[],events:[],mode:"roam",district:"Palmera Row"}}
// route: {x,z,heading} lane point provider from roadgraph (fn(x,z)->{x,z,heading,light})
export function spawnTrafficCar(tr,pool,route,district){
 const p=route(tr.rng);if(!p)return null;
 const type=pickTrafficType(tr.rng,district||tr.district);
 const v=spawnVehicle(pool,type,p.x,p.z,p.heading,{occupied:true});
 v.cruise=(14+tr.rng()*10);v.lane=p;v.state="drive";v.blocked=0;v.panic=0;
 tr.list.push(v);return v}
export function trafficTarget(tr){
 const base=DENSITY[tr.mode]||DENSITY.roam;
 const mod=DISTRICT_MOD[tr.district]||1;
 return Math.round((base[0]+base[1])/2*mod)}
export function updateTraffic(tr,pool,route,player,dt,events){
 const d=dt||1/60,out=events||tr.events;
 for(let i=tr.list.length-1;i>=0;i--){
  const v=tr.list[i],dx=v.x-player.x,dz=v.z-player.z,dist=Math.sqrt(dx*dx+dz*dz);
  if(dist>RECYCLE){tr.list.splice(i,1);const k=pool.list.indexOf(v);if(k>=0)pool.list.splice(k,1);continue}
  const ahead=route(v.x,v.z,v.heading);
  if(!ahead)continue;
  let throttle=0.6,steer=0;
  // red light: stop up to 8 s
  if(ahead.light==="red"&&ahead.dist<10){throttle=0;v.state="light"}
  else v.state="drive";
  // follow distance 6-10 m: slow for car ahead
  const lead=nearestAhead(tr.list,v,10);
  if(lead)throttle=Math.max(0,throttle-(10-lead)/10*0.6);
  // obstacle / ped within 12 m: slow
  if(ahead.blocked)throttle=Math.min(throttle,0.2);
  // panic: collision / near-miss >10 m/s, gunfire <30 m
  if(v.panic>0){v.panic-=d;throttle=1;steer=v.panicDir||0;
   if(v.panic<=0)v.state="drive"}
  else if(ahead.flee){v.panic=2+tr.rng()*2;v.panicDir=tr.rng()<0.5?-0.8:0.8;
   out.push({type:"panic",id:v.id})}
  // lane steering toward next lane point
  const want=Math.atan2(ahead.x-v.x,ahead.z-v.z);
  let dh=want-v.heading;while(dh>Math.PI)dh-=2*Math.PI;while(dh<-Math.PI)dh+=2*Math.PI;
  steer=Math.max(-1,Math.min(1,dh*2))+(v.panic>0?(v.panicDir||0):0);
  const sp=Math.min(v.cruise||20,Math.abs(v.speed)+8*d);
  v.heading+=steer*1.4*d*(v.speed>=0?1:-1);
  v.speed=Math.max(0,Math.min(sp,v.speed+throttle*10*d));
  if(throttle===0)v.speed=Math.max(0,v.speed-14*d);
  v.x+=Math.sin(v.heading)*v.speed*d;v.z+=Math.cos(v.heading)*v.speed*d;
  // near-miss: player passes <1.5 m at >12 m/s
  const pd=Math.sqrt((v.x-player.x)*(v.x-player.x)+(v.z-player.z)*(v.z-player.z));
  if(pd<1.5&&Math.abs(player.speed||0)>12&&!v.nearMiss){
   v.nearMiss=true;out.push({type:"nearMiss",value:150,id:v.id})}
  else if(pd>4)v.nearMiss=false;
 }
 return tr.list.length}
function nearestAhead(list,v,maxD){
 let best=0;
 for(const o of list){if(o===v)continue;
  const dx=o.x-v.x,dz=o.z-v.z,along=dx*Math.sin(v.heading)+dz*Math.cos(v.heading);
  const side=Math.abs(dx*Math.cos(v.heading)-dz*Math.sin(v.heading));
  if(along>0&&along<maxD&&side<3)best=Math.max(best,along)}
 return best||null}
export function trafficPanic(tr,id){const v=tr.list.find(c=>c.id===id);if(v){v.panic=3;v.panicDir=tr.rng()<0.5?-1:1}}
export function trafficCount(tr){return tr.list.length}
export function clearTraffic(tr,pool){for(const v of tr.list){const k=pool.list.indexOf(v);if(k>=0)pool.list.splice(k,1)}tr.list.length=0}
