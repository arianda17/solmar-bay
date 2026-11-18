// hudOverlay.js — DOM overlay under #hud, 1280x720 baseline, T1-T5 scale.
// All 10 widgets: minimap, wanted+heli, mission panel, location/time, toasts
// (FIX 1: y 76), police list, radio, dialogue (FIX 2: never auto-advance in
// shot mode), weapon slots, status meters, speedometer, score pop-ups, prompt.
// Pill bg rgba(8,12,24,0.62) behind every top widget over sky. No canvas text.
export const T={T1:12,T2:14,T3:18,T4:24,T5:36};
const PILL="background:rgba(8,12,24,0.62);border-radius:10px;padding:6px";
const CSS=".hud{position:absolute;inset:0;pointer-events:none;font-family:system-ui,sans-serif;color:#fff}"
 +".pill{background:rgba(8,12,24,0.62);border-radius:10px;padding:6px}"
 +".t1{font-size:12px}.t2{font-size:14px}.t3{font-size:18px}.t4{font-size:24px}.t5{font-size:36px}"
 +".gold{color:#f5c518}.mut{color:#b8c0cc}.red{color:#e33b3b}.blu{color:#3b82e3}"
 +"@keyframes fl{50%{opacity:.35}} .flash{animation:fl .6s infinite}"
 +"@keyframes rise{to{transform:translateY(-40px);opacity:0}} .pop{animation:rise 1.2s forwards}";
function el(tag,cls,parent,text){const n=document.createElement(tag);
 if(cls)n.className=cls;if(text!=null)n.textContent=text;
 if(parent)parent.appendChild(n);return n}
function box(parent,x,y,w,h,cls){const n=el("div","pill "+(cls||""),parent);
 n.style.cssText+=";position:absolute;left:"+x+"px;top:"+y+"px;width:"+w+"px;height:"+h+"px;box-sizing:border-box";
 return n}
