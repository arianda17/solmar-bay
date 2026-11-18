// saveStore.js — minimal: 1 autosave + 1 manual slot, key solmar_bay_save_v1.
// Corrupt / future-version save -> null (caller falls back to New Game).
export const SAVE_KEY="solmar_bay_save_v1",VERSION=1;
export function blankSave(){return{version:VERSION,seed:20261124,
 pos:{x:0,z:0,heading:0},hp:100,cash:0,heat:0,weapons:{slot:0,reserve:[0,60,60]},
 vehicle:null,missions:{},contacts:[],tokens:[],settings:{radio:true,shadows:true}}}
function readStore(){try{const raw=localStorage.getItem(SAVE_KEY);
 if(!raw)return{auto:null,manual:null};
 const s=JSON.parse(raw);if(!s||typeof s!=="object")return{auto:null,manual:null};
 return s}catch(e){return{auto:null,manual:null}}}
function writeStore(s){try{localStorage.setItem(SAVE_KEY,JSON.stringify(s));return true}
 catch(e){return false}}
function valid(s){return s&&s.version===VERSION&&s.pos&&typeof s.hp==="number"}
export function saveGame(data,slot){
 const s=readStore();s[slot==="manual"?"manual":"auto"]=Object.assign(blankSave(),data||{});
 return writeStore(s)}
export function autosave(data){return saveGame(data,"auto")}
export function manualSave(data){return saveGame(data,"manual")}
export function loadGame(slot){
 const s=readStore(),v=s[slot==="manual"?"manual":"auto"];
 return valid(v)?v:null}
export function loadLatest(){return loadGame("manual")||loadGame("auto")}
export function saveExists(){return!!loadLatest()}
export function clearSave(){try{localStorage.removeItem(SAVE_KEY);return true}catch(e){return false}}
