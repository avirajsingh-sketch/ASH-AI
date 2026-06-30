/**
 * ASH — AI Agent Platform  |  app.js
 * Created by: Aviraj & Sehaj
 */

const ASH = {
  _toastWrap: null,

  init() {
    this._toastWrap = document.getElementById('toast-wrap');
    this._applyTheme();
    this._initSidebar();
    this._initPage();
  },

  /* ── Toast ───────────────────────────────────────────────────────── */
  toast(msg, type = 'info', duration = 4000) {
    if (!this._toastWrap) return;
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
    this._toastWrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  },

  /* ── Theme ───────────────────────────────────────────────────────── */
  _applyTheme(theme) {
    const t = theme || localStorage.getItem('ash-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('ash-theme', t);
  },

  /* ── Sidebar ─────────────────────────────────────────────────────── */
  _initSidebar() {
    const hamburger = document.getElementById('hamburger');
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('sidebar-overlay');
    if (!hamburger || !sidebar) return;

    const open  = () => { sidebar.classList.add('open'); overlay?.classList.add('visible'); hamburger.classList.add('open'); };
    const close = () => { sidebar.classList.remove('open'); overlay?.classList.remove('visible'); hamburger.classList.remove('open'); };

    hamburger.addEventListener('click', () => sidebar.classList.contains('open') ? close() : open());
    overlay?.addEventListener('click', close);

    const current = window.location.pathname;
    document.querySelectorAll('.nav-item[data-path]').forEach(item => {
      if (item.dataset.path === current) item.classList.add('active');
    });

    document.getElementById('sidebar-logout')?.addEventListener('click', () => this.logout());
  },

  /* ── Page router ─────────────────────────────────────────────────── */
  _initPage() {
    const page = document.body.dataset.page;
    if (!page) return;
    const map = {
      login:     () => this._initAuth('login'),
      register:  () => this._initAuth('register'),
      dashboard: () => this._initDashboard(),
      settings:  () => this._initSettings(),
      about:     () => {},
      chat:      () => this._initChat(),
      agent:     () => this._initAgent(),
      tasks:     () => this._initTasks(),
      memory:    () => this._initMemory(),
    };
    map[page]?.();
  },

  /* ── Auth ────────────────────────────────────────────────────────── */
  _initAuth(mode) {
    const form    = document.getElementById('auth-form');
    const btn     = document.getElementById('auth-btn');
    const errBox  = document.getElementById('auth-error');
    if (!form) return;

    const showErr = msg => {
      if (errBox) { errBox.textContent = msg; errBox.style.display = 'block'; }
      else this.toast(msg, 'error');
    };
    const hideErr = () => { if (errBox) errBox.style.display = 'none'; };

    form.addEventListener('submit', async e => {
      e.preventDefault();
      hideErr();
      const email    = form.querySelector('#email')?.value.trim();
      const password = form.querySelector('#password')?.value;
      const name     = form.querySelector('#name')?.value?.trim();

      if (!email || !password) { showErr('Email and password are required.'); return; }
      if (mode === 'register' && password.length < 6) { showErr('Password must be at least 6 characters.'); return; }

      btn.classList.add('loading');
      btn.disabled = true;

      const endpoint = mode === 'register' ? '/api/register' : '/api/login';
      const body     = mode === 'register'
        ? { email, password, name: name || email.split('@')[0] }
        : { email, password };

      try {
        const res  = await fetch(endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          showErr(data.error || 'Authentication failed.');
          btn.classList.remove('loading');
          btn.disabled = false;
          return;
        }
        if (data.redirect) window.location.href = data.redirect;
      } catch {
        showErr('Connection error. Please try again.');
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
  },

  /* ── Dashboard ───────────────────────────────────────────────────── */
  _initDashboard() {
    // Counter animation
    document.querySelectorAll('[data-counter]').forEach(el => {
      const target = parseInt(el.dataset.counter, 10);
      if (!target) return;
      const start  = performance.now();
      const update = now => {
        const t = Math.min((now - start) / 1200, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(update);
      };
      requestAnimationFrame(update);
    });

    // Load profile + stats
    fetch('/api/profile').then(r => r.json()).then(data => {
      if (data.error) return;
      const first = (data.name || data.email || 'Operator').split(' ')[0];
      const nameEl = document.getElementById('dash-welcome-name');
      if (nameEl) nameEl.textContent = `Welcome back, ${first} 👾`;

      const metaEl = document.getElementById('dash-user-meta');
      if (metaEl) {
        const lastLogin = data.last_login ? new Date(data.last_login).toLocaleString() : 'Just now';
        metaEl.textContent = `${data.email}  ·  Last login: ${lastLogin}`;
      }

      const tc = document.getElementById('dash-tasks-count');
      const td = document.getElementById('dash-tasks-delta');
      const mc = document.getElementById('dash-memory-count');
      const md = document.getElementById('dash-memory-delta');
      const cc = document.getElementById('dash-chat-count');
      const cd = document.getElementById('dash-chat-delta');

      if (tc) tc.textContent  = data.task_count ?? 0;
      if (td) td.textContent  = `↑ ${data.task_count ?? 0} total`;
      if (mc) mc.textContent  = data.memory_count ?? 0;
      if (md) md.textContent  = (data.memory_count ?? 0) > 0 ? '↑ Stored' : 'None yet';
      if (cc) cc.textContent  = data.chat_count ?? 0;
      if (cd) cd.textContent  = `↑ ${data.chat_count ?? 0} messages`;

      // System status
      fetch('/api/meta').then(r => r.json()).then(meta => {
        const sl = document.getElementById('system-status-list');
        if (!sl) return;
        const rows = [
          ['Flask Backend',  'Operational',                          'ready'],
          ['Firebase Auth',  meta.firebase_available ? 'Connected' : 'Dev mode', meta.firebase_available ? 'ready' : 'warning'],
          ['Groq LLM',       meta.groq_available ? 'Connected' : 'Add GROQ_API_KEY', meta.groq_available ? 'ready' : 'warning'],
          ['ASH Agent',      'Phase 3.5',                            'ready'],
          ['Firestore',      meta.firebase_available ? 'Syncing' : 'In-memory', meta.firebase_available ? 'ready' : 'warning'],
        ];
        sl.innerHTML = rows.map(([name, status, cls]) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--glass-border);font-size:12px;">
            <span style="color:var(--text-secondary);">${name}</span>
            <span class="agent-status-badge badge-${cls}">${status}</span>
          </div>`).join('');
      });
    }).catch(() => {});
  },

  /* ── Settings ────────────────────────────────────────────────────── */
  _initSettings() {
    // Load current profile + prefs
    fetch('/api/profile').then(r => r.json()).then(data => {
      if (data.error) return;
      const nameInput = document.getElementById('s-name');
      if (nameInput && data.name) nameInput.value = data.name;

      const createdEl = document.getElementById('s-created-at');
      if (createdEl && data.created_at) {
        createdEl.textContent = new Date(data.created_at).toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric'
        });
      } else if (createdEl) {
        createdEl.textContent = '—';
      }

      // Apply agent prefs
      const prefs = data.preferences || {};
      const memTog = document.getElementById('pref-memory');
      const hisTog = document.getElementById('pref-history');
      if (memTog) memTog.checked = prefs.memory_enabled !== false;
      if (hisTog) hisTog.checked = prefs.history_enabled !== false;

      // Apply theme from prefs (also stored in localStorage)
      const theme = prefs.theme || localStorage.getItem('ash-theme') || 'dark';
      this._applyTheme(theme);
      const darkRadio  = document.getElementById('theme-dark');
      const lightRadio = document.getElementById('theme-light');
      if (darkRadio)  darkRadio.checked  = theme === 'dark';
      if (lightRadio) lightRadio.checked = theme === 'light';
    }).catch(() => {});

    // Live theme preview
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
      radio.addEventListener('change', () => this._applyTheme(radio.value));
    });

    // Profile form
    const profileForm = document.getElementById('profile-form');
    profileForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn  = profileForm.querySelector('button[type="submit"]');
      const name = document.getElementById('s-name')?.value?.trim();
      if (!name) { this.toast('Name cannot be empty.', 'warning'); return; }
      btn.classList.add('loading');
      try {
        const res  = await fetch('/api/profile', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok || data.error) { this.toast(data.error || 'Failed to save.', 'error'); return; }
        // Update sidebar name
        document.getElementById('sb-name')?.textContent && (document.getElementById('sb-name').textContent = name);
        document.getElementById('sb-avatar') && (document.getElementById('sb-avatar').textContent = name[0].toUpperCase());
        this.toast('Profile saved.', 'success');
      } catch { this.toast('Failed to save profile.', 'error'); }
      finally { btn.classList.remove('loading'); }
    });

    // Password form
    const passwordForm = document.getElementById('password-form');
    passwordForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn        = passwordForm.querySelector('button[type="submit"]');
      const currentPw  = document.getElementById('s-current-pw')?.value;
      const newPw      = document.getElementById('s-new-pw')?.value;
      const confirmPw  = document.getElementById('s-confirm-pw')?.value;
      if (!currentPw || !newPw || !confirmPw) { this.toast('Fill in all password fields.', 'warning'); return; }
      if (newPw !== confirmPw) { this.toast('New passwords do not match.', 'error'); return; }
      if (newPw.length < 6) { this.toast('Password must be at least 6 characters.', 'warning'); return; }
      btn.classList.add('loading');
      try {
        const res  = await fetch('/api/change-password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
        });
        const data = await res.json();
        if (!res.ok || data.error) { this.toast(data.error || 'Failed to change password.', 'error'); return; }
        passwordForm.reset();
        this.toast('Password changed successfully.', 'success');
      } catch { this.toast('Failed to change password.', 'error'); }
      finally { btn.classList.remove('loading'); }
    });

    // Preferences form (theme)
    const prefsForm = document.getElementById('prefs-form');
    prefsForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn   = prefsForm.querySelector('button[type="submit"]');
      const theme = prefsForm.querySelector('input[name="theme"]:checked')?.value || 'dark';
      btn.classList.add('loading');
      try {
        const res  = await fetch('/api/preferences', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme }),
        });
        const data = await res.json();
        if (!res.ok || data.error) { this.toast(data.error || 'Failed to save.', 'error'); return; }
        this._applyTheme(theme);
        this.toast('Preferences saved.', 'success');
      } catch { this.toast('Failed to save preferences.', 'error'); }
      finally { btn.classList.remove('loading'); }
    });

    // Agent prefs form
    const agentForm = document.getElementById('agent-prefs-form');
    agentForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const btn            = agentForm.querySelector('button[type="submit"]');
      const memory_enabled  = document.getElementById('pref-memory')?.checked ?? true;
      const history_enabled = document.getElementById('pref-history')?.checked ?? true;
      btn.classList.add('loading');
      try {
        const res  = await fetch('/api/preferences', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memory_enabled, history_enabled }),
        });
        const data = await res.json();
        if (!res.ok || data.error) { this.toast(data.error || 'Failed to save.', 'error'); return; }
        this.toast('Agent settings saved.', 'success');
      } catch { this.toast('Failed to save agent settings.', 'error'); }
      finally { btn.classList.remove('loading'); }
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());
    document.getElementById('sidebar-logout')?.addEventListener('click', () => this.logout());
  },

  /* ── Chat ────────────────────────────────────────────────────────── */
  _initChat() {
    const messagesEl = document.getElementById('chat-messages');
    const inputEl    = document.getElementById('chat-input');
    const sendBtn    = document.getElementById('chat-send-btn');
    const typingEl   = document.getElementById('chat-typing');
    const welcomeEl  = document.getElementById('chat-welcome');
    const clearBtn   = document.getElementById('clear-chat-btn');
    if (!messagesEl || !inputEl || !sendBtn) return;

    // Load history
    fetch('/api/chat/history').then(r => r.json()).then(data => {
      if (data.history?.length) {
        welcomeEl?.remove();
        data.history.forEach(msg => this._appendBubble(messagesEl, msg.role, msg.content));
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }).catch(() => {});

    // Auto-grow textarea
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
    });

    // Enter = send, Shift+Enter = newline
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
    });

    // Chips
    document.querySelectorAll('.chat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        inputEl.value = chip.dataset.msg || chip.textContent.trim();
        sendBtn.click();
      });
    });

    // Send
    const sendMessage = async () => {
      const message = inputEl.value.trim();
      if (!message || sendBtn.disabled) return;
      welcomeEl?.remove();
      this._appendBubble(messagesEl, 'user', message);
      inputEl.value = '';
      inputEl.style.height = 'auto';
      messagesEl.scrollTop = messagesEl.scrollHeight;
      sendBtn.disabled = true;
      if (typingEl) typingEl.style.display = '';
      messagesEl.scrollTop = messagesEl.scrollHeight;
      try {
        const res  = await fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        const data = await res.json();
        if (typingEl) typingEl.style.display = 'none';
        if (!res.ok) throw new Error(data.error || 'Server error');
        this._appendBubble(messagesEl, 'assistant', data.assistant.content);
      } catch (err) {
        if (typingEl) typingEl.style.display = 'none';
        this.toast(err.message || 'Chat failed.', 'error');
      } finally {
        sendBtn.disabled = false;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        inputEl.focus();
      }
    };

    sendBtn.addEventListener('click', sendMessage);

    // Clear
    clearBtn?.addEventListener('click', async () => {
      if (!confirm('Clear all chat history?')) return;
      await fetch('/api/chat/clear', { method: 'POST' }).catch(() => {});
      messagesEl.innerHTML = '';
      this.toast('Chat cleared.', 'success');
    });
  },

  _appendBubble(container, role, content) {
    const isAsh = role === 'assistant';
    const div   = document.createElement('div');
    div.className = isAsh ? 'chat-bubble-ash' : 'chat-bubble-user';
    const safe = content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    div.innerHTML = isAsh
      ? `<div class="chat-avatar-ash">🤖</div><div class="chat-bubble-body">${safe}</div>`
      : `<div class="chat-bubble-body">${safe}</div>`;
    container.appendChild(div);
  },

  /* ── Agent ───────────────────────────────────────────────────────── */
  _initAgent() {
    const outputEl = document.getElementById('agent-output');
    const inputEl  = document.getElementById('agent-task-input');
    const runBtn   = document.getElementById('run-agent-btn');
    const clearBtn = document.getElementById('clear-console-btn');
    if (!runBtn || !inputEl) return;

    document.querySelectorAll('.agent-quick-btn').forEach(btn =>
      btn.addEventListener('click', () => { inputEl.value = btn.dataset.task; inputEl.focus(); }));

    clearBtn?.addEventListener('click', () => { if (outputEl) outputEl.innerHTML = ''; });

    const appendMsg = (role, text) => {
      if (!outputEl) return;
      const div  = document.createElement('div');
      div.className = `agent-msg agent-msg-${role}`;
      const icon = role === 'ash' ? '🤖' : '👤';
      const safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
      div.innerHTML = `<div class="agent-msg-icon">${icon}</div>
        <div class="agent-msg-content">
          <div class="agent-msg-label">${role === 'ash' ? 'ASH' : 'You'}</div>
          <div class="agent-msg-text">${safe}</div>
        </div>`;
      outputEl.appendChild(div);
      outputEl.scrollTop = outputEl.scrollHeight;
    };

    runBtn.addEventListener('click', async () => {
      const task = inputEl.value.trim();
      if (!task) return;
      appendMsg('user', task);
      inputEl.value = '';
      const label = runBtn.querySelector('.btn-label');
      label.textContent = 'Running…';
      runBtn.disabled = true;
      try {
        const res  = await fetch('/api/agent/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Agent error');
        appendMsg('ash', data.task?.result || 'Done.');
      } catch (err) { this.toast(err.message, 'error'); }
      finally { label.textContent = '▶ Run Task'; runBtn.disabled = false; }
    });
  },

  /* ── Tasks ───────────────────────────────────────────────────────── */
  _initTasks() {
    let currentStatus = 'all';
    const listEl      = document.getElementById('task-list');
    const countLbl    = document.getElementById('tasks-count-label');
    const form        = document.getElementById('create-task-form');
    const refreshBtn  = document.getElementById('refresh-tasks-btn');

    const badgeCls = s => s === 'completed' ? 'ready' : s === 'pending' ? 'warning' : 'soon';

    const renderTask = t => `
      <div class="p2-item-card" data-id="${t.id}">
        <div class="p2-item-header">
          <span class="p2-item-title">${this._esc(t.title)}</span>
          <span class="agent-status-badge badge-${badgeCls(t.status)}">${t.status}</span>
        </div>
        ${t.description ? `<div class="p2-item-desc">${this._esc(t.description)}</div>` : ''}
        <div class="p2-item-actions">
          ${t.status !== 'completed' ? `<button class="btn btn-ghost btn-sm p2-complete-btn" data-id="${t.id}">✓ Complete</button>` : ''}
          <button class="btn btn-ghost btn-sm p2-delete-btn" data-id="${t.id}" style="color:var(--danger)">✕ Delete</button>
        </div>
      </div>`;

    const load = async () => {
      if (listEl) listEl.innerHTML = '<div class="p2-loading"><div class="skel" style="height:80px;border-radius:12px;"></div></div>';
      const url = currentStatus === 'all' ? '/api/tasks' : `/api/tasks?status=${currentStatus}`;
      try {
        const data  = await fetch(url).then(r => r.json());
        const tasks = data.tasks || [];
        if (countLbl) countLbl.textContent = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;
        if (listEl) {
          listEl.innerHTML = tasks.length
            ? tasks.map(renderTask).join('')
            : '<div class="p2-empty-state"><div class="p2-empty-icon">📋</div><p>No tasks yet.</p></div>';
          listEl.querySelectorAll('.p2-complete-btn').forEach(btn =>
            btn.addEventListener('click', async () => {
              await fetch(`/api/tasks/${btn.dataset.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:'completed'}) });
              load();
            }));
          listEl.querySelectorAll('.p2-delete-btn').forEach(btn =>
            btn.addEventListener('click', async () => {
              await fetch(`/api/tasks/${btn.dataset.id}`, { method:'DELETE' });
              load();
            }));
        }
      } catch { if (listEl) listEl.innerHTML = '<p style="color:var(--danger);padding:16px;">Failed to load tasks.</p>'; }
    };

    document.querySelectorAll('#tasks-filter .p2-filter-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('#tasks-filter .p2-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentStatus = btn.dataset.status;
        load();
      }));

    refreshBtn?.addEventListener('click', load);

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const title = document.getElementById('task-title')?.value.trim();
      const desc  = document.getElementById('task-desc')?.value.trim();
      if (!title) return;
      const btn = form.querySelector('button[type="submit"]');
      btn.classList.add('loading');
      try {
        const res = await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title, description:desc}) });
        const data = await res.json();
        if (!res.ok || data.error) { this.toast(data.error || 'Failed to create task.', 'error'); return; }
        form.reset();
        this.toast('Task created.', 'success');
        load();
      } catch { this.toast('Failed to create task.', 'error'); }
      finally { btn.classList.remove('loading'); }
    });

    load();
  },

  /* ── Memory ──────────────────────────────────────────────────────── */
  _initMemory() {
    let currentCategory = 'all';
    const listEl        = document.getElementById('memory-list');
    const countLbl      = document.getElementById('memory-count-label');
    const form          = document.getElementById('add-memory-form');
    const refreshBtn    = document.getElementById('refresh-memory-btn');

    const renderMem = m => `
      <div class="p2-item-card" data-id="${m.id}">
        <div class="p2-item-header">
          <span class="agent-status-badge badge-soon">${m.category}</span>
          <button class="btn btn-ghost btn-sm p2-delete-btn" data-id="${m.id}" style="color:var(--danger)">✕</button>
        </div>
        <div class="p2-item-desc" style="margin-top:8px;">${this._esc(m.content)}</div>
      </div>`;

    const load = async () => {
      if (listEl) listEl.innerHTML = '<div class="p2-loading"><div class="skel" style="height:80px;border-radius:12px;"></div></div>';
      const url = currentCategory === 'all' ? '/api/memory' : `/api/memory?category=${currentCategory}`;
      try {
        const data = await fetch(url).then(r => r.json());
        const mems = data.memories || [];
        if (countLbl) countLbl.textContent = `${mems.length} node${mems.length !== 1 ? 's' : ''}`;
        if (listEl) {
          listEl.innerHTML = mems.length
            ? mems.map(renderMem).join('')
            : '<div class="p2-empty-state"><div class="p2-empty-icon">🧠</div><p>No memories yet.</p></div>';
          listEl.querySelectorAll('.p2-delete-btn').forEach(btn =>
            btn.addEventListener('click', async () => {
              await fetch(`/api/memory/${btn.dataset.id}`, { method:'DELETE' });
              load();
            }));
        }
      } catch { if (listEl) listEl.innerHTML = '<p style="color:var(--danger);padding:16px;">Failed to load memory.</p>'; }
    };

    document.querySelectorAll('#memory-filter .p2-filter-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('#memory-filter .p2-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.category;
        load();
      }));

    refreshBtn?.addEventListener('click', load);

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const content  = document.getElementById('mem-content')?.value.trim();
      const category = document.getElementById('mem-category')?.value || 'general';
      if (!content) return;
      const btn = form.querySelector('button[type="submit"]');
      btn.classList.add('loading');
      try {
        const res = await fetch('/api/memory', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({content, category}) });
        const data = await res.json();
        if (!res.ok || data.error) { this.toast(data.error || 'Failed to save memory.', 'error'); return; }
        form.reset();
        this.toast('Memory saved.', 'success');
        load();
      } catch { this.toast('Failed to save memory.', 'error'); }
      finally { btn.classList.remove('loading'); }
    });

    load();
  },

  /* ── Logout ──────────────────────────────────────────────────────── */
  async logout() {
    try {
      const res  = await fetch('/api/logout', { method: 'POST' });
      const data = await res.json();
      window.location.href = data.redirect || '/login';
    } catch {
      window.location.href = '/login';
    }
  },

  /* ── Util ────────────────────────────────────────────────────────── */
  _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },
};

document.addEventListener('DOMContentLoaded', () => ASH.init());
window.ASH = ASH;