export function createHud(root,onAdvance){
 const R=root||document.getElementById("hud");
 const st=document.createElement("style");st.textContent=CSS;document.head.appendChild(st);
 const h={root:R,shotMode:false,dlgTimer:0,onAdvance:onAdvance||null,popups:[],toasts:[]};
 R.classList.add("hud");
 // minimap top-left d=180 — light SVG street map (roads + route + blips
 // + player arrow) so it reads at 720p instead of a near-black circle
 h.minimap=box(R,16,16,180,180);h.minimap.style.borderRadius="50%";
 h.minimap.style.overflow="hidden";h.minimap.style.padding="0";
 h.minimap.style.background="rgba(52,72,96,0.94)";
 h.minimap.innerHTML='<svg width="180" height="180" viewBox="0 0 180 180">'
  +'<rect width="180" height="180" fill="#3a5068"/>'
  +'<polygon points="0,180 0,120 60,180" fill="#2a5a74"/>'
  +'<g stroke="#aebfce" stroke-width="5"><line x1="35" y1="0" x2="35" y2="180"/><line x1="75" y1="0" x2="75" y2="180"/><line x1="115" y1="0" x2="115" y2="180"/><line x1="155" y1="0" x2="155" y2="180"/><line x1="0" y1="35" x2="180" y2="35"/><line x1="0" y1="75" x2="180" y2="75"/><line x1="0" y1="115" x2="180" y2="115"/><line x1="0" y1="155" x2="180" y2="155"/></g>'
  +'<g stroke="#93a7bd" stroke-width="4"><line x1="0" y1="180" x2="180" y2="0"/><line x1="0" y1="0" x2="180" y2="180"/></g>'
  +'<polyline points="90,90 90,55 115,30" fill="none" stroke="#f5c518" stroke-width="3"/>'
  +'<polygon points="115,22 122,30 115,38 108,30" fill="#f5c518" stroke="#111" stroke-width="1"/>'
  +'<circle id="mapCop0" cx="60" cy="60" r="5" fill="#ff5252" stroke="#fff" stroke-width="1.5" style="display:none"/>'
  +'<circle id="mapCop1" cx="120" cy="60" r="5" fill="#ff5252" stroke="#fff" stroke-width="1.5" style="display:none"/>'
  +'<circle id="mapCop2" cx="60" cy="120" r="5" fill="#ff5252" stroke="#fff" stroke-width="1.5" style="display:none"/>'
  +'<g id="mapArrowG"><polygon points="90,78 83,97 97,97" fill="#f5c518" stroke="#111" stroke-width="1"/></g></svg>';
 h.mapArrowG=h.minimap.querySelector("#mapArrowG");
 h.mapCops=[0,1,2].map(i=>h.minimap.querySelector("#mapCop"+i));
 // mission panel top-center x280..1000 y16..72
 h.mission=box(R,280,16,720,56);
 h.mStage=el("div","t1 gold",h.mission,"");h.mStage.style.cssText="float:left;font-weight:700";
 h.mTimer=el("div","t1",h.mission,"");h.mTimer.style.cssText="float:right";
 h.mObj=el("div","t3",h.mission,"");h.mObj.style.cssText="clear:both;text-align:center;font-weight:700";
 h.mNext=el("div","t2 mut",h.mission,"");h.mNext.style.textAlign="center";
 // location + time top-right x1064..1264 y16..64 (48 px: 18+12 text + padding)
 h.loc=box(R,1064,16,200,48);h.loc.style.textAlign="right";
 h.locName=el("div","t3",h.loc,"Palmera Row");h.locName.style.lineHeight="1.15";
 h.locTime=el("div","t1 mut",h.loc,"17:40");h.locTime.style.lineHeight="1.2";
 // toasts x984..1264 y76..196 (FIX 1), max 3
 h.toasts=el("div","",R);h.toasts.style.cssText="position:absolute;left:984px;top:76px;width:280px";
 // wanted stars x10..252 y200..240 + heli x260..316 y200..236
 h.wanted=box(R,10,200,242,40);h.wanted.style.display="flex";h.wanted.style.gap="6px";
 h.stars=[];for(let i=0;i<5;i++){const s=el("span","t4",h.wanted,"☆");s.style.fontSize="32px";s.style.lineHeight="1";h.stars.push(s)}
 h.heli=box(R,260,200,56,36);h.heli.style.display="none";h.heli.style.textAlign="center";
 h.heliGlyph=el("div","t2",h.heli,"🚁");h.heliGlyph.style.display="none"; // replaced by SVG below
 h.heliGlyph.remove();
 h.heliSvg=el("div","",h.heli);h.heliSvg.innerHTML='<svg width="28" height="14" viewBox="0 0 28 14"><rect x="2" y="6" width="24" height="2" fill="#f5c518"/><ellipse cx="14" cy="9" rx="6" ry="3" fill="#8be9fd"/></svg>';
 h.heliTxt=el("div","t1",h.heli,"TRACKING");
 // police list x984..1264 y186..440, max 6 rows
 h.police=box(R,984,186,280,254);h.police.style.display="none";
 el("div","t1 gold",h.police,"POLICE RESPONSE");
 h.policeRows=el("div","",h.police);
 // radio x984..1264 y448..516
 h.radio=box(R,984,448,280,68);h.radio.style.display="none";
 h.radioName=el("div","t3",h.radio,"Coastline FM");
 h.radioTrack=el("div","t2 mut",h.radio,"Neon Tide");
 h.radioSig=el("div","t1",h.radio,"▓▓▓░░");
 // dialogue x160..900 y556..638
 h.dialogue=box(R,160,556,740,82);h.dialogue.style.display="none";h.dialogue.style.pointerEvents="auto";
 h.portrait=el("div","",h.dialogue);h.portrait.style.cssText="float:left;width:110px;height:70px;border-radius:6px;text-align:center";
 h.portInit=el("div","t4",h.portrait,"NC");h.portInit.style.lineHeight="1.4";
 h.portFace=el("div","",h.portrait);h.portFace.innerHTML='<svg width="40" height="16" viewBox="0 0 40 16"><circle cx="13" cy="5" r="2.5" fill="#111"/><circle cx="27" cy="5" r="2.5" fill="#111"/><path d="M13 12 Q20 16 27 12" stroke="#111" fill="none" stroke-width="1.5"/></svg>';
 h.dlgName=el("div","t3 gold",h.dialogue,"");h.dlgName.style.marginLeft="122px";
 h.dlgText=el("div","t2",h.dialogue,"");h.dlgText.style.marginLeft="122px";
 h.dlgHint=el("div","t1 mut",h.dialogue,"Enter / click to skip");h.dlgHint.style.cssText="position:absolute;right:10px;bottom:6px";
 h.dialogue.addEventListener("click",()=>{if(h.onAdvance)h.onAdvance()});
 // status bottom-left x16..340 y642..712
 h.status=box(R,16,642,324,70);
 h.cash=el("div","t2",h.status,"$12,450");h.cash.style.cssText="text-align:right;font-weight:700";
 h.cashDelta=el("span","t1 gold",h.cash,"");
 h.stam=el("div","",h.status);h.stam.style.cssText="height:5px;background:#f3f0e2;margin:2px 0;display:none";
 h.hpRow=meter(h.status,"HP","#e33b3b");h.arRow=meter(h.status,"AR","#3b82e3");h.rpRow=meter(h.status,"RP","#d4a017");
 // weapon slots x924..1264 y600..652 + ammo line y654..672
 h.weapons=box(R,924,600,340,52);h.weapons.style.display="flex";h.weapons.style.gap="4px";h.weapons.style.padding="4px";
 h.slots=[];
 const glyphs=['<svg width="40" height="24" viewBox="0 0 40 24"><rect x="10" y="4" width="20" height="14" rx="4" fill="#ddd"/></svg>',
  '<svg width="40" height="24" viewBox="0 0 40 24"><rect x="4" y="10" width="26" height="5" fill="#ddd"/><rect x="28" y="14" width="4" height="8" fill="#ddd"/></svg>',
  '<svg width="40" height="24" viewBox="0 0 40 24"><rect x="2" y="9" width="30" height="6" fill="#ddd"/><rect x="12" y="15" width="4" height="7" fill="#ddd"/><rect x="30" y="10" width="8" height="4" fill="#ddd"/></svg>'];
 ["F","D9","K45"].forEach((g,i)=>{const s=el("div","t2",h.weapons);s.style.cssText="width:92px;height:44px;border:2px solid #555;text-align:center;opacity:.6";
  s.innerHTML=glyphs[i]+"<div>"+g+"</div>";h.slots.push(s)});
 h.ammo=el("div","t2",R,"Dockside 9  18/90");h.ammo.style.cssText="position:absolute;left:924px;top:654px;width:340px";
 // speedometer x924..1264 y676..712 — column flex: value row + damage bar,
 // everything clipped inside the box, no floats past the right edge
 h.speed=box(R,924,676,340,36);h.speed.style.display="none";
 h.speed.style.overflow="hidden";h.speed.style.whiteSpace="nowrap";
 h.speed.style.flexDirection="column";h.speed.style.padding="4px 6px";
 h.speedRow=el("div","",h.speed);
 h.speedRow.style.cssText="display:flex;align-items:baseline;gap:6px";
 h.speedName=el("span","t2",h.speedRow,"Furia 2");
 h.speedName.style.cssText="flex:1;overflow:hidden;text-overflow:ellipsis";
 h.speedGear=el("span","t3",h.speedRow,"D");
 h.speedUnit=el("span","t2 mut",h.speedRow," km/h");
 h.speedNum=el("span","t5",h.speedRow,"88");
 h.speedNum.style.cssText="font-weight:700;font-size:28px;line-height:1";
 h.dmgBar=el("div","",h.speed);h.dmgBar.style.cssText="height:6px;background:#3fae5a;width:100%;flex:none";
 // hitmarker (centre crosshair) + muzzle flash (near player gun) — shown
 // from state flags; in shot mode the staged flags stay on until capture
 h.hitmarker=el("div","",R);h.hitmarker.style.cssText="position:absolute;left:600px;top:300px;width:80px;height:80px;display:none;pointer-events:none";
 h.hitmarker.innerHTML='<svg width="80" height="80" viewBox="0 0 80 80"><g stroke="#ff5252" stroke-width="5" stroke-linecap="round"><line x1="14" y1="14" x2="30" y2="30"/><line x1="66" y1="14" x2="50" y2="30"/><line x1="14" y1="66" x2="30" y2="50"/><line x1="66" y1="66" x2="50" y2="50"/></g><circle cx="40" cy="40" r="4" fill="#ff5252"/></svg>';
 h.muzzle=el("div","",R);h.muzzle.style.cssText="position:absolute;left:555px;top:420px;width:90px;height:90px;display:none;pointer-events:none";
 h.muzzle.innerHTML='<svg width="90" height="90" viewBox="0 0 120 120"><g fill="#ffd54f"><polygon points="60,10 70,45 105,30 78,58 110,70 72,75 85,110 60,82 35,110 48,75 10,70 42,58 15,30 50,45"/></g><circle cx="60" cy="60" r="14" fill="#fff3c4"/></svg>';
 // drift / near-miss pop-ups centre x520..760 y260..460
 h.popups=el("div","",R);h.popups.style.cssText="position:absolute;left:520px;top:260px;width:240px;text-align:center";
 // interaction prompt centre-bottom x400..880 y652..692
 h.prompt=el("div","t3",R,"");h.prompt.style.cssText="position:absolute;left:400px;top:652px;width:480px;text-align:center;display:none";
 // end card: ARRESTED / TAKEN OUT only
 h.endCard=box(R,440,280,400,120);h.endCard.style.display="none";h.endCard.style.textAlign="center";
 h.endTitle=el("div","t4",h.endCard,"TAKEN OUT");
 h.endSub=el("div","t2 mut",h.endCard,"");
 return h}
