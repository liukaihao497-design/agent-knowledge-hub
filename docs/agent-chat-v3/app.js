(() => {
'use strict';
    const stageMap = {
        analysis: { label: '分析', color: '#2f6f90' },
        execution: { label: '执行', color: '#a66a20' },
        supervision: { label: '监督', color: '#7b5aa6' },
        summary: { label: '归纳', color: '#2e7658' },
        error: { label: '异常', color: '#a94232' },
        complete: { label: '完成', color: '#2e7658' }
    };

    const subTypeMap = {
        analysis_status: '任务状态', analysis_history: '历史评估', analysis_strategy: '执行策略', analysis_progress: '完成度', analysis_task_status: '任务状态',
        execution_target: '执行目标', execution_process: '执行过程', execution_result: '执行结果', execution_quality: '质量检查',
        assessment: '质量评估', issues: '问题识别', suggestions: '改进建议', score: '质量评分', pass: '检查结果',
        supervision_assessment: '质量评估', supervision_issues: '问题识别', supervision_suggestions: '改进建议', supervision_score: '质量评分',
        completed_work: '已完成工作', incomplete_reasons: '未完成原因', evaluation: '效果评估', summary_overview: '总结概览'
    };

    function configureMarkdown() {
        if (!window.marked) return;
        marked.setOptions({ breaks: true, gfm: true });
    }

    function renderUserMessage(message) {
        const article = document.createElement('article');
        article.className = 'message-row user-row';
        article.dataset.messageId = message.id;
        article.innerHTML = `<div class="avatar user-avatar">你</div><div class="message-content">
            <div class="message-meta"><strong>你</strong><span class="message-time">${formatTime(message.createdAt)}</span></div>
            <div class="user-bubble"></div>
        </div>`;
        article.querySelector('.user-bubble').textContent = message.content;
        els.messages.appendChild(article);
    }

    function renderAssistantMessage(message) {
        const fragment = els.assistantTemplate.content.cloneNode(true);
        const article = fragment.querySelector('.assistant-row');
        article.dataset.messageId = message.id;
        article.querySelector('.message-time').textContent = formatTime(message.createdAt);
        updateAssistantElement(article, message);
        bindTraceControls(article, message);
        els.messages.appendChild(fragment);
        highlightCode(article);
    }

    function traceCardHtml(trace, index) {
        const stage = stageMap[trace.type] || { label: trace.type || '过程', color: '#2e7658' };
        const subLabel = subTypeMap[trace.subType] || trace.subType || stage.label;
        const stepLabel = trace.step ? `STEP ${String(trace.step).padStart(2, '0')}` : `LOG ${String(index + 1).padStart(2, '0')}`;
        return `<article class="trace-card" style="--stage-color:${stage.color}">
            <div class="trace-card-top"><span class="trace-stage"><i></i>${escapeHtml(stage.label)} · ${escapeHtml(subLabel)}</span><span class="trace-step">${stepLabel}</span></div>
            <div class="trace-card-body markdown-body">${renderMarkdown(trace.content)}</div>
        </article>`;
    }

    function bindTraceControls(article, message) {
        const traceWindow = article.querySelector('.trace-window');
        const track = article.querySelector('.trace-track');
        article.querySelector('.trace-toggle').onclick = () => {
            message.traceCollapsed = !message.traceCollapsed;
            traceWindow.classList.toggle('is-collapsed', message.traceCollapsed);
            article.querySelector('.trace-toggle').setAttribute('aria-expanded', String(!message.traceCollapsed));
            persistSessions();
        };
        article.querySelectorAll('.trace-controls button').forEach(button => {
            button.onclick = () => {
                if (message.traceCollapsed) {
                    message.traceCollapsed = false;
                    traceWindow.classList.remove('is-collapsed');
                }
                const direction = Number(button.dataset.direction);
                track.scrollBy({ left: direction * Math.max(260, track.clientWidth * .7), behavior: 'smooth' });
            };
        });
        track.ondblclick = () => {
            message.traceExpanded = !message.traceExpanded;
            traceWindow.dataset.expanded = String(message.traceExpanded);
            persistSessions();
        };
    }

    async function consumeEventStream(stream, onEvent) {
        const reader = stream.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() || '';
            blocks.forEach(block => parseEventBlock(block, onEvent));
            if (done) break;
        }
        if (buffer.trim()) parseEventBlock(buffer, onEvent);
    }

    function parseEventBlock(block, onEvent) {
        const dataLines = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart());
        const payload = dataLines.length ? dataLines.join('\n') : block.trim();
        if (!payload || payload === '[DONE]') return;
        try {
            onEvent(JSON.parse(payload));
        } catch (_) {
            onEvent({ type: 'error', content: payload, completed: true, timestamp: Date.now() });
        }
    }

    function receiveAgentEvent(sessionId, messageId, data) {
        const message = findMessage(sessionId, messageId);
        if (!message || !data) return;
        const type = String(data.type || 'analysis').toLowerCase();
        const content = String(data.content || '').trim();

        if (type === 'summary' && (data.completed === true || !data.subType)) {
            if (content) message.final = content;
        } else if (type === 'complete') {
            message.status = 'complete';
        } else if (type === 'error') {
            message.status = 'error';
            message.final = content || '任务执行失败';
        } else if (content) {
            message.traces.push({ type, subType: data.subType || '', step: data.step || null, content, timestamp: data.timestamp || Date.now() });
        }

        const session = sessions.find(item => item.id === sessionId);
        if (session) session.updatedAt = Date.now();
        persistSessions();
        refreshMessage(messageId);
    }

    function refreshMessage(messageId) {
        if (getActiveSession()?.id !== activeRequest?.sessionId) return;
        const message = findMessage(activeRequest.sessionId, messageId);
        const article = els.messages.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
        if (!message || !article) return;
        const track = article.querySelector('.trace-track');
        const wasAtEnd = track.scrollWidth - track.scrollLeft - track.clientWidth < 80;
        updateAssistantElement(article, message);
        bindTraceControls(article, message);
        highlightCode(article);
        if (wasAtEnd) requestAnimationFrame(() => { track.scrollLeft = track.scrollWidth; });
        scrollConversation(false);
    }

    function moveSessionToTop(id) {
        const index = sessions.findIndex(item => item.id === id);
        if (index > 0) sessions.unshift(sessions.splice(index, 1)[0]);
    }

    function setConnectionState(state, label) {
        els.connectionStatus.dataset.state = state;
        els.connectionStatus.querySelector('span').textContent = label;
    }

    function toggleSettings(event) {
        event.stopPropagation();
        const willOpen = els.settingsPanel.hidden;
        els.settingsPanel.hidden = !willOpen;
        els.settingsButton.setAttribute('aria-expanded', String(willOpen));
    }

    function closeSettingsOnOutsideClick(event) {
        if (!els.settingsPanel.hidden && !els.settingsPanel.contains(event.target)) hideSettings();
    }

    function hideSettings() {
        els.settingsPanel.hidden = true;
        els.settingsButton.setAttribute('aria-expanded', 'false');
    }

    function closeMobileSidebar() { document.body.classList.remove('sidebar-open'); }

    function autoResizeInput() {
        els.messageInput.style.height = 'auto';
        els.messageInput.style.height = `${Math.min(140, els.messageInput.scrollHeight)}px`;
    }

    function scrollConversation(force) {
        const distance = els.conversation.scrollHeight - els.conversation.scrollTop - els.conversation.clientHeight;
        if (force || distance < 220) requestAnimationFrame(() => els.conversation.scrollTo({ top: els.conversation.scrollHeight, behavior: force ? 'smooth' : 'auto' }));
    }

    function highlightCode(root) {
        if (!window.hljs) return;
        root.querySelectorAll('pre code:not([data-highlighted])').forEach(block => hljs.highlightElement(block));
    }

    function getActiveSession() { return sessions.find(item => item.id === activeSessionId) || null; }
    function findMessage(sessionId, messageId) { return sessions.find(item => item.id === sessionId)?.messages.find(item => item.id === messageId) || null; }

    function makeId(prefix) {
        const random = window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        return `${prefix}_${random}`;
    }

    function makeTitle(content) { return content.replace(/\s+/g, ' ').slice(0, 28) || '新的智能会话'; }

    function formatTime(value) {
        return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
    }

    function formatRelativeTime(value) {
        const date = new Date(value);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) return formatTime(value);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }

    function escapeAttribute(value) { return escapeHtml(value); }

    function showToast(message) {
        let toast = document.querySelector('.toast');
        if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
    }
    const STORAGE_KEY = 'agent-station.chat-history.v3';
    const MAX_LOCAL_SESSIONS = 30;
    const els = {};
    let sessions = loadSessions();
    let activeSessionId = null;
    let activeRequest = null;
    let toastTimer = null;
    let mode = 'knowledge';
    let view = 'chat';
    let knowledgeBases = [];
    let selectedBaseId = '';
    let basesLoaded = false;
    let basesLoading = false;
    let basesError = '';
    let basesGeneration = 0;
    let editingBaseId = null;
    let savingBase = false;
    let libraryBase = '';
    let libraryPage = 1;
    let libraryGeneration = 0;
    let libraryTimer = null;
    let sourceGeneration = 0;
    let uploadContext = null;
    let selectedFile = null;
    let uploading = false;

    window.addEventListener('DOMContentLoaded', init);
    function init() {
        document.querySelectorAll('[id]').forEach(element => { els[element.id] = element; });
        els.assistantTemplate = els.assistantMessageTemplate;
        configureMarkdown(); restoreSettings(); bindEvents(); renderAll(); refreshKnowledgeBases();
    }
    function bindEvents() {
        els.composer.addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
        els.messageInput.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(); }
        });
        els.messageInput.addEventListener('input', autoResizeInput);
        els.newChatButton.onclick = createNewSession;
        els.chatNav.onclick = () => setView('chat');
        els.libraryButton.onclick = () => setView('library');
        els.clearHistoryButton.onclick = clearHistory;
        els.mobileMenuButton.onclick = () => document.body.classList.add('sidebar-open');
        els.mobileBackdrop.onclick = closeMobileSidebar;
        els.settingsButton.onclick = toggleSettings;
        document.addEventListener('click', closeSettingsOnOutsideClick);
        document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => changeMode(button.dataset.mode));
        els.knowledgeBaseInput.onchange = changeBase;
        els.agentSelect.onchange = changeAgent;
        [els.maxStepSelect, els.topKSelect, els.apiUrlInput].forEach(control => control.addEventListener('change', saveSettings));
        els.suggestions.onclick = event => {
            const button = event.target.closest('[data-prompt]'); if (!button) return;
            els.messageInput.value = button.dataset.prompt; autoResizeInput(); els.messageInput.focus();
        };
        ['quickUpload', 'welcomeUpload'].forEach(id => els[id].onclick = () => openUpload(els.knowledgeBaseInput.value.trim()));
        els.sidebarUpload.onclick = () => openUpload(view === 'library' ? libraryBase : selectedBaseId);
        els.libraryUpload.onclick = () => openUpload(els.libraryBaseInput.value.trim());
        els.closeUpload.onclick = () => els.uploadDialog.close();
        els.closeSource.onclick = () => els.sourceDrawer.close();
        els.sourceDrawer.addEventListener('close', () => { sourceGeneration++; });
        els.fileInput.onchange = () => chooseFile(els.fileInput.files[0]);
        els.uploadForm.onsubmit = event => { event.preventDefault(); uploadFile(); };
        els.dropZone.addEventListener('dragover', event => { event.preventDefault(); if (!uploading) els.dropZone.classList.add('drag-over'); });
        els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag-over'));
        els.dropZone.addEventListener('drop', event => {
            event.preventDefault(); els.dropZone.classList.remove('drag-over'); if (uploading) return;
            if (event.dataTransfer.files.length !== 1) { showToast('请每次选择一个文件'); return; }
            chooseFile(event.dataTransfer.files[0]);
        });
        els.uploadAsk.onclick = () => { const base = uploadContext.base; els.uploadDialog.close(); startKnowledgeChat(base); };
        els.newBaseButton.onclick = () => openBaseDialog();
        els.createLibraryBase.onclick = () => openBaseDialog();
        els.refreshBases.onclick = () => refreshKnowledgeBases();
        els.closeBaseDialog.onclick = () => { if (!savingBase) els.baseDialog.close(); };
        els.baseDialog.addEventListener('cancel', event => { if (savingBase) event.preventDefault(); });
        els.baseForm.onsubmit = event => { event.preventDefault(); saveKnowledgeBase(); };
        els.libraryBaseInput.onchange = changeLibraryBase;
        els.loadLibrary.onclick = changeLibraryBase;
        els.libraryBaseInput.onkeydown = event => { if (event.key === 'Enter') changeLibraryBase(); };
        els.askLibrary.onclick = () => startKnowledgeChat(els.libraryBaseInput.value.trim());
        els.previousPage.onclick = () => loadDocuments(Math.max(1, libraryPage - 1));
        els.nextPage.onclick = () => loadDocuments(libraryPage + 1);
        window.addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); createNewSession(); }
            if (event.key === 'Escape') { closeMobileSidebar(); hideSettings(); }
        });
    }
    function currentConfig() {
        return { mode, knowledgeBaseId: selectedBaseId, knowledgeBaseName: baseName(selectedBaseId), agentId: els.agentSelect.value,
            maxStep: Number(els.maxStepSelect.value), topK: Number(els.topKSelect.value), apiBase: els.apiUrlInput.value.trim().replace(/\/$/, '') };
    }
    function validateBase(base, activeOnly = true) {
        const item = knowledgeBases.find(item => item.knowledgeBaseId === base);
        if (!basesLoaded || !item) { showToast('请先创建或选择一个有效的知识库'); return false; }
        if (activeOnly && item.status !== 'ACTIVE') { showToast('该知识库已停用，请先启用或选择其他知识库'); return false; }
        return true;
    }

    function validateApi() {
        const value = els.apiUrlInput.value.trim(); if (!value) return true;
        try {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error(); return true;
        } catch { showToast('请输入服务根地址，例如 http://localhost:8099，不包含接口路径'); return false; }
    }
    function api(path, config = currentConfig()) { return `${config.apiBase || ''}/api/v1/${path}`; }
    function rememberBase(base) {
        selectedBaseId = base;
    }

    function storeSettings() {
        try { localStorage.setItem(`${STORAGE_KEY}.settings`, JSON.stringify(currentConfig())); }
        catch { showToast('浏览器无法保存设置，当前页面仍可使用'); }
    }
    function saveSettings(event) {
        if (!validateApi()) return;
        const session = getActiveSession(); if (session && !activeRequest) { session.config = currentConfig(); persistSessions(); }
        storeSettings();
        if (event?.target === els.apiUrlInput) refreshKnowledgeBases();
    }
    function restoreSettings() {
        let config = {}; try { config = JSON.parse(localStorage.getItem(`${STORAGE_KEY}.settings`)) || {}; } catch {}
        applyConfig({ ...config, mode: 'knowledge' });
        libraryBase = selectedBaseId;
    }
    function applyConfig(config) {
        mode = config.mode === 'agent' ? 'agent' : 'knowledge';
        selectedBaseId = /^[A-Za-z0-9_-]{1,64}$/.test(config.knowledgeBaseId || '') ? config.knowledgeBaseId : '';
        renderBaseSelectors();
        els.agentSelect.value = ['3','4'].includes(String(config.agentId)) ? String(config.agentId) : '4';
        els.maxStepSelect.value = ['1','2','3','5','10'].includes(String(config.maxStep)) ? String(config.maxStep) : '5';
        els.topKSelect.value = ['3','5','10'].includes(String(config.topK)) ? String(config.topK) : '5';
        els.apiUrlInput.value = typeof config.apiBase === 'string' ? config.apiBase : '';
    }
    function guardRequest() { if (activeRequest) { showToast('当前回复生成中，请等待完成后再切换'); return false; } return true; }
    function changeMode(nextMode) {
        if (nextMode === mode || !guardRequest()) return;
        activeSessionId = null; mode = nextMode; els.messageInput.value = ''; autoResizeInput(); storeSettings(); renderAll();
    }
    function changeBase() {
        const base = els.knowledgeBaseInput.value.trim();
        if (!validateBase(base) || !guardRequest()) { els.knowledgeBaseInput.value = getActiveSession()?.config.knowledgeBaseId || selectedBaseId; return; }
        const session = getActiveSession();
        if (session && session.config.knowledgeBaseId !== base) { activeSessionId = null; els.messageInput.value = ''; }
        els.knowledgeBaseInput.value = base; rememberBase(base); storeSettings(); renderAll();
    }
    function changeAgent() {
        if (!guardRequest()) { els.agentSelect.value = getActiveSession()?.config.agentId || '4'; return; }
        if (getActiveSession()?.config.agentId !== els.agentSelect.value) { activeSessionId = null; els.messageInput.value = ''; }
        storeSettings(); renderAll();
    }
    function createNewSession() {
        if (!guardRequest()) return;
        activeSessionId = null; mode = 'knowledge'; els.messageInput.value = ''; autoResizeInput(); setView('chat'); hideSettings(); renderAll(); els.messageInput.focus();
    }
    function startKnowledgeChat(base) {
        if (!validateBase(base) || !guardRequest()) return;
        activeSessionId = null; mode = 'knowledge'; els.knowledgeBaseInput.value = base;
        rememberBase(base); storeSettings(); els.messageInput.value = ''; setView('chat'); renderAll(); els.messageInput.focus();
    }
    function addSession() {
        const now = Date.now(); const session = { id: makeId('session'), title: '新会话', createdAt: now, updatedAt: now, config: currentConfig(), messages: [] };
        sessions.unshift(session); activeSessionId = session.id; return session;
    }
    function selectSession(id) {
        if (!guardRequest()) return;
        const session = sessions.find(item => item.id === id); if (!session) return;
        activeSessionId = id; applyConfig(session.config); els.messageInput.value = ''; autoResizeInput(); rememberBase(session.config.knowledgeBaseId || ''); setView('chat'); renderAll(); refreshKnowledgeBases();
    }
    function setView(nextView) {
        view = nextView; closeMobileSidebar(); hideSettings(); els.libraryView.hidden = view !== 'library';
        [els.contextBar, els.conversation, els.composerWrap].forEach(element => { element.hidden = view !== 'chat'; });
        els.chatNav.removeAttribute('aria-current'); els.libraryButton.removeAttribute('aria-current');
        (view === 'chat' ? els.chatNav : els.libraryButton).setAttribute('aria-current', 'page');
        if (view === 'library') { libraryBase = selectedBaseId || knowledgeBases[0]?.knowledgeBaseId || ''; renderBaseSelectors(); loadDocuments(1); }
        else { clearTimeout(libraryTimer); libraryGeneration++; } updateHeader(); updateKnowledgeAvailability();
    }
    function renderAll() { renderHistory(); renderMode(); renderConversation(); updateHeader(); }
    function renderMode() {
        const knowledge = mode === 'knowledge';
        document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
        els.knowledgeControls.hidden = !knowledge; els.agentControls.hidden = knowledge;
        els.welcomeTitle.innerHTML = knowledge ? '把资料交给知识库，<br>把问题留在这里。' : '从一个问题出发，<br>让任务有序完成。';
        els.welcomeEyebrow.textContent = knowledge ? 'YOUR KNOWLEDGE, CONNECTED.' : 'FROM INTENT TO ACTION.';
        els.welcomeDescription.textContent = knowledge ? '从项目文档到学习笔记，找到答案，也找到依据。' : '选择一个智能体，追踪分析、执行与监督的每一步。';
        els.welcomeUpload.hidden = !knowledge; els.welcomeCard.querySelector('.document-art').hidden = !knowledge;
        els.welcomeCard.querySelector('.welcome-bottom').innerHTML = (knowledge ? ['上传资料','提出问题','核验来源'] : ['选择智能体','描述任务','查看执行结果']).map((text,i) => `${i ? '<i></i>' : ''}<span><b>0${i+1}</b> ${text}</span>`).join('');
        els.messageInput.placeholder = knowledge ? '向当前知识库提问，尽量写明主题和背景…' : '描述你希望智能体完成的任务…';
        els.composerHint.textContent = knowledge ? 'Enter 发送 · Shift + Enter 换行 · 每次提问请提供完整背景' : 'Enter 发送 · Shift + Enter 换行 · 展开执行轨迹查看详细过程';
        const prompts = knowledge ? [['概括核心内容','请根据知识库资料，概括其中的核心内容，并注明引用来源。'],['梳理关键流程','请根据知识库资料，梳理主要业务流程及各步骤的作用。'],['查找实现依据','请根据知识库资料，说明其中的技术方案和实现依据。']] : [['查询限流用户','通过 ES 查询被限流的用户，给出被限流用户列表。'],['制定学习计划','检索小傅哥的相关项目，列出一份学习计划。'],['分析系统日志','分析当前系统日志并总结异常原因。']];
        els.suggestions.innerHTML = prompts.map(([label,prompt]) => `<button type="button" data-prompt="${escapeAttribute(prompt)}">${label} ↗</button>`).join('');
        els.suggestions.hidden = Boolean(getActiveSession()?.messages.length);
        updateKnowledgeAvailability();
    }
    function renderHistory() {
        els.historyCount.textContent = String(sessions.length);
        if (!sessions.length) { els.historyList.innerHTML = '<div class="history-empty">还没有会话。<br>你的问题与答案会保存在这里。</div>'; return; }
        els.historyList.innerHTML = sessions.map(session => `<button class="history-item ${session.id === activeSessionId ? 'active' : ''}" type="button" data-session-id="${escapeAttribute(session.id)}"><span class="history-title">${escapeHtml(session.title)}</span><time class="history-time">${formatRelativeTime(session.updatedAt)}</time><span class="history-preview"><span class="history-kind">${session.config.mode === 'agent' ? '智能体' : '知识库'}</span>${escapeHtml(session.config.mode === 'agent' ? `Agent ${session.config.agentId}` : (knowledgeBases.find(base => base.knowledgeBaseId === session.config.knowledgeBaseId)?.name || session.config.knowledgeBaseName || session.config.knowledgeBaseId))}</span></button>`).join('');
        els.historyList.querySelectorAll('[data-session-id]').forEach(button => button.onclick = () => selectSession(button.dataset.sessionId));
    }
    function renderConversation() {
        const session = getActiveSession(); els.welcomeCard.hidden = Boolean(session?.messages.length); els.messages.replaceChildren();
        session?.messages.forEach(message => { if (message.role === 'user') renderUserMessage(message); else renderAssistantMessage(message); });
    }
    function updateHeader() {
        const session = getActiveSession();
        els.conversationTitle.textContent = view === 'library' ? '知识库' : session?.title || (mode === 'knowledge' ? '知识库问答' : '智能体任务');
        els.viewEyebrow.textContent = view === 'library' ? 'WORKSPACE / LIBRARY' : mode === 'knowledge' ? 'WORKSPACE / KNOWLEDGE' : 'WORKSPACE / AGENT';
        els.sessionLabel.textContent = mode === 'knowledge' ? `KNOWLEDGE · ${baseName(selectedBaseId)}` : `AUTO AGENT · ${els.agentSelect.value}`;
        if (!activeRequest) {
            const lastReply = session?.messages.filter(message => message.role === 'assistant').at(-1);
            const failed = view === 'chat' && lastReply?.status === 'error';
            setConnectionState(failed ? 'error' : 'ready', failed ? '请求失败' : '就绪');
        }
    }
    function updateAssistantElement(article, message) {
        const knowledge = message.mode === 'knowledge'; const traceWindow = article.querySelector('.trace-window');
        article.querySelector('.message-meta strong').textContent = knowledge ? '知识库助手' : `Auto Agent · ${message.agentId || '4'}`;
        article.querySelector('.assistant-avatar').textContent = knowledge ? 'K' : 'A'; traceWindow.hidden = knowledge;
        traceWindow.classList.toggle('is-streaming', message.status === 'streaming'); traceWindow.classList.toggle('is-collapsed', Boolean(message.traceCollapsed));
        traceWindow.dataset.expanded = String(Boolean(message.traceExpanded));
        article.querySelector('.trace-toggle').setAttribute('aria-expanded', String(!message.traceCollapsed));
        article.querySelector('.trace-count').textContent = `${message.traces.length} 条记录`;
        article.querySelector('.trace-empty').hidden = message.traces.length > 0 || message.status !== 'streaming';
        const track = article.querySelector('.trace-track'); track.hidden = !message.traces.length; track.innerHTML = message.traces.map(traceCardHtml).join('');
        article.querySelector('.answer-card').classList.toggle('is-error', message.status === 'error');
        article.querySelector('.answer-kicker span').textContent = message.status === 'error' ? '请求未完成' : knowledge ? '基于知识库资料回答' : '任务执行结果';
        const body = article.querySelector('.answer-body');
        if (message.final) body.innerHTML = renderMarkdown(message.final);
        else if (message.status === 'streaming') body.innerHTML = `<div class="typing-state"><span></span><span></span><span></span>${knowledge ? '正在检索资料并生成回答…' : '正在执行任务，稍后呈现结果…'}</div>`;
        else body.textContent = '本次请求没有返回答案，请重新提问。';
        article.querySelector('.reference-list')?.remove(); if (knowledge && message.status === 'complete') renderReferences(article, message);
    }
    function renderReferences(article, message) {
        const references = Array.isArray(message.references) ? message.references : [];
        const section = document.createElement('section'); section.className = 'reference-list';
        if (!references.length) section.innerHTML = '<p class="empty-reference">本次未返回引用片段，可补充相关资料或调整问题。</p>';
        else {
            section.innerHTML = `<div class="reference-heading">参考来源 · ${references.length} 个片段</div><div class="reference-grid"></div>`;
            references.forEach(reference => {
                const button = document.createElement('button'); button.type = 'button'; button.className = 'reference-button';
                button.innerHTML = `<span>[${escapeHtml(reference.number)}] ${escapeHtml(reference.fileName)}</span><small>查看引用片段 ↗</small>`;
                button.onclick = () => openReference(reference, message.apiBase, message.knowledgeBaseId || getActiveSession()?.config.knowledgeBaseId); section.querySelector('.reference-grid').appendChild(button);
            });
            const body = article.querySelector('.answer-body'); const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
            const nodes = []; while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('a,code,pre,button')) nodes.push(walker.currentNode);
            nodes.forEach(node => {
                const regex = /\[(\d+)\]/g; let match; let start = 0; const fragment = document.createDocumentFragment(); let changed = false;
                while ((match = regex.exec(node.textContent))) {
                    const reference = references.find(item => String(item.number) === match[1]); if (!reference) continue;
                    fragment.append(node.textContent.slice(start, match.index));
                    const button = document.createElement('button'); button.className = 'citation'; button.type = 'button'; button.textContent = match[0];
                    button.setAttribute('aria-label', `查看引用 ${match[1]}：${reference.fileName}`);
                    button.onclick = () => openReference(reference, message.apiBase, message.knowledgeBaseId || getActiveSession()?.config.knowledgeBaseId); fragment.append(button); start = regex.lastIndex; changed = true;
                }
                if (changed) { fragment.append(node.textContent.slice(start)); node.replaceWith(fragment); }
            });
        }
        article.querySelector('.answer-card').appendChild(section);
    }
    async function sendMessage() {
        const content = els.messageInput.value.trim(); if (!content) { showToast('请先输入问题或任务'); return; }
        if (!guardRequest() || !validateApi() || (mode === 'knowledge' && !validateBase(els.knowledgeBaseInput.value.trim()))) return;
        let session = getActiveSession(); if (!session) session = addSession();
        const config = { ...currentConfig() }; session.config = config; const now = Date.now();
        const message = { id: makeId('assistant'), role: 'assistant', mode, knowledgeBaseId: config.knowledgeBaseId, agentId: config.agentId, apiBase: config.apiBase, final: '', references: [], traces: [], status: 'streaming', traceCollapsed: false, traceExpanded: false, createdAt: now+1 };
        session.messages.push({ id: makeId('user'), role: 'user', content, createdAt: now }, message);
        if (session.messages.length === 2) session.title = makeTitle(content);
        session.updatedAt = now; moveSessionToTop(session.id); persistSessions(); els.messageInput.value = ''; autoResizeInput();
        const controller = new AbortController(); activeRequest = { controller, sessionId: session.id, messageId: message.id };
        setWorking(true); renderAll(); scrollConversation(true);
        try {
            if (config.mode === 'knowledge') {
                const data = await requestJson(api('knowledge/questions', config), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ knowledgeBaseId:config.knowledgeBaseId, question:content, topK:config.topK }), signal:controller.signal });
                if (typeof data?.answer !== 'string' || !data.answer.trim() || !Array.isArray(data.references)) throw new Error('知识库接口未返回有效的答案与引用');
                message.final = data.answer; message.references = data.references; message.status = 'complete';
            } else {
                const response = await fetch(api('agent/auto_agent',config), { method:'POST', headers:{'Content-Type':'application/json','Accept':'text/event-stream'}, body:JSON.stringify({ aiAgentId:config.agentId, message:content, sessionId:session.id, maxStep:config.maxStep }), signal:controller.signal });
                if (!response.ok) throw new Error(`智能体服务返回 ${response.status}`);
                if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('智能体接口未返回 SSE 执行流，请检查服务地址');
                await consumeEventStream(response.body, event => receiveAgentEvent(session.id,message.id,event));
                if (message.status !== 'error') { if (!message.final) throw new Error('执行流已结束，但未收到最终回答。请查看执行轨迹后重试。'); message.status = 'complete'; }
            }
        } catch (error) { message.status = 'error'; message.final = `请求失败：${friendlyError(error)}`; }
        finally {
            session.updatedAt = Date.now(); activeRequest = null; persistSessions(); setWorking(false);
            setConnectionState(message.status === 'error' ? 'error' : 'ready', message.status === 'error' ? '请求失败' : '就绪'); renderAll(); scrollConversation(true);
        }
    }
    function setWorking(working) {
        els.sendButton.disabled = working; els.sendButton.querySelector('span').textContent = working ? '处理中' : '发送';
        [els.agentSelect,els.knowledgeBaseInput,els.maxStepSelect,els.topKSelect,els.apiUrlInput,...document.querySelectorAll('[data-mode]')].forEach(element => { element.disabled = working; });
        if (working) setConnectionState('working', mode === 'knowledge' ? '检索与回答中' : '任务执行中');
        updateKnowledgeAvailability();
    }
    function friendlyError(error) {
        if (error instanceof TypeError) return '无法连接服务。请检查后端是否启动及服务地址；跨域访问请使用 v3 本地启动脚本。';
        return error.message || '服务暂时不可用，请稍后重试';
    }
    async function requestJson(url, options = {}) {
        const response = await fetch(url, { ...options, headers:{Accept:'application/json',...options.headers} });
        let result; try { result = await response.json(); } catch { throw new Error(`服务返回非 JSON 响应（${response.status}），请检查接口地址`); }
        if (!response.ok || result.code !== '0000') {
            const error = new Error(result.info || (response.status === 404 ? '知识库接口不可用，请确认后端已启用 knowledge 配置' : `服务返回 ${response.status}`)); error.documentId = result.data?.documentId; throw error;
        } return result.data;
    }
    function loadSessions() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (!Array.isArray(value)) return [];
            return value.filter(item => item && typeof item.id === 'string' && item.config && Array.isArray(item.messages) && Number.isFinite(item.updatedAt)).slice(0,MAX_LOCAL_SESSIONS).map(session => ({ ...session, messages:session.messages.filter(message => message && ['user','assistant'].includes(message.role)).map(message => ({ ...message, traces:Array.isArray(message.traces) ? message.traces : [], ...(message.status === 'streaming' ? {status:'error',final:'页面已重新打开，上次请求的结果未完整保存。请检查后重试。'} : {}) })) }));
        } catch { return []; }
    }
    function persistSessions() {
        try { sessions = sessions.slice(0,MAX_LOCAL_SESSIONS); localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch { showToast('本地历史无法保存，请检查浏览器存储空间'); }
    }
    function clearHistory() {
        if (!guardRequest() || !sessions.length || !window.confirm('清空 v3 的本地会话记录？知识库资料和 v2 记录会保留。')) return;
        sessions = []; activeSessionId = null; persistSessions(); createNewSession();
    }
    function renderMarkdown(value) {
        const source = String(value || '');
        if (!window.marked || !window.DOMPurify) return escapeHtml(source).replace(/\n/g,'<br>');
        return DOMPurify.sanitize(marked.parse(source), { FORBID_TAGS:['img','iframe','form','input','style'], FORBID_ATTR:['style'] });
    }
    function changeLibraryBase() {
        const base = els.libraryBaseInput.value; if (!validateBase(base, false)) return;
        libraryBase = base; updateKnowledgeAvailability(); loadDocuments(1);
    }
    async function loadDocuments(page = 1, quiet = false) {
        clearTimeout(libraryTimer); const generation = ++libraryGeneration;
        const base = libraryBase; const config = { ...currentConfig(), knowledgeBaseId: base }; libraryPage = page;
        if (!basesLoaded || !knowledgeBases.some(item => item.knowledgeBaseId === base)) {
            els.librarySummary.textContent = '请先创建或选择知识库';
            els.documentList.innerHTML = '<div class="empty-state"><strong>选择知识库后查看资料</strong><p>每个知识库独立管理自己的文件和问答。</p></div>';
            els.previousPage.disabled = true; els.nextPage.disabled = true; els.pageLabel.textContent = '尚未选择'; return;
        }
        els.previousPage.disabled = true; els.nextPage.disabled = true;
        if (!quiet) { els.documentList.innerHTML = '<div class="empty-state"><strong>正在加载资料…</strong><p>读取当前知识库的文档与处理状态。</p></div>'; els.librarySummary.textContent = `知识库 ${baseName(base)}`; }
        try {
            const data = await requestJson(api(`knowledge/documents?knowledgeBaseId=${encodeURIComponent(base)}&page=${page}&pageSize=10`,config));
            if (generation !== libraryGeneration || view !== 'library') return;
            if (!Array.isArray(data?.items) || typeof data.total !== 'number') throw new Error('文档列表响应格式不正确');
            const pages = Math.max(1,Math.ceil(data.total/10)); if (page > pages) { loadDocuments(pages); return; }
            els.librarySummary.textContent = `知识库 ${baseName(base)} · 共 ${data.total} 份资料`; els.pageLabel.textContent = `第 ${page} / ${pages} 页`;
            els.previousPage.disabled = page <= 1; els.nextPage.disabled = page >= pages; renderDocuments(data.items,config);
            if (data.items.some(document => !['READY','FAILED'].includes(document.status))) {
                libraryTimer = setTimeout(() => { if (view === 'library' && libraryBase === base) loadDocuments(page,true); },5000);
            }
        } catch(error) {
            if (generation !== libraryGeneration || view !== 'library') return;
            els.librarySummary.textContent = `知识库 ${baseName(base)} · 加载失败`; els.pageLabel.textContent = '尚未加载';
            els.documentList.innerHTML = `<div class="empty-state"><strong>暂时无法读取资料</strong><p>${escapeHtml(friendlyError(error))}</p><button class="small-button" type="button">重新加载</button></div>`;
            els.documentList.querySelector('button').onclick = () => loadDocuments(page);
        }
    }
    const statusNames = { UPLOADING:'正在上传',UPLOADED:'等待处理',INDEXING:'正在建立索引',READY:'可用于问答',FAILED:'处理失败' };
    function documentContentUrl(id,config) { return api(`knowledge/documents/${encodeURIComponent(id)}/content?knowledgeBaseId=${encodeURIComponent(config.knowledgeBaseId || '')}`,config); }
    function renderDocuments(documents,config) {
        if (!documents.length) {
            els.documentList.innerHTML = '<div class="empty-state"><strong>这里还没有资料</strong><p>上传项目文档、学习笔记或产品手册，<br>开始建立你的知识库。</p><button class="primary-button" type="button">＋ 上传第一份资料</button></div>';
            els.documentList.querySelector('button').onclick = () => openUpload(libraryBase); return;
        }
        els.documentList.replaceChildren();
        documents.forEach(documentInfo => {
            const row = document.createElement('article'); row.className = 'document-row'; const status = documentInfo.status;
            row.innerHTML = `<span class="file-icon">${escapeHtml((documentInfo.fileName.split('.').pop() || 'DOC').toUpperCase().slice(0,5))}</span><div><h4 class="document-name">${escapeHtml(documentInfo.fileName)}</h4><div class="document-meta"><span class="status-badge ${status === 'FAILED' ? 'failed' : status === 'READY' ? '' : 'processing'}">${escapeHtml(statusNames[status] || status)}</span><span>${formatBytes(documentInfo.fileSize)}</span><span>${Number(documentInfo.chunkCount)||0} 个片段</span><span>${escapeHtml((documentInfo.createTime || '').replace('T',' ').slice(0,16))}</span></div>${documentInfo.errorMessage ? `<p class="document-error">${escapeHtml(documentInfo.errorMessage)}</p>` : ''}</div><div class="document-actions"><button class="small-button" type="button">查看片段</button></div>`;
            row.querySelector('button').onclick = () => openDocument(documentInfo,config);
            if (documentInfo.contentUrl) row.querySelector('.document-actions').appendChild(fileLink(documentInfo.documentId,config));
            els.documentList.appendChild(row);
        });
    }
    function formatBytes(bytes) { const size = Number(bytes)||0; return size >= 1024*1024 ? `${(size/1024/1024).toFixed(1)} MiB` : `${Math.max(.1,size/1024).toFixed(1)} KiB`; }
    function fileLink(documentId,config) {
        const link = document.createElement('a'); link.className = 'small-button'; link.textContent = '查看原文件 ↗';
        link.href = documentContentUrl(documentId,config); link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
    }
    function openReference(reference,apiBase,knowledgeBaseId) {
        sourceGeneration++; els.sourceTitle.textContent = reference.fileName || '引用来源'; els.sourceBody.replaceChildren();
        const info = document.createElement('p'); info.className = 'source-info'; info.textContent = `引用 [${reference.number}] · 片段序号 ${reference.chunkIndex}`;
        const content = document.createElement('div'); content.className = 'source-text'; content.textContent = reference.content || '未返回片段正文';
        els.sourceBody.append(info,content,fileLink(reference.documentId,{apiBase,knowledgeBaseId}));
        const note = document.createElement('p'); note.className = 'source-info'; note.textContent = '这里展示本次回答引用的资料片段；原文件会在新窗口打开或下载。'; els.sourceBody.append(note);
        if (!els.sourceDrawer.open) els.sourceDrawer.showModal();
    }
    async function openDocument(documentInfo,config,page = 1, append = false) {
        const generation = ++sourceGeneration; els.sourceTitle.textContent = documentInfo.fileName;
        if (!append) {
            els.sourceBody.innerHTML = `<p class="source-info">${escapeHtml(statusNames[documentInfo.status] || documentInfo.status)} · ${Number(documentInfo.chunkCount)||0} 个片段</p><div id="chunkList"></div>`;
            if (documentInfo.contentUrl) els.sourceBody.appendChild(fileLink(documentInfo.documentId,config));
        }
        if (!els.sourceDrawer.open) els.sourceDrawer.showModal();
        const chunkList = els.sourceBody.querySelector('#chunkList'); chunkList.querySelector('.chunk-more')?.remove();
        const loading = document.createElement('p'); loading.className = 'source-info'; loading.textContent = '正在读取文档片段…'; chunkList.appendChild(loading);
        try {
            const result = await requestJson(api(`knowledge/documents/${encodeURIComponent(documentInfo.documentId)}/chunks?knowledgeBaseId=${encodeURIComponent(config.knowledgeBaseId)}&page=${page}&pageSize=10`,config));
            if (generation !== sourceGeneration || !els.sourceDrawer.open) return;
            if (!Array.isArray(result?.items)) throw new Error('片段列表响应格式不正确'); loading.remove();
            if (!result.items.length && page === 1) { loading.textContent = '暂无可查看的片段，请等待文档处理完成。'; chunkList.appendChild(loading); }
            result.items.forEach(chunk => {
                const details = document.createElement('details'); details.className = 'chunk-card'; details.open = page === 1 && chunk === result.items[0];
                const summary = document.createElement('summary'); summary.textContent = `片段序号 ${chunk.chunkIndex} · ${chunk.charCount} 字符`;
                const content = document.createElement('div'); content.className = 'source-text'; content.textContent = chunk.content;
                details.append(summary,content); chunkList.appendChild(details);
            });
            if (page*10 < result.total) {
                const more = document.createElement('button'); more.type = 'button'; more.className = 'small-button chunk-more'; more.textContent = '加载更多片段';
                more.onclick = () => openDocument(documentInfo,config,page+1,true); chunkList.appendChild(more);
            }
        } catch (error) {
            if (generation !== sourceGeneration || !els.sourceDrawer.open) return; loading.textContent = friendlyError(error);
            const retry = document.createElement('button'); retry.type='button'; retry.className='small-button chunk-more'; retry.textContent='重新加载片段';
            retry.onclick=()=>{loading.remove();openDocument(documentInfo,config,page,append);}; chunkList.appendChild(retry);
        }
    }
    function openUpload(base) {
        if (uploading) { if (!els.uploadDialog.open) els.uploadDialog.showModal(); return; }
        if (!validateBase(base) || !validateApi()) return;
        uploadContext = { base, config:{...currentConfig(), knowledgeBaseId:base} }; selectedFile = null;
        els.fileInput.value = ''; els.fileTitle.textContent = '拖放文件到这里，或点击选择'; els.fileMeta.textContent = 'TXT / MD / PDF / DOCX · 最大 10 MiB';
        els.uploadBaseLabel.textContent = baseName(base); els.uploadAsk.hidden = true; els.uploadSubmit.disabled = false;
        els.uploadStatus.textContent = '资料处理完成后，即可用于知识库问答。'; els.uploadStatus.dataset.state = '';
        closeMobileSidebar(); els.uploadDialog.showModal();
    }
    function chooseFile(file) {
        selectedFile = null; els.uploadAsk.hidden = true; if (!file) return;
        let error = '';
        if (!/\.(txt|md|pdf|docx)$/i.test(file.name)) error = '请选择 TXT、MD、PDF 或 DOCX 文件。';
        else if (!file.size || file.size > 10*1024*1024) error = '文件不能为空，且不能超过 10 MiB。';
        els.fileTitle.textContent = file.name; els.fileMeta.textContent = formatBytes(file.size);
        if (error) { els.uploadStatus.textContent = error; els.uploadStatus.dataset.state = 'error'; els.uploadSubmit.disabled = true; return; }
        selectedFile = file; els.uploadSubmit.disabled = false; els.uploadStatus.textContent = '文件已选择，点击上传开始处理。'; els.uploadStatus.dataset.state = '';
    }
    async function uploadFile() {
        if (uploading) return;
        if (!selectedFile) { els.uploadStatus.textContent = '请先选择一个支持的文件。'; els.uploadStatus.dataset.state = 'error'; return; }
        const context = uploadContext; const file = selectedFile;
        const form = new FormData(); form.append('knowledgeBaseId',context.base); form.append('file',file);
        uploading = true; els.uploadSubmit.disabled = true; els.fileInput.disabled = true;
        els.uploadStatus.dataset.state = 'working'; els.uploadStatus.textContent = '正在上传并处理资料，请稍候。完成前请勿重复上传。';
        try {
            const result = await requestJson(api('knowledge/documents',context.config), {method:'POST',body:form});
            if (result?.status !== 'READY') throw new Error('文档尚未处理完成，请在知识库列表查看状态。');
            els.uploadStatus.dataset.state = 'success'; els.uploadStatus.textContent = `「${result.fileName}」已就绪，生成 ${result.chunkCount} 个片段，可以开始提问。`;
            els.uploadAsk.hidden = false; selectedFile = null; showToast('资料已就绪，可以开始提问');
        } catch (error) {
            els.uploadStatus.dataset.state = 'error'; els.uploadStatus.textContent = `${friendlyError(error)}${error.documentId ? `（文档 ${error.documentId}）` : ''} 请先刷新知识库列表确认状态，再决定是否重新上传。`;
            showToast('资料未确认就绪，请查看上传窗口与文档列表');
        } finally {
            uploading = false; els.fileInput.disabled = false; els.uploadSubmit.disabled = !selectedFile;
            if (view === 'library' && libraryBase === context.base) loadDocuments(libraryPage);
        }
    }

    function baseName(id) {
        return knowledgeBases.find(base => base.knowledgeBaseId === id)?.name || (id ? '知识库不可用' : '请选择知识库');
    }

    function renderBaseSelectors() {
        function fill(select, items, selected, placeholder) {
            select.replaceChildren();
            const empty = document.createElement('option'); empty.value = ''; empty.textContent = placeholder; empty.disabled = true; select.append(empty);
            items.forEach(base => {
                const option = document.createElement('option'); option.value = base.knowledgeBaseId;
                option.textContent = base.name + (base.status === 'ACTIVE' ? '' : '（已停用）');
                option.title = base.knowledgeBaseId;
                if (select === els.knowledgeBaseInput && base.status !== 'ACTIVE') option.disabled = true;
                select.append(option);
            });
            if (selected && !items.some(base => base.knowledgeBaseId === selected)) {
                const missing = document.createElement('option'); missing.value = selected;
                missing.textContent = basesLoaded ? '原知识库不可用，请重新选择' : '等待加载原知识库'; missing.disabled = true; select.append(missing);
            }
            select.value = selected || '';
        }
        const chatBases = knowledgeBases.filter(base => base.status === 'ACTIVE' || base.knowledgeBaseId === selectedBaseId);
        fill(els.knowledgeBaseInput, chatBases, selectedBaseId, basesLoading ? '正在加载…' : '请选择知识库');
        fill(els.libraryBaseInput, knowledgeBases, libraryBase, '请选择知识库');
        updateKnowledgeAvailability();
    }

    function updateKnowledgeAvailability() {
        const selected = knowledgeBases.find(base => base.knowledgeBaseId === selectedBaseId);
        const usable = basesLoaded && !basesLoading && selected?.status === 'ACTIVE';
        els.knowledgeBaseInput.disabled = Boolean(activeRequest) || basesLoading || !basesLoaded;
        els.sendButton.disabled = Boolean(activeRequest) || (mode === 'knowledge' && !usable);
        ['quickUpload','welcomeUpload'].forEach(id => { els[id].disabled = !usable && !uploading; });
        const managed = knowledgeBases.find(base => base.knowledgeBaseId === libraryBase);
        const managedUsable = basesLoaded && !basesLoading && managed?.status === 'ACTIVE';
        els.sidebarUpload.disabled = !(view === 'library' ? managedUsable : usable) && !uploading;
        els.libraryUpload.disabled = !managedUsable && !uploading;
        els.askLibrary.disabled = !managedUsable || Boolean(activeRequest);
        els.libraryBaseInput.disabled = basesLoading || !basesLoaded;
        els.refreshBases.disabled = basesLoading;
        let message = '';
        if (basesLoading) message = '正在读取知识库列表…';
        else if (basesError) message = basesError;
        else if (!knowledgeBases.some(base => base.status === 'ACTIVE')) message = '还没有可用知识库，先新建一个，或在知识库管理中启用已有知识库。';
        else if (!usable) message = '当前会话的知识库不可用，请选择其他知识库开启新会话。';
        els.baseNotice.hidden = mode !== 'knowledge' || view !== 'chat' || !message;
        els.baseNotice.replaceChildren();
        if (message) {
            els.baseNotice.append(message);
            if (basesError) {
                const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'text-button'; retry.textContent = '重新加载';
                retry.onclick = () => refreshKnowledgeBases(); els.baseNotice.append(retry);
            }
        }
    }

    async function refreshKnowledgeBases(preferredId = selectedBaseId) {
        if (!validateApi()) return false;
        const generation = ++basesGeneration;
        const config = {...currentConfig()};
        basesLoading = true; basesError = ''; updateKnowledgeAvailability();
        try {
            const rows = []; let page = 1; let total;
            do {
                const result = await requestJson(api(`knowledge/bases?page=${page}&pageSize=100`,config));
                if (!Array.isArray(result?.items) || !Number.isSafeInteger(result.total) || result.total < 0) throw new Error('知识库列表格式不正确');
                total = result.total; rows.push(...result.items); page++;
                if (!result.items.length) break;
            } while (rows.length < total);
            if (generation !== basesGeneration) return false;
            knowledgeBases = [...new Map(rows.map(base => [base.knowledgeBaseId,base])).values()];
            basesLoaded = true; basesLoading = false;
            // 恢复历史时绝不悄悄改绑到其他库；只有没有会话的新界面可选第一个可用库。
            selectedBaseId = preferredId || '';
            if (!getActiveSession() && !knowledgeBases.some(base => base.knowledgeBaseId === selectedBaseId && base.status === 'ACTIVE')) {
                selectedBaseId = knowledgeBases.find(base => base.status === 'ACTIVE')?.knowledgeBaseId || '';
            }
            if (!knowledgeBases.some(base => base.knowledgeBaseId === libraryBase)) libraryBase = selectedBaseId || knowledgeBases[0]?.knowledgeBaseId || '';
            renderBaseSelectors(); renderBaseCards(); renderHistory(); updateHeader(); storeSettings();
            if (view === 'library') loadDocuments(1);
            return true;
        } catch (error) {
            if (generation !== basesGeneration) return false;
            basesLoading = false; basesLoaded = false;
            basesError = '知识库列表加载失败：' + friendlyError(error);
            updateKnowledgeAvailability();
            els.baseCards.innerHTML = `<p class="subtle">${escapeHtml(basesError)}</p>`;
            if (view === 'library') loadDocuments(1);
            return false;
        }
    }

    function renderBaseCards() {
        els.baseCards.replaceChildren();
        if (!knowledgeBases.length) { els.baseCards.innerHTML = '<p class="subtle">还没有知识库。点击“新建知识库”，添加名称和说明后即可上传资料。</p>'; return; }
        knowledgeBases.forEach(base => {
            const card = document.createElement('article'); card.className = 'base-card';
            card.innerHTML = `<div class="base-card-title"><h5>${escapeHtml(base.name)}</h5><span class="status-badge ${base.status === 'ACTIVE' ? '' : 'processing'}">${base.status === 'ACTIVE' ? '已启用' : '已停用'}</span></div><p>${escapeHtml(base.description || '暂无说明')}</p><div class="base-card-actions"><button class="small-button" type="button" data-action="documents">查看资料</button><button class="small-button" type="button" data-action="edit">编辑</button><button class="small-button" type="button" data-action="status">${base.status === 'ACTIVE' ? '停用' : '启用'}</button></div>`;
            card.querySelector('[data-action="documents"]').onclick = () => { libraryBase = base.knowledgeBaseId; renderBaseSelectors(); loadDocuments(1); };
            card.querySelector('[data-action="edit"]').onclick = () => openBaseDialog(base);
            card.querySelector('[data-action="status"]').onclick = event => toggleKnowledgeBase(base,event.currentTarget);
            els.baseCards.append(card);
        });
    }

    function openBaseDialog(base = null) {
        if (!guardRequest() || savingBase) return;
        editingBaseId = base?.knowledgeBaseId || null;
        els.baseDialogTitle.textContent = base ? '编辑知识库' : '新建知识库';
        els.baseNameInput.value = base?.name || ''; els.baseDescriptionInput.value = base?.description || '';
        els.saveBaseButton.textContent = base ? '保存修改' : '创建知识库';
        els.baseFormStatus.textContent = ''; els.baseFormStatus.dataset.state = '';
        closeMobileSidebar(); els.baseDialog.showModal();
    }

    async function saveKnowledgeBase() {
        if (savingBase || !validateApi()) return;
        savingBase = true; els.saveBaseButton.disabled = true; els.closeBaseDialog.disabled = true;
        const id = editingBaseId;
        els.baseFormStatus.textContent = '正在保存…'; els.baseFormStatus.dataset.state = 'working';
        try {
            const result = await requestJson(api('knowledge/bases' + (id ? '/' + encodeURIComponent(id) : '')), {
                method:id ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({name:els.baseNameInput.value.trim(),description:els.baseDescriptionInput.value.trim()})
            });
            if (!result?.knowledgeBaseId) throw new Error('服务未返回有效的知识库');
            if (!id) { activeSessionId = null; selectedBaseId = result.knowledgeBaseId; libraryBase = result.knowledgeBaseId; }
            els.baseDialog.close();
            const loaded = await refreshKnowledgeBases(!id ? result.knowledgeBaseId : selectedBaseId);
            if (!id && loaded) startKnowledgeChat(result.knowledgeBaseId);
            showToast(id ? '知识库信息已更新' : '知识库已创建，可以上传资料');
        } catch (error) {
            els.baseFormStatus.textContent = friendlyError(error); els.baseFormStatus.dataset.state = 'error';
        } finally { savingBase = false; els.saveBaseButton.disabled = false; els.closeBaseDialog.disabled = false; }
    }

    async function toggleKnowledgeBase(base, button) {
        if (!guardRequest()) return;
        button.disabled = true;
        try {
            await requestJson(api(`knowledge/bases/${encodeURIComponent(base.knowledgeBaseId)}/status`), {
                method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:base.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'})
            });
            await refreshKnowledgeBases();
            showToast(base.status === 'ACTIVE' ? '知识库已停用，资料已保留' : '知识库已启用');
        } catch (error) { showToast(friendlyError(error)); button.disabled = false; }
    }
})();
