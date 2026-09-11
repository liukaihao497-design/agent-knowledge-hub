'use strict';

const $ = id => document.getElementById(id);
const defaultApiBase = new URL('../api/v1/knowledge', window.location.href).pathname.replace(/\/$/, '');
const statusLabel = {
  UPLOADING: '上传中', UPLOADED: '原件已上传', INDEXING: '索引中', READY: '可问答', FAILED: '失败'
};
const state = {
  documentPage: 1,
  documentPageSize: 10,
  documentTotal: 0,
  selectedDocumentId: null,
  chunkPage: 1,
  chunkPageSize: 6,
  chunkTotal: 0,
  requests: [],
  lastResponse: '{}'
};

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function apiBase() {
  const value = $('api-base').value.trim().replace(/\/$/, '');
  if (!value) throw new Error('请填写接口根地址');
  return value;
}

function knowledgeBaseId() {
  const value = $('knowledge-base').value.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new Error('知识库标识只能包含字母、数字、下划线和短横线，长度 1～64');
  }
  return value;
}

function announce(text, type = '') {
  $('notice').textContent = text;
  $('notice').className = 'notice' + (type ? ' ' + type : '');
}

function setConnection(type, text) {
  $('connection-dot').className = 'signal' + (type ? ' ' + type : '');
  $('connection-copy').textContent = text;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MiB';
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function inspectResponse(meta, value) {
  state.lastResponse = pretty(value);
  $('response-meta').textContent = meta;
  $('response-json').textContent = state.lastResponse;
}

function renderRequestLog() {
  const list = $('request-log');
  list.replaceChildren();
  if (!state.requests.length) {
    list.append(node('li', '发起请求后将在这里显示。', 'history-empty'));
    return;
  }
  state.requests.slice(0, 8).forEach(entry => {
    const item = node('li', null, entry.ok ? '' : 'failed');
    item.append(node('span', entry.method, 'method'), node('span', entry.path, 'path'), node('span', entry.duration + 'ms', 'duration'));
    list.append(item);
  });
}

function rememberRequest(entry) {
  state.requests.unshift(entry);
  renderRequestLog();
}

async function request(path, options = {}) {
  if (/^\/(documents\/|chunks\/)/.test(path) && !path.includes('knowledgeBaseId=')) path += (path.includes('?') ? '&' : '?') + 'knowledgeBaseId=' + encodeURIComponent(knowledgeBaseId());
  const method = options.method || 'GET';
  const started = performance.now();
  let response;
  let payload;
  try {
    response = await fetch(apiBase() + path, options);
    const raw = await response.text();
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error('接口没有返回 JSON：' + raw.slice(0, 180));
    }
    const duration = Math.round(performance.now() - started);
    rememberRequest({ method, path, duration, ok: response.ok && payload?.code === '0000' });
    inspectResponse(method + ' ' + path + ' · HTTP ' + response.status + ' · ' + duration + ' ms', payload);
    if (!response.ok || payload?.code !== '0000') {
      const documentHint = payload?.data?.documentId ? '；文档 ID：' + payload.data.documentId : '';
      throw new Error((payload?.info || '请求失败，HTTP ' + response.status) + documentHint);
    }
    return payload.data;
  } catch (error) {
    if (!response) {
      const duration = Math.round(performance.now() - started);
      rememberRequest({ method, path, duration, ok: false });
      inspectResponse(method + ' ' + path + ' · NETWORK ERROR · ' + duration + ' ms', { error: error.message });
    }
    throw error;
  }
}