function meter(parent,label,color){
 const r=el("div","t1",parent,label+" ");r.style.display="flex";r.style.gap="4px";r.style.alignItems="center";
 const bar=el("div","",r);bar.style.cssText="flex:1;height:12px;background:#222";
 const fill=el("div","",bar);fill.style.cssText="height:100%;width:100%;background:"+color;
 const val=el("span","t2",r,"100");return{fill,val}}
export function setShotMode(h,on){h.shotMode=!!on;
 if(on&&h.dlgTimer){clearTimeout(h.dlgTimer);h.dlgTimer=0}}
export function showToast(h,text,ms){
 const t=el("div","t2 pill",h.toasts,text);t.style.marginBottom="4px";
 h.toastsList=h.toastsList||[];h.toastsList.push(t);
 while(h.toastsList.length>3)h.toastsList.shift().remove();
 setTimeout(()=>{t.remove();const i=(h.toastsList||[]).indexOf(t);if(i>=0)h.toastsList.splice(i,1)},ms||2500)}
export function showDialogue(h,speaker,lines,color,init){
 const g={Nia:"#f5c518",Mara:"#4fd1c5",Tomo:"#c96a4f"};
 h.dialogue.style.display="block";h.prompt.style.display="none";
 h.portrait.style.background=color||g[speaker]||"#f5c518";
 h.portInit.textContent=init||(speaker||"??").slice(0,2).toUpperCase();
 h.dlgName.textContent=speaker||"";
 h.dlgText.textContent=(lines||[]).join(" ");
 // FIX 2: no auto-advance in shot mode; live play 4 s, pauses on hover
 if(h.dlgTimer){clearTimeout(h.dlgTimer);h.dlgTimer=0}
 if(!h.shotMode){h.dlgTimer=setTimeout(()=>{if(h.onAdvance)h.onAdvance()},4000);
  h.dialogue.onmouseenter=()=>{clearTimeout(h.dlgTimer);h.dlgTimer=0};
  h.dialogue.onmouseleave=()=>{if(!h.shotMode)h.dlgTimer=setTimeout(()=>{if(h.onAdvance)h.onAdvance()},4000)}}}
