const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../dist/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const key = 'snow-house-mobile-v2';
function boot(initial, failWrite = false) {
  const storage = new Map([['unrelated-app', 'preserve']]);
  if (initial !== undefined) storage.set(key, JSON.stringify(initial));
  const element = {innerHTML:'', textContent:'', insertAdjacentHTML(){}, style:{}, classList:{toggle(){}}};
  let writes = 0;
  const context = vm.createContext({
    SnowBackup:require('../dist/backup-core.js'),
    document:{querySelector:()=>element,querySelectorAll:()=>[],addEventListener(){}},
    window:{addEventListener(){}},
    localStorage:{getItem:k=>storage.get(k)??null,setItem(k,v){if(failWrite)throw Error('blocked');writes++;storage.set(k,v)}},
    FormData:class{constructor(target){return new Map(Object.entries(target))}},
  });
  vm.runInContext(script, context);
  vm.runInContext('openSheet=html=>{globalThis.lastSheet=html}', context);
  return {context,storage,element,writes:()=>writes,run:s=>vm.runInContext(s,context)};
}
const clean = {plans:[],sales:[],teach:[],dealers:[],orders:[],other:[],categories:[]};
const fixture = {
  plans:[{id:'p',date:'2000-01-01',name:'test',done:false}],
  sales:[{id:'s',date:'2000-01-01',receipt:100,ship:8,note:'test',shipping:'test address',items:[{name:'test',color:'白',size:'M',cost:20,qty:2}]}],
  teach:[{id:'t',date:'2000-01-01',hours:1.5,rate:200,fee:300,status:'planned'}],
  dealers:[{id:'d',name:'test',location:'test'}],orders:[{id:'o',date:'2000-01-01',dealer:'d',amount:100}],
  other:[{id:'x',date:'2000-01-01',project:'test',amount:200}],categories:[{name:'test',sale:50,cost:20}],
};
const existing=boot(fixture);
assert.equal(existing.writes(),0,'loading must not write or reset');
assert.deepEqual(JSON.parse(existing.storage.get(key)),fixture);
existing.run("showResetData()");
assert.equal(existing.writes(),0,'opening confirmation must not reset');
existing.run("resetAllData({preventDefault(){},target:{confirmation:'wrong'}})");
assert.equal(existing.writes(),0);
assert.deepEqual(JSON.parse(existing.storage.get(key)),fixture);
existing.run("resetAllData({preventDefault(){},target:{confirmation:'清空全部'}})");
assert.deepEqual(JSON.parse(existing.storage.get(key)),clean);
assert.deepEqual(JSON.parse(existing.run('JSON.stringify(data)')),clean);
assert.equal(existing.storage.get('unrelated-app'),'preserve');
assert.equal(existing.writes(),1);
const reloaded=boot(JSON.parse(existing.storage.get(key)));
assert.equal(reloaded.run('data.categories.length'),0,'reload must not reseed categories');
reloaded.run('openSale()');
assert.match(reloaded.context.lastSheet,/请先添加商品品类/);
for(const page of ['home()','plans()','records()','admin()','showTeaching()','showDealers()','showOther()','showSales()','showCategories()'])reloaded.run(page);
const failed=boot(fixture,true);
failed.run("resetAllData({preventDefault(){},target:{confirmation:'清空全部'}})");
assert.deepEqual(JSON.parse(failed.run('JSON.stringify(data)')),fixture);
assert.deepEqual(JSON.parse(failed.storage.get(key)),fixture);
assert.match(failed.element.textContent,/清空未成功/);
assert.equal(boot().run('data.categories.length'),0,'first use starts empty');
assert.equal(existing.run("JSON.stringify(saleTotals())"),JSON.stringify({receipt:0,cost:0,ship:0,count:0,qty:0}));
console.log('PASS: no auto-delete; confirmation; scoped reset; reload empty; empty views; write failure preserves data; no default categories.');
