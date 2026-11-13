const {JSDOM}=require('jsdom');
const fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const {boot}=require('./harness.js');
(async()=>{const w=await boot();
const $=id=>w.document.getElementById(id);
let fails=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)fails++};
const get=e=>w.eval(e);
ok($('pandaCard').classList.contains('bg-estrelas'),'default background class applied');
ok($('pandaArtwork').classList.contains('look-fur-noturno')===false && $('pandaArtwork').classList.contains('growth-stage-0'),'stage 0 at start, default fur');
ok($('pandaNameTitle').textContent==='Panda','default name shown: '+$('pandaNameTitle').textContent);
w.setLook('fur','rosa');
ok(get('data.panda.look.fur')==='classico','locked fur rejected at xp=0');
$('pandaNameInput').value='  Bambi  ';
w.savePandaName();
ok(get('data.panda.name')==='Bambi','name trimmed and saved');
ok($('pandaNameTitle').textContent==='Bambi','title updates with name');
ok($('speech').textContent.includes('Bambi'),'speech uses name: '+$('speech').textContent);
w.eval('data.panda.xp=900'); w.save();
ok($('pandaArtwork').classList.contains('growth-stage-2'),'xp 900 -> growth stage 2');
w.setLook('fur','rosa');
ok(get('data.panda.look.fur')==='rosa','unlocked fur applied');
ok($('pandaArtwork').classList.contains('look-fur-rosa'),'fur class on svg');
w.setLook('bg','oceano');
ok($('pandaCard').classList.contains('bg-oceano') && !$('pandaCard').classList.contains('bg-estrelas'),'bg swapped, old removed');
ok($('furOptions').innerHTML.includes('Algodão-doce'),'fur options rendered');
ok($('bgOptions').innerHTML.includes('Por do sol') && $('bgOptions').innerHTML.includes('Desbloqueia com 1000 XP'),'bg options rendered, 900xp unlocks through 600');
// reset keeps name and look
w.resetPanda=w.resetPanda; // confirm stubbed
w.eval("data.panda.xp=1200");
get("resetPanda()");
ok(get('data.panda.xp')===0 && get('data.panda.name')==='Bambi' && get('data.panda.look.fur')==='rosa','reset keeps name+look, zeroes xp');
// migration
const raw={version:8,contests:[{id:'a',name:'X',subjects:[],topics:[],sessions:[],week:[[],[],[],[],[],[],[]]}],activeId:'a',panda:{xp:10}};
const mig=get(`normalizeData(${JSON.stringify(raw)})`);
ok(mig.panda.name==='Panda' && mig.panda.look.fur==='classico' && mig.panda.look.bg==='estrelas','migration adds name/look defaults');
// date helper uses local date
ok(get("isoOf(new Date(2026,10,3,23,30))")==='2026-11-03','isoOf local date at 23:30');
// performance chart renders without error
w.showPage('performance');
ok($('dailyBars').children.length===14,'daily bars = 14 days');
const lastLabel=$('dailyBars').lastElementChild.textContent;
ok(lastLabel===String(new Date().getDate()).padStart(2,'0'),'last bar is today (local): '+lastLabel);
console.log(fails?`\n${fails} FAILED`:'\nALL PASSED');
process.exit(fails?1:0);

})().catch(e=>{console.error('ERR',e);process.exit(1)});
