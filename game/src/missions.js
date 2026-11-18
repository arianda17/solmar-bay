// missions.js — M1-M6 intact. Givers: Nia M1/M2/M4, Mara M5, Tomo M3/M6.
// Dialogue compressed to 2-4 lines each. Flow: M1-M3 linear, M4+M5 parallel, M6 last.
export const GIVERS={Nia:{name:"Nia Calder",color:"#f5c518",init:"NC"},
 Mara:{name:"Mara Solis",color:"#4fd1c5",init:"MS"},
 Tomo:{name:"Tomo Varela",color:"#c96a4f",init:"TV"}};
export const MISSIONS=[
 {id:"M1",title:"Pier Run",giver:"Nia",reward:400,unlock:"Safehouse, M2, Dockside 9 (30 reserve)",
  intro:["Nia: Rafe. Cargo's on the Tidewheel. Grab that Mico.","Nia: Drive it to the Cerro Verde safehouse. No detours."],
  steps:[{t:"goto",o:"Walk to the Tidewheel Promenade marker",n:"E Talk to Nia"},
   {t:"enterVehicle",o:"Steal the parked Mico",n:"E Enter Mico",veh:"Mico"},
   {t:"deliver",o:"Drive to the Cerro Verde safehouse",n:"Park in the garage marker"},
   {t:"talk",o:"Talk to Nia",n:"E Talk to Nia"}],
  outro:["Nia: Clean run. The safehouse is yours now.","Nia: Pistol's in the glovebox. Don't waste it."]},
 {id:"M2",title:"Cargo Manifest",giver:"Nia",reward:650,unlock:"Tomo contact, chop shop, M3, SMG $1,200",
  intro:["Nia: Pico's van leaves Brisa Yards at dusk.","Nia: Tail it. Don't spook him. 25 to 60 metres."],
  steps:[{t:"goto",o:"Drive to the tail start",n:"Reach the marker"},
   {t:"tail",o:"Tail Pico's van 25-60 m for 90 s",n:"Keep distance — lose sight 5 s and it's over",dur:90},
   {t:"enterVehicle",o:"Steal Pico's van",n:"E Pull the driver out",veh:"Bruto"},
   {t:"deliver",o:"Deliver the van to Tomo's chop shop",n:"Escape the patrol first",heat:20},
   {t:"talk",o:"Talk to Tomo",n:"E Talk to Tomo"}],
  outro:["Tomo: Van's clean. You're alright, courier.","Tomo: My shop's open to you now."]},
 {id:"M3",title:"Hot Wire",giver:"Tomo",reward:1200,unlock:"M4 + M5, Furia 2 in beach traffic, respray",
  intro:["Tomo: Sunflare Hotel. Furia 2, top floor garage.","Tomo: Walk in, drive out. Patrol wakes up on exit."],
  steps:[{t:"goto",o:"Drive to the Sunflare Hotel",n:"Reach the parking entrance"},
   {t:"enterVehicle",o:"Enter the hotel on foot, take the Furia 2",n:"E Enter Furia 2",veh:"Furia2"},
   {t:"escape",o:"Escape the patrol — 2 stars, no helicopter",n:"Break line of sight for 20 s",heat:40},
   {t:"deliver",o:"Deliver the Furia 2 to Tomo's",n:"Park at the chop shop"}],
  outro:["Tomo: She purrs, doesn't she? M4 and M5 are live.","Tomo: Nia and Mara both want you. Pick one."]},
 {id:"M4",title:"The Drop",giver:"Nia",reward:1500,unlock:"Courier deliveries, Bullet Barn shop",
  intro:["Nia: Package in Port Lumen. Pier by 17:52.","Nia: Twelve minutes. Guards at the pier. Deal with them."],
  steps:[{t:"pickup",o:"Pick up the package in Port Lumen",n:"E Pick up package"},
   {t:"deliver",o:"Drive to Solmar Pier — 12 min timer",n:"Timer top-center",timer:720},
   {t:"kill",o:"Eliminate the guards 1/2",n:"Two guards, 60 HP each",count:2,hp:60},
   {t:"escape",o:"Escape the pier",n:"Lose the patrol",heat:15},
   {t:"talk",o:"Return to Nia at Casa de Radios",n:"E Talk to Nia"}],
  outro:["Nia: Delivered. Couriers pay better than this, you know.","Nia: Bullet Barn will sell to you now."]},
 {id:"M5",title:"Ridgeline",giver:"Mara",reward:800,unlock:"Street races, M6 (once M4 done)",
  intro:["Mara: Three laps, Alto Mar ridge. Three racers.","Mara: Finish first or don't bother coming back."],
  steps:[{t:"goto",o:"Drive to the Alto Mar start line",n:"Reach the start"},
   {t:"race",o:"Race 3 laps — finish 1st",n:"3 laps, ~1.8 km each",laps:3,racers:3},
   {t:"talk",o:"Talk to Mara",n:"E Talk to Mara"}],
  outro:["Mara: First place. The ridge is yours on race nights.","Mara: Tomo's job is the big one. Go."]},
 {id:"M6",title:"Captain's Debt",giver:"Tomo",reward:2500,unlock:"All districts/weapons/vehicles, stats, replay",
  intro:["Tomo: Depot. Four guards. My evidence briefcase.","Tomo: Get me out alive. Heat caps at 3 stars — no heli."],
  steps:[{t:"goto",o:"Drive to the Solis Freight Depot",n:"Reach the depot gate"},
   {t:"kill",o:"Clear the depot — 4 guards",n:"Four guards, 80 HP each",count:4,hp:80},
   {t:"escort",o:"Free Tomo — he follows you",n:"E Free Tomo"},
   {t:"pickup",o:"Grab the evidence briefcase",n:"E Take briefcase"},
   {t:"deliver",o:"Drive Tomo to the Cerro Verde safehouse",n:"Heat spikes to 60 on exit",heat:60},
   {t:"talk",o:"Talk to Tomo",n:"E Talk to Tomo"}],
  outro:["Tomo: Debt cleared. Solmar Bay remembers.","Tomo: The workshop is safe. All of it is yours now."]},
];
export const UNLOCKS={taxi:"M1",tokens:"M1",smg:"M2",respray:"M2",races:"M5",courier:"M4"};
export function createMissionRunner(){return{active:null,step:0,done:{},flags:{},
 dialogue:null,beat:0,timer:0,tail:0,lost:0,kills:0,laps:0,checkpoints:0,failed:null,events:[]}}
