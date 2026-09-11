// Local-only static server + streaming API proxy. No npm install required.
import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.CHAT_V3_PORT || 3103);
const backend = new URL(process.env.CHAT_V3_BACKEND || 'http://127.0.0.1:8099');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid CHAT_V3_PORT');
if (!['http:', 'https:'].includes(backend.protocol) || backend.username || backend.password || backend.pathname !== '/' || backend.search || backend.hash) throw new Error('CHAT_V3_BACKEND must be an HTTP(S) origin');
const files = new Set(['index.html', 'app.js', 'styles.css', 'workspace.css', 'vendor/marked.min.js', 'vendor/purify.min.js', 'vendor/highlight.min.js', 'vendor/github.min.css']);
const mime = { html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8', css:'text/css; charset=utf-8' };
const base = new URL('./', import.meta.url);
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
function failure(response, status, message) {
    if (response.headersSent) { response.destroy(); return; }
    response.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
    response.end(JSON.stringify({code:`LOCAL_${status}`,info:message,data:null}));
}
const server = http.createServer(async (request, response) => {
    if (!hosts.has(request.headers.host)) return failure(response,403,'仅允许本机访问');
    let url; try { url = new URL(request.url, `http://127.0.0.1:${port}`); } catch { return failure(response,400,'请求地址无效'); }
    if (url.pathname.startsWith('/api/')) {
        const origin = request.headers.origin;
        if (origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(origin)) return failure(response,403,'不接受其他站点发起的请求');
        const allowed = request.method === 'POST'
            ? ['/api/v1/agent/auto_agent','/api/v1/knowledge/documents','/api/v1/knowledge/questions','/api/v1/knowledge/bases'].includes(url.pathname)
            : request.method === 'PUT'
                ? /^\/api\/v1\/knowledge\/bases\/[^/]+(?:\/status)?$/.test(url.pathname)
                : request.method === 'GET' && /^\/api\/v1\/knowledge\/(bases(?:\/[^/]+)?|documents(?:\/[^/]+(?:\/(?:chunks|content))?)?|chunks\/[^/]+)$/.test(url.pathname);
        if (!allowed) return failure(response,404,'接口不在 v3 代理范围内');
        const headers = {};
        for (const name of ['content-type','content-length','accept']) if (request.headers[name]) headers[name] = request.headers[name];
        const target = new URL(url.pathname + url.search, backend);
        const upstream = (backend.protocol === 'https:' ? https : http).request(target, {method:request.method, headers}, incoming => {
            const resultHeaders = {...incoming.headers};
            for (const name of ['connection','keep-alive','transfer-encoding']) delete resultHeaders[name];
            resultHeaders['cache-control'] = 'no-store';
            response.writeHead(incoming.statusCode || 502,resultHeaders);
            response.flushHeaders();
            incoming.on('error',() => response.destroy());
            incoming.pipe(response);
        });
        upstream.setTimeout(10*60*1000, () => { failure(response,504,'后端处理超时。上传资料请先查询文档状态，避免重复上传。'); upstream.destroy(); });
        upstream.on('error',() => failure(response,502,'无法连接后端，请启动 Java 服务并确认端口及 knowledge 配置。'));
        request.on('aborted',() => upstream.destroy());
        response.on('close',() => { if (!response.writableEnded) upstream.destroy(); });
        request.pipe(upstream);
        return;
    }
    if (!['GET','HEAD'].includes(request.method)) return failure(response,405,'不支持此请求方法');
    const name = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//,'');
    if (!files.has(name)) return failure(response,404,'页面不存在');
    try {
        const content = await readFile(fileURLToPath(new URL(name,base)));
        response.writeHead(200, {'Content-Type':mime[name.split('.').pop()] || 'application/octet-stream', 'Content-Length':content.length, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
        response.end(request.method === 'HEAD' ? undefined : content);
    } catch { failure(response,404,'文件不存在'); }
});
server.on('error',error => { console.error(`V3 启动失败：${error.message}`); process.exitCode = 1; });
server.listen(port,'127.0.0.1',() => console.log(`Agent Chat V3: http://127.0.0.1:${port}\nBackend: ${backend.origin}\nPress Ctrl+C to stop.`));
