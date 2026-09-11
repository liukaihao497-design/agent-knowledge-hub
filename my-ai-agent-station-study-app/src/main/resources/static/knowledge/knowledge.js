'use strict';
const $ = id => document.getElementById(id);
const apiRoot = new URL('../api/v1/knowledge', window.location.href).pathname;
const state = { documentPage: 1, chunkPage: 1, documentId: null, base: null, loading: 0, chunkRequest: 0, documentRequest: 0 };
const statusNames = { UPLOADING: '上传中', UPLOADED: '原件已上传', INDEXING: '建立索引中', READY: '可问答', FAILED: '处理失败' };
function message(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
function element(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
function base() { const value = $('base').value.trim(); if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new Error('知识库标识格式不正确'); return value; }
async function api(path, options = {}) {
  if (/^\/(documents\/|chunks\/)/.test(path) && !path.includes('knowledgeBaseId=')) path += (path.includes('?') ? '&' : '?') + 'knowledgeBaseId=' + encodeURIComponent(base());
  const response = await fetch(apiRoot + path, options);
  let body; try { body = await response.json(); } catch { throw new Error('接口未返回 JSON。请确认 knowledge.enabled=true，并从应用的 /knowledge/index.html 访问。'); }
  if (!response.ok || body.code !== '0000') throw new Error((body.info || '请求失败') + (body.data?.documentId ? '；文档 ID：' + body.data.documentId : ''));
  return body.data;
}
async function busy(button, label, work) {
  const original = button.textContent; button.disabled = true; button.textContent = label;
  state.loading++; $('base').disabled = true;
  try { await work(); } catch (error) { message(error.message, true); }
  finally { button.disabled = false; button.textContent = original; state.loading--; $('base').disabled = state.loading > 0; }
}
function originalLink(documentId) { const link = element('a', '查看原文件 ↗'); link.href = apiRoot + '/documents/' + encodeURIComponent(documentId) + '/content?knowledgeBaseId=' + encodeURIComponent(base()); link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; }
async function loadDocuments() {
  const request = ++state.documentRequest;
  const current = base(); if (state.base !== current) { state.documentPage = 1; state.base = current; $('chunks-panel').hidden = true; $('answer-panel').hidden = true; }
  const data = await api('/documents?knowledgeBaseId=' + encodeURIComponent(current) + '&page=' + state.documentPage + '&pageSize=10');
  if (request !== state.documentRequest) return;
  const rows = $('documents'); rows.replaceChildren();
  if (!data.items.length) { const tr = element('tr'); const td = element('td', '这里还没有文档。上传一份资料开始测试。', 'empty'); td.colSpan = 4; tr.append(td); rows.append(tr); }
  for (const doc of data.items) {
    const tr = element('tr'); const title = element('td'); title.append(element('div', doc.fileName), element('div', doc.documentId + ' · ' + Math.ceil(doc.fileSize / 1024) + ' KiB', 'doc-meta'));
    if (doc.errorMessage) title.append(element('div', doc.errorMessage, 'doc-meta'));
    const status = element('td'); status.append(element('span', statusNames[doc.status] || doc.status, 'badge ' + doc.status));
    const actions = element('td'); const inspect = element('button', '检查切片', 'secondary'); inspect.type = 'button'; inspect.onclick = () => busy(inspect, '加载中…', () => inspectDocument(doc.documentId)); actions.append(inspect);
    if (doc.contentUrl) actions.append(originalLink(doc.documentId));
    tr.append(title, status, element('td', String(doc.chunkCount)), actions); rows.append(tr);
  }
  $('document-total').textContent = data.total + ' 份文档'; $('doc-page').textContent = '第 ' + data.page + ' 页';
  $('doc-prev').disabled = data.page <= 1; $('doc-next').disabled = data.page * data.pageSize >= data.total;
}
function chunkCard(chunk) {
  const card = element('article', null, 'chunk'); card.id = 'chunk-' + chunk.chunkId;
  card.append(element('h3', '片段 ' + chunk.chunkIndex + ' · ' + chunk.charCount + ' 字符'), element('p', chunk.chunkId, 'help'), element('pre', chunk.content));
  const details = element('details'); details.append(element('summary', '查看 metadata'));
  let metadata = chunk.metadata; try { metadata = JSON.stringify(JSON.parse(metadata), null, 2); } catch { /* 保留原文供排查 */ }
  details.append(element('pre', metadata)); card.append(details); return card;
}
async function inspectDocument(id, page = 1) {
  const request = ++state.chunkRequest;
  const [doc, data] = await Promise.all([api('/documents/' + encodeURIComponent(id)), api('/documents/' + encodeURIComponent(id) + '/chunks?page=' + page + '&pageSize=10')]);
  if (request !== state.chunkRequest) return;
  state.documentId = id; state.chunkPage = page;
  $('chunk-title').textContent = doc.fileName; $('chunk-detail').textContent = '状态：' + (statusNames[doc.status] || doc.status) + ' · 共 ' + data.total + ' 个切片' + (doc.errorMessage ? ' · ' + doc.errorMessage : '');
  $('chunks').replaceChildren(...data.items.map(chunkCard)); if (!data.items.length) $('chunks').append(element('p', '尚无切片；请检查文档状态。', 'help'));
  $('chunk-page').textContent = '第 ' + data.page + ' 页'; $('chunk-prev').disabled = page <= 1; $('chunk-next').disabled = page * data.pageSize >= data.total;
  $('chunks-panel').hidden = false; $('chunks-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function showLinkedChunk() {
  const id = new URLSearchParams(location.hash.slice(1)).get('chunk');
  if (!id) return;
  if (!/^[0-9a-f-]{36}$/.test(id)) { message('引用链接的 chunk ID 无效', true); return; }
  try { const chunk = await api('/chunks/' + id); await inspectDocument(chunk.documentId, Math.floor((chunk.chunkIndex - 1) / 10) + 1); const target = $('chunk-' + id); if (target) { target.style.borderColor = '#356b56'; target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
  catch (error) { message(error.message, true); }
}
$('upload-form').addEventListener('submit', event => {
  event.preventDefault(); busy($('upload-button'), '上传及索引中…', async () => {
    const selected = $('file').files[0]; if (!selected || !selected.size || selected.size > 10 * 1024 * 1024) throw new Error('请选择非空且不超过 10 MiB 的文件');
    const form = new FormData(); form.append('file', selected); form.append('knowledgeBaseId', base());
    $('upload-result').hidden = true; message('正在上传、切分并写入向量，请等待处理完成。');
    const doc = await api('/documents', { method: 'POST', body: form });
    $('upload-result').textContent = doc.fileName + ' · ' + (statusNames[doc.status] || doc.status) + ' · ' + doc.chunkCount + ' 个切片'; $('upload-result').hidden = false;
    state.documentPage = 1; await loadDocuments(); message('索引完成，可以提问或检查切片。');
  });
});
$('question-form').addEventListener('submit', event => {
  event.preventDefault(); busy($('ask-button'), '检索与回答中…', async () => {
    const question = $('question').value.trim(); if (!question) throw new Error('请填写问题');
    $('answer-panel').hidden = true; message('正在检索当前知识库，并依据资料生成回答。');
    const result = await api('/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ knowledgeBaseId: base(), question, topK: Number($('topk').value) }) });
    $('answer').textContent = result.answer; $('references').replaceChildren();
    for (const ref of result.references) {
      const card = element('article', null, 'reference'); card.append(element('h3', '[' + ref.number + '] ' + ref.fileName + ' · 片段 ' + ref.chunkIndex), element('p', ref.content));
      const source = element('a', '定位原文片段'); source.href = '#chunk=' + encodeURIComponent(ref.chunkId); source.onclick = () => { if (location.hash === source.hash) showLinkedChunk(); };
      card.append(source, originalLink(ref.documentId)); $('references').append(card);
    }
    $('answer-panel').hidden = false; message('回答完成，共提供 ' + result.references.length + ' 条参考片段。'); $('answer-panel').scrollIntoView({ behavior: 'smooth' });
  });
});
$('refresh').onclick = () => busy($('refresh'), '加载中…', async () => { await loadDocuments(); message('文档列表已更新。'); });
// 分页结束后由接口结果设置按钮状态，避免通用 busy 再次启用末页按钮。
async function paginate(kind, delta) {
  try {
    if (kind === 'document') { state.documentPage += delta; await loadDocuments(); }
    else await inspectDocument(state.documentId, state.chunkPage + delta);
  } catch (error) { if (kind === 'document') state.documentPage -= delta; message(error.message, true); }
}
$('doc-prev').onclick = () => paginate('document', -1); $('doc-next').onclick = () => paginate('document', 1);
$('chunk-prev').onclick = () => paginate('chunk', -1); $('chunk-next').onclick = () => paginate('chunk', 1);
$('close-chunks').onclick = () => { $('chunks-panel').hidden = true; };
window.addEventListener('hashchange', showLinkedChunk);
showLinkedChunk();