export function missionById(id){return MISSIONS.find(m=>m.id===id)}
export function availableMissions(r){
 const d=r.done;
 if(!d.M1)return["M1"];if(!d.M2)return["M2"];if(!d.M3)return["M3"];
 const out=[];if(!d.M4)out.push("M4");if(!d.M5)out.push("M5");
 if(d.M4&&d.M5&&!d.M6)out.push("M6");return out}
export function startMission(r,id){
 const m=missionById(id);if(!m||r.active)return null;
 r.active=id;r.step=0;r.timer=0;r.tail=0;r.lost=0;r.kills=0;r.laps=0;r.failed=null;
 r.dialogue={speaker:m.giver,lines:m.intro};r.beat=0;
 r.events.push({type:"dialogue",mission:id});return m}
export function currentStep(r){const m=r.active?missionById(r.active):null;
 return m?m.steps[r.step]:null}
export function objectiveText(r){
 const m=r.active?missionById(r.active):null;
 if(!m)return"No active mission — explore Solmar Bay";
 const s=m.steps[r.step];return s?s.o:m.title}
export function nextStepText(r){const s=currentStep(r);return s&&s.n?s.n:""}
export function stageText(r){const m=r.active?missionById(r.active):null;
 return m?"STAGE "+(r.step+1)+"/"+m.steps.length:""}
export function advanceDialogue(r){
 if(!r.dialogue)return false;
 r.beat++;
 if(r.beat>=r.dialogue.lines.length){r.dialogue=null;r.beat=0;return false}
 return true}
export function showOutro(r){const m=missionById(r.active);
 if(m){r.dialogue={speaker:m.giver,lines:m.outro};r.beat=0}}
// ctx: {nearMarker, inVehicle, vehicleType, targetDist, targetVisible, kills,
// laps, escaped, heat, outOfBounds, dead, vehicleDead, time}
// Returns events; main applies heat/reward/cash from them.
export function updateMission(r,ctx,dt){
 const d=dt||1/60,ev=r.events;if(!r.active)return ev;
 const m=missionById(r.active),s=m.steps[r.step];
 if(ctx.dead||ctx.vehicleDead){r.failed="retry";ev.push({type:"fail",why:ctx.dead?"TAKEN OUT":"Vehicle destroyed"});return ev}
 if(s.t==="goto"||s.t==="pickup"||s.t==="talk"||s.t==="escort"){
  if(ctx.nearMarker){if(s.t==="escort")r.flags.tomoFree=true;completeStep(r,ev)}}
 else if(s.t==="enterVehicle"){
  if(ctx.inVehicle&&(!s.veh||ctx.vehicleType===s.veh))completeStep(r,ev)}
 else if(s.t==="deliver"){
  if(ctx.nearMarker&&ctx.inVehicle)completeStep(r,ev)}
 else if(s.t==="tail"){
  if(ctx.targetVisible&&ctx.targetDist>=25&&ctx.targetDist<=60){
   r.tail+=d;r.lost=0;if(r.tail>=s.dur)completeStep(r,ev)}
  else{r.lost+=d;if(r.lost>5){r.failed="lost";ev.push({type:"fail",why:"Lost the trail"})}}}
 else if(s.t==="kill"){
  r.kills=ctx.kills||0;
  if(r.kills>=s.count)completeStep(r,ev)}
 else if(s.t==="race"){
  r.laps=ctx.laps||0;
  if(ctx.finished){if(ctx.place===1)completeStep(r,ev);
   else{r.failed="place";ev.push({type:"fail",why:"Finished "+ctx.place+" — need 1st"})}}}
 else if(s.t==="escape"){
  if(ctx.escaped)completeStep(r,ev)}
 if(s.timer){r.timer+=d;if(r.timer>=s.timer){r.failed="timer";
  ev.push({type:"fail",why:"Timer expired"})}}
 if(ctx.outOfBounds){r.failed="bounds";ev.push({type:"fail",why:"Out of bounds"})}
 return ev}
function completeStep(r,ev){
 const m=missionById(r.active),s=m.steps[r.step];
 if(s.heat!=null)ev.push({type:"heat",heat:s.heat});
 r.step++;
 if(r.step>=m.steps.length){
  r.done[m.id]=true;r.flags[m.id]=true;
  ev.push({type:"passed",id:m.id,reward:m.reward,unlock:m.unlock});
  showOutro(r);r.active=null;r.step=0}
 else ev.push({type:"step",id:m.id,step:r.step})}
export function failMission(r){const id=r.active;r.active=null;r.step=0;r.failed=null;
 return id}
export function retryMission(r,id){return startMission(r,id)}
export function missionProgress(r){return{active:r.active,step:r.step,
 done:Object.keys(r.done),available:availableMissions(r)}}
export function takeMissionEvents(r){const e=r.events.slice();r.events.length=0;return e}
