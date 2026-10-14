/* Loaded after the existing app; uses the same storage key and business records. */
let backupExport=null,backupPreview=null,backupReadSequence=0;
const backupLabels={plans:'工作计划',sales:'销售交易',teach:'教学记录',dealers:'经销商资料',orders:'订货记录',other:'其他收入',categories:'商品品类'};
const backupMetaKey=key+'-verified-backup';
let verifiedBackup=null,verifiedSnapshot=null;
try{verifiedBackup=JSON.parse(localStorage.getItem(backupMetaKey)||'null')}catch(e){}
function backupSummary(d){return '<div class="card">'+SnowBackup.groups.map(k=>`<div class="list-row"><span class="grow">${backupLabels[k]}</span><b>${d[k].length}</b></div>`).join('')+'</div>'}
function backupError(message){const el=document.querySelector('#backup-message');if(el)el.textContent=message}
function backupReminder(){
  let matched=false;try{matched=verifiedSnapshot===SnowBackup.canonical(data)}catch(e){}
  if(!SnowBackup.groups.some(k=>data[k].length))return '本地保存 · 需要时导出到手机';
  return matched?'已校验的备份与当前资料一致':'有本地资料，请记得导出一份保存';
}
const previousAdmin=admin;
admin=function(){
  const original=previousAdmin();
  const card=`<section class="card"><button class="btn primary" onclick="showBackup()">导出数据</button><div class="meta">${backupReminder()}</div><div class="meta">仅保存在本机 · 版本 2026.10.15</div></section>`;
  return original.replace('<section class="card">',card+'<section class="card">').replace('<div class="admin-row"><div class="grow"><div class="title">数据导出</div><div class="meta">后续测试完整导出格式</div></div><span class="arrow">›</span></div>','').replace('正式登录功能最后处理','当前仅使用本机存储，未设置应用密码；请保护设备访问权限');
};
const originalHome=home;
home=function(){return originalHome()+`<section class="card"><div class="meta">${backupReminder()}</div><button class="btn" onclick="showBackup()">导出数据</button></section>`};
function showBackup(){
  backupPreview=null;backupReadSequence++;
  backupExport=null;
  openSheet(`<h2>导出数据</h2><p>把全部记录和资料保存到手机。</p><div id="backup-download"><p class="meta">正在准备文件…</p></div><p id="backup-message" role="status" aria-live="polite"></p><p class="meta">导出为完整 JSON 数据文件，可用于恢复，不是 Excel 表格。包含备注和发货原文，未加密，请妥善保管。</p><details><summary class="btn">恢复与文件校验（需要时使用）</summary><div class="field"><label for="backup-file">选择以前保存的数据文件</label><input id="backup-file" type="file" accept=".json,application/json" onchange="readBackupFile(this)"></div><div id="backup-preview"></div><button class="btn" onclick="previewLocalRollback()">查看上次恢复前的本机副本</button><p class="meta">选择文件先检查，不会立即恢复。恢复为整份替换，不是追加。本机副本也会随缓存清除，不是独立备份。</p></details><p class="meta">仅在本机处理，不自动上传。无需注册账号；如果手机提示保存位置，选择“存储到文件”。</p>`);
  prepareBackup();
}
async function prepareBackup(){
  const seq=backupReadSequence;
  try{
    if(storageFault)throw new Error(storageFault);
    if(localStorage.getItem(key)!==persistedRaw)throw new Error('资料已在其他页面变化，请刷新后生成备份');
    const snapshot=JSON.parse(JSON.stringify(data));const file=await SnowBackup.create(snapshot);
    if(seq!==backupReadSequence)return;
    backupExport={text:JSON.stringify(file,null,2),name:'小张的雪屋-完整备份-'+file.createdAt.replace(/[:.]/g,'-')+'.json'};
    document.querySelector('#backup-download').innerHTML='<div class="actions"><button class="btn primary" onclick="exportToPhone()">导出到手机</button></div><button class="btn" onclick="downloadBackup()">备用：下载文件</button>';
    backupError('文件已准备好，点击“导出到手机”保存即可。');
  }catch(e){backupError('未生成备份：'+e.message)}
}
function exportToPhone(){if(!backupExport){backupError('文件还未准备好，请稍后重试');return}const file=new File([backupExport.text],backupExport.name,{type:'application/json'});if(navigator.canShare?.({files:[file]}))shareBackup();else downloadBackup()}
function downloadBackup(){
  try{if(!backupExport)throw Error('请先生成备份');const url=URL.createObjectURL(new Blob([backupExport.text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=backupExport.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);backupError('已请求下载，请在手机“文件”中确认保存结果。若没有收到文件，请尝试上方“导出到手机”。')}catch(e){backupError(e.message)}
}
async function shareBackup(){
  try{if(!backupExport)throw Error('请先生成备份');const file=new File([backupExport.text],backupExport.name,{type:'application/json'});if(!navigator.canShare?.({files:[file]}))throw Error('当前飞书容器不支持文件分享，请尝试下载；不要清缓存或切换浏览器来寻找原数据');await navigator.share({files:[file],title:'小张的雪屋备份'});backupError('保存窗口已关闭，请在手机“文件”中确认文件已保存。')}catch(e){backupError(e.name==='AbortError'?'已取消保存。':e.message)}
}
async function readBackupFile(input){
  const seq=++backupReadSequence;backupPreview=null;document.querySelector('#backup-preview').innerHTML='';
  try{const f=input.files?.[0];if(!f)return;if(f.size>SnowBackup.maxBytes)throw Error('备份不能超过 20 MB');backupError('正在本机检查文件…');const file=await SnowBackup.parse(await f.text());if(seq!==backupReadSequence)return;await previewBackup(file,false,seq)}catch(e){if(seq===backupReadSequence)backupError('未恢复任何数据：'+e.message)}
}
async function previewBackup(file,rollback,seq){
  const same=!storageFault&&SnowBackup.canonical(file.data)===SnowBackup.canonical(data);
  if(same&&!rollback){
    try{const snapshot=SnowBackup.canonical(data),digest=await SnowBackup.hash(data);if(seq!==backupReadSequence)return;if(snapshot!==SnowBackup.canonical(data))throw Error('资料已变化');const meta={checkedAt:new Date().toISOString(),hash:digest};localStorage.setItem(backupMetaKey,JSON.stringify(meta));verifiedBackup=meta;verifiedSnapshot=snapshot}catch(e){backupError('文件校验通过，但本机无法保存校验标记，请重新校验。');return}
  }
  backupPreview={file,raw:localStorage.getItem(key),rollback,seq};
  backupError(same?'校验通过：文件内容与当前全部资料完全一致，无需恢复。':'校验通过：仅完成检查，尚未改变当前资料。');
  document.querySelector('#backup-preview').innerHTML=`<h3>文件中的资料</h3><p class="meta">${esc(file.createdAt)}${rollback?' · 本机恢复前副本':''}</p>${backupSummary(file.data)}${same?'':`<h3>当前资料（将被替换）</h3>${backupSummary(data)}<div class="notice">恢复会替换全部记录、品类、价格与经销商资料，不是追加。${storageFault?'当前原始存储异常，恢复前会先保存原始副本。':'有当前资料时，必须先导出并读回校验当前资料的备份。'}</div><form onsubmit="confirmBackupRestore(event)"><div class="field"><label for="restore-confirm">输入“覆盖恢复”确认</label><input id="restore-confirm" name="confirmation" required pattern="覆盖恢复" autocomplete="off"></div>${formActions('确认恢复')}</form>`}`;
  render();
}
async function previewLocalRollback(){
  const seq=++backupReadSequence;backupPreview=null;document.querySelector('#backup-preview').innerHTML='';
  try{const saved=JSON.parse(localStorage.getItem(key+'-before-restore')||'null');if(!saved)throw Error('尚无恢复前副本');const d=saved.raw===null?emptyData():JSON.parse(saved.raw);const file=await SnowBackup.create(d);file.createdAt=saved.savedAt;if(seq!==backupReadSequence)return;await previewBackup(file,true,seq)}catch(e){backupError('无法读取副本：'+e.message)}
}
function confirmBackupRestore(e){
  e.preventDefault();
  try{
    if(fields(e).confirmation!=='覆盖恢复')throw Error('请输入“覆盖恢复”');
    if(!backupPreview)throw Error('请重新选择文件');
    if(!storageFault&&SnowBackup.groups.some(k=>data[k].length)&&verifiedSnapshot!==SnowBackup.canonical(data))throw Error('请先导出并读回校验当前资料的备份，再重新选择要恢复的文件');
    const restored=SnowBackup.restore(localStorage,key,backupPreview.file.data,backupPreview.raw);
    Object.keys(data).forEach(k=>delete data[k]);Object.assign(data,restored);persistedRaw=localStorage.getItem(key);storageFault='';backupPreview=null;backupReadSequence++;render();
    openSheet('<h2>恢复完成</h2><div class="notice">已写入并读回核对，完整保留文件里的记录、金额、历史结算价、备注和资料，没有重新计算。</div><p class="meta">恢复前的本机副本已保留。请保管好独立备份文件；本机副本不能抵御清缓存或手机损坏。</p><div class="actions"><button class="btn primary" onclick="closeSheet()">完成</button></div>');
  }catch(e){backupError('未完成恢复：'+e.message)}
}
// Mutations happen in existing handlers before save(). Restore the in-memory
// baseline on failure so a retry cannot silently duplicate the unsaved record.
save=function(){
  try{
    if(storageFault)throw Error(storageFault);
    if(localStorage.getItem(key)!==persistedRaw)throw Error('另一页面已修改资料，请刷新后再操作');
    const next=JSON.stringify(data);localStorage.setItem(key,next);persistedRaw=next;
  }catch(e){
    try{const old=Object.assign(emptyData(),JSON.parse(persistedRaw||'{}'));Object.keys(data).forEach(k=>delete data[k]);Object.assign(data,old)}catch(ignore){}
    alert('保存失败，尚未保存此次操作，表单仍保留。'+e.message);throw e;
  }
};
render();
if(verifiedBackup?.hash&&!storageFault){const snapshot=SnowBackup.canonical(data);SnowBackup.hash(data).then(digest=>{if(digest===verifiedBackup.hash&&snapshot===SnowBackup.canonical(data)){verifiedSnapshot=snapshot;render()}}).catch(()=>{})}
