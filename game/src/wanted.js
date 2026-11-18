// wanted.js — heat 0-100, stars = clamp(ceil(heat/20),0,5). 5 stars max.
export const CRIME={carjack:20,gunfire:15,hitPed:10,killPed:20,killCop:40,
 stealPolice:30,hitPolice:20,robStore:30,explosion:25,attackHeli:20};
export const SEARCH_RADIUS={0:0,1:80,2:100,3:120,4:150,5:180};
export const ESCAPE_TIME={0:0,1:15,2:20,3:25,4:30,5:35};
export function starsFromHeat(heat){return Math.max(0,Math.min(5,Math.ceil(Math.max(0,heat)/20)))}
export function createWanted(){return{heat:0,lastCrime:0,heatRising:false,unseen:0,stars:0}}
export function addHeat(w,crime,seen){
 const amt=typeof crime==="number"?crime:(CRIME[crime]||0);
 if(!seen&&crime!=="explosion")return w.heat; // witnessed only, except explosion
 w.heat=Math.min(100,w.heat+amt);w.lastCrime=0;w.heatRising=true;
 w.stars=starsFromHeat(w.heat);return w.heat}
export function setHeat(w,heat){w.heat=Math.max(0,Math.min(100,heat));w.stars=starsFromHeat(w.heat);return w.heat}
// Decay: after 12 s no crime AND no line of sight, -2/s. No decay while seen.
// Stars clear one at a time after no LOS for (10+5*stars) s.
export function updateWantedHeat(w,dt,hasSight){
 const d=dt||1/60;w.lastCrime+=d;
 if(hasSight){w.unseen=0;w.heatRising=false}
 else{
  w.unseen+=d;
  if(w.lastCrime>=12&&w.heat>0){w.heat=Math.max(0,w.heat-2*d);w.heatRising=w.heat>0}
  const need=10+5*w.stars;
  if(w.stars>0&&w.unseen>=need){
   w.heat=Math.max(0,(w.stars-1)*20);w.stars=starsFromHeat(w.heat);w.unseen=0}}
 w.stars=starsFromHeat(w.heat);return w.heat}
export function searchRadius(stars){return SEARCH_RADIUS[stars]||0}
export function escapeTime(stars){return ESCAPE_TIME[stars]||0}
export function resprayCost(stars){return 1000*stars}
export function clearWanted(w){w.heat=0;w.stars=0;w.unseen=0;w.heatRising=false;w.lastCrime=0}
export function wantedSummary(w){return{heat:Math.round(w.heat),stars:w.stars,
 radius:searchRadius(w.stars),escape:escapeTime(w.stars),rising:w.heatRising}}
