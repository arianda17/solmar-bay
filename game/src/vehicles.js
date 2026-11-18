// vehicles.js — arcade vehicle physics, car pool, damage, carjacking.
// 6 archetypes + Caballero taxi. Seeded RNG only (rng passed in).
export const ARCHETYPES={
 Mico:{name:"Mico",top:34,acc:4.5,steer:1.9,grip:8,drift:0.4,mass:900},
 Viajero:{name:"Viajero",top:38,acc:5.0,steer:1.7,grip:9,drift:0.5,mass:1200},
 Furia2:{name:"Furia 2",top:48,acc:3.6,steer:2.1,grip:7,drift:1.0,mass:1100},
 Terraza:{name:"Terraza",top:33,acc:6.2,steer:1.4,grip:10,drift:0.3,mass:1800},
 Bruto:{name:"Bruto",top:32,acc:6.8,steer:1.3,grip:10,drift:0.3,mass:2000},
 Enforcer:{name:"Enforcer",top:44,acc:4.0,steer:1.8,grip:9,drift:0.6,mass:1500,police:true},
 Caballero:{name:"Caballero",top:36,acc:5.2,steer:1.6,grip:9,drift:0.4,mass:1250,taxi:true}};
export const DAMAGE={CLEAN:100,DAMAGED:60,SMOKING:30,DISABLED:0};
export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function createVehiclePool(rng){return{list:[],rng:rng||mulberry32(20261124),nextId:1}}
export function spawnVehicle(pool,type,x,z,heading,opts){
 const a=ARCHETYPES[type]||ARCHETYPES.Mico,o=opts||{};
 const v={id:pool.nextId++,type,arch:a,x,z,heading:heading||0,speed:0,steer:0,
  damage:o.damage!=null?o.damage:100,locked:!!o.locked,occupied:!!o.occupied,
  parked:!!o.parked,drift:0,gear:"D",horn:0,lights:!!o.lights,dead:false};
 pool.list.push(v);return v}
export function despawnVehicle(pool,v){const i=pool.list.indexOf(v);if(i>=0)pool.list.splice(i,1)}
export function vehicleSpeedKmh(v){return Math.abs(v.speed)*3.6}
export function damageState(v){return v.damage<=0?"disabled":v.damage<30?"smoking":v.damage<60?"damaged":"clean"}
export function damageVehicle(v,amt){if(v.dead)return;v.damage=Math.max(0,v.damage-amt);if(v.damage<=0){v.dead=true;v.speed=0}}
export function repairVehicle(v,amt){v.damage=Math.min(100,v.damage+amt);if(v.damage>0)v.dead=false}
// Arcade step: input {throttle:-1..1,steer:-1..1,handbrake,dt}. dt fixed 1/60.
export function updateVehicle(v,input,dt){
 if(v.dead||v.parked&&!input.throttle){if(v.parked&&input.throttle)v.parked=false}
 if(v.dead)return v;
 const a=v.arch,d=dt||1/60;
 const top=a.top,accel=top/a.acc;
 let sp=v.speed+input.throttle*accel*d*3;
 if(input.throttle===0)sp-=Math.sign(sp)*Math.min(Math.abs(sp),6*d);
 if(input.handbrake){sp*=Math.max(0,1-1.6*d);v.drift=Math.min(1,v.drift+d*3)}
 else v.drift=Math.max(0,v.drift-d*2);
 sp=Math.max(-top*0.35,Math.min(top,sp));
 const grip=a.grip*(input.handbrake?0.45:1);
 const turn=input.steer*a.steer*(0.4+0.6*Math.min(1,Math.abs(sp)/12))*d*(sp>=0?1:-1);
 v.heading+=turn*(1-v.drift*0.3);
 v.speed=sp;
 v.x+=Math.sin(v.heading)*sp*d;v.z+=Math.cos(v.heading)*sp*d;
 v.steer=input.steer;
 v.gear=sp<-0.5?"R":sp<0.5?"N":"D";
 return v}
export function canEnter(v,playerDist,playerSpeed){
 if(v.locked||v.dead)return{ok:false,why:"locked"};
 if(playerDist>2.0)return{ok:false,why:"too far"};
 if(!v.parked&&Math.abs(v.speed)>=3)return{ok:false,why:"moving"};
 return{ok:true,time:v.occupied?1.0:0.6}}
export function exitVehicle(v){return Math.abs(v.speed)<4?{ok:true}:{ok:false,why:"Slow down to exit"}}
export function nearestVehicle(pool,x,z,maxD){
 let best=null,bd=maxD||1e9;
 for(const v of pool.list){const dx=v.x-x,dz=v.z-z,d=dx*dx+dz*dz;if(d<bd*bd){bd=Math.sqrt(d);best=v}}
 return best}
export function pickTrafficType(rng,district){
 const r=rng();const hot=district==="Palmera Row"||district==="Alto Mar";
 if(hot&&r<0.10)return"Furia2";if(r<0.55)return rng()<0.5?"Mico":"Viajero";
 if(r<0.75)return rng()<0.5?"Terraza":"Bruto";if(r<0.85)return"Caballero";
 return rng()<0.5?"Mico":"Viajero"}