async function run(button, pendingText, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = pendingText;
  try {
    await action();
  } catch (error) {
    announce(error.message || String(error), 'error');
    setConnection('error', '最近请求失败');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function originalDocument(documentId) {
  window.open(apiBase() + '/documents/' + encodeURIComponent(documentId) + '/content?knowledgeBaseId=' + encodeURIComponent(knowledgeBaseId()), '_blank', 'noopener,noreferrer');
}

function selectFile(file) {
  if (!file) {
    $('file-title').textContent = '选择文件，或拖放到这里';
    $('file-meta').textContent = 'TXT / MD / PDF / DOCX · 最大 10 MiB';
    return;
  }
  $('file-title').textContent = file.name;
  $('file-meta').textContent = formatBytes(file.size) + ' · ' + (file.type || '未知 MIME 类型');
}

async function upload() {
  const file = $('file-input').files[0];
  if (!file || file.size === 0) throw new Error('请选择一个非空文件');
  if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10 MiB');
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['txt', 'md', 'pdf', 'docx'].includes(extension)) throw new Error('第一版只支持 txt、md、pdf、docx');

  const form = new FormData();
  form.append('knowledgeBaseId', knowledgeBaseId());
  form.append('file', file);
  announce('正在上传、解析、切片并写入索引，请等待接口完成。');
  const documentData = await request('/documents', { method: 'POST', body: form });
  $('upload-result').hidden = false;
  $('upload-result').textContent = documentData.fileName + ' · ' + (statusLabel[documentData.status] || documentData.status) + ' · ' + documentData.chunkCount + ' 个切片 · ' + documentData.documentId;
  state.documentPage = 1;
  await loadDocuments();
  announce('上传接口调用成功，文档和切片已刷新。', 'success');
  setConnection('online', '接口连接正常');
}

function documentRow(documentData) {
  const row = node('tr');
  const name = node('td');
  name.append(node('div', documentData.fileName, 'doc-name'), node('div', documentData.documentId, 'doc-id'));
  if (documentData.errorMessage) name.append(node('div', documentData.errorMessage, 'doc-id'));

  const statusCell = node('td');
  statusCell.append(node('span', statusLabel[documentData.status] || documentData.status, 'status ' + documentData.status));
  const actions = node('td', null, 'row-actions');
  const detail = node('button', '详情与切片', 'link-button');
  detail.type = 'button';
  detail.addEventListener('click', () => run(detail, '读取中…', () => openDocument(documentData.documentId)));
  const source = node('button', '打开原件', 'link-button');
  source.type = 'button';
  source.addEventListener('click', () => originalDocument(documentData.documentId));
  actions.append(detail, source);
  row.append(name, statusCell, node('td', formatBytes(documentData.fileSize)), node('td', String(documentData.chunkCount)), actions);
  return row;
}

async function loadDocuments() {
  const query = new URLSearchParams({
    knowledgeBaseId: knowledgeBaseId(),
    page: String(state.documentPage),
    pageSize: String(state.documentPageSize)
  });
  const data = await request('/documents?' + query);
  state.documentTotal = data.total;
  const body = $('document-rows');
  body.replaceChildren();
  if (!data.items.length) {
    const row = node('tr');
    const cell = node('td', '当前知识库还没有文档。', 'empty-cell');
    cell.colSpan = 5;
    row.append(cell);
    body.append(row);
  } else {
    body.append(...data.items.map(documentRow));
  }
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  $('document-total').textContent = data.total + ' 份文档';
  $('document-page').textContent = data.page + ' / ' + totalPages;
  $('document-prev').disabled = data.page <= 1;
  $('document-next').disabled = data.page >= totalPages;
}

function addDetail(term, description) {
  const wrapper = node('div');
  wrapper.append(node('dt', term), node('dd', description == null || description === '' ? '—' : String(description)));
  $('document-detail').append(wrapper);
}

function renderDocumentDetail(documentData) {
  $('detail-title').textContent = documentData.fileName;
  $('document-detail').replaceChildren();
  addDetail('documentId', documentData.documentId);
  addDetail('knowledgeBaseId', documentData.knowledgeBaseId);
  addDetail('status', statusLabel[documentData.status] || documentData.status);
  addDetail('contentType', documentData.contentType);
  addDetail('fileSize', formatBytes(documentData.fileSize));
  addDetail('chunkCount', documentData.chunkCount);
  addDetail('createdAt', documentData.createTime);
  addDetail('updatedAt', documentData.updateTime);
}

function chunkCard(chunk) {
  const card = node('article', null, 'chunk');
  card.dataset.chunkId = chunk.chunkId;
  const head = node('div', null, 'chunk-head');
  head.append(node('strong', 'Chunk #' + chunk.chunkIndex), node('span', chunk.charCount + ' 字符 · ' + chunk.chunkId));
  const actions = node('div', null, 'chunk-actions');
  const detail = node('button', '调用单切片详情接口', 'link-button');
  detail.type = 'button';
  detail.addEventListener('click', () => run(detail, '请求中…', () => inspectChunk(chunk.chunkId)));
  const metadata = node('button', '检查 metadata', 'link-button');
  metadata.type = 'button';
  metadata.addEventListener('click', () => {
    let value = chunk.metadata;
    try { value = JSON.parse(chunk.metadata); } catch { /* 展示数据库原始值 */ }
    inspectResponse('本页 Chunk #' + chunk.chunkIndex + ' metadata', value);
    $('inspector').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  actions.append(detail, metadata);
  card.append(head, node('p', chunk.content), actions);
  return card;
}

async function loadChunks(page = 1) {
  const documentId = state.selectedDocumentId;
  const query = new URLSearchParams({ page: String(page), pageSize: String(state.chunkPageSize) });
  const data = await request('/documents/' + encodeURIComponent(documentId) + '/chunks?' + query);
  state.chunkPage = data.page;
  state.chunkTotal = data.total;
  const list = $('chunk-list');
  list.replaceChildren();
  if (!data.items.length) list.append(node('p', '这个文档尚未生成切片。', 'empty-cell'));
  else list.append(...data.items.map(chunkCard));
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  $('chunk-total').textContent = data.total + ' 个切片';
  $('chunk-page-label').textContent = '第 ' + data.page + ' / ' + pages + ' 页';
  $('chunk-prev').disabled = data.page <= 1;
  $('chunk-next').disabled = data.page >= pages;
}

async function openDocument(documentId) {
  state.selectedDocumentId = documentId;
  state.chunkPage = 1;
  const documentData = await request('/documents/' + encodeURIComponent(documentId));
  renderDocumentDetail(documentData);
  await loadChunks(1);
  $('detail-panel').hidden = false;
  $('detail-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  announce('文档详情和切片接口调用成功。', 'success');
}

async function inspectChunk(chunkId) {
  const chunk = await request('/chunks/' + encodeURIComponent(chunkId));
  document.querySelectorAll('.chunk').forEach(item => item.classList.toggle('highlight', item.dataset.chunkId === chunkId));
  announce('单切片详情接口调用成功，原始结果已写入响应检查器。', 'success');
  $('inspector').scrollIntoView({ behavior: 'smooth', block: 'start' });
  return chunk;
}

function referenceCard(reference) {
  const card = node('article', null, 'reference');
  card.append(node('h4', '[' + reference.number + '] ' + reference.fileName + ' · Chunk #' + reference.chunkIndex), node('p', reference.content));
  const footer = node('footer');
  const chunkButton = node('button', '查询该切片');
  chunkButton.type = 'button';
  chunkButton.addEventListener('click', () => run(chunkButton, '查询中…', () => inspectChunk(reference.chunkId)));
  const sourceButton = node('button', '打开原件');
  sourceButton.type = 'button';
  sourceButton.addEventListener('click', () => originalDocument(reference.documentId));
  footer.append(chunkButton, sourceButton);
  card.append(footer);
  return card;
}

async function askQuestion() {
  const question = $('question-input').value.trim();
  if (!question) throw new Error('请输入问题');
  $('answer-card').hidden = true;
  announce('正在召回切片并生成回答。');
  const data = await request('/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ knowledgeBaseId: knowledgeBaseId(), question, topK: Number($('top-k').value) })
  });
  $('answer-text').textContent = data.answer;
  $('references').replaceChildren(...data.references.map(referenceCard));
  $('reference-count').textContent = data.references.length + ' 条引用';
  $('answer-card').hidden = false;
  announce('问答接口调用成功。', 'success');
  setConnection('online', '接口连接正常');
}

async function testConnection() {
  const query = new URLSearchParams({ knowledgeBaseId: knowledgeBaseId(), page: '1', pageSize: '1' });
  await request('/documents?' + query);
  setConnection('online', '连接成功');
  announce('接口连接成功，knowledge.enabled 已启用。', 'success');
}

$('api-base').value = localStorage.getItem('knowledgev1.apiBase') || defaultApiBase;
$('knowledge-base').value = localStorage.getItem('knowledgev1.baseId') || 'demo';
$('api-base').addEventListener('change', () => localStorage.setItem('knowledgev1.apiBase', $('api-base').value.trim()));
$('knowledge-base').addEventListener('change', () => {
  localStorage.setItem('knowledgev1.baseId', $('knowledge-base').value.trim());
  state.documentPage = 1;
  $('detail-panel').hidden = true;
  $('answer-card').hidden = true;
});

$('file-input').addEventListener('change', event => selectFile(event.target.files[0]));
['dragenter', 'dragover'].forEach(type => $('drop-zone').addEventListener(type, event => {
  event.preventDefault();
  $('drop-zone').classList.add('dragging');
}));
['dragleave', 'drop'].forEach(type => $('drop-zone').addEventListener(type, event => {
  event.preventDefault();
  $('drop-zone').classList.remove('dragging');
}));
$('drop-zone').addEventListener('drop', event => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  $('file-input').files = transfer.files;
  selectFile(file);
});

$('upload-form').addEventListener('submit', event => {
  event.preventDefault();
  run($('upload-button'), '处理中…', upload);
});
$('question-form').addEventListener('submit', event => {
  event.preventDefault();
  run($('question-button'), '生成中…', askQuestion);
});
$('test-connection').addEventListener('click', () => run($('test-connection'), '连接中…', testConnection));
$('refresh-documents').addEventListener('click', () => run($('refresh-documents'), '…', async () => {
  await loadDocuments();
  announce('文档列表已刷新。', 'success');
}));
$('document-prev').addEventListener('click', async () => {
  state.documentPage -= 1;
  try { await loadDocuments(); } catch (error) { state.documentPage += 1; announce(error.message, 'error'); }
});
$('document-next').addEventListener('click', async () => {
  state.documentPage += 1;
  try { await loadDocuments(); } catch (error) { state.documentPage -= 1; announce(error.message, 'error'); }
});
$('chunk-prev').addEventListener('click', () => loadChunks(state.chunkPage - 1).catch(error => announce(error.message, 'error')));
$('chunk-next').addEventListener('click', () => loadChunks(state.chunkPage + 1).catch(error => announce(error.message, 'error')));
$('close-detail').addEventListener('click', () => { $('detail-panel').hidden = true; });
$('clear-history').addEventListener('click', () => { state.requests = []; renderRequestLog(); });
$('copy-response').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(state.lastResponse);
    announce('响应 JSON 已复制。', 'success');
  } catch {
    announce('浏览器未授予剪贴板权限，请直接从响应检查器复制。', 'error');
  }
});
