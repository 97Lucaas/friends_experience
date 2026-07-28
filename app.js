const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const KEY = "friends-film-v1";
const COLORS = ["#6fb1b7","#e4ad65","#8c7ac2","#7ea36b","#d77979","#5888b7","#be79a5"];
const DAY = 86400000;
let state = { owner:{name:"",birth:"",photo:""}, people:[] };
let saveTimer;

function id(){ return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random()); }
function openDatabase(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open("friends-film",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("memories");
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
  });
}
async function readState(){
  try{
    const db=await openDatabase();
    const saved=await new Promise((resolve,reject)=>{const r=db.transaction("memories").objectStore("memories").get(KEY);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    if(saved)return saved;
  }catch(error){ console.warn("IndexedDB indisponible",error); }
  try{return JSON.parse(localStorage.getItem(KEY)||"null")}catch{return null}
}
async function writeState(){
  try{
    const db=await openDatabase();
    await new Promise((resolve,reject)=>{const tx=db.transaction("memories","readwrite");tx.objectStore("memories").put(state,KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
    // Une copie légère reste disponible si IndexedDB est momentanément indisponible.
    const light=structuredClone(state);light.owner.photo="";light.people.forEach(p=>p.photo="");
    localStorage.setItem(KEY,JSON.stringify(light));
    $("#saved-dot").style.background="#62a982";
  }catch(error){$("#saved-dot").style.background="#d06a63";console.error("Sauvegarde impossible",error)}
}
function fileData(file){
  return new Promise(resolve=>{
    if(!file)return resolve("");
    const img=new Image(),url=URL.createObjectURL(file);
    img.onload=()=>{
      const max=512,scale=Math.min(1,max/Math.max(img.width,img.height));
      const c=document.createElement("canvas");c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg",.82));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);resolve("")};img.src=url;
  });
}
function save(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    state.owner.name=$("#owner-name").value; state.owner.birth=$("#birth-date").value;
    writeState();
    $("#saved-dot").animate([{opacity:.2},{opacity:1}],{duration:500});
  },100);
}

function portableState(){
  state.owner.name=$("#owner-name").value.trim();
  state.owner.birth=$("#birth-date").value;
  return {
    version:1,
    owner:{name:state.owner.name,birth:state.owner.birth},
    people:state.people.map((person,index)=>({
      id:person.id,
      order:person.order??index,
      name:person.name||"",
      color:person.color||COLORS[index%COLORS.length],
      chapters:(person.chapters||[]).map(chapter=>({
        kind:chapter.kind,
        start:chapter.start||"",
        end:chapter.end||"",
        today:Boolean(chapter.today),
        deceased:Boolean(chapter.deceased)
      }))
    }))
  };
}
function normalizePortableState(input){
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Format d’export invalide.");
  if(!input.owner||typeof input.owner!=="object"||!Array.isArray(input.people))throw new Error("Le personnage principal ou les relations sont absents.");
  const date=value=>{
    const result=typeof value==="string"?value:"";
    if(result&&!/^\d{4}-\d{2}-\d{2}$/.test(result))throw new Error(`Date invalide : ${result}`);
    const parsed=result?new Date(`${result}T12:00:00`):null;
    if(parsed&&(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==result))throw new Error(`Date invalide : ${result}`);
    return result;
  };
  const usedIds=new Set();
  const people=input.people.map((person,index)=>{
    if(!person||typeof person!=="object"||!Array.isArray(person.chapters))throw new Error(`Relation ${index+1} invalide.`);
    let personId=typeof person.id==="string"&&person.id?person.id:id();
    if(usedIds.has(personId))personId=id();
    usedIds.add(personId);
    const color=typeof person.color==="string"&&/^#[0-9a-f]{6}$/i.test(person.color)
      ? person.color
      : COLORS[index%COLORS.length];
    return {
      id:personId,
      order:Number.isFinite(Number(person.order))?Number(person.order):index,
      name:typeof person.name==="string"?person.name.slice(0,30):"",
      color,
      photo:"",
      chapters:person.chapters.map((chapter,chapterIndex)=>{
        if(!chapter||typeof chapter!=="object")throw new Error(`Chapitre ${chapterIndex+1} invalide pour ${person.name||`la relation ${index+1}`}.`);
        const kind=["friend","love","away"].includes(chapter.kind)?chapter.kind:"friend";
        const today=Boolean(chapter.today);
        const deceased=!today&&Boolean(chapter.deceased);
        return {kind,start:date(chapter.start),end:today?"":date(chapter.end),today,deceased};
      })
    };
  });
  return {
    owner:{
      name:typeof input.owner.name==="string"?input.owner.name.slice(0,30):"",
      birth:date(input.owner.birth),
      photo:""
    },
    people
  };
}
function setTransferStatus(message,error=false){
  const status=$("#transfer-status");
  status.textContent=message;
  status.classList.toggle("error",error);
}
async function copyTransferData(){
  const json=JSON.stringify(portableState());
  const field=$("#transfer-data");
  field.value=json;
  try{
    await navigator.clipboard.writeText(json);
    setTransferStatus("Données copiées dans le presse-papiers. Les photos n’ont pas été incluses.");
  }catch{
    field.focus();field.select();
    const copied=document.execCommand("copy");
    setTransferStatus(copied
      ?"Données copiées dans le presse-papiers. Les photos n’ont pas été incluses."
      :"L’export est prêt dans le champ : copiez-le manuellement.",!copied);
  }
}
async function importTransferData(){
  const value=$("#transfer-data").value.trim();
  if(!value){setTransferStatus("Collez d’abord les données à importer dans le champ.",true);return}
  let imported;
  try{imported=normalizePortableState(JSON.parse(value))}
  catch(error){setTransferStatus(error.message||"Impossible de lire ces données.",true);return}
  if(!confirm("Cet import va remplacer toutes les données actuelles. Continuer ?"))return;
  clearTimeout(saveTimer);
  state=imported;
  film.images.clear();
  $("#owner-name").value=state.owner.name;$("#birth-date").value=state.owner.birth;
  $("#owner-photo").value="";$("#owner-photo-label").textContent="Choisir une photo";
  const list=$("#people-list");list.replaceChildren();
  state.people.forEach(person=>list.append(personNode(person)));
  $("#empty-state").hidden=state.people.length>0;
  await writeState();
  $("#transfer-data").value="";
  setTransferStatus(`${state.people.length} relation${state.people.length>1?"s":""} importée${state.people.length>1?"s":""}. Pensez à remettre les photos.`);
  scrollTo({top:0,behavior:"smooth"});
}

function chapterNode(person, data={kind:"friend",start:"",end:"",today:true,deceased:false}){
  data.deceased=Boolean(data.deceased);
  const node=$("#chapter-template").content.firstElementChild.cloneNode(true);
  $(".chapter-kind",node).value=data.kind; $(".chapter-start",node).value=data.start;
  $(".chapter-end",node).value=data.end; $(".chapter-today",node).checked=data.today;
  $(".chapter-deceased",node).checked=data.deceased; $(".chapter-end",node).disabled=data.today;
  const sync=e=>{
    if(e?.target.classList.contains("chapter-today")&&e.target.checked)$(".chapter-deceased",node).checked=false;
    if(e?.target.classList.contains("chapter-deceased")&&e.target.checked)$(".chapter-today",node).checked=false;
    data.kind=$(".chapter-kind",node).value; data.start=$(".chapter-start",node).value; data.end=$(".chapter-end",node).value;
    data.today=$(".chapter-today",node).checked;data.deceased=$(".chapter-deceased",node).checked;
    $(".chapter-end",node).disabled=data.today;save();
  };
  $$("input,select",node).forEach(el=>el.addEventListener("input",sync));
  $(".remove-chapter",node).onclick=()=>{ person.chapters.splice(person.chapters.indexOf(data),1); node.remove(); save(); };
  return node;
}
function personNode(person){
  const node=$("#person-template").content.firstElementChild.cloneNode(true);
  $(".person-name",node).value=person.name; $(".person-color",node).value=person.color;
  if(person.photo){ const p=$(".avatar-preview",node); p.style.backgroundImage=`url("${person.photo}")`; p.textContent=""; }
  $(".person-name",node).oninput=e=>{person.name=e.target.value;save()};
  $(".person-color",node).oninput=e=>{person.color=e.target.value;save()};
  $(".person-photo",node).onchange=async e=>{ person.photo=await fileData(e.target.files[0]); const p=$(".avatar-preview",node);p.style.backgroundImage=`url("${person.photo}")`;p.textContent="";save(); };
  const chapters=$(".chapters",node);
  person.chapters.forEach(c=>chapters.append(chapterNode(person,c)));
  $(".add-chapter",node).onclick=()=>{const c={kind:"friend",start:"",end:"",today:true,deceased:false};person.chapters.push(c);chapters.append(chapterNode(person,c));save()};
  $(".remove-person",node).onclick=()=>{state.people.splice(state.people.indexOf(person),1);node.remove();$("#empty-state").hidden=state.people.length>0;save()};
  return node;
}
function addPerson(){
  const nextOrder=Math.max(-1,...state.people.map((person,index)=>person.order??index))+1;
  const p={id:id(),order:nextOrder,name:"",color:COLORS[state.people.length%COLORS.length],photo:"",chapters:[{kind:"friend",start:"",end:"",today:true,deceased:false}]};
  state.people.unshift(p);$("#people-list").prepend(personNode(p));$("#empty-state").hidden=true;save();
}
async function init(){
  state=await readState()||state;
  state.owner=state.owner||{name:"",birth:"",photo:""};state.people=state.people||[];
  state.people.forEach((person,index)=>{if(person.order==null)person.order=index});
  $("#owner-name").value=state.owner.name;$("#birth-date").value=state.owner.birth;
  if(state.owner.photo)$("#owner-photo-label").textContent="Photo enregistrée ✓";
  state.people.forEach(p=>$("#people-list").append(personNode(p)));
  $("#empty-state").hidden=state.people.length>0;
  $("#add-person").onclick=addPerson;
  $("#export-data").onclick=copyTransferData;
  $("#import-data").onclick=importTransferData;
  $("#owner-name").oninput=save;$("#birth-date").oninput=save;
  $("#owner-photo").onchange=async e=>{state.owner.photo=await fileData(e.target.files[0]);$("#owner-photo-label").textContent="Photo enregistrée ✓";save()};
  $("#launch").onclick=launch;
  $("#back").onclick=closeFilm;$("#replay").onclick=()=>startFilm();
  addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")writeState()});
  await writeState();
}

const canvas=$("#timeline"),ctx=canvas.getContext("2d");
let film={raf:0,launchTimer:0,openingTimer:0,endingTimer:0,birthHoldUntil:0,gapHoldUntil:0,focusHoldUntil:0,paused:false,speed:"auto",duration:18000,elapsed:0,lastFrame:0,realGap:112,heldGap:112,centerY:0,cameraMotion:0,lastFocusStrength:0,displayFocus:0,heldFocus:0,focusEvent:null,exitTail:0,now:Date.now(),images:new Map(),tracks:[],events:[],motionEvents:[],laneTransitions:new Map(),laneHolds:new Map(),deceasedTransitions:new Map()};
function dateNum(v){return new Date(v+"T12:00:00").getTime()}
function resize(){canvas.width=innerWidth*devicePixelRatio;canvas.height=innerHeight*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
function seeded(n){const x=Math.sin(n*9321.17)*43758.5;return x-Math.floor(x)}
function loadImage(src,key){if(!src)return;const img=new Image();img.src=src;film.images.set(key,img)}
function buildTracks(){
  film.tracks=[];film.events=[];film.motionEvents=[];film.now=Date.now();
  state.people.forEach((p,pi)=>{
    const trackOrder=p.order??pi;
    loadImage(p.photo,p.id);
    p.chapters.filter(c=>c.kind!=="away"&&c.start).forEach(c=>{
      const death=c.deceased&&c.end?dateNum(c.end):null;
      const track={id:p.id,name:p.name||"Quelqu’un",photo:p.photo,color:c.kind==="love"?"#f06b82":p.color,start:dateNum(c.start),end:(c.today||death)?film.now:dateNum(c.end||c.start),death,love:c.kind==="love",real:true,slot:trackOrder%2?-(Math.ceil((trackOrder+1)/2)):Math.ceil((trackOrder+1)/2)};
      film.tracks.push(track);
    });
  });
  film.tracks.filter(track=>track.real).forEach(track=>{
    track.personEnd=Math.max(...film.tracks.filter(other=>other.real&&other.id===track.id).map(other=>other.end));
  });
  const birth=dateNum(state.owner.birth), now=film.now, span=now-birth;
  film.exitTail=span*.115*(.5+90/innerWidth)/.78;
  for(let i=0;i<55;i++){
    const st=birth+span*(.06+seeded(i)*.88), life=span*(.018+seeded(i+80)*.095);
    film.tracks.push({id:"ghost"+i,name:"",color:COLORS[i%COLORS.length],start:st,end:Math.min(now,st+life),love:false,real:false,slot:(i%2?1:-1)*(2+Math.floor(seeded(i+40)*8))});
  }
  film.tracks.filter(r=>r.real).forEach(r=>{
    const previous=film.tracks.find(other=>other!==r&&other.real&&other.id===r.id&&Math.abs(other.end-r.start)<DAY*2);
    const next=film.tracks.find(other=>other!==r&&other.real&&other.id===r.id&&Math.abs(other.start-r.end)<DAY*2);
    r.continuesFromPrevious=Boolean(previous);
    r.continued=Boolean(next);
    film.events.push(r.start);
    if(!previous)film.motionEvents.push({time:r.start,weight:1.35,type:"enter",track:r});
    else if(r.love&&!previous.love)film.motionEvents.push({time:r.start,weight:5.2,type:"loveStart",track:r});
    else if(!r.love&&previous.love)film.motionEvents.push({time:r.start,weight:3.8,type:"friendResume",track:r});
    if(r.end<now-DAY){
      film.events.push(r.end);
      if(r.love)film.motionEvents.push({time:r.end,weight:5.4,type:"loveEnd",track:r});
      else if(!next)film.motionEvents.push({time:r.end,weight:1.2,type:"leave",track:r});
    }
    if(r.death)film.motionEvents.push({time:r.death,weight:5.6,type:"death",track:r});
  });
  film.events=[...new Set(film.events)].sort((a,b)=>a-b);
  buildLaneTransitions(birth,span);
  buildLaneHolds(span);
  buildDeceasedTransitions(span);
}
function drawAvatar(track,x,y,alpha,gray,showLabel=true){
  const radius=track.real?21:7;
  ctx.save();ctx.globalAlpha=alpha;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.clip();
  const img=film.images.get(track.id);
  if(img?.complete&&img.naturalWidth){ if(gray)ctx.filter="grayscale(1)";ctx.drawImage(img,x-radius,y-radius,radius*2,radius*2); }
  else {ctx.fillStyle=gray?"#777982":track.color;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);if(track.real){ctx.fillStyle="#111";ctx.font="600 12px DM Sans";ctx.textAlign="center";ctx.fillText((track.name[0]||"•").toUpperCase(),x,y+4)}}
  ctx.restore();
  if(track.real){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=gray?"#777982":track.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,radius+2,0,Math.PI*2);ctx.stroke();if(showLabel){ctx.fillStyle="#e5e1d9";ctx.font="600 12px DM Sans";ctx.textAlign="left";ctx.fillText(track.name,x+radius+11,y+4)}ctx.restore();}
}
function rawSlot(track,time){
  if(!track.real)return track.slot;
  const deceased=[...new Map(film.tracks.filter(r=>r.real&&r.death&&time>=r.death).map(r=>[r.id,r])).values()].sort((a,b)=>a.death-b.death);
  const deceasedIndex=deceased.findIndex(r=>r.id===track.id);
  const activeLiving=[...new Map(film.tracks.filter(r=>
    r.real&&r.start<=time
      &&(r.end>=time||(!r.continued&&time<=r.end+film.exitTail))
      &&!deceased.some(d=>d.id===r.id)
  ).map(r=>[r.id,r])).values()];
  const upperLiving=activeLiving.filter(r=>r.slot<0).sort((a,b)=>Math.abs(a.slot)-Math.abs(b.slot));
  const lowerLiving=activeLiving.filter(r=>r.slot>=0).sort((a,b)=>Math.abs(a.slot)-Math.abs(b.slot));
  if(deceasedIndex>=0){
    return -(upperLiving.length+1+deceasedIndex);
  }
  const side=track.slot<0?upperLiving:lowerLiving;
  const sign=track.slot<0?-1:1;
  const lover=film.tracks.find(r=>
    r.real&&r.love&&r.start<=time&&r.end>=time
  );
  if(lover?.id===track.id)return sign;
  const sameSideLover=lover&&Math.sign(lover.slot||1)===sign;
  const ordered=sameSideLover?side.filter(r=>r.id!==lover.id):side;
  const rank=ordered.findIndex(r=>r.id===track.id);
  if(rank<0)return track.slot;
  return sign*(rank+1+(sameSideLover?1:0));
}
function buildLaneTransitions(birth,span){
  film.laneTransitions=new Map();
  const grouped=[...new Set(film.motionEvents.map(event=>event.time))].sort((a,b)=>a-b).map(time=>({
    time,events:film.motionEvents.filter(event=>event.time===time)
  }));
  const realTracks=film.tracks.filter(track=>track.real);
  realTracks.forEach(track=>{
    const transitions=[];
    grouped.forEach(group=>{
      const beforeTrack=realTracks.find(other=>other.id===track.id&&other.start<group.time&&other.end>=group.time-1);
      const afterTrack=realTracks.find(other=>other.id===track.id&&other.start<=group.time+1&&other.end>group.time);
      if(!beforeTrack&&!afterTrack)return;
      // Une vraie arrivée ou une vraie sortie utilise son animation verticale,
      // pas un changement artificiel de piste.
      if(!beforeTrack&&afterTrack)return;
      if(beforeTrack&&!afterTrack)return;
      const from=rawSlot(beforeTrack||track,group.time-1);
      let to=rawSlot(afterTrack||track,group.time+1);
      const types=group.events.map(event=>event.type);
      let start=group.time-span*.012,end=group.time+span*.012,hold=group.time-span*.012,freezeFrom=hold;
      let reservation=false,reservationUntil=group.time;
      if(types.includes("leave")){
        // La pile ne se compacte qu'au moment exact où le profil sortant
        // franchit le bord gauche. Le cadrage et les lignes repartent ensemble.
        const vacateTime=Math.min(film.now,group.time+film.exitTail);
        const afterVacate=Math.min(film.now,vacateTime+1);
        const stableTrack=realTracks.find(other=>
          other.id===track.id&&other.start<=afterVacate&&other.end>=afterVacate
        );
        if(stableTrack)to=rawSlot(stableTrack,afterVacate);
        reservation=true;
        freezeFrom=group.time;
        hold=vacateTime;
        start=vacateTime;
        end=Math.abs(from-to)<.001?vacateTime:Math.min(film.now,vacateTime+span*.018);
        reservationUntil=end;
      }else if(types.includes("enter")){
        hold=group.time-span*.018;
        start=hold;
        end=group.time;
        freezeFrom=hold;
      }else if(types.includes("loveStart")){
        hold=group.time-span*.001;
        start=hold;
        end=group.time+span*.0015;
        freezeFrom=hold;
      }else if(types.includes("loveEnd")){
        hold=group.time;start=group.time+span*.002;end=group.time+span*.010;
        freezeFrom=hold;
      }else if(types.includes("death")){
        hold=group.time;start=group.time;end=group.time+span*.018;
        freezeFrom=hold;
      }
      const loveTransition=group.events.some(event=>event.type==="loveStart"&&event.track.id===track.id);
      const deathTransition=types.includes("death");
      const departureDriven=types.includes("leave");
      const entryDriven=types.includes("enter");
      const protectedTransition=types.some(type=>["loveStart","loveEnd","death"].includes(type));
      if(Math.abs(from-to)<.001&&!reservation)return;
      transitions.push({time:group.time,freezeFrom,hold,start,end,from,to,loveTransition,deathTransition,departureDriven,entryDriven,protectedTransition,reservation,reservationUntil});
    });
    // Deux mouvements proches se rejoignent à une frontière commune au lieu
    // de se superposer et de produire des zigzags.
    const merged=[];
    transitions.forEach(current=>{
      const previous=merged.at(-1);
      if(previous?.reservation&&current.time<=previous.reservationUntil){
        // Une arrivée réelle est prioritaire sur une ancienne réservation :
        // l'occupant doit libérer la piste avant que le nouveau profil s'insère.
        if(!current.protectedTransition&&!current.entryDriven)return;
        const cutoff=current.hold-1;
        previous.to=previous.from;
        previous.hold=Math.min(previous.hold,cutoff);
        previous.start=previous.hold;
        previous.end=previous.hold;
        previous.reservationUntil=cutoff;
      }
      if(previous&&current.hold<previous.end){
        if(current.deathTransition){
          previous.end=Math.min(previous.end,current.time);
          previous.start=Math.min(previous.start,previous.end);
          current.freezeFrom=current.time;
          current.hold=current.time;
          current.start=current.time;
          current.from=previous.to;
        }else{
          const boundary=(previous.time+current.time)/2;
          previous.start=Math.min(previous.start,boundary-span*.008);
          previous.end=boundary;
          current.hold=boundary;
          current.start=boundary;
          current.end=Math.max(current.end,current.start+span*.008);
          current.from=previous.to;
        }
      }
      merged.push({...current});
    });
    const withoutExcursions=[];
    for(let i=0;i<merged.length;i++){
      const current=merged[i];
      if(current.protectedTransition){
        withoutExcursions.push(current);
        continue;
      }
      let returnIndex=-1;
      for(let j=i+1;j<merged.length;j++){
        const candidate=merged[j];
        if(candidate.time-current.time>film.exitTail||candidate.protectedTransition||candidate.reservation)break;
        if(Math.abs(candidate.to-current.from)<.001){
          returnIndex=j;
          break;
        }
      }
      if(returnIndex>=0){
        withoutExcursions.push({
          ...current,
          end:merged[returnIndex].end,
          to:current.from,
          departureDriven:false,
          entryDriven:false
        });
        i=returnIndex;
      }else{
        withoutExcursions.push(current);
      }
    }
    const guarded=[];
    withoutExcursions.forEach(item=>{
      const current={...item},previous=guarded.at(-1);
      if(current.reservation&&current.hold>=film.now)return;
      if(previous&&current.hold<=previous.end+1)current.from=previous.to;
      if(!current.reservation&&Math.abs(current.from-current.to)<.001)return;
      if(Math.abs(current.from-current.to)>=.001){
        const minimumDuration=current.loveTransition
          ? span*.002
          : current.protectedTransition?span*.006:span*.008;
        current.start=Math.max(current.start,current.hold);
        current.end=Math.max(current.end,current.start+minimumDuration);
      }
      guarded.push(current);
    });
    film.laneTransitions.set(track,guarded);
  });
}
function buildLaneHolds(span){
  film.laneHolds=new Map();
  // Correctif strictement mobile : le moteur desktop conserve exactement
  // son comportement et ses transitions actuelles.
  if(innerWidth>560)return;
  const realTracks=film.tracks.filter(track=>track.real);
  const boundaries=new Map();
  const addBoundary=(time,id,protectedEvent=false)=>{
    if(time>film.now)return;
    if(!boundaries.has(time))boundaries.set(time,{ids:new Set(),protectedEvent:false});
    const boundary=boundaries.get(time);
    boundary.ids.add(id);
    boundary.protectedEvent ||= protectedEvent;
  };
  realTracks.forEach(track=>{
    addBoundary(track.start,track.id,track.love);
    addBoundary(track.end,track.id,track.love);
    if(!track.continued&&track.end<film.now-DAY)addBoundary(Math.min(film.now,track.end+film.exitTail),track.id);
    if(track.death)addBoundary(track.death,track.id,true);
  });
  const ordered=[...boundaries].sort((a,b)=>a[0]-b[0]);
  realTracks.forEach(track=>{
    const changes=ordered
      .filter(([time])=>time>=track.start&&time<=Math.min(film.now,track.personEnd+film.exitTail))
      .map(([time,boundary])=>({time,...boundary,from:rawSlot(track,time-1),to:rawSlot(track,time+1)}))
      .filter(change=>Math.abs(change.from-change.to)>.001);
    const holds=[];
    for(let i=0;i<changes.length-1;i++){
      const current=changes[i],next=changes[i+1];
      const returnsToOrigin=Math.abs(current.from-next.to)<.001;
      const brief=next.time-current.time<=span*.025;
      const concernsTrack=current.ids.has(track.id)||next.ids.has(track.id);
      const cinematicEvent=current.protectedEvent||next.protectedEvent;
      if(returnsToOrigin&&brief&&!concernsTrack&&!cinematicEvent){
        holds.push({start:current.time,end:next.time,slot:current.from});
        i++;
      }
    }
    film.laneHolds.set(track.id,holds);
  });
}
function buildDeceasedTransitions(span){
  film.deceasedTransitions=new Map();
  const realTracks=film.tracks.filter(track=>track.real);
  const boundaries=[];
  realTracks.forEach(track=>{
    if(!track.continuesFromPrevious)boundaries.push({time:track.start,type:"enter"});
    if(!track.continued&&track.end<film.now-DAY)boundaries.push({time:Math.min(film.now,track.end+film.exitTail),type:"leave"});
    if(track.death)boundaries.push({time:track.death,type:"death"});
  });
  const unique=[...new Map(boundaries.sort((a,b)=>a.time-b.time).map(item=>[`${item.time}:${item.type}`,item])).values()];
  const deceased=[...new Map(realTracks.filter(track=>track.death).map(track=>[track.id,track])).values()];
  deceased.forEach(track=>{
    const changes=unique
      .filter(item=>item.time>=track.death&&item.time<=film.now)
      .map(item=>({
        ...item,
        from:rawSlot(track,item.time-1),
        to:rawSlot(track,item.time+1)
      }))
      .filter(item=>Math.abs(item.from-item.to)>.001);
    const compact=[];
    for(let i=0;i<changes.length;i++){
      const current=changes[i],next=changes[i+1];
      // Un bref remplacement sur la même piste ne doit pas dessiner un V :
      // la personne décédée reste au-dessus pendant le passage de relais.
      if(next&&Math.abs(current.from-next.to)<.001&&next.time-current.time<span*.012){
        compact.push({
          time:current.time,type:"hold",from:current.from,to:current.from,
          fixedStart:current.time,fixedEnd:next.time
        });
        i++;
        continue;
      }
      compact.push(current);
    }
    const transitions=compact.map((item,index)=>{
      if(item.type==="hold")return {...item,start:item.fixedStart,end:item.fixedEnd};
      const death=item.type==="death";
      let start=death?item.time:item.type==="enter"?item.time-span*.008:item.time;
      let end=death?item.time+span*.018:item.type==="enter"?item.time:item.time+span*.008;
      const previous=compact[index-1],next=compact[index+1];
      if(previous){
        const previousNaturalEnd=previous.type==="death"
          ? previous.time+span*.018
          : previous.type==="enter"?previous.time:previous.time+span*.008;
        if(previousNaturalEnd>start)start=(previous.time+item.time)/2;
      }
      if(next){
        const nextNaturalStart=next.type==="death"
          ? next.time
          : next.type==="enter"?next.time-span*.008:next.time;
        if(end>nextNaturalStart)end=(item.time+next.time)/2;
      }
      return {...item,start,end:Math.max(start+DAY,end)};
    });
    film.deceasedTransitions.set(track.id,transitions);
  });
}
function smoothSlot(track,time){
  if(!track.real)return track.slot;
  if(track.death&&time>=track.death){
    const transitions=film.deceasedTransitions.get(track.id)||[];
    const transition=transitions.find(item=>time>=item.start&&time<=item.end);
    if(transition){
      const q=Math.max(0,Math.min(1,(time-transition.start)/(transition.end-transition.start)));
      const s=q*q*(3-2*q);
      return transition.from+(transition.to-transition.from)*s;
    }
    return rawSlot(track,time);
  }
  const transitions=film.laneTransitions.get(track)||[];
  const transition=transitions.find(item=>time>=item.hold&&time<=item.end);
  if(track.love&&time>=track.start&&time<=track.end&&!transition?.loveTransition){
    return rawSlot(track,time);
  }
  const laneHold=(film.laneHolds.get(track.id)||[]).find(item=>time>=item.start&&time<=item.end);
  if(laneHold)return laneHold.slot;
  if(transition){
    if(time<=transition.start)return transition.from;
    const q=Math.max(0,Math.min(1,(time-transition.start)/(transition.end-transition.start)));
    const s=q*q*(3-2*q);
    return transition.from+(transition.to-transition.from)*s;
  }
  // Hors de sa transition d'arrivée en couple, le partenaire garde toujours
  // la piste immédiatement voisine de celle du propriétaire.
  if(track.love&&time>=track.start&&time<=track.end)return rawSlot(track,time);
  const waiting=transitions.find(item=>time>=item.freezeFrom&&time<item.hold);
  if(waiting)return waiting.from;
  return rawSlot(track,time);
}
function entryTrackY(track,time,targetY,span){
  // Une reprise après un chapitre « éloignement » est une vraie réentrée.
  // Seuls les changements continus ami/amour restent déjà installés.
  const animatedEntry=track.real&&!track.continuesFromPrevious;
  const nextChapter=film.tracks
    .filter(other=>other.real&&other.id===track.id&&other.start>track.start)
    .sort((a,b)=>a.start-b.start)[0];
  const naturalEnd=track.start+span*.014;
  const entryEnd=nextChapter?Math.min(naturalEnd,nextChapter.start):naturalEnd;
  if(!animatedEntry||time>=entryEnd)return targetY;
  const duration=Math.max(DAY,entryEnd-track.start);
  const q=Math.max(0,Math.min(1,(time-track.start)/duration));
  const originY=track.slot<0?-50:innerHeight+50;
  const smooth=q*q*(3-2*q);
  return originY+(targetY-originY)*smooth;
}
function drawPath(track,from,to,current,pxPerMs,centerY,gap,span,dashed=false){
  if(to<=from)return;
  const interval=track.real?span*.0012:span*.006;
  const steps=Math.max(2,Math.min(track.real?260:36,Math.ceil((to-from)/interval)));
  ctx.lineCap="round";ctx.lineJoin="round";
  ctx.beginPath();
  for(let i=0;i<=steps;i++){
    const time=from+(to-from)*(i/steps),x=innerWidth/2+(time-current)*pxPerMs;
    const laneY=centerY+smoothSlot(track,time,span)*gap,y=entryTrackY(track,time,laneY,span);
    if(i===0)ctx.moveTo(Math.max(-60,x),y);else ctx.lineTo(x,y);
  }
  if(dashed)ctx.setLineDash([6,8]);ctx.stroke();
}
function easeOutBack(x){const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2)}
function draw(t){
  const W=innerWidth,H=innerHeight,birth=dateNum(state.owner.birth),now=film.now,span=now-birth;
  if(!film.lastFrame)film.lastFrame=t;
  const previousP=Math.min(1,film.elapsed/film.duration),previousDate=birth+span*previousP;
  const motionWindow=span*.026;
  const movementScore=film.motionEvents.reduce((score,event)=>{
    const proximity=Math.max(0,1-Math.abs(event.time-previousDate)/motionWindow);
    return score+proximity*event.weight;
  },0);
  const endSlowdown=.95*Math.pow(previousP,3.2);
  const calmSpeed=1.48-endSlowdown;
  const baseEffective=film.speed==="auto"?Math.max(.1,calmSpeed/(1+movementScore*.58)):Number(film.speed);
  const loveSlowdown=film.speed==="auto"?film.motionEvents.reduce((strength,event)=>{
    if(event.type!=="loveStart")return strength;
    const proximity=Math.max(0,1-Math.abs(event.time-previousDate)/(span*.012));
    return Math.max(strength,proximity);
  },0):0;
  const brakeProgress=Math.max(0,Math.min(1,(previousP-.95)/.05));
  const brakeCurve=brakeProgress*brakeProgress*(3-2*brakeProgress);
  const endBrake=1-.55*brakeCurve;
  const cameraBrake=1-.82*Math.pow(Math.min(1,film.cameraMotion),1.4);
  const effective=baseEffective*(1-.42*loveSlowdown)*endBrake*cameraBrake;
  const holdingBirth=t<film.birthHoldUntil;
  if(!film.paused&&!holdingBirth)film.elapsed+=Math.min(50,t-film.lastFrame)*effective;
  film.lastFrame=t;
  const p=Math.min(1,Math.max(0,film.elapsed/film.duration)), eased=p;
  const current=birth+span*eased, pxPerMs=(W*.78)/(span*.115);
  // Les entrées ne comptent qu'une fois installées. En revanche, une personne
  // qui sort reste dans le calcul tant que son profil est encore dans le cadre.
  const settledReal=[...new Map(film.tracks.filter(r=>{
    if(!r.real||r.start>current)return false;
    const animatedEntry=!r.continuesFromPrevious;
    if(animatedEntry){
      const nextChapter=film.tracks
        .filter(other=>other.real&&other.id===r.id&&other.start>r.start)
        .sort((a,b)=>a.start-b.start)[0];
      const entryEnd=nextChapter?Math.min(r.start+span*.014,nextChapter.start):r.start+span*.014;
      if(current<entryEnd)return false;
    }
    if(r.end>=current)return true;
    if(r.continued)return false;
    const exitX=W/2+(r.end-current)*pxPerMs;
    return exitX>-90;
  }).map(r=>[r.id,r])).values()];
  // Attribution indépendante pour le cadrage : une arrivée encore animée ne
  // peut ainsi pas modifier indirectement le rang des personnes déjà posées.
  const framedDeceased=settledReal
    .filter(r=>r.death&&current>=r.death)
    .sort((a,b)=>a.death-b.death);
  const framedLiving=settledReal.filter(r=>!framedDeceased.some(d=>d.id===r.id));
  const framedUpper=framedLiving.filter(r=>r.slot<0).sort((a,b)=>Math.abs(a.slot)-Math.abs(b.slot));
  const framedLower=framedLiving.filter(r=>r.slot>=0).sort((a,b)=>Math.abs(a.slot)-Math.abs(b.slot));
  const framedLover=framedLiving.find(r=>r.love&&r.end>=current);
  const visibleSlots=settledReal.map(track=>{
    const deceasedIndex=framedDeceased.findIndex(r=>r.id===track.id);
    if(deceasedIndex>=0)return -(framedUpper.length+1+deceasedIndex);
    const sign=track.slot<0?-1:1;
    const side=sign<0?framedUpper:framedLower;
    if(framedLover?.id===track.id)return sign;
    const sameSideLover=framedLover&&Math.sign(framedLover.slot||1)===sign;
    const ordered=sameSideLover?side.filter(r=>r.id!==framedLover.id):side;
    const rank=ordered.findIndex(r=>r.id===track.id);
    return rank<0?track.slot:sign*(rank+1+(sameSideLover?1:0));
  });
  const upperDepth=Math.max(0,...visibleSlots.filter(slot=>slot<0).map(Math.abs));
  const lowerDepth=Math.max(0,...visibleSlots.filter(slot=>slot>0));
  const normalGap=112,topSafe=100,bottomSafe=H-145;
  const totalDepth=upperDepth+lowerDepth;
  const fittedGap=totalDepth>0?(bottomSafe-topSafe)/totalDepth:normalGap;
  const targetRealGap=Math.min(normalGap,Math.max(24,fittedGap));
  const minCenter=topSafe+upperDepth*targetRealGap;
  const maxCenter=bottomSafe-lowerDepth*targetRealGap;
  const targetCenterY=minCenter<=maxCenter
    ? Math.max(minCenter,Math.min(maxCenter,H/2))
    : topSafe+upperDepth*targetRealGap;
  if(!film.centerY)film.centerY=H/2;
  film.centerY+=(targetCenterY-film.centerY)*.06;
  const centerY=film.centerY;
  // Le cadrage normal reste la référence. On ne réduit l'écartement que si
  // l'ensemble de la pile ne tient réellement plus dans la zone visible.
  film.heldGap=targetRealGap;
  const stableGapTarget=targetRealGap;
  film.realGap+=(stableGapTarget-film.realGap)*.06;
  const realGap=film.realGap;
  const focusWindow=span*.018;
  let focusEvent=null,focusStrength=0;
  film.motionEvents.forEach(event=>{
    const strength=Math.max(0,1-Math.abs(event.time-current)/focusWindow)*Math.min(1,event.weight/2);
    if(strength>focusStrength){focusStrength=strength;focusEvent=event}
  });
  if(focusEvent)film.focusEvent=focusEvent;
  if(focusStrength>film.heldFocus){
    film.heldFocus=focusStrength;film.focusHoldUntil=t+1400;
  }else if(t>=film.focusHoldUntil){
    film.heldFocus=focusStrength;
  }
  const stableFocusTarget=t<film.focusHoldUntil?Math.max(focusStrength,film.heldFocus):focusStrength;
  film.displayFocus+=(stableFocusTarget-film.displayFocus)*(stableFocusTarget>film.displayFocus ? .09 : .022);
  focusStrength=film.displayFocus;
  focusEvent=film.focusEvent;
  if(focusStrength<.002&&t>=film.focusHoldUntil)film.focusEvent=null;
  const gapMotion=Math.abs(stableGapTarget-film.realGap)/45;
  const centerMotion=Math.abs(targetCenterY-film.centerY)/120;
  const focusMotion=Math.abs(focusStrength-film.lastFocusStrength)*4;
  film.cameraMotion=Math.min(1,Math.max(gapMotion,centerMotion,focusMotion));
  film.lastFocusStrength=focusStrength;
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#07080b";ctx.fillRect(0,0,W,H);
  ctx.save();
  if(focusEvent&&focusStrength>0){
    const zoom=1+focusStrength*.105;
    const focusX=W/2+(focusEvent.time-current)*pxPerMs;
    const focusY=centerY+smoothSlot(focusEvent.track,focusEvent.time,span)*realGap;
    ctx.translate(focusX,focusY);ctx.scale(zoom,zoom);ctx.translate(-focusX,-focusY);
  }
  // year ticks move through the fixed playhead
  const year=new Date(current).getFullYear(), yearStart=year-8;
  ctx.font="10px DM Sans";ctx.textAlign="center";
  for(let y=yearStart;y<=year+8;y++){const x=W/2+(dateNum(`${y}-01-01`)-current)*pxPerMs;ctx.strokeStyle="#25262b";ctx.beginPath();ctx.moveTo(x,centerY-9);ctx.lineTo(x,H-74);ctx.stroke();ctx.fillStyle="#62636a";ctx.fillText(y,x,H-56)}
  // self line
  const selfStartX=W/2+(birth-current)*pxPerMs;
  ctx.strokeStyle="#ddd9d0";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(Math.max(-20,selfStartX),centerY);ctx.lineTo(W/2,centerY);ctx.stroke();
  // tracks: active ends at playhead; finished slides left
  const active=film.tracks.filter(r=>r.start<=current&&r.end>=current);
  const orderedTracks=[...film.tracks].sort((a,b)=>Number(a.real)-Number(b.real));
  orderedTracks.forEach(r=>{
    if(r.start>current)return;
    const endX=W/2+(Math.min(r.end,current)-current)*pxPerMs;
    const deathX=r.death?W/2+(Math.min(r.death,current)-current)*pxPerMs:null;
    const gap=r.real?realGap:Math.min(34,Math.max(22,(H-180)/18));
    const endpointTime=r.death&&current>r.death?r.death:Math.min(r.end,current);
    const targetY=centerY+smoothSlot(r,endpointTime,span)*gap;
    const entryFade=r.continuesFromPrevious?1:(current-r.start)/(span*.006);
    const personExitX=W/2+(r.personEnd-current)*pxPerMs;
    const historyFade=r.real
      ? (current<=r.personEnd?1:Math.max(0,Math.min(1,(personExitX+90)/140)))
      : (current<=r.end?1:Math.max(0,1-(current-r.end)/(span*.025)));
    const fade=Math.min(1,entryFade,historyFade);
    ctx.save();ctx.globalAlpha=fade*(r.real?1:.001);ctx.strokeStyle=r.color;ctx.lineWidth=r.real?2.2:.4;
    drawPath(r,r.start,r.death&&current>r.death?r.death:Math.min(r.end,current),current,pxPerMs,centerY,gap,span);
    if(r.death&&current>r.death){ctx.globalAlpha=fade*.65;drawPath(r,r.death,Math.min(r.end,current),current,pxPerMs,centerY,gap,span,true)}
    ctx.restore();
    let avatarY=targetY;
    if(r.end>=current)avatarY=entryTrackY(r,current,targetY,span);
    if(r.death&&current>r.death){
      drawAvatar(r,deathX,targetY,fade,true,false);
      const livingY=centerY+smoothSlot(r,current,span)*gap;
      drawAvatar(r,endX,livingY,fade*.78,true,true);
    }else if(!(r.continued&&current>r.end))drawAvatar(r,endX,avatarY,fade*(r.real?1:.002),r.end<current-DAY);
  });
  drawAvatar({id:"owner",name:state.owner.name,color:"#e8e4dc",real:true},W/2,centerY,1,false);
  ctx.fillStyle="#aaa8a3";ctx.font="12px DM Sans";ctx.textAlign="left";ctx.fillText(`${Math.max(0,Math.floor((current-birth)/(365.2425*DAY)))} ans`,W/2+32,centerY+20);
  if(holdingBirth){
    ctx.save();ctx.fillStyle="#e8e4dc";ctx.font="600 11px DM Sans";ctx.textAlign="center";
    ctx.fillText("NAISSANCE",W/2,centerY-52);ctx.restore();
  }
  if(p>.982){
    const todayAlpha=Math.min(1,(p-.982)/.012);
    ctx.save();ctx.globalAlpha=todayAlpha;ctx.strokeStyle="#f05d69";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(W/2,H-92);ctx.lineTo(W/2,H-62);ctx.stroke();
    ctx.fillStyle="#f05d69";ctx.font="600 10px DM Sans";ctx.textAlign="center";ctx.fillText("AUJOURD’HUI",W/2,H-101);ctx.restore();
  }
  // Les symboles amoureux sont dessinés en dernier dans le canvas afin de
  // rester devant chaque profil, y compris celui du propriétaire.
  const lover=active.find(r=>r.real&&r.love);
  const loverTransition=lover&&(film.laneTransitions.get(lover)||[])
    .find(item=>item.loveTransition&&current>=item.hold&&current<=item.end);
  if(lover&&!loverTransition){
    const loverY=centerY+smoothSlot(lover,current,span)*realGap;
    ctx.save();ctx.fillStyle="#ff6684";ctx.font="18px serif";ctx.textAlign="center";ctx.shadowColor="#ff6684";ctx.shadowBlur=10;ctx.fillText("♥",W/2,(centerY+loverY)/2+6);ctx.restore();
  }
  const loveArrival=film.motionEvents.find(event=>event.type==="loveStart"&&current>=event.time&&current<=event.time+span*.014);
  if(loveArrival){
    const q=(current-loveArrival.time)/(span*.014);
    const finalLoverY=centerY+Math.sign(rawSlot(loveArrival.track,loveArrival.time+span*.002)||1)*realGap;
    const scale=.25+easeOutBack(Math.min(1,q*1.8))*.95;
    ctx.save();ctx.globalAlpha=Math.max(0,1-q);ctx.translate(W/2,(centerY+finalLoverY)/2);ctx.scale(scale,scale);
    ctx.fillStyle="#ff6684";ctx.font="30px serif";ctx.textAlign="center";ctx.shadowColor="#ff6684";ctx.shadowBlur=20;ctx.fillText("♥",0,8);ctx.restore();
  }
  const breakup=film.motionEvents.find(event=>event.type==="loveEnd"&&current>=event.time&&current<=event.time+span*.014);
  if(breakup){
    const q=(current-breakup.time)/(span*.014);
    const formerY=centerY+rawSlot(breakup.track,breakup.time-1)*realGap;
    const eventX=W/2+(breakup.time-current)*pxPerMs;
    ctx.save();ctx.globalAlpha=Math.max(0,1-q);ctx.font=`${24+8*Math.sin(Math.PI*q)}px serif`;ctx.textAlign="center";
    ctx.shadowColor="#ff6684";ctx.shadowBlur=14;ctx.fillText("💔",(W/2+eventX)/2,(centerY+formerY)/2+7);ctx.restore();
  }
  ctx.restore();
  const currentDate=new Date(current);
  $("#film-year").textContent=currentDate.getFullYear();
  $("#film-month").textContent=currentDate.toLocaleDateString("fr-FR",{month:"long"});
  $("#progress-bar").style.width=`${p*100}%`;
  if(p>=1){cancelAnimationFrame(film.raf);clearTimeout(film.endingTimer);film.endingTimer=setTimeout(()=>$("#ending").classList.add("show"),3000);return}
  film.raf=requestAnimationFrame(draw);
}
function startFilm(){
  cancelAnimationFrame(film.raf);clearTimeout(film.openingTimer);clearTimeout(film.endingTimer);$("#ending").classList.remove("show");$("#opening").classList.remove("hidden");
  film.speed=$("#speed").value;film.paused=false;film.elapsed=0;film.lastFrame=0;film.realGap=112;film.heldGap=112;film.centerY=0;film.cameraMotion=0;film.lastFocusStrength=0;film.displayFocus=0;film.heldFocus=0;film.focusEvent=null;film.gapHoldUntil=0;film.focusHoldUntil=0;film.birthHoldUntil=0;
  film.openingTimer=setTimeout(()=>{
    $("#opening").classList.add("hidden");film.lastFrame=0;film.birthHoldUntil=performance.now()+2000;
    film.raf=requestAnimationFrame(draw);
  },1800);
}
function renderEndingFaces(){
  const container=$("#ending-faces");container.replaceChildren();
  state.people.forEach(person=>{
    const stillHere=person.chapters.some(c=>c.today&&c.kind!=="away");
    const remembered=!stillHere&&person.chapters.some(c=>c.deceased&&c.kind!=="away");
    if(!stillHere&&!remembered)return;
    const face=document.createElement("span");
    face.className=`ending-face${remembered?" deceased":""}`;
    face.title=person.name||"Une présence";
    if(person.photo)face.style.backgroundImage=`url("${person.photo}")`;
    else face.textContent=(person.name?.[0]||"•").toUpperCase();
    container.append(face);
  });
}
function launch(){
  state.owner.name=$("#owner-name").value.trim();state.owner.birth=$("#birth-date").value;
  if(!state.owner.name||!state.owner.birth){$("#identity-form").reportValidity();return}
  if(!state.owner.photo)film.images.delete("owner");else loadImage(state.owner.photo,"owner");
  save();buildTracks();resize();$("#opening-name").textContent=state.owner.name;
  const remain=state.people.filter(p=>p.chapters.some(c=>(c.today||c.deceased)&&c.kind!=="away")).map(p=>p.name).filter(Boolean);
  $("#thanks").textContent=remain.length?`Merci ${remain.join(", ")}. Pour tout ce temps.`:"Certaines présences n’ont pas besoin de fin.";
  renderEndingFaces();
  $("#film").classList.add("active");$("#film").setAttribute("aria-hidden","false");clearTimeout(film.launchTimer);film.launchTimer=setTimeout(startFilm,500);
  document.body.classList.add("watching");
}
function closeFilm(){
  cancelAnimationFrame(film.raf);clearTimeout(film.launchTimer);clearTimeout(film.openingTimer);clearTimeout(film.endingTimer);
  $("#ending").classList.remove("show");$("#opening").classList.add("hidden");
  $("#film").classList.remove("active");$("#film").setAttribute("aria-hidden","true");document.body.classList.remove("watching");
}
$("#play-toggle").onclick=()=>{if(film.paused){film.paused=false;film.lastFrame=0;film.raf=requestAnimationFrame(draw);$("#play-toggle").textContent="Ⅱ"}else{film.paused=true;cancelAnimationFrame(film.raf);$("#play-toggle").textContent="▶"}};
$("#speed").onchange=()=>film.speed=$("#speed").value;
addEventListener("resize",resize);
init();
