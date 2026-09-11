(() => {
    'use strict';

    const STORAGE_KEY = 'agent-station.chat-history.v2';
    const DEFAULT_API = 'http://localhost:8099/api/v1/agent/auto_agent';
    const MAX_LOCAL_SESSIONS = 30;

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

    const els = {};
    let sessions = loadSessions();
    let activeSessionId = sessions[0]?.id || null;
    let activeRequest = null;
    let toastTimer = null;

    window.addEventListener('DOMContentLoaded', init);

    function init() {
        Object.assign(els, {
            sidebar: document.getElementById('sidebar'),
            mobileBackdrop: document.getElementById('mobileBackdrop'),
            mobileMenuButton: document.getElementById('mobileMenuButton'),
            newChatButton: document.getElementById('newChatButton'),
            clearHistoryButton: document.getElementById('clearHistoryButton'),
            historyList: document.getElementById('historyList'),
            historyCount: document.getElementById('historyCount'),
            conversation: document.getElementById('conversation'),
            messages: document.getElementById('messages'),
            welcomeCard: document.getElementById('welcomeCard'),
            conversationTitle: document.getElementById('conversationTitle'),
            connectionStatus: document.getElementById('connectionStatus'),
            settingsButton: document.getElementById('settingsButton'),
            settingsPanel: document.getElementById('settingsPanel'),
            agentSelect: document.getElementById('agentSelect'),
            maxStepSelect: document.getElementById('maxStepSelect'),
            apiUrlInput: document.getElementById('apiUrlInput'),
            composer: document.getElementById('composer'),
            messageInput: document.getElementById('messageInput'),
            sendButton: document.getElementById('sendButton'),
            sessionLabel: document.getElementById('sessionLabel'),
            suggestions: document.getElementById('suggestions'),
            assistantTemplate: document.getElementById('assistantMessageTemplate')
        });

        configureMarkdown();
        restoreSettings();
        bindEvents();
        renderAll();
        els.messageInput.focus();
    }

    function configureMarkdown() {
        if (!window.marked) return;
        marked.setOptions({ breaks: true, gfm: true });
    }

    function bindEvents() {
        els.composer.addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
        els.messageInput.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                sendMessage();
            }
        });
        els.messageInput.addEventListener('input', autoResizeInput);
        els.newChatButton.addEventListener('click', createNewSession);
        els.clearHistoryButton.addEventListener('click', clearHistory);
        els.mobileMenuButton.addEventListener('click', () => document.body.classList.add('sidebar-open'));
        els.mobileBackdrop.addEventListener('click', closeMobileSidebar);
        els.settingsButton.addEventListener('click', toggleSettings);
        document.addEventListener('click', closeSettingsOnOutsideClick);
        els.suggestions.addEventListener('click', event => {
            const button = event.target.closest('[data-prompt]');
            if (!button) return;
            els.messageInput.value = button.dataset.prompt;
            autoResizeInput();
            els.messageInput.focus();
        });
        [els.agentSelect, els.maxStepSelect, els.apiUrlInput].forEach(control => control.addEventListener('change', saveSettings));
        window.addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                createNewSession();
            }
            if (event.key === 'Escape') {
                closeMobileSidebar();
                hideSettings();
            }
        });
    }

    function renderAll() {
        renderHistory();
        renderConversation();
        updateHeader();
    }

    function renderHistory() {
        els.historyCount.textContent = String(sessions.length);
        if (!sessions.length) {
            els.historyList.innerHTML = '<div class="history-empty">第一段对话会在这里留下索引。<br>刷新页面也不会消失。</div>';
            return;
        }
        els.historyList.innerHTML = sessions.map(session => {
            const lastUser = [...session.messages].reverse().find(item => item.role === 'user');
            return `<button class="history-item ${session.id === activeSessionId ? 'active' : ''}" type="button" data-session-id="${escapeAttribute(session.id)}">
                <span class="history-title">${escapeHtml(session.title || '新的智能会话')}</span>
                <time class="history-time">${formatRelativeTime(session.updatedAt)}</time>
                <span class="history-preview">${escapeHtml(lastUser?.content || '尚未发送消息')}</span>
            </button>`;
        }).join('');

        els.historyList.querySelectorAll('[data-session-id]').forEach(button => {
            button.addEventListener('click', () => selectSession(button.dataset.sessionId));
        });
    }

    function renderConversation() {
        const session = getActiveSession();
        els.welcomeCard.hidden = Boolean(session?.messages.length);
        els.messages.innerHTML = '';
        if (!session) return;

        session.messages.forEach(message => {
            if (message.role === 'user') renderUserMessage(message);
            if (message.role === 'assistant') renderAssistantMessage(message);
        });
        requestAnimationFrame(() => scrollConversation(false));
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

    function updateAssistantElement(article, message) {
        const traceWindow = article.querySelector('.trace-window');
        const track = article.querySelector('.trace-track');
        const empty = article.querySelector('.trace-empty');
        const count = article.querySelector('.trace-count');
        const answerCard = article.querySelector('.answer-card');
        const answerBody = article.querySelector('.answer-body');
        const answerKicker = article.querySelector('.answer-kicker span');

        traceWindow.classList.toggle('is-streaming', message.status === 'streaming');
        traceWindow.classList.toggle('is-collapsed', Boolean(message.traceCollapsed));
        traceWindow.dataset.expanded = String(Boolean(message.traceExpanded));
        article.querySelector('.trace-toggle').setAttribute('aria-expanded', String(!message.traceCollapsed));
        count.textContent = `${message.traces.length} 条记录`;
        empty.hidden = message.traces.length > 0;
        track.hidden = message.traces.length === 0;
        track.innerHTML = message.traces.map(traceCardHtml).join('');

        answerCard.classList.toggle('is-error', message.status === 'error');
        answerKicker.textContent = message.status === 'error' ? 'EXECUTION ERROR' : 'FINAL RESPONSE';
        if (message.final) {
            answerBody.innerHTML = renderMarkdown(message.final);
        } else if (message.status === 'error') {
            answerBody.textContent = '执行中断，请检查服务状态后重试。';
        } else {
            answerBody.innerHTML = '<div class="typing-state"><span></span><span></span><span></span> 正在整理最终回复</div>';
        }
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

    async function sendMessage() {
        const content = els.messageInput.value.trim();
        if (!content) { showToast('请先输入任务内容'); return; }
        if (activeRequest) { showToast('当前任务仍在执行，请稍候'); return; }

        let session = getActiveSession();
        if (!session) session = addSession();

        const now = Date.now();
        const userMessage = { id: makeId('user'), role: 'user', content, createdAt: now };
        const assistantMessage = { id: makeId('assistant'), role: 'assistant', final: '', traces: [], status: 'streaming', traceCollapsed: false, traceExpanded: false, createdAt: now + 1 };
        session.messages.push(userMessage, assistantMessage);
        session.title = session.messages.filter(item => item.role === 'user').length === 1 ? makeTitle(content) : session.title;
        session.updatedAt = now;
        session.config = currentConfig();
        moveSessionToTop(session.id);
        persistSessions();

        els.messageInput.value = '';
        autoResizeInput();
        setWorking(true);
        renderAll();
        scrollConversation(true);

        const controller = new AbortController();
        activeRequest = { controller, sessionId: session.id, messageId: assistantMessage.id };

        try {
            const response = await fetch(session.config.apiUrl || DEFAULT_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
                body: JSON.stringify({ aiAgentId: session.config.agentId, message: content, sessionId: session.id, maxStep: Number(session.config.maxStep) }),
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`服务返回 ${response.status}`);
            if (!response.body) throw new Error('浏览器未获得流式响应');
            await consumeEventStream(response.body, data => receiveAgentEvent(session.id, assistantMessage.id, data));

            const currentMessage = findMessage(session.id, assistantMessage.id);
            if (currentMessage && currentMessage.status === 'streaming') currentMessage.status = 'complete';
        } catch (error) {
            if (error.name !== 'AbortError') {
                const currentMessage = findMessage(session.id, assistantMessage.id);
                if (currentMessage) {
                    currentMessage.status = 'error';
                    currentMessage.final = currentMessage.final || `请求失败：${error.message}`;
                }
                setConnectionState('error', '连接失败');
            }
        } finally {
            session.updatedAt = Date.now();
            persistSessions();
            activeRequest = null;
            setWorking(false);
            renderAll();
        }
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

    function createNewSession() {
        if (activeRequest) { showToast('任务执行中，暂不能切换会话'); return; }
        activeSessionId = null;
        closeMobileSidebar();
        hideSettings();
        renderAll();
        els.messageInput.value = '';
        autoResizeInput();
        els.messageInput.focus();
    }

    function addSession() {
        const now = Date.now();
        const session = { id: makeId('session'), title: '新的智能会话', createdAt: now, updatedAt: now, config: currentConfig(), messages: [] };
        sessions.unshift(session);
        activeSessionId = session.id;
        persistSessions();
        return session;
    }

    function selectSession(id) {
        if (activeRequest && id !== activeSessionId) { showToast('任务执行中，暂不能切换会话'); return; }
        activeSessionId = id;
        const session = getActiveSession();
        if (session?.config) applyConfig(session.config);
        closeMobileSidebar();
        renderAll();
    }

    function clearHistory() {
        if (activeRequest) { showToast('任务执行中，暂不能清空记录'); return; }
        if (!sessions.length || !window.confirm('确定清空当前浏览器中的全部会话记录吗？')) return;
        sessions = [];
        activeSessionId = null;
        localStorage.removeItem(STORAGE_KEY);
        renderAll();
    }

    function moveSessionToTop(id) {
        const index = sessions.findIndex(item => item.id === id);
        if (index > 0) sessions.unshift(sessions.splice(index, 1)[0]);
    }

    function updateHeader() {
        const session = getActiveSession();
        els.conversationTitle.textContent = session?.title || '新的智能会话';
        els.sessionLabel.textContent = session ? `SESSION · ${session.id.slice(-8).toUpperCase()}` : 'SESSION · NEW';
    }

    function setWorking(working) {
        els.sendButton.disabled = working;
        els.sendButton.querySelector('span').textContent = working ? '执行中' : '发送';
        if (working) setConnectionState('working', '执行中');
        else if (els.connectionStatus.dataset.state !== 'error') setConnectionState('ready', '就绪');
    }

    function setConnectionState(state, label) {
        els.connectionStatus.dataset.state = state;
        els.connectionStatus.querySelector('span').textContent = label;
    }

    function currentConfig() {
        return { agentId: els.agentSelect.value, maxStep: Number(els.maxStepSelect.value), apiUrl: els.apiUrlInput.value.trim() || DEFAULT_API };
    }

    function saveSettings() {
        const config = currentConfig();
        localStorage.setItem(`${STORAGE_KEY}.settings`, JSON.stringify(config));
        const session = getActiveSession();
        if (session && !activeRequest) { session.config = config; persistSessions(); }
    }

    function restoreSettings() {
        try { applyConfig(JSON.parse(localStorage.getItem(`${STORAGE_KEY}.settings`)) || {}); } catch (_) { applyConfig({}); }
        const session = getActiveSession();
        if (session?.config) applyConfig(session.config);
    }

    function applyConfig(config) {
        els.agentSelect.value = String(config.agentId || '4');
        els.maxStepSelect.value = String(config.maxStep || 5);
        els.apiUrlInput.value = config.apiUrl || DEFAULT_API;
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

    function renderMarkdown(value) {
        const source = String(value || '');
        const html = window.marked ? marked.parse(source) : escapeHtml(source).replace(/\n/g, '<br>');
        return window.DOMPurify ? DOMPurify.sanitize(html) : html;
    }

    function highlightCode(root) {
        if (!window.hljs) return;
        root.querySelectorAll('pre code:not([data-highlighted])').forEach(block => hljs.highlightElement(block));
    }

    function loadSessions() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!Array.isArray(value)) return [];
            return value.filter(item => item && item.id && Array.isArray(item.messages));
        } catch (_) { return []; }
    }

    function persistSessions() {
        try {
            sessions = sessions.slice(0, MAX_LOCAL_SESSIONS);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
        } catch (_) { showToast('本地历史空间已满，请清理较早会话'); }
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
})();
