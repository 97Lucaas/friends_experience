const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app.js', 'utf8');
const engine = source.slice(source.indexOf('let film='), source.indexOf('function entryTrackY'));
const state = {owner:{birth:'2003-01-06'},people:[
  {id:'romain',name:'Romain',order:1,photo:'',color:'#aaa',chapters:[{kind:'friend',start:'2003-03-01',end:'2024-06-14',deceased:true}]},
  {id:'ilona',name:'Ilona',order:9,photo:'',color:'#aaa',chapters:[{kind:'friend',start:'2024-02-01',end:'2024-03-01'},{kind:'love',start:'2024-03-01',end:'2024-05-01'}]}
]};
const context = {state,innerWidth:1600,innerHeight:900,DAY:86400000,COLORS:['#aaa']};
vm.createContext(context);
vm.runInContext(engine+'\nbuildTracks(); globalThis.film=film; globalThis.smoothSlot=smoothSlot; globalThis.dateNum=dateNum;',context);
const romain=context.film.tracks.find(track=>track.id==='romain');
const before=context.smoothSlot(romain,context.dateNum('2024-04-30'));
for(const date of ['2024-05-02','2024-05-20','2024-06-13','2024-06-14']){
  assert.equal(context.smoothSlot(romain,context.dateNum(date)),before,`Romain change de piste trop tôt le ${date}`);
}
console.log('Départ d’Ilona avant le décès de Romain : piste conservée.');
