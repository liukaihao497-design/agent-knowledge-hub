// Synthetic fixtures only: no model, database, MinIO or external network calls.
import http from 'node:http';
import {randomUUID} from 'node:crypto';
const bases = [{knowledgeBaseId:'demo',name:'项目资料',description:'原有 demo 资料',status:'ACTIVE'}, {knowledgeBaseId:'study',name:'学习笔记',description:'独立的学习资料',status:'ACTIVE'}, {knowledgeBaseId:'empty',name:'空知识库',description:'空召回验证',status:'ACTIVE'}];
const requests = [];
const documents = Array.from({length:12},(_,i) => ({
    documentId:`fixture-${i}`, knowledgeBaseId:'demo', fileName:`验证资料-${i+1}.md`,
    fileSize:2048+i, contentType:'text/markdown', status:i===2?'FAILED':'READY', chunkCount:12,
    contentUrl:`/api/v1/knowledge/documents/fixture-${i}/content`,
    errorMessage:i===2?'模拟索引失败，请检查嵌入服务。':null, createTime:'2026-09-07T12:30:00'
}));
function json(response,data,status=200,info='成功') {
    response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
    response.end(JSON.stringify({code:status===200?'0000':`K${status}`,info,data}));
}
const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/__requests') return json(res,requests);
    const buffers=[]; for await(const buffer of req) buffers.push(buffer);
    const raw=Buffer.concat(buffers).toString('utf8');
    let body={}; if(req.headers['content-type']?.includes('application/json')) { try{body=JSON.parse(raw);}catch{return json(res,null,400,'无效 JSON');} }
    requests.push({method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),body, multipart:raw.includes('name="knowledgeBaseId"')&&raw.includes('name="file"')});
    const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('pageSize')||10);
    if(url.pathname==='/api/v1/knowledge/bases'){
        if(req.method==='POST'){
            if(!body.name?.trim()||body.name.length>100)return json(res,null,400,'请填写有效名称');
            const base={knowledgeBaseId:randomUUID(),name:body.name.trim(),description:body.description||'',status:'ACTIVE'};
            bases.unshift(base);return json(res,base);
        }
        const status=url.searchParams.get('status');const rows=bases.filter(base=>!status||base.status===status);
        return json(res,{items:rows.slice((page-1)*size,page*size),total:rows.length,page,pageSize:size});
    }
    const baseRoute=/^\/api\/v1\/knowledge\/bases\/([^/]+)(\/status)?$/.exec(url.pathname);
    if(baseRoute){
        const base=bases.find(base=>base.knowledgeBaseId===baseRoute[1]);if(!base)return json(res,null,404,'知识库不存在');
        if(req.method==='PUT'){
            if(baseRoute[2]){if(!['ACTIVE','DISABLED'].includes(body.status))return json(res,null,400,'无效状态');base.status=body.status;}
            else{if(!body.name?.trim())return json(res,null,400,'名称不能为空');base.name=body.name.trim();base.description=body.description||'';}
        }
        return json(res,base);
    }
    if(req.method==='GET' && url.pathname==='/api/v1/knowledge/documents'){
        const base=url.searchParams.get('knowledgeBaseId');
        if(base==='error')return json(res,null,500,'模拟服务不可用');
        if(base==='slow')await new Promise(resolve=>setTimeout(resolve,1000));
        if(!bases.some(item=>item.knowledgeBaseId===base))return json(res,null,404,'知识库不存在');
        const data=documents.filter(d=>d.knowledgeBaseId===base);
        return json(res,{items:data.slice((page-1)*size,page*size),total:data.length,page,pageSize:size});
    }
    if(req.method==='POST' && url.pathname==='/api/v1/knowledge/documents'){
        if(!raw.includes('name="knowledgeBaseId"')||!raw.includes('name="file"'))return json(res,null,400,'缺少 multipart 字段');
        await new Promise(resolve=>setTimeout(resolve,400));
        const filename=/filename="([^"]+)"/.exec(raw)?.[1]||'fixture.md';
        const baseId=/name="knowledgeBaseId"\r\n\r\n([^\r]+)/.exec(raw)?.[1];
        const base=bases.find(item=>item.knowledgeBaseId===baseId);if(!base)return json(res,null,404,'知识库不存在');if(base.status!=='ACTIVE')return json(res,null,409,'知识库已停用');
        const row={...documents[0],documentId:randomUUID(),knowledgeBaseId:baseId,fileName:filename,chunkCount:3,status:'READY'};documents.push(row);return json(res,row);
    }
    const scopedDoc=/^\/api\/v1\/knowledge\/documents\/([^/]+)\/(chunks|content)$/.exec(url.pathname);
    if(scopedDoc){const baseId=url.searchParams.get('knowledgeBaseId');if(!baseId)return json(res,null,400,'缺少 knowledgeBaseId');const row=documents.find(item=>item.documentId===scopedDoc[1]&&item.knowledgeBaseId===baseId);if(!row)return json(res,null,404,'文档不属于当前知识库');}
    if(url.pathname.endsWith('/chunks')){
        const chunks=Array.from({length:12},(_,i)=>({chunkId:`chunk-${i}`,documentId:'fixture-0',chunkIndex:i+1,charCount:44,content:`验证片段 ${i}：原始文档保存在 MinIO，正文切分后写入向量库。<script>alert(1)</script>`}));
        return json(res,{items:chunks.slice((page-1)*size,page*size),total:12,page,pageSize:size});
    }
    if(url.pathname.endsWith('/content')){res.writeHead(302,{Location:'http://127.0.0.1:18099/fixture.md'});return res.end();}
    if(url.pathname==='/fixture.md'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Synthetic fixture original.');}
    if(url.pathname==='/api/v1/knowledge/questions'){
        if(!body.knowledgeBaseId||!body.question||!Number.isInteger(body.topK)) return json(res,null,400,'问答契约不正确');
        const base=bases.find(item=>item.knowledgeBaseId===body.knowledgeBaseId);if(!base)return json(res,null,404,'知识库不存在');if(base.status!=='ACTIVE')return json(res,null,409,'知识库已停用');
        if(body.question==='fail')return json(res,null,502,'模拟模型调用失败');
        if(body.question==='empty'||!documents.some(item=>item.knowledgeBaseId===body.knowledgeBaseId))return json(res,{answer:'未找到足够的参考资料，请上传相关文档或换一种问法。',references:[]});
        await new Promise(resolve=>setTimeout(resolve,250));
        const source=documents.find(item=>item.knowledgeBaseId===body.knowledgeBaseId);
        return json(res,{answer:`当前知识库：${base.name}。\n`+'原始文档保存在 **MinIO**，正文切分后进行向量检索。[1]\n\n<script>alert("unsafe")</script>\n[危险链接](javascript:alert(1))',references:[{number:1,documentId:source.documentId,chunkId:'chunk-0',chunkIndex:1,fileName:source.fileName,content:'原始文档保存在 MinIO；只使用 READY 文档作为回答依据。<script>alert(1)</script>',score:.93,contentUrl:'/api/v1/knowledge/documents/fixture-0/content'}]});
    }
    if(url.pathname==='/api/v1/agent/auto_agent'){
        if(!['3','4'].includes(body.aiAgentId)||!body.sessionId||!Number.isInteger(body.maxStep))return json(res,null,400,'Agent 契约不正确');
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.flushHeaders();
        const events=[{type:'analysis',subType:'analysis_strategy',step:1,content:'分析模拟任务，确定执行步骤。'},{type:'execution',step:1,content:'执行模拟查询。'},{type:'supervision',step:1,content:'监督检查通过。'}];
        if(body.message!=='incomplete')events.push({type:'summary',completed:true,content:`Agent ${body.aiAgentId} 已完成模拟任务，最大步数 ${body.maxStep}。`},{type:'complete'});
        const bytes=Buffer.from(events.map(e=>`data: ${JSON.stringify(e)}\r\n\r\n`).join(''));
        for(let i=0;i<bytes.length;i+=17){res.write(bytes.subarray(i,i+17));await new Promise(resolve=>setTimeout(resolve,8));}
        return res.end();
    }
    json(res,null,404,'模拟路由不存在');
});
server.listen(18099,'127.0.0.1',()=>console.log('Synthetic backend: http://127.0.0.1:18099'));
