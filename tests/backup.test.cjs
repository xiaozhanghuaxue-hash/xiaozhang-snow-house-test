const assert=require('node:assert/strict');
const B=require('../dist/backup-core.js');
const fs=require('node:fs'),vm=require('node:vm');
const key='snow-house-mobile-v2';
const empty=()=>Object.fromEntries(B.groups.map(k=>[k,[]]));
const fixture={
 plans:[{id:'p1',date:'2026-10-15',time:'09:00',name:'手动安排',done:false,note:'保留\n换行'}],
 sales:[{id:'s1',date:'2026-10-15',receipt:2548.5,ship:12,note:'<b>原文</b>',shipping:'测试发货原文',items:[{name:'雪服',color:'白',size:'M',qty:2,cost:934.45},{name:'雪裤',color:'黑',size:'L',qty:1,cost:824.45}]}],
 teach:[{id:'t1',date:'2026-10-15',start:'10:00',hours:0.5,rate:200,fee:100,status:'done',note:'场地与学员'}],
 dealers:[{id:'d1',name:'测试雪店',location:'崇礼'}],orders:[{id:'o1',dealer:'d1',date:'2026-10-15',amount:80000,note:'第二次'}],
 other:[{id:'x1',date:'2026-10-15',project:'临时项目',amount:0}],categories:[{name:'雪服',sale:1699,cost:934.45}],
};
function storage(raw){const m=new Map([['unrelated','keep']]);if(raw!==null)m.set(key,raw);let failKey;return {m,getItem:k=>m.get(k)??null,setItem(k,v){if(k===failKey)throw Error('quota');m.set(k,v)},removeItem:k=>m.delete(k),fail(k){failKey=k}}}
function app(raw){const s=storage(raw),nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',insertAdjacentHTML(){},style:{},classList:{toggle(){}}});return nodes.get(id)};
const c=vm.createContext({SnowBackup:B,localStorage:s,document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},FormData:class{constructor(t){return new Map(Object.entries(t))}},alert:()=>{},navigator:{},setTimeout,Blob,File});
const html=fs.readFileSync(require('node:path').join(__dirname,'../dist/index.html'),'utf8');vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],c);vm.runInContext('openSheet=html=>{globalThis.sheetHTML=html};closeSheet=()=>{}',c);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/backup-ui.js'),'utf8'),c);return {s,c,el,run:t=>vm.runInContext(t,c)};}
(async()=>{
 const original=JSON.stringify(fixture),file=await B.create(fixture),text=JSON.stringify(file,null,2);
 assert.equal(JSON.stringify(fixture),original);
 assert.deepEqual((await B.parse(text)).data,fixture);
 const target=storage(null);const restored=B.restore(target,key,(await B.parse(text)).data,null);
 assert.deepEqual(restored,fixture);assert.equal(target.getItem('unrelated'),'keep');assert.deepEqual(JSON.parse(target.getItem(key)),fixture);
 assert.equal(JSON.parse(target.getItem(key+'-before-restore')).raw,null);
 B.restore(target,key,empty(),target.getItem(key));assert.deepEqual(JSON.parse(JSON.parse(target.getItem(key+'-before-restore')).raw),fixture);
 assert.throws(()=>B.restore(target,key,fixture,'stale'),/变化/);
 for(const failedKey of [key,key+'-before-restore']){const s=storage(original);s.fail(failedKey);assert.throws(()=>B.restore(s,key,empty(),original),/quota/);assert.equal(s.getItem(key),original)}
 const tampered=JSON.parse(text);tampered.data.sales[0].receipt++;
 await assert.rejects(()=>B.parse(JSON.stringify(tampered)),/校验失败/);
 for(const bad of ['',text.slice(0,-5),'{}',JSON.stringify({...file,version:2})])await assert.rejects(()=>B.parse(bad));
 const variants=[d=>delete d.sales,d=>d.sales[0].items[0].qty=-1,d=>d.sales[0].receipt='100',d=>d.sales.push(d.sales[0]),d=>d.orders[0].dealer='missing',d=>d.teach[0].start='<img src=x>',d=>d.sales[0].date='2026-02-30',d=>d.sales[0].id="x'bad"];
 for(const change of variants){const d=JSON.parse(original);change(d);assert.throws(()=>B.validate(d))}
 assert.throws(()=>B.validate(JSON.parse(original.replace('"plans":','"__proto__":{},"plans":'))),/不安全/);
 assert.deepEqual((await B.parse(JSON.stringify(await B.create(empty())))).data,empty());
 const a=app(original);assert.equal(a.s.getItem(key),original,'load never writes');a.run('showBackup()');assert.equal(a.s.getItem(key),original);
 await a.run('prepareBackup()');assert.match(a.el('#backup-download').innerHTML,/下载文件/);
 assert.equal(a.s.getItem(key+'-verified-backup'),null,'generation is not verified saved backup');
 a.c.incoming=await B.create(empty());await a.run('previewBackup(incoming,false,backupReadSequence)');a.run("confirmBackupRestore({preventDefault(){},target:{confirmation:'覆盖恢复'}})");assert.equal(a.s.getItem(key),original,'must protect current nonempty data first');
 a.c.incoming=file;await a.run('previewBackup(incoming,false,backupReadSequence)');assert.ok(a.s.getItem(key+'-verified-backup'));
 a.c.incoming=await B.create(empty());await a.run('previewBackup(incoming,false,backupReadSequence)');a.run("confirmBackupRestore({preventDefault(){},target:{confirmation:'wrong'}})");assert.equal(a.s.getItem(key),original);
 a.run("confirmBackupRestore({preventDefault(){},target:{confirmation:'覆盖恢复'}})");assert.deepEqual(JSON.parse(a.s.getItem(key)),empty());assert.match(a.c.sheetHTML,/恢复完成/);
 a.c.incoming=file;await a.run('previewBackup(incoming,false,backupReadSequence)');a.run("confirmBackupRestore({preventDefault(){},target:{confirmation:'覆盖恢复'}})");assert.deepEqual(JSON.parse(a.s.getItem(key)),fixture);
 assert.deepEqual(JSON.parse(a.run('JSON.stringify(data)')),fixture,'UI roundtrip preserves every field');
 assert.equal(a.run('saleTotals().cost'),2693.3500000000004); // unchanged legacy calculation
 const broken=app('{broken');assert.ok(broken.run('storageFault'));assert.equal(broken.s.getItem(key),'{broken');broken.c.incoming=file;await broken.run('previewBackup(incoming,false,backupReadSequence)');broken.run("confirmBackupRestore({preventDefault(){},target:{confirmation:'覆盖恢复'}})");assert.deepEqual(JSON.parse(broken.s.getItem(key)),fixture);assert.equal(JSON.parse(broken.s.getItem(key+'-before-restore')).raw,'{broken');
 const failed=app(original);failed.s.fail(key);assert.throws(()=>failed.run("data.other.push({id:'x2'});save()"),/quota/);assert.deepEqual(JSON.parse(failed.run('JSON.stringify(data)')),fixture);
 const stale=app(original);stale.s.setItem(key,JSON.stringify(empty()));assert.throws(()=>stale.run('save()'),/另一页面/);assert.deepEqual(JSON.parse(stale.s.getItem(key)),empty());
 console.log('PASS: full-file roundtrip, 7 groups, unchanged prices/notes, SHA-256 corruption, schema/version/unsafe input, zero writes on load/preview, restore confirmation, prerequisite backup, rollback, quota failures, damaged original, stale tabs, failed-save memory rollback.');
})().catch(e=>{console.error(e);process.exitCode=1});
