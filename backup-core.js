/* Local-only backup format. No network calls, no price recalculation. */
(function(root){
  'use strict';
  const groups=['plans','sales','teach','dealers','orders','other','categories'];
  const format='xiaozhang-snow-house-backup';
  const maxBytes=20*1024*1024;
  function check(ok,message){if(!ok)throw new Error(message)}
  function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
  function safe(x,depth=0){
    check(depth<25,'文件嵌套过深');
    if(typeof x==='number')check(Number.isFinite(x),'存在无效数字');
    if(x&&typeof x==='object')for(const k of Object.keys(x)){
      check(!['__proto__','prototype','constructor'].includes(k),'文件含不安全字段');safe(x[k],depth+1);
    }
  }
  function canonical(x){if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';if(plain(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';return JSON.stringify(x)}
  async function hash(x){check(root.crypto?.subtle,'当前环境不支持安全校验，请使用 HTTPS 入口');const bytes=new TextEncoder().encode(canonical(x));return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')}
  function validate(data){
    check(plain(data),'资料格式不正确');safe(data);
    for(const g of groups){check(Array.isArray(data[g]),'缺少资料分组：'+g);check(data[g].length<=100000,'记录过多');for(const x of data[g])check(plain(x),'记录格式不正确：'+g)}
    function text(x,k,required=false){check((!required&&x[k]===undefined)||typeof x[k]==='string','文字字段无效：'+k)}
    function number(x,k,required=true){if(!required&&x[k]===undefined)return;check(typeof x[k]==='number'&&Number.isFinite(x[k])&&x[k]>=0,'金额或数量无效：'+k)}
    function identity(x){text(x,'id',true);check(/^[A-Za-z0-9_-]+$/.test(x.id),'记录编号无效')}
    function date(x){text(x,'date',true);check(/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&!Number.isNaN(Date.parse(x.date+'T00:00:00Z'))&&new Date(x.date+'T00:00:00Z').toISOString().slice(0,10)===x.date,'记录日期无效')}
    for(const g of groups){const ids=new Set();for(const x of data[g]){
      if(g!=='categories'){identity(x);check(!ids.has(x.id),'同一分组有重复记录编号');ids.add(x.id)}
      for(const k of ['name','note','shipping','color','size','location','project','start','time'])text(x,k);
      for(const k of ['start','time'])if(x[k])check(/^([01]\d|2[0-3]):[0-5]\d$/.test(x[k]),'时间格式无效');
      if(!['categories','dealers'].includes(g))date(x);
    }}
    for(const x of data.plans){text(x,'name',true);check(typeof x.done==='boolean','计划状态无效')}
    for(const x of data.categories){text(x,'name',true);number(x,'sale');number(x,'cost')}
    for(const x of data.dealers){text(x,'name',true);text(x,'location',true)}
    for(const x of data.sales){number(x,'receipt');number(x,'ship');check(Array.isArray(x.items)&&x.items.length>0,'销售明细缺失');for(const i of x.items){check(plain(i),'商品明细无效');for(const k of ['name','color','size'])text(i,k,true);number(i,'cost');number(i,'qty');check(Number.isInteger(i.qty)&&i.qty>0,'商品数量无效')}}
    for(const x of data.teach){number(x,'hours');number(x,'rate');number(x,'fee');check(['planned','done','cancelled'].includes(x.status),'教学状态无效')}
    for(const x of data.orders){number(x,'amount');check(data.dealers.some(d=>d.id===x.dealer),'订货记录缺少关联经销商')}
    for(const x of data.other){text(x,'project',true);number(x,'amount')}
    return data;
  }
  async function create(data){validate(data);const body={format,version:1,createdAt:new Date().toISOString(),data:JSON.parse(JSON.stringify(data))};return {...body,checksum:await hash(body)}}
  async function parse(text){
    check(typeof text==='string'&&new TextEncoder().encode(text).length<=maxBytes,'备份文件过大');
    let file;try{file=JSON.parse(text)}catch(e){throw new Error('不是完整的 JSON 备份文件')}
    check(plain(file)&&file.format===format,'这不是小张的雪屋备份');check(file.version===1,'备份版本不支持，请勿覆盖现有资料');
    check(typeof file.createdAt==='string'&&!Number.isNaN(Date.parse(file.createdAt)),'备份日期无效');
    validate(file.data);check(typeof file.checksum==='string'&&file.checksum===await hash({format:file.format,version:file.version,createdAt:file.createdAt,data:file.data}),'校验失败：文件可能损坏或被修改');return file;
  }
  function counts(data){return Object.fromEntries(groups.map(k=>[k,data[k].length]))}
  function restore(storage,key,data,expected){
    validate(data);check(storage.getItem(key)===expected,'当前资料已变化，请重新打开恢复预览');
    const next=JSON.stringify(data),rollback=key+'-before-restore';
    // Keep the old raw payload before replacing it. Quota failure aborts here.
    storage.setItem(rollback,JSON.stringify({savedAt:new Date().toISOString(),raw:expected}));
    storage.setItem(key,next);
    if(storage.getItem(key)!==next){if(expected===null)storage.removeItem(key);else storage.setItem(key,expected);throw new Error('恢复后的读回校验失败，已尝试回退；请勿继续录入')}
    return JSON.parse(next);
  }
  root.SnowBackup={groups,maxBytes,validate,canonical,hash,create,parse,counts,restore};
  if(typeof module!=='undefined')module.exports=root.SnowBackup;
})(globalThis);
