const {load,boot,createAccount}=require('./harness.js');
(async()=>{
let f=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)f++};
const $=id=>null;
// 1. no session -> login visible, nothing persisted
let w=load();
const d=w.document;
ok(!d.getElementById('loginScreen').hidden,'login screen shown with no session');
ok(d.getElementById('formCreate').hidden===false || d.getElementById('formEnter').hidden===true,'create tab when no accounts');
ok(d.getElementById('loginError').textContent.includes('Nenhuma conta'),'no-account message');
ok(!w.localStorage.getItem('trilhaPandaUltimate_v5'),'no data persisted before login');
// validations
const fill=(n,p,p2)=>{d.getElementById('newName').value=n;d.getElementById('newPin').value=p;d.getElementById('newPin2').value=p2};
fill('','1234','1234'); await w.createAccount({preventDefault(){}}); ok(d.getElementById('loginError').textContent.includes('nome'),'empty name rejected');
fill('Ana','12','12'); await w.createAccount({preventDefault(){}}); ok(d.getElementById('loginError').textContent.includes('4 a 6'),'short PIN rejected');
fill('Ana','1234','9999'); await w.createAccount({preventDefault(){}}); ok(d.getElementById('loginError').textContent.includes('não coincidem'),'PIN mismatch rejected');
fill('Ana','1234','1234'); await w.createAccount({preventDefault(){}});
ok(d.getElementById('loginScreen').hidden===true,'account created -> enters app');
ok(d.getElementById('accountLabel').textContent==='Ana','account label shown');
w.eval('save()');ok(!!w.localStorage.getItem('trilhaPandaUltimate_v5:'+JSON.parse(w.localStorage.getItem('trilhaPandaAccounts'))[0].id),'data stored under account key after first save');
ok(JSON.parse(w.localStorage.getItem('trilhaPandaAccounts'))[0].hash!=='1234' && !w.localStorage.getItem('trilhaPandaAccounts').includes('1234'),'PIN not stored in plain text');
// duplicate name
w.eval("data.panda.xp=300;save()");
w.logout();
ok(!d.getElementById('loginScreen').hidden,'logout shows login');
ok(w.eval('data.panda.xp')===0,'logout clears in-memory data');
ok(w.localStorage.getItem('trilhaPandaSession')===null && w.sessionStorage.getItem('trilhaPandaSession')===null,'session removed on logout');
// wrong PIN + lock
d.getElementById('loginAccount').value=JSON.parse(w.localStorage.getItem('trilhaPandaAccounts'))[0].id;
const attempt=async pin=>{d.getElementById('loginPin').value=pin;await w.loginSubmit({preventDefault(){}})};
await attempt('0000'); ok(d.getElementById('loginError').textContent.includes('restantes'),'wrong PIN message');
for(let i=0;i<4;i++)await attempt('0000');
ok(d.getElementById('loginError').textContent.includes('30 s'),'locked after 5 wrong attempts');
ok(d.getElementById('loginScreen').hidden===false,'still locked out');
// correct PIN after lock time reset manually (simulate waiting)
w.eval("Object.keys(loginLock).forEach(k=>delete loginLock[k])");
await attempt('1234'); ok(d.getElementById('loginScreen').hidden===true,'correct PIN enters');
ok(w.eval('data.panda.xp')===300,'account data restored on login');
// 2. second account has separate data
w.logout();
d.getElementById('tabCreate').click();
fill('Bruno','5678','5678'); await w.createAccount({preventDefault(){}});
ok(w.eval('data.panda.xp')===0,'second account starts with empty data');
ok(d.getElementById('accountLabel').textContent==='Bruno','second account active');
// 3. legacy data adoption
const legacy=JSON.parse(JSON.stringify(w.eval('freshData()')));legacy.panda.xp=777;legacy.panda.name='Antigo';
const w2=load({legacy});
const d2=w2.document;
ok(!d2.getElementById('legacyNote').hidden,'legacy note shown when old data exists');
d2.getElementById('newName').value='Carla';d2.getElementById('newPin').value='1111';d2.getElementById('newPin2').value='1111';
await w2.createAccount({preventDefault(){}});
ok(w2.eval('data.panda.xp')===777 && w2.eval('data.panda.name')==='Antigo','legacy data adopted by first account');
// 4. restore session (kept connected)
const accs=JSON.parse(w2.localStorage.getItem('trilhaPandaAccounts'));
const w3=load({legacy:JSON.parse(w2.localStorage.getItem('trilhaPandaUltimate_v5')),accounts:accs,session:accs[0].id,keep:true});
ok(w3.document.getElementById('loginScreen').hidden===true,'kept-connected session restores without PIN');
ok(w3.eval('data.panda.xp')===777,'restored session loads its data');
// 5. session only (not kept) also restores in this tab
const w4=load({legacy:JSON.parse(w2.localStorage.getItem('trilhaPandaUltimate_v5')),accounts:accs,session:accs[0].id,keep:false});
ok(w4.document.getElementById('loginScreen').hidden===true,'tab session restores');
// 6. unknown session falls back to login
const w5=load({accounts:accs,session:'nope'});
ok(!w5.document.getElementById('loginScreen').hidden,'unknown session -> login');
console.log(f?`\n${f} FAILED`:'\nALL PASSED');
process.exit(f?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
