const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js','utf8');
const prepare = source.slice(source.indexOf('function prepareOverview(){'), source.indexOf('// Essai de conclusion'));
const first={id:'a',real:true,start:10,end:20};
const second={id:'a',real:true,start:20,end:30,continuesFromPrevious:true};
const film={now:30,tracks:[first,second],overviewSamples:new Map([
  [first,[{time:11,slot:2},{time:19,slot:3}]],
  [second,[{time:21,slot:4},{time:29,slot:5}]]
])};
const context={film,state:{owner:{birth:'unused'}},dateNum:()=>0,smoothSlot:()=>0,DAY:1};
vm.createContext(context);
vm.runInContext(prepare+'\nprepareOverview();',context);
const firstPoints=film.overviewGeometry.get(first),secondPoints=film.overviewGeometry.get(second);
assert.equal(firstPoints[0].time,10);
assert.equal(firstPoints.at(-1).time,20);
assert.equal(secondPoints[0].time,20);
assert.equal(secondPoints[0].slot,firstPoints.at(-1).slot);
assert.equal(secondPoints.at(-1).time,30);
assert.equal(secondPoints.at(-1).slot,5);
console.log('Historique conservé et chapitres continus raccordés.');
