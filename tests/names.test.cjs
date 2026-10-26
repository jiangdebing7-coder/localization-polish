const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
function harness(){
 let handler;const messages=[],writes=[];
 vm.runInNewContext(source,{TextEncoder,btoa,cindy:{onHostMessage(fn){handler=fn;},async send(message){messages.push(message);},async fs(args){writes.push(args);return {ok:true,bytes:Buffer.from(args.content,'base64').length};}}});
 return {writes,async run(row){await handler({type:'tool-call',tool:'export_review_xlsx',callId:'name-regression',args:{expected_rows:1,rows:[row]}});return messages.at(-1);}};
}
const name={entry_type:'name',source:'激流之刃碎片',translation:'Fragment de la Lame du torrent',optimized_translation:'Fragment de la Lame du torrent',changes:[]};
for(const [label,row] of [
 ['screenshot Lame lowered and article removed',{...name,optimized_translation:'Fragment de lame du torrent',changes:['统一名称大小写。']}],
 ['screenshot Baton lowered',{...name,source:'冰霜之杖碎片',translation:'Fragment de Bâton de givre',optimized_translation:'Fragment de bâton de givre',changes:['统一碎片名称内部的大小写。']}],
 ['screenshot Arc renamed without glossary',{...name,source:'繁花之弓碎片',translation:"Fragment d'Arc florissant",optimized_translation:"Fragment d'arc de floraison",changes:['将碎片中的武器名称与成品名称统一。']}],
 ['case-only name normalization',{...name,optimized_translation:'Fragment de la lame du torrent',changes:['采用普通法语大小写。']}],
 ['unrequested all caps',{...name,optimized_translation:name.translation.toUpperCase(),changes:['专有名词统一全大写。']}],
 ['unrequested title case',{...name,optimized_translation:'Fragment De La Lame Du Torrent',changes:['统一首字母大写。']}],
 ['approved spelling with wrong case',{...name,optimized_translation:'Fragment de la lame du torrent',approved_name:name.translation,name_basis:'术语表固定译名。',changes:['匹配项目术语。']}],
 ['unpaired approval',{...name,optimized_translation:'FRAGMENT',approved_name:'FRAGMENT',changes:['按用户要求。']}],
 ['basis without target',{...name,name_basis:'用户要求名称大写。'}],
 ['name approval on text',{...name,entry_type:'text',approved_name:name.translation,name_basis:'术语表。'}]
])test('rejects '+label+' before writing',async()=>{const h=harness();const r=await h.run(row);assert.equal(r.ok,false);assert.equal(r.errorCode,'INVALID_REVIEW');assert.equal(h.writes.length,0);});
for(const value of [name.translation,name.translation.toUpperCase(),'Fragment de Bâton de givre',"Fragment d'Arc florissant"])
 test('preserves existing spelling '+value,async()=>{const h=harness();const r=await h.run({...name,translation:value,optimized_translation:value});assert.equal(r.ok,true);assert.equal(r.result.unchanged,1);assert.equal(h.writes.length,1);});
test('allows explicitly confirmed full uppercase rule',async()=>{const h=harness();const upper=name.translation.toUpperCase();const r=await h.run({...name,optimized_translation:upper,approved_name:upper,name_basis:'用户明确要求本批整条道具名称全大写。',changes:['按项目要求使用全大写名称。']});assert.equal(r.ok,true);assert.equal(r.result.changed,1);});
test('allows explicit glossary correction with its exact project capitalization',async()=>{const h=harness();const approved='Fragment de la Lame du Torrent';const r=await h.run({...name,optimized_translation:approved,approved_name:approved,name_basis:'本批用户提供的术语表条目。',changes:['按术语表修正名称。']});assert.equal(r.ok,true);});
test('ordinary prose still supports natural rewrites',async()=>{const h=harness();const r=await h.run({entry_type:'text',source:'扣动扳机，终结混沌。',translation:'Press the trigger and end the chaos.',optimized_translation:'Pull the trigger. Bring order to chaos.',changes:['调整动词搭配和节奏，保留宣传意图。']});assert.equal(r.ok,true);});
