const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const outputDir = path.join(os.tmpdir(), 'localization-polish-tests');
fs.mkdirSync(outputDir, {recursive:true});
function harness(writeResult) {
  const messages=[], writes=[];
  let handler;
  const context = vm.createContext({TextEncoder, btoa, cindy:{
    onHostMessage(fn){handler=fn;},
    async send(msg){messages.push(msg);},
    async fs(args){writes.push(args); return writeResult || {ok:true,bytes:Buffer.from(args.content,'base64').length};}
  }});
  vm.runInContext(source,context);
  return {context,messages,writes,async run(args,tool='export_review_xlsx'){
    await handler({type:'tool-call',tool,callId:'test-call',args}); return messages.at(-1);
  }};
}
const unchanged={source:'Barbare',translation:'野蛮人',optimized_translation:'野蛮人',changes:[]};
const changed={source:'Enregistrez les modifications avant de quitter.',translation:'退出后保存更改。',optimized_translation:'退出前保存更改。',changes:[{before:'退出后',after:'退出前',reason:'avant de quitter 表示退出之前，修正操作顺序误译。'}]};
test('exports original, existing translation, polished translation and specific reasons',async()=>{
 const h=harness(); const result=await h.run({expected_rows:2,rows:[unchanged,changed]});
 assert.equal(result.ok,true);assert.equal(result.result.changed,1);assert.equal(result.result.unchanged,1);
 assert.deepEqual(Array.from(result.result.columns),['原文','译文','优化后译文','修改原因']);
 assert.equal(h.writes[0].callId,'test-call');assert.equal(h.writes[0].root,'workdir');
 fs.writeFileSync(path.join(outputDir,'review-example.xlsx'),Buffer.from(h.writes[0].content,'base64'));
});
for(const [label,row] of [
 ['missing optimized translation',{...changed,optimized_translation:undefined}],
 ['missing old translation',{...changed,translation:undefined}],
 ['missing source',{...changed,source:undefined}],
 ['missing changes',{...changed,changes:undefined}],
 ['changed without reasons',{...changed,changes:[]}],
 ['blank reason',{...changed,changes:[{...changed.changes[0],reason:'  '}]}],
 ['generic reason',{...changed,changes:[{...changed.changes[0],reason:'更自然'}]}],
 ['wrong quote',{...changed,changes:[{...changed.changes[0],before:'退出之后'}]}],
 ['unexplained extra change',{...changed,optimized_translation:'退出前请保存更改。'}],
 ['invented change on unchanged row',{...unchanged,changes:changed.changes}],
 ['ambiguous quote',{...changed,translation:'后后',optimized_translation:'前后',changes:[{before:'后',after:'前',reason:'改成退出前操作。'}]}],
 ['oversize cell',{...unchanged,source:'x'.repeat(32768)}]
])test('rejects '+label+' without writing a file',async()=>{
 const h=harness();const r=await h.run({expected_rows:1,rows:[row]});assert.equal(r.ok,false);assert.equal(r.errorCode,'INVALID_REVIEW');assert.equal(h.writes.length,0);
});
test('rejects row count mismatch',async()=>{const h=harness();assert.equal((await h.run({expected_rows:2,rows:[unchanged]})).ok,false);assert.equal(h.writes.length,0);});
test('preserves duplicate rows, IDs, whitespace, Unicode, multiline and formula-like text',async()=>{
 const texts=[' =1+1\n<&> " 😀 ','_x0041_\r\nline\t2','00123'];
 const rows=texts.map((s,i)=>({source:s,translation:s,optimized_translation:s,changes:[],id:String(i)}));
 rows.push({...rows[0]});rows.push({source:null,translation:'abc',optimized_translation:'ab',changes:[{before:'abc',after:'ab',reason:'删除末尾误加的 c 字符；原文未提供，需人工确认。'}]});
 const h=harness();const r=await h.run({expected_rows:rows.length,rows});assert.equal(r.ok,true);
 fs.writeFileSync(path.join(outputDir,'edge-cases.xlsx'),Buffer.from(h.writes[0].content,'base64'));
 fs.writeFileSync(path.join(outputDir,'edge-cases.json'),JSON.stringify(rows));
});
test('handles sequential changes and validates complete coverage',async()=>{
 const h=harness(); const r=await h.run({expected_rows:1,rows:[{source:'a',translation:'one two',optimized_translation:'1 2',changes:[{before:'one',after:'1',reason:'按数字格式显示第一项。'},{before:'two',after:'2',reason:'按数字格式显示第二项。'}]}]});assert.equal(r.ok,true);
});
test('does not report a file when host write fails',async()=>{const h=harness({ok:false,message:'test disk failure'});const r=await h.run({expected_rows:1,rows:[unchanged]});assert.equal(r.ok,false);assert.equal(r.errorCode,'EXPORT_FAILED');assert.equal(r.result,undefined);});
test('does not report success when byte count differs',async()=>{const h=harness({ok:true,bytes:0});const r=await h.run({expected_rows:1,rows:[unchanged]});assert.equal(r.ok,false);});
test('protected token checks remain compatible',async()=>{const h=harness();const r=await h.run({source:'{a} {b}',translation:'{a}',tokens:['{a}','{b}']},'check_protected_tokens');assert.equal(r.ok,true);assert.equal(r.result.issues[0].status,'missing');});
test('manifest keeps discovery text inside host length limit and exposes exporter',()=>{const m=JSON.parse(fs.readFileSync(path.join(__dirname,'../ghost.json'),'utf8'));assert.ok(m.whenToUse.length<=300);assert.equal(m.tools[0].name,'export_review_xlsx');});
