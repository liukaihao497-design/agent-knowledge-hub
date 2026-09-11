import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Requires the synthetic backend (18099) and its V3 proxy (3104).
const base='http://127.0.0.1:3104';
async function request(path,options={}) { return fetch(base+path,{...options,signal:AbortSignal.timeout(10000)}); }
test('V2 files retain their original bytes',async()=>{
    const baseline=JSON.parse(await readFile(new URL('../v2-baseline.json',import.meta.url),'utf8'));
    for(const [name,hash] of Object.entries(baseline)){
        const bytes=await readFile(new URL(`../../agent-chat-v2/${name}`,import.meta.url));
        assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,name);
    }
});
test('independent static assets are served with correct MIME types',async()=>{
    for(const [path,type] of [['/','text/html'],['/app.js','text/javascript'],['/workspace.css','text/css'],['/vendor/purify.min.js','text/javascript']]){
        const response=await request(path); assert.equal(response.status,200); assert.ok(response.headers.get('content-type').startsWith(type));
    }
});
test('proxy passes knowledge pagination and empty scopes',async()=>{
    const data=(await (await request('/api/v1/knowledge/documents?knowledgeBaseId=demo&page=2&pageSize=10')).json()).data;
    assert.ok(data.total>=12); assert.equal(data.items.length,Math.min(10,data.total-10)); assert.equal(data.items[0].documentId,'fixture-10');
    const empty=(await (await request('/api/v1/knowledge/documents?knowledgeBaseId=empty')).json()).data;
    assert.deepEqual(empty.items,[]);
});
test('question contract and reference data survive the proxy',async()=>{
    const response=await request('/api/v1/knowledge/questions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({knowledgeBaseId:'demo',question:'文档存在哪里？',topK:3})});
    assert.equal(response.status,200); const data=(await response.json()).data;
    assert.match(data.answer,/MinIO/); assert.equal(data.references[0].documentId,'fixture-0');
});
test('backend status and error details are preserved',async()=>{
    const response=await request('/api/v1/knowledge/questions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({knowledgeBaseId:'demo',question:'fail',topK:5})});
    assert.equal(response.status,502); assert.equal((await response.json()).info,'模拟模型调用失败');
});
test('multipart upload forwards field names and file bytes',async()=>{
    const form=new FormData();form.append('knowledgeBaseId','demo');form.append('file',new Blob(['Synthetic fixture'],{type:'text/markdown'}),'fixture.md');
    const response=await request('/api/v1/knowledge/documents',{method:'POST',body:form});
    const result=await response.json();assert.equal(response.status,200);assert.equal(result.data.status,'READY');assert.equal(result.data.fileName,'fixture.md');
});
test('SSE remains incremental and preserves split UTF-8 and final response',async()=>{
    const response=await request('/api/v1/agent/auto_agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({aiAgentId:'4',message:'验证',sessionId:'test-contract',maxStep:3})});
    assert.equal(response.headers.get('content-type'),'text/event-stream');
    const reader=response.body.getReader(), decoder=new TextDecoder();let chunks=0,text='';
    while(true){const {done,value}=await reader.read();if(done)break;chunks++;text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
    assert.ok(chunks>1,'SSE should not be buffered until completion');
    const events=text.trim().split('\r\n\r\n').map(block=>JSON.parse(block.slice(6)));
    assert.deepEqual(events.map(e=>e.type),['analysis','execution','supervision','summary','complete']);
    assert.match(events[3].content,/Agent 4 已完成模拟任务，最大步数 3/);
});
test('original-file redirects pass through without downloading at the proxy',async()=>{
    const response=await request('/api/v1/knowledge/documents/fixture-0/content?knowledgeBaseId=demo',{redirect:'manual'});
    assert.equal(response.status,302);assert.equal(response.headers.get('location'),'http://127.0.0.1:18099/fixture.md');
});
test('only intended assets, methods and same-origin requests are allowed',async()=>{
    for(const path of ['/README.md','/tests/sample.md','/../pom.xml','/api/v1/unknown'])assert.equal((await request(path)).status,404);
    assert.equal((await request('/api/v1/knowledge/documents',{method:'DELETE'})).status,404);
    assert.equal((await request('/api/v1/knowledge/questions',{method:'POST',headers:{Origin:'http://other.invalid'}})).status,403);
});
test('knowledge lifecycle proxy supports create, list, rename and disable',async()=>{
    const create=await request('/api/v1/knowledge/bases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'接口隔离验证',description:'synthetic'})});
    assert.equal(create.status,200);const item=(await create.json()).data;
    assert.match(item.knowledgeBaseId,/^[0-9a-f-]{36}$/);
    const path=`/api/v1/knowledge/bases/${item.knowledgeBaseId}`;
    const renamed=await request(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'修改后的名称',description:'kept'})});
    assert.equal((await renamed.json()).data.knowledgeBaseId,item.knowledgeBaseId);
    const disabled=await request(path+'/status',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'DISABLED'})});
    assert.equal((await disabled.json()).data.status,'DISABLED');
    const answer=await request('/api/v1/knowledge/questions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({knowledgeBaseId:item.knowledgeBaseId,question:'问题',topK:5})});
    assert.equal(answer.status,409);
    const active=(await (await request('/api/v1/knowledge/bases?status=ACTIVE&pageSize=100')).json()).data.items;
    assert.ok(active.every(base=>base.knowledgeBaseId!==item.knowledgeBaseId));
});
test('document content cannot be requested without or with the wrong scope',async()=>{
    assert.equal((await request('/api/v1/knowledge/documents/fixture-0/content',{redirect:'manual'})).status,400);
    assert.equal((await request('/api/v1/knowledge/documents/fixture-0/content?knowledgeBaseId=study',{redirect:'manual'})).status,404);
});
