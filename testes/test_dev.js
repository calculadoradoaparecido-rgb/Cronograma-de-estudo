const {JSDOM}=require('jsdom');const fs=require('fs');
const {boot}=require('./harness.js');
(async()=>{const w=await boot();
const $=id=>w.document.getElementById(id);const get=e=>w.eval(e);
let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
ok($('devNav').classList.contains('hidden'),'dev hidden by default');
w.setDevMode(true);
ok(!$('devNav').classList.contains('hidden') && !$('devOpen').classList.contains('hidden'),'dev enabled shows nav + open button');
w.showPage('dev');
ok($('page-dev').classList.contains('active'),'dev page opens');
ok($('devNeeds').querySelectorAll('input[type=range]').length===4,'four need sliders');
ok($('devSlot-head').options.length>=2,'accessory selects filled');
w.showPage('home');
ok(!$('devBack').classList.contains('hidden'),'floating dev shortcut on home');
// state
w.showPage('dev');
$('devXp').value=1250; w.applyDevState();
ok(get('data.panda.xp')===1250,'xp applied');
ok($('pandaArtwork').classList.contains('growth-stage-3'),'xp 1250 -> stage 3 on panda');
// lock override
w.setLook('fur','rosa'); ok(get('data.panda.look.fur')==='rosa','rosa unlocked at 1250xp (needs 800)');
get("data.panda.xp=100"); w.save(); w.setLook('bg','por-do-sol'); ok(get('data.panda.look.bg')==='estrelas','bg locked at 100xp');
$('devUnlock').checked=true; get("data.panda.devUnlock=true"); w.save();
w.setLook('bg','por-do-sol'); ok(get('data.panda.look.bg')==='por-do-sol','devUnlock lets locked bg apply');
// apply look from dev select
$('devFur').value='cafe'; $('devBg').value='biblioteca'; $('devSlot-head').value='crown';
w.applyDevLook();
ok(get('data.panda.look.fur')==='cafe' && get('data.panda.equipped.head')==='crown','dev look+accessory applied');
ok($('pandaArtwork').classList.contains('look-fur-cafe'),'cafe class on svg');
// poses
w.devPose('celebrate');
ok($('pandaArtwork').classList.contains('pose-celebrate'),'celebrate pose class added');
// simulate study
const before=get('activeContest().sessions.length');
w.devSimulateStudy(30,10,7);
ok(get('activeContest().sessions.length')===before+1,'simulated session stored');
ok(get('activeContest().sessions.at(-1).notes')==='[dev] sessão simulada','session tagged [dev]');
w.devClearTestSessions();
ok(get('activeContest().sessions.length')===before,'test sessions cleared');
// pause
w.devToggleAnim(); ok(w.document.body.classList.contains('dev-paused'),'pause toggled');
w.devToggleAnim();
// dev off hides and leaves page
w.showPage('dev'); w.setDevMode(false);
ok($('devNav').classList.contains('hidden') && $('page-settings').classList.contains('active'),'disabling dev returns to settings and hides nav');
// backup excludes dev flag (flag is localStorage, not data)
ok(get('Object.keys(data).join(",")')==='contests,activeId,panda,settings' || get('Object.keys(data).join(",")').indexOf('dev')===-1,'dev flag not in data/backup');
console.log(f?`\n${f} FAILED`:'\nALL PASSED');
process.exit(f?1:0);

})().catch(e=>{console.error('ERR',e);process.exit(1)});
