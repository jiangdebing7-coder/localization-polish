const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
function harness(){
 let handler;const messages=[];let writes=0;
 vm.runInNewContext(source,{TextEncoder,btoa,cindy:{onHostMessage(fn){handler=fn;},async send(msg){messages.push(msg);},async fs(){writes++;throw new Error('task preparation must not write files');}}});
 return {get writes(){return writes;},async run(args){await handler({type:'tool-call',tool:'prepare_polish_task',callId:'test-task',args});return messages.at(-1);}};
}
const sample={target_language:'法语（地区未指定）',context:'游戏公告：武器介绍与感恩季活动，面向玩家。',has_source:true,segments:[
 {scope:'武器介绍',purpose:'传达精密科幻感与秩序意象。',direction:'按法语节奏重组修辞，保留演算和分形意象，不新增武器性能。'},
 {scope:'活动标题',purpose:'吸引玩家参与。',direction:'简洁有吸引力，保持活动名称一致，不添加奖励承诺。'},
 {scope:'活动时间与领奖规则',purpose:'让玩家清楚何时参与、如何领取。',direction:'准确保留累计签到、30/60/80 档位、每日金币上限及服务器时间。'}
],requirements:['保留 <color=#ff7e38> 与 </color> 标签。'],unknowns:['未提供官方术语表，不擅自认定译名。']};
test('mixed copy retains separate purposes, styles and constraints without side effects',async()=>{
 const h=harness();const result=await h.run(sample);assert.equal(result.ok,true);
 const prompt=result.result.task_prompt;
 for(const part of ['精密科幻感','活动标题','累计签到','30/60/80','<color=#ff7e38>','未提供官方术语表','修改原因','无需修改'])assert.ok(prompt.includes(part),part);
 assert.equal(h.writes,0);assert.ok(!('path' in result.result));assert.ok(prompt.length<3000);
});
test('new calls do not inherit previous project or voice',async()=>{
 const h=harness();await h.run(sample);
 const result=await h.run({target_language:'日语',context:'角色向长辈郑重致歉。',has_source:false,segments:[{scope:'一条对白',purpose:'表达歉意与敬重。',direction:'根据人物关系使用自然敬语，语气克制，不加俏皮感。'}]});
 assert.equal(result.ok,true);const prompt=result.result.task_prompt;
 assert.ok(prompt.includes('自然敬语'));assert.ok(prompt.includes('仅有译文'));
 assert.ok(!prompt.includes('精密科幻'));assert.ok(!prompt.includes('30/60/80'));assert.equal(h.writes,0);
});
for(const [name,args]of[
 ['missing language',{...sample,target_language:undefined}],
 ['empty context',{...sample,context:' '}],
 ['unknown source availability',{...sample,has_source:undefined}],
 ['empty segments',{...sample,segments:[]}],
 ['missing purpose',{...sample,segments:[{scope:'a',direction:'b'}]}],
 ['missing direction',{...sample,segments:[{scope:'a',purpose:'b'}]}],
 ['too many groups',{...sample,segments:Array(13).fill(sample.segments[0])}],
 ['invalid requirement',{...sample,requirements:['']}],
 ['invalid unknowns',{...sample,unknowns:'guess'}],
 ['oversize pasted context',{...sample,context:'x'.repeat(18001)}]
])test('rejects '+name,async()=>{const h=harness();const r=await h.run(args);assert.equal(r.ok,false);assert.equal(r.errorCode,'INVALID_TASK');assert.equal(h.writes,0);});
test('minimal one-group task does not invent locale, glossary or extra examples',async()=>{
 const h=harness();const r=await h.run({target_language:'英语',context:'保存确认提示。',has_source:true,segments:[{scope:'按钮文案',purpose:'确认是否保存。',direction:'使用常见简短提示，已自然的保留。'}]});
 assert.equal(r.ok,true);assert.ok(!r.result.task_prompt.includes('美式'));assert.ok(!r.result.task_prompt.includes('官方术语'));assert.ok(!r.result.task_prompt.includes('待确认（'));
});
test('manifest exposes task tool and bounded discovery strings',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(__dirname,'../ghost.json'),'utf8'));
 assert.ok(m.whenToUse.length<=300);assert.ok(m.description.length<=300);
 const t=m.tools.find(x=>x.name==='prepare_polish_task');assert.ok(t);
 assert.ok(t.parameters.required.includes('segments'));
});
