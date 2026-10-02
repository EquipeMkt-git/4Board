/* 4Board — front-end (GitHub Pages)
 * Fluxo: telas em <section> mostradas/escondidas (SPA), rota por hash
 *   #/          -> lista de quadros
 *   #/b/<id>    -> quadro aberto (F5 mantém o quadro)
 */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const COLORS = ['yellow', 'pink', 'green', 'blue', 'orange', 'lilac'];
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const state = {
    token: localStorage.getItem('4b_token'),
    user: safeParse(localStorage.getItem('4b_user')),
    projects: [],
    board: null
  };

  function safeParse(v) { try { return JSON.parse(v); } catch { return null; } }

  // =========================================================
  // API (fala com o Apps Script)
  // =========================================================
  // text/plain evita o preflight de CORS que o Apps Script não suporta
  async function api(action, payload = {}) {
    let res;
    try {
      res = await fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token: state.token, ...payload })
      });
    } catch {
      throw new Error('Sem conexão com o servidor.');
    }
    const data = await res.json().catch(() => ({
      ok: false, error: 'Resposta inválida do servidor. Confira a API_URL no config.js.'
    }));
    if (!data.ok) {
      if (data.error === 'SESSAO_INVALIDA') {
        clearSession();
        route();
        throw new Error('Sua sessão expirou. Entre de novo.');
      }
      throw new Error(data.error || 'Erro desconhecido.');
    }
    return data;
  }

  function saveSession(token, user) {
    state.token = token; state.user = user;
    localStorage.setItem('4b_token', token);
    localStorage.setItem('4b_user', JSON.stringify(user));
  }
  function clearSession() {
    state.token = null; state.user = null;
    localStorage.removeItem('4b_token');
    localStorage.removeItem('4b_user');
  }

  // =========================================================
  // NAVEGAÇÃO
  // =========================================================
  function show(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== id));
  }

  function route() {
    if (!state.token) { closeBoard(); show('view-auth'); return; }
    const m = location.hash.match(/^#\/b\/([\w-]+)/);
    if (m) openBoard(m[1]);
    else { closeBoard(); showProjects(); }
  }
  window.addEventListener('hashchange', route);

  let toastTimer;
  function toast(msg, ms = 3000) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  async function busy(btn, fn) {
    btn.disabled = true;
    try { return await fn(); } finally { btn.disabled = false; }
  }

  // =========================================================
  // TELA 1: LOGIN / CADASTRO
  // =========================================================
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      $('#form-login').classList.toggle('hidden', tab.dataset.tab !== 'login');
      $('#form-register').classList.toggle('hidden', tab.dataset.tab !== 'register');
      $('#auth-error').textContent = '';
    });
  });

  async function authSubmit(e, action) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    $('#auth-error').textContent = '';
    await busy(form.querySelector('button'), async () => {
      try {
        const r = await api(action, data);
        saveSession(r.token, r.user);
        form.reset();
        location.hash = '#/';
        route();
      } catch (err) {
        $('#auth-error').textContent = err.message;
      }
    });
  }
  $('#form-login').addEventListener('submit', (e) => authSubmit(e, 'login'));
  $('#form-register').addEventListener('submit', (e) => authSubmit(e, 'register'));

  $('#btn-logout').addEventListener('click', async () => {
    api('logout').catch(() => {});
    clearSession();
    location.hash = '';
    route();
  });

  // =========================================================
  // TELA 2: LISTA DE QUADROS
  // =========================================================
  async function showProjects() {
    show('view-projects');
    $('#me-name').textContent = state.user ? state.user.nome : '';
    try {
      const r = await api('listProjects');
      state.projects = r.projects;
      renderProjects();
    } catch (err) { toast(err.message); }
  }

  function renderProjects() {
    const list = $('#project-list');
    list.replaceChildren();
    $('#projects-empty').classList.toggle('hidden', state.projects.length > 0);
    state.projects.forEach((p) => {
      const li = el('li', 'project-item');
      li.tabIndex = 0;
      const sw = el('span', 'project-swatch c-' + colorFor(p.id));
      const name = el('span', 'project-name', p.nome);
      const pessoas = p.membros === 1 ? '1 pessoa' : p.membros + ' pessoas';
      const meta = el('span', 'project-meta', p.papel === 'dono' ? pessoas + ', criado por você' : pessoas);
      li.append(sw, name, meta);
      if (p.papel === 'dono') {
        const del = el('button', 'btn danger', 'Excluir');
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Excluir o quadro "${p.nome}" para todo mundo?`)) return;
          try {
            await api('deleteProject', { projectId: p.id });
            state.projects = state.projects.filter((x) => x.id !== p.id);
            renderProjects();
            toast('Quadro excluído');
          } catch (err) { toast(err.message); }
        });
        li.append(del);
      }
      const open = () => { location.hash = '#/b/' + p.id; };
      li.addEventListener('click', open);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      list.append(li);
    });
  }

  $('#form-new-project').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const nome = form.nome.value.trim();
    await busy(form.querySelector('button'), async () => {
      try {
        const r = await api('createProject', { nome });
        form.reset();
        location.hash = '#/b/' + r.project.id;
      } catch (err) { toast(err.message); }
    });
  });

  // =========================================================
  // TELA 3: O QUADRO
  // =========================================================
  const viewport = $('#viewport');
  const world = $('#world');

  function newBoardState(id) {
    return {
      id, papel: null, version: 0, alive: true,
      els: new Map(),        // id -> { d: dados, node: elemento DOM }
      ops: new Map(),        // mudanças locais aguardando envio (1 por nota)
      inflight: new Set(),   // ids sendo enviados agora
      localVer: new Map(),   // id -> versão da nossa última gravação aceita
      deferred: new Map(),   // mudanças remotas adiadas porque o usuário estava mexendo
      activeId: null, selectedId: null, maxZ: 1,
      pan: { x: 0, y: 0 }, zoom: 1,
      color: localStorage.getItem('4b_color') || 'yellow',
      pollTimer: null, flushTimer: null, flushing: false, polling: false,
      lastDeleted: []
    };
  }

  async function openBoard(id) {
    if (state.board && state.board.id === id) return;
    closeBoard();
    show('view-board');
    const b = state.board = newBoardState(id);
    world.replaceChildren();
    $('#board-title').textContent = 'Carregando…';
    $('#online-list').replaceChildren();
    renderSwatches();
    setSync('ok');

    let r;
    try {
      r = await api('getBoard', { projectId: id });
    } catch (err) {
      toast(err.message);
      location.hash = '#/';
      return;
    }
    if (state.board !== b) return;

    b.version = r.version;
    b.papel = r.project.papel;
    $('#board-title').textContent = r.project.nome;
    document.title = r.project.nome + ' · 4Board';
    r.elements.forEach(renderNote);
    renderOnline(r.online);
    centerOnContent();
    updateEmptyHint();
    schedulePoll();
  }

  function closeBoard() {
    const b = state.board;
    if (!b) return;
    sendPendingBeacon();
    b.alive = false;
    clearTimeout(b.pollTimer);
    clearTimeout(b.flushTimer);
    state.board = null;
    document.title = '4Board';
  }

  $('#btn-back').addEventListener('click', () => { location.hash = '#/'; });

  // ---------- desenho das notas ----------
  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function colorFor(id) { return COLORS[hash(id) % COLORS.length]; }
  function tiltFor(id) { return ((hash(id) % 25) - 12) / 10; } // -1.2° a +1.2°

  function renderNote(d) {
    const b = state.board;
    let rec = b.els.get(d.id);
    if (!rec) {
      const node = el('div', 'note');
      node.dataset.id = d.id;
      node.style.setProperty('--tilt', tiltFor(d.id) + 'deg');
      const text = el('div', 'text');
      const del = el('button', 'del', '×');
      del.title = 'Apagar nota';
      del.setAttribute('aria-label', 'Apagar nota');
      const grip = el('div', 'grip');
      node.append(text, del, grip);
      bindNote(node, text, del, grip);
      world.append(node);
      rec = { d, node, text };
      b.els.set(d.id, rec);
    }
    rec.d = { ...d };
    const n = rec.node;
    COLORS.forEach((c) => n.classList.toggle('c-' + c, c === d.cor));
    n.style.left = d.x + 'px';
    n.style.top = d.y + 'px';
    n.style.width = d.w + 'px';
    n.style.height = d.h + 'px';
    n.style.zIndex = d.z;
    if (!n.classList.contains('editing') && rec.text.textContent !== d.texto) {
      rec.text.textContent = d.texto;
    }
    b.maxZ = Math.max(b.maxZ, d.z);
  }

  function removeNote(id) {
    const b = state.board;
    const rec = b.els.get(id);
    if (!rec) return;
    rec.node.remove();
    b.els.delete(id);
    if (b.activeId === id) b.activeId = null;
    if (b.selectedId === id) b.selectedId = null;
    updateEmptyHint();
  }

  function updateEmptyHint() {
    const b = state.board;
    $('#board-empty').classList.toggle('hidden', !b || b.els.size > 0);
  }

  function select(id) {
    const b = state.board;
    if (b.selectedId && b.els.get(b.selectedId)) b.els.get(b.selectedId).node.classList.remove('selected');
    b.selectedId = id;
    if (id && b.els.get(id)) b.els.get(id).node.classList.add('selected');
    renderSwatches();
  }

  // ---------- criar / apagar ----------
  function newId() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const buf = crypto.getRandomValues(new Uint8Array(20));
    return 'e_' + Array.from(buf, (x) => chars[x % chars.length]).join('');
  }

  function createNote(x, y) {
    const b = state.board;
    const d = {
      id: newId(), texto: '', cor: b.color,
      x: Math.round(x - 100), y: Math.round(y - 90), w: 200, h: 180, z: ++b.maxZ
    };
    renderNote(d);
    updateEmptyHint();
    queueUpsert(d.id);
    select(d.id);
    startEdit(d.id);
  }

  function deleteNote(id) {
    const b = state.board;
    const rec = b.els.get(id);
    if (!rec) return;
    b.lastDeleted.push({ ...rec.d });
    if (b.lastDeleted.length > 20) b.lastDeleted.shift();
    removeNote(id);
    b.ops.set(id, { op: 'delete', id });
    scheduleFlush();
    toast('Nota apagada. Ctrl+Z desfaz.');
  }

  function undoDelete() {
    const b = state.board;
    const d = b && b.lastDeleted.pop();
    if (!d) return;
    renderNote(d);
    updateEmptyHint();
    queueUpsert(d.id);
    toast('Nota restaurada');
  }

  $('#btn-add').addEventListener('click', () => {
    const r = viewport.getBoundingClientRect();
    const p = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const jitter = () => (Math.random() - 0.5) * 60;
    createNote(p.x + jitter(), p.y + jitter());
  });

  // ---------- cores ----------
  function renderSwatches() {
    const b = state.board;
    const box = $('#swatches');
    box.replaceChildren();
    const sel = b && b.selectedId && b.els.get(b.selectedId);
    const current = sel ? sel.d.cor : b ? b.color : 'yellow';
    COLORS.forEach((c) => {
      const s = el('button', 'swatch c-' + c + (c === current ? ' active' : ''));
      s.title = 'Cor ' + c;
      s.setAttribute('aria-label', 'Cor ' + c);
      s.addEventListener('click', () => {
        b.color = c;
        localStorage.setItem('4b_color', c);
        if (sel) {
          sel.d.cor = c;
          renderNote(sel.d);
          queueUpsert(sel.d.id);
        }
        renderSwatches();
      });
      box.append(s);
    });
  }

  // ---------- interação com cada nota ----------
  function bindNote(node, text, del, grip) {
    const id = () => node.dataset.id;

    // arrastar
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || node.classList.contains('editing')) return;
      if (e.target === del || e.target === grip) return;
      e.stopPropagation();
      const b = state.board;
      const rec = b.els.get(id());
      const wasSelected = b.selectedId === id();
      select(id());
      b.activeId = id();
      const start = { px: e.clientX, py: e.clientY, x: rec.d.x, y: rec.d.y };
      let moved = false;
      node.setPointerCapture(e.pointerId);

      const move = (ev) => {
        const dx = (ev.clientX - start.px) / b.zoom;
        const dy = (ev.clientY - start.py) / b.zoom;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        if (!moved) {
          moved = true;
          node.classList.add('dragging');
          rec.d.z = ++b.maxZ;
          node.style.zIndex = rec.d.z;
        }
        rec.d.x = Math.round(start.x + dx);
        rec.d.y = Math.round(start.y + dy);
        node.style.left = rec.d.x + 'px';
        node.style.top = rec.d.y + 'px';
      };
      const up = () => {
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        node.classList.remove('dragging');
        if (moved) queueUpsert(id());
        releaseActive(id());
        if (!moved && wasSelected) startEdit(id()); // 2º toque edita (útil no celular)
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
    });

    // redimensionar
    grip.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const b = state.board;
      const rec = b.els.get(id());
      b.activeId = id();
      select(id());
      const start = { px: e.clientX, py: e.clientY, w: rec.d.w, h: rec.d.h };
      grip.setPointerCapture(e.pointerId);
      node.classList.add('resizing');
      const move = (ev) => {
        rec.d.w = Math.round(Math.min(600, Math.max(120, start.w + (ev.clientX - start.px) / b.zoom)));
        rec.d.h = Math.round(Math.min(600, Math.max(100, start.h + (ev.clientY - start.py) / b.zoom)));
        node.style.width = rec.d.w + 'px';
        node.style.height = rec.d.h + 'px';
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        node.classList.remove('resizing');
        queueUpsert(id());
        releaseActive(id());
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });

    del.addEventListener('pointerdown', (e) => e.stopPropagation());
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteNote(id()); });

    // editar texto
    node.addEventListener('dblclick', (e) => { e.stopPropagation(); startEdit(id()); });

    let typingTimer;
    text.addEventListener('input', () => {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => commitText(id()), 800);
    });
    text.addEventListener('blur', () => { clearTimeout(typingTimer); endEdit(id()); });
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); text.blur(); }
      e.stopPropagation();
    });
    text.addEventListener('paste', (e) => {
      e.preventDefault();
      const plain = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, plain);
    });
  }

  function startEdit(id) {
    const b = state.board;
    const rec = b.els.get(id);
    if (!rec) return;
    b.activeId = id;
    rec.node.classList.add('editing');
    rec.text.contentEditable = 'true';
    rec.text.focus();
    const range = document.createRange();
    range.selectNodeContents(rec.text);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function commitText(id) {
    const b = state.board;
    const rec = b && b.els.get(id);
    if (!rec) return;
    const t = rec.text.innerText.replace(/\n$/, '').slice(0, 2000);
    if (t !== rec.d.texto) {
      rec.d.texto = t;
      queueUpsert(id);
    }
  }

  function endEdit(id) {
    const b = state.board;
    const rec = b && b.els.get(id);
    if (!rec) return;
    commitText(id);
    rec.text.contentEditable = 'false';
    rec.node.classList.remove('editing');
    releaseActive(id);
  }

  /** Solta o "trava" local e aplica mudança remota que ficou esperando. */
  function releaseActive(id) {
    const b = state.board;
    if (!b || b.activeId !== id) return;
    b.activeId = null;
    const pending = b.deferred.get(id);
    b.deferred.delete(id);
    if (pending && !b.ops.has(id)) applyRemote(pending);
  }

  // =========================================================
  // SINCRONIZAÇÃO: fila de envio + polling
  // =========================================================
  function queueUpsert(id) {
    const b = state.board;
    const rec = b.els.get(id);
    if (!rec) return;
    b.ops.set(id, { op: 'upsert', element: { ...rec.d } });
    scheduleFlush();
  }

  function scheduleFlush(delay = CFG.FLUSH_MS, quiet = false) {
    const b = state.board;
    if (!b) return;
    if (!quiet) setSync('pending');
    clearTimeout(b.flushTimer);
    b.flushTimer = setTimeout(flush, delay);
  }

  async function flush() {
    const b = state.board;
    if (!b || !b.alive || b.flushing || !b.ops.size) return;
    b.flushing = true;
    let failed = false;
    const batch = [...b.ops.entries()].slice(0, 50);
    batch.forEach(([id]) => { b.ops.delete(id); b.inflight.add(id); });

    try {
      const r = await api('applyOps', { projectId: b.id, ops: batch.map(([, op]) => op) });
      batch.forEach(([id]) => b.localVer.set(id, r.version));
      if (!b.ops.size) setSync('ok');
    } catch (err) {
      // devolve para a fila (se o usuário não mudou de novo nesse meio tempo)
      batch.forEach(([id, op]) => { if (!b.ops.has(id)) b.ops.set(id, op); });
      failed = true;
      setSync('error');
    } finally {
      batch.forEach(([id]) => b.inflight.delete(id));
      b.flushing = false;
      if (b.alive && b.ops.size && state.board === b) {
        failed ? scheduleFlush(3000, true) : scheduleFlush();
      }
    }
  }

  function applyRemote(d) {
    const b = state.board;
    if ((b.localVer.get(d.id) || 0) >= d.versao) return;      // já temos algo igual ou mais novo
    if (b.ops.has(d.id) || b.inflight.has(d.id)) return;       // nossa gravação vai prevalecer
    if (b.activeId === d.id) { b.deferred.set(d.id, d); return; } // usuário mexendo agora
    if (d.excluido) { removeNote(d.id); return; }
    renderNote(d);
    updateEmptyHint();
  }

  function schedulePoll(delay) {
    const b = state.board;
    if (!b || !b.alive) return;
    clearTimeout(b.pollTimer);
    b.pollTimer = setTimeout(poll, delay ?? (document.hidden ? CFG.POLL_HIDDEN_MS : CFG.POLL_MS));
  }

  async function poll() {
    const b = state.board;
    if (!b || !b.alive || b.polling) return;
    b.polling = true;
    try {
      const r = await api('poll', { projectId: b.id, since: b.version });
      if (state.board !== b) return;
      r.changes.forEach(applyRemote);
      b.version = Math.max(b.version, r.version);
      renderOnline(r.online);
      if (!b.ops.size && !b.flushing) setSync('ok');
    } catch {
      if (state.board === b) setSync('error');
    } finally {
      b.polling = false;
      if (state.board === b) schedulePoll();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.board) schedulePoll(0);
  });

  // Ao fechar a aba, envia o que faltou (sendBeacon não espera resposta)
  function sendPendingBeacon() {
    const b = state.board;
    if (!b || !b.ops.size || !navigator.sendBeacon) return;
    const body = JSON.stringify({
      action: 'applyOps', token: state.token, projectId: b.id, ops: [...b.ops.values()]
    });
    navigator.sendBeacon(CFG.API_URL, new Blob([body], { type: 'text/plain;charset=utf-8' }));
    b.ops.clear();
  }
  window.addEventListener('pagehide', sendPendingBeacon);

  function setSync(status) {
    const s = $('#sync-status');
    const text = { ok: 'Tudo salvo', pending: 'Salvando…', error: 'Sem conexão, tentando de novo' };
    s.textContent = text[status];
    s.classList.toggle('error', status === 'error');
  }

  function renderOnline(list) {
    const box = $('#online-list');
    box.replaceChildren();
    (list || []).slice(0, 6).forEach((u) => {
      const initials = u.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
      const a = el('span', 'avatar c-' + colorFor(u.id), initials);
      a.title = u.nome + (state.user && u.id === state.user.id ? ' (você)' : '') + ' está no quadro';
      box.append(a);
    });
  }

  // =========================================================
  // CANVAS: mover a visão (pan) e zoom
  // =========================================================
  function applyView() {
    const b = state.board;
    world.style.transform = `translate(${b.pan.x}px, ${b.pan.y}px) scale(${b.zoom})`;
    viewport.style.backgroundPosition = `${b.pan.x}px ${b.pan.y}px`;
    viewport.style.backgroundSize = `${24 * b.zoom}px ${24 * b.zoom}px`;
    $('#btn-zoom-reset').textContent = Math.round(b.zoom * 100) + '%';
  }

  function toWorld(cx, cy) {
    const b = state.board;
    const r = viewport.getBoundingClientRect();
    return { x: (cx - r.left - b.pan.x) / b.zoom, y: (cy - r.top - b.pan.y) / b.zoom };
  }

  function zoomAt(newZoom, cx, cy) {
    const b = state.board;
    newZoom = Math.min(2.5, Math.max(0.2, newZoom));
    const before = toWorld(cx, cy);
    b.zoom = newZoom;
    const r = viewport.getBoundingClientRect();
    b.pan.x = cx - r.left - before.x * b.zoom;
    b.pan.y = cy - r.top - before.y * b.zoom;
    applyView();
  }

  function centerOnContent() {
    const b = state.board;
    const r = viewport.getBoundingClientRect();
    b.zoom = 1;
    if (!b.els.size) {
      b.pan = { x: r.width / 2, y: r.height / 2 };
    } else {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      b.els.forEach(({ d }) => {
        minX = Math.min(minX, d.x); minY = Math.min(minY, d.y);
        maxX = Math.max(maxX, d.x + d.w); maxY = Math.max(maxY, d.y + d.h);
      });
      b.pan = { x: r.width / 2 - (minX + maxX) / 2, y: r.height / 2 - (minY + maxY) / 2 };
    }
    applyView();
  }

  viewport.addEventListener('pointerdown', (e) => {
    if (e.target !== viewport && e.target !== world) return;
    const b = state.board;
    if (!b) return;
    if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
    select(null);
    const start = { px: e.clientX, py: e.clientY, x: b.pan.x, y: b.pan.y };
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('panning');
    const move = (ev) => {
      b.pan.x = start.x + ev.clientX - start.px;
      b.pan.y = start.y + ev.clientY - start.py;
      applyView();
    };
    const up = () => {
      viewport.removeEventListener('pointermove', move);
      viewport.removeEventListener('pointerup', up);
      viewport.classList.remove('panning');
    };
    viewport.addEventListener('pointermove', move);
    viewport.addEventListener('pointerup', up);
  });

  viewport.addEventListener('dblclick', (e) => {
    if (e.target !== viewport && e.target !== world) return;
    const p = toWorld(e.clientX, e.clientY);
    createNote(p.x, p.y);
  });

  // Rodinha/trackpad move a visão; Ctrl+rodinha ou pinça faz zoom
  viewport.addEventListener('wheel', (e) => {
    const b = state.board;
    if (!b) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(b.zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    } else {
      b.pan.x -= e.shiftKey ? e.deltaY : e.deltaX;
      b.pan.y -= e.shiftKey ? 0 : e.deltaY;
      applyView();
    }
  }, { passive: false });

  const zoomCenter = (f) => {
    const r = viewport.getBoundingClientRect();
    zoomAt(state.board.zoom * f, r.left + r.width / 2, r.top + r.height / 2);
  };
  $('#btn-zoom-in').addEventListener('click', () => zoomCenter(1.2));
  $('#btn-zoom-out').addEventListener('click', () => zoomCenter(1 / 1.2));
  $('#btn-zoom-reset').addEventListener('click', () => {
    const r = viewport.getBoundingClientRect();
    zoomAt(1, r.left + r.width / 2, r.top + r.height / 2);
  });

  // Atalhos de teclado no quadro
  document.addEventListener('keydown', (e) => {
    const b = state.board;
    if (!b || $('#dlg-members').open) return;
    if (e.target.matches('input, [contenteditable="true"]')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && b.selectedId) {
      e.preventDefault();
      deleteNote(b.selectedId);
    } else if (e.key === 'Enter' && b.selectedId) {
      e.preventDefault();
      startEdit(b.selectedId);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoDelete();
    } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
      $('#btn-add').click();
    }
  });

  // =========================================================
  // MODAL: PESSOAS DO QUADRO
  // =========================================================
  const dlg = $('#dlg-members');

  $('#btn-members').addEventListener('click', async () => {
    const b = state.board;
    if (!b) return;
    $('#invite-msg').textContent = '';
    const isOwner = b.papel === 'dono';
    $('#form-invite').classList.toggle('hidden', !isOwner);
    dlg.querySelectorAll('.owner-only').forEach((n) => n.classList.toggle('hidden', !isOwner));
    $('#member-list').replaceChildren(el('li', 'muted', 'Carregando…'));
    dlg.showModal();
    try {
      const r = await api('listMembers', { projectId: b.id });
      renderMembers(r.members);
    } catch (err) { $('#invite-msg').textContent = err.message; }
  });

  function renderMembers(members) {
    const b = state.board;
    const list = $('#member-list');
    list.replaceChildren();
    members.forEach((m) => {
      const li = el('li');
      const who = el('span');
      who.append(el('strong', null, m.nome), document.createTextNode(' '), el('span', 'muted', m.email));
      li.append(who, el('span', 'role', m.papel === 'dono' ? 'Dono' : 'Pode editar'));
      if (b.papel === 'dono' && m.papel !== 'dono') {
        const rm = el('button', 'btn danger', 'Remover');
        rm.addEventListener('click', async () => {
          try {
            await api('removeMember', { projectId: b.id, userId: m.id });
            li.remove();
          } catch (err) { $('#invite-msg').textContent = err.message; }
        });
        li.append(rm);
      }
      list.append(li);
    });
  }

  $('#form-invite').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const b = state.board;
    $('#invite-msg').textContent = '';
    await busy(form.querySelector('button'), async () => {
      try {
        await api('inviteMember', { projectId: b.id, email: form.email.value });
        form.reset();
        const r = await api('listMembers', { projectId: b.id });
        renderMembers(r.members);
        toast('Pessoa adicionada ao quadro');
      } catch (err) { $('#invite-msg').textContent = err.message; }
    });
  });

  $('#btn-rename').addEventListener('click', async () => {
    const b = state.board;
    const nome = prompt('Novo nome do quadro:', $('#board-title').textContent);
    if (!nome || !nome.trim()) return;
    try {
      const r = await api('renameProject', { projectId: b.id, nome });
      $('#board-title').textContent = r.nome;
      toast('Quadro renomeado');
    } catch (err) { toast(err.message); }
  });

  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());

  // =========================================================
  // INÍCIO
  // =========================================================
  if (CFG.API_URL.includes('COLE_SEU_ID_AQUI')) {
    toast('Configure a API_URL no arquivo config.js', 8000);
  }
  route();
})();