export function hideDialogue(h){h.dialogue.style.display="none";
 if(h.dlgTimer){clearTimeout(h.dlgTimer);h.dlgTimer=0}}
export function addScorePopup(h,text,kind){
 const p=el("div","t3 pop",h.popups,text);
 p.style.color=kind==="drift"?"#f5c518":"#8be9fd";p.style.fontWeight="700";
 // In shot mode the staged pop-up must survive until capture (~77 s wall
 // under SwiftShader); live play keeps the 1.2 s rise+fade. The .pop CSS
 // animation would fade it to opacity 0 in 1.2 s, so shot mode disables it.
 if(h.shotMode){p.style.animation="none";while(h.popups.children.length>3)h.popups.firstChild.remove();return}
 setTimeout(()=>p.remove(),1200)}
export function showEndCard(h,kind,sub){
 h.endCard.style.display="block";
 h.endTitle.textContent=kind==="arrested"?"ARRESTED":"TAKEN OUT";
 h.endSub.textContent=sub||""}
export function hideEndCard(h){h.endCard.style.display="none"}
// state: {district,time,heat,stars,heatRising,sight,hp,armour,respect,cash,
// cashDelta,stamina,weapon:{selected,ammoLine,locked},speedKmh,vehicleName,
// damage,gear,inVehicle,mission:{stage,objective,next,timer},police:[{id,
// tactic,distance,threat}],heli:{active,spotLOS},radio:{name,track,signal,on},
// prompt,mapAngle}
export function updateHud(h,s){
 if(!s)return;
 if(s.district!=null)h.locName.textContent=s.district;
 if(s.time!=null)h.locTime.textContent=s.time;
 // wanted stars
 const stars=s.stars||0;
 h.stars.forEach((n,i)=>{n.textContent=i<stars?"★":"☆";n.style.color=i<stars?"#f5c518":"#888"});
 h.wanted.classList.toggle("flash",!!(s.heatRising||s.sight));
 // heli indicator, stars>=4 only
 const heli=s.heli||{};
 h.heli.style.display=heli.active&&stars>=4?"block":"none";
 if(heli.active)h.heliTxt.textContent=heli.spotLOS?"SPOTLIGHT":"TRACKING";
 // mission panel
 const m=s.mission||{};
 h.mStage.textContent=m.stage||"";h.mTimer.textContent=m.timer||"";
 h.mObj.textContent=m.objective||"No active mission";
 h.mNext.textContent=m.next?("Next: "+m.next):"";
 // police list: heat>=1, max 6, sorted by threat (caller sorts; re-sort here)
 const rows=(s.police||[]).slice().sort((a,b)=>b.threat-a.threat||a.id-b.id).slice(0,6);
 h.police.style.display=(s.heat||0)>=1&&rows.length?"block":"none";
 h.policeRows.innerHTML="";
 const col={RAMMING:"#e33b3b",PURSUIT:"#2a6fd6",ROADBLOCK:"#d4a017",SEARCHLIGHT:"#f5c518"};
 for(const u of rows){const r=el("div","t2",h.policeRows);
  r.innerHTML="<b>UNIT "+u.id+" — "+u.tactic+" "+u.distance+"m</b><br><span style='color:"+(col[u.tactic]||"#fff")+"'>"+u.tactic+"</span>";
  r.style.cssText="height:38px;border-bottom:1px solid #334"}
 // radio: in vehicle + on only
 const rd=s.radio||{};
 h.radio.style.display=s.inVehicle&&rd.on?"block":"none";
 if(rd.name){h.radioName.textContent=rd.name;h.radioTrack.textContent=rd.track||"";
  h.radioSig.textContent="▓".repeat(rd.signal||3)+"░".repeat(Math.max(0,3-(rd.signal||3)))}
 // status meters
 if(s.hp!=null){h.hpRow.fill.style.width=s.hp+"%";h.hpRow.val.textContent=Math.round(s.hp)}
 if(s.armour!=null){h.arRow.fill.style.width=s.armour+"%";h.arRow.val.textContent=Math.round(s.armour);
  h.arRow.fill.parentElement.style.display=s.armour>0?"flex":"none"}
 if(s.respect!=null){h.rpRow.fill.style.width=s.respect+"%";h.rpRow.val.textContent=Math.round(s.respect)}
 if(s.cash!=null)h.cash.firstChild.textContent="$"+Math.round(s.cash).toLocaleString("en-US");
 if(s.cashDelta){h.cashDelta.textContent=" ("+s.cashDelta+")"}
 if(s.stamina!=null){h.stam.style.display=s.stamina<100?"block":"none";h.stam.style.width=(s.stamina*3.24)+"px"}
 // weapon slots
 const w=s.weapon||{};
 h.slots.forEach((n,i)=>{n.style.border=i===(w.selected||0)?"2px solid #f5c518":"2px solid #555";
  n.style.opacity=w.locked&&w.locked[i]?".35":(i===(w.selected||0)?"1":".6")});
 if(w.ammoLine)h.ammo.textContent=w.ammoLine;
 // speedometer: in vehicle only (flex column: value row + damage bar)
 h.speed.style.display=s.inVehicle?"flex":"none";
 if(s.inVehicle){h.speedName.textContent=s.vehicleName||"";
  h.speedNum.textContent=Math.round(s.speedKmh||0);
  h.speedGear.textContent=s.gear||"D";
  const dmg=s.damage==null?100:s.damage;
  h.dmgBar.style.width=dmg+"%";
  h.dmgBar.style.background=dmg<30?"#e33b3b":dmg<60?"#d4a017":"#3fae5a"}
 // prompt: in shot mode the staged prompt wins even while dialogue is
 // open (round-1 bug: dialogue-open hid it); live play hides it under dialogue
 const showP=!!s.prompt&&(h.shotMode||h.dialogue.style.display==="none");
 h.prompt.style.display=showP?"block":"none";
 if(s.prompt)h.prompt.textContent=s.prompt;
 // hitmarker / muzzle flash from state flags (staged on in shot mode)
 if(h.hitmarker)h.hitmarker.style.display=s.hitmarker?"block":"none";
 if(h.muzzle)h.muzzle.style.display=s.muzzle?"block":"none";
 // minimap: rotate player arrow, place cop blips by unit id + distance
 if(h.mapArrowG&&s.mapAngle!=null)h.mapArrowG.setAttribute("transform","rotate("+s.mapAngle+" 90 90)");
 if(h.mapCops){const rows=s.police||[];
  h.mapCops.forEach((c,i)=>{const u=rows[i];
   if(!u){c.style.display="none";return}
   const a=(u.id*137%360)*Math.PI/180,r=Math.min(68,22+(u.distance||0)*0.45);
   c.setAttribute("cx",90+Math.cos(a)*r);c.setAttribute("cy",90+Math.sin(a)*r);
   c.style.display="block"})}
}
