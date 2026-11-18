// audio.js — stubbed synth: ambient drone + station state only.
// No melodic engines. Radio DISPLAY text is what the HUD reads.
export const STATIONS=[
 {name:"Coastline FM",tracks:["Neon Tide","Salt Air","Golden Static"]},
 {name:"Yard Pulse",tracks:["Crane Shift","Dock Lights","Night Haul"]}];
export function createAudio(){return{ctx:null,drone:null,gain:null,station:0,
 track:0,on:true,inVehicle:false,started:false,signal:3}}
export function ensureAudio(a){
 if(a.ctx||typeof AudioContext==="undefined")return a.ctx;
 try{a.ctx=new AudioContext();
  a.gain=a.ctx.createGain();a.gain.gain.value=0.05;a.gain.connect(a.ctx.destination);
  a.drone=a.ctx.createOscillator();a.drone.type="sine";a.drone.frequency.value=55;
  a.drone.connect(a.gain);a.drone.start();a.started=true}catch(e){a.ctx=null}
 return a.ctx}
export function setInVehicle(a,inside){a.inVehicle=inside;
 if(a.gain)a.gain.gain.value=inside&&a.on?0.05:0.015}
export function toggleRadio(a){a.on=!a.on;setInVehicle(a,a.inVehicle);return a.on}
export function cycleStation(a){a.station=(a.station+1)%STATIONS.length;a.track=0;return stationInfo(a)}
export function nextTrack(a){const st=STATIONS[a.station];
 a.track=(a.track+1)%st.tracks.length;return stationInfo(a)}
export function stationInfo(a){const st=STATIONS[a.station];
 return{name:st.name,track:st.tracks[a.track],on:a.on,signal:a.signal}}
export function radioDisplay(a){const s=stationInfo(a);
 return s.on?s.name+" / "+s.track:"Radio off"}
export function setSignal(a,bars){a.signal=Math.max(1,Math.min(3,bars))}
