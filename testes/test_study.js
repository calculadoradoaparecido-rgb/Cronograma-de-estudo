const {JSDOM}=require('jsdom');const fs=require('fs');
const {boot}=require('./harness.js');
(async()=>{const w=await boot();
const $=id=>w.document.getElementById(id);const get=e=>w.eval(e);
let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
// seed a contest with subject + topics
w.eval(`data.contests[0].subjects=['Português','Direito Civil'];data.contests[0].topics=[{id:'t1',subject:'Português',text:'Crase',done:false},{id:'t2',subject:'Português',text:'Pontuação',done:false},{id:'t3',subject:'Direito Civil',text:'LINDB',done:false}];save();`);
w.showPage('study');
ok($('studyTopics').querySelectorAll('input:checked').length===0,'no topics checked by default');
$('studySubject').value='Português';w.renderStudyTopics();
ok($('studyTopics').querySelectorAll('input').length===2,'topics listed for subject');
// validation
$('studyMinutes').value='';w.saveStudy();
ok(get('activeContest().sessions.length')===0,'empty minutes rejected');
$('studyMinutes').value='40';$('studyQuestions').value='5';$('studyCorrect').value='9';w.saveStudy();
ok(get('activeContest().sessions.length')===0,'correct > questions rejected');
// valid save with topic
$('studyMinutes').value='40';$('studyQuestions').value='10';$('studyCorrect').value='7';$('studyNotes').value='revisar';
const xpBefore=get('data.panda.xp');
const firstTopic=$('studyTopics').querySelector('input');firstTopic.checked=true;
w.saveStudy();
ok(get('activeContest().sessions.length')===1,'session saved');
const sess=get('activeContest().sessions[0]');
ok(sess.topicIds.length===1 && sess.topicIds[0]===firstTopic.value,'topic linked to session');
ok(get('activeContest().topics.find(t=>t.id===activeContest().sessions[0].topicIds[0]).done')===true,'linked topic marked done');
const xpGained=get('data.panda.xp')-xpBefore;
ok(xpGained>=5,'XP awarded: +'+xpGained);
ok(get('activeContest().sessions[0].createdAt')!==undefined,'createdAt stored');
// edit: XP must not change
w.editStudy(sess.id);
ok($('studyFormTitle').textContent.includes('Editar'),'edit mode title');
ok($('studyMinutes').value==='40' && $('studySubject').value==='Português','edit loads fields');
$('studyMinutes').value='60';w.saveStudy();
ok(get('activeContest().sessions[0].minutes')===60,'edit updates minutes');
ok(get('data.panda.xp')===xpBefore+xpGained,'edit keeps XP unchanged');
ok(!$('studyCancelEdit').hidden===false || $('studyCancelEdit').hidden===true,'cancel hidden after save');
// delete keeps XP
const xpNow=get('data.panda.xp');
w.deleteStudy(sess.id);
ok(get('activeContest().sessions.length')===0,'delete removes session');
ok(get('data.panda.xp')===xpNow,'delete keeps XP');
// totals + filter
w.eval(`activeContest().sessions.push({id:'a1',subject:'Português',date:todayISO(),minutes:30,questions:10,correct:10,type:'Teoria',notes:'',topicIds:[],createdAt:new Date().toISOString()},{id:'a2',subject:'Direito Civil',date:todayISO(),minutes:90,questions:0,correct:0,type:'Teoria',notes:'',topicIds:[],createdAt:new Date().toISOString()});save();`);
w.renderStudy();
ok($('studyTotals').textContent.includes('2h 00') ,'today total sums sessions (2h 00)');
ok($('studyHistory').querySelectorAll('.session').length===2,'history shows 2 sessions');
$('studyFilterSubject').value='Direito Civil';w.renderStudy();
ok($('studyHistory').querySelectorAll('.session').length===1,'subject filter works');
// focus
w.focusPreset(25);
ok($('focusDisplay').textContent==='25:00','focus preset 25');
w.focusReset();
get('focus.left=600');w.focusRender();
w.focusUseElapsed();
ok($('studyMinutes').value==='15','use elapsed fills minutes (15 min elapsed)');
w.focusPreset(50); w.focusDone && get('focus.left=0');
w.focusDone();
ok($('studyMinutes').value==='50','focus done fills full cycle minutes');
w.focusPreset(25);
ok(get('focus.running')===false,'not running after preset');
console.log(f?`\n${f} FAILED`:'\nALL PASSED');
process.exit(f?1:0);

})().catch(e=>{console.error('ERR',e);process.exit(1)});
