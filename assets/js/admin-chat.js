// assets/js/admin-chat.js
(function () {
  if (!window.QA_ADMIN_CHAT) return;
  const {
    apiBase, sessionId, pollInterval, restNonce,
    adminPostBase, deleteAction, deleteNonce
  } = window.QA_ADMIN_CHAT;

  const POLL_MS = Math.max(600, Number(pollInterval) || 1200);

  // ---------- API ----------
  function apiGet(path) {
    return fetch(`${apiBase}${path}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-WP-Nonce': restNonce || '', 'Accept': 'application/json' }
    });
  }
  function apiPost(path, body) {
    return fetch(`${apiBase}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-WP-Nonce': restNonce || '',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body || {})
    });
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])
    );
  }

  // ---------- State ----------
  let visitorName = 'Visitor';
  let currentServerMsgs = [];        // last array from server we reconciled to DOM
  let pending = [];                  // optimistic admin sends [{_id, message, time}]
  let pollTimer = null;
  let inFlight = false;

  // ---------- DOM helpers ----------
  function ensureContainers(root) {
    // root holds 2 children: .qa-lines (server) + .qa-pending (optimistic)
    let lines = root.querySelector('.qa-lines');
    let pend  = root.querySelector('.qa-pending');
    if (!lines) {
      lines = document.createElement('div');
      lines.className = 'qa-lines';
      root.appendChild(lines);
    }
    if (!pend) {
      pend = document.createElement('div');
      pend.className = 'qa-pending';
      root.appendChild(pend);
    }
    return { lines, pend };
  }

  function makeSig(m) {
    // stable signature for diffing
    return `${m.sender || ''}|${m.created_at || ''}|${m.message || ''}`;
  }

  function createMsgEl(m) {
    const who = m.sender === 'user' ? visitorName : 'Admin';
    const cls = m.sender === 'user' ? 'user' : 'admin';
    const p = document.createElement('p');
    p.className = `qa-line ${cls}`;
    p.dataset.sig = makeSig(m);
    p.innerHTML =
      `<strong>${escapeHtml(who)}:</strong> ${escapeHtml(m.message)}
       <span class="qa-ts">${escapeHtml(m.created_at || '')}</span>`;
    return p;
  }

  function renderServerMessagesIncremental(linesEl, msgs) {
    // Incremental patch: only modify the tail that changed.
    const children = Array.from(linesEl.children);
    const oldSigs  = children.map(el => el.dataset.sig || '');
    const newSigs  = msgs.map(makeSig);

    // Longest common prefix
    let i = 0;
    const max = Math.min(oldSigs.length, newSigs.length);
    while (i < max && oldSigs[i] === newSigs[i]) i++;

    const nearBottom = (linesEl.scrollHeight - linesEl.scrollTop - linesEl.clientHeight) < 60;
    const hadLen = children.length;

    // If we have extra old nodes, remove from the end
    for (let k = oldSigs.length - 1; k >= newSigs.length; k--) {
      linesEl.removeChild(children[k]);
    }

    // Replace or append for the changed tail
    for (let k = i; k < newSigs.length; k++) {
      const el = (k < linesEl.children.length) ? linesEl.children[k] : null;
      const m  = msgs[k];
      if (el) {
        // Replace node only if sig differs
        if (el.dataset.sig !== newSigs[k]) {
          linesEl.replaceChild(createMsgEl(m), el);
        }
      } else {
        linesEl.appendChild(createMsgEl(m));
      }
    }

    if (nearBottom && linesEl.children.length !== hadLen) {
      linesEl.scrollTop = linesEl.scrollHeight;
    }
  }

  function renderPending(pendEl) {
    const root = pendEl.parentNode || pendEl;
    const nearBottom = (root.scrollHeight - root.scrollTop - root.clientHeight) < 60;

    // build fragment
    const frag = document.createDocumentFragment();
    pending.forEach(pmsg => {
      const p = document.createElement('p');
      p.className = 'qa-line admin pending';
      p.dataset.tempId = pmsg._id;
      p.innerHTML = `<strong>Admin:</strong> ${escapeHtml(pmsg.message)} <span class="qa-ts">Sending…</span>`;
      frag.appendChild(p);
    });

    // swap in one go
    pendEl.innerHTML = '';
    pendEl.appendChild(frag);

    if (nearBottom) {
      root.scrollTop = root.scrollHeight;
    }
  }

  function reconcilePending() {
    if (!pending.length) return;
    // Drop pending entries that now appear in the server feed
    const seen = new Set();
    currentServerMsgs.forEach(m => {
      if (m.sender === 'admin') seen.add(m.message);
    });
    pending = pending.filter(pmsg => !seen.has(pmsg.message) && (Date.now() - pmsg.time) < 12000);
  }

  // ---------- Data ----------
  function loadSessionMeta() {
    if (!parseInt(sessionId, 10)) return Promise.resolve();
    return apiGet(`/chat/session?session_id=${sessionId}`)
      .then(r => r.json())
      .then(data => {
        const s = data.session || {};
        visitorName = (parseInt(s.user_id,10) > 0)
          ? (s.user_login || 'User')
          : (s.guest_name || 'Visitor');
      })
      .catch(()=>{});
  }

  function refreshMessages(container) {
    const { lines, pend } = ensureContainers(container);
    return apiGet(`/chat/messages?session_id=${sessionId}`)
      .then(r => r.json())
      .then(data => {
        const msgs = Array.isArray(data.messages) ? data.messages : [];
        currentServerMsgs = msgs;
        renderServerMessagesIncremental(lines, msgs);
        reconcilePending();
        renderPending(pend);
      })
      .catch(()=>{});
  }

  function startMessagePolling() {
    const container = document.getElementById('qa-chat-messages');
    if (!container) return;
    ensureContainers(container);

    function schedule(delay) {
      clearTimeout(pollTimer);
      pollTimer = setTimeout(tick, delay);
    }
    function tick() {
      if (inFlight || document.hidden) { schedule(200); return; }
      inFlight = true;
      refreshMessages(container)
        .finally(() => { inFlight = false; schedule(POLL_MS); });
    }

    loadSessionMeta().then(() => { refreshMessages(container).finally(() => schedule(POLL_MS)); });

    // Admin reply (optimistic)
    const form = document.getElementById('qa-admin-reply-form');
    if (form) {
      form.addEventListener('submit', function(e){
        e.preventDefault();
        const ta  = form.querySelector('textarea[name="admin_message"]');
        const btn = form.querySelector('input[type="submit"], button[type="submit"]') || form.querySelector('input[type="submit"]');
        const text = (ta.value || '').trim();
        if (!text) return;

        const orig = btn ? (btn.value || btn.textContent) : '';
        if (btn) { btn.disabled = true; btn.value = 'Sending…'; if (btn.textContent) btn.textContent = 'Sending…'; }

        // optimistic bubble
        const temp = { _id: `${Date.now()}-${Math.random()}`, message: text, time: Date.now() };
        pending.push(temp);
        renderPending(container.querySelector('.qa-pending'));

        ta.value = '';

        apiPost('/chat/admin/send', { session_id: Number(sessionId), message: text })
          .then(async r => {
            const j = await r.json().catch(()=>({}));
            if (!r.ok) throw new Error(j?.message || 'Failed to send');
            // Next poll will pick it up; also clear stale pending if needed
            setTimeout(() => { reconcilePending(); renderPending(container.querySelector('.qa-pending')); }, 1200);
          })
          .catch(err => {
            // remove optimistic bubble on failure
            pending = pending.filter(p => p._id !== temp._id);
            renderPending(container.querySelector('.qa-pending'));
            alert(err.message || 'Failed to send');
          })
          .finally(() => {
            if (btn) { btn.disabled = false; if (btn.value) btn.value = orig; if (btn.textContent) btn.textContent = orig; }
          });
      });
    }
  }

  // ---------- Sessions list (no flicker) ----------
  function detailsCell(s) {
    if (parseInt(s.user_id, 10) > 0) {
      const u = (s.user_login || '—');
      const e = (s.user_email || '—');
      return (
        `<div><em>User session</em></div>` +
        `<div class="qa-user-meta"><span>Username: ${escapeHtml(u)}</span><span>Email: ${escapeHtml(e)}</span></div>`
      );
    }
    const n = s.guest_name  || '—';
    const e = s.guest_email || '—';
    const p = s.guest_phone || '—';
    return (
      `<div><em>Guest session</em></div>` +
      `<div class="qa-user-meta"><span>Name: ${escapeHtml(n)}</span><span>Email: ${escapeHtml(e)}</span><span>Phone: ${escapeHtml(p)}</span></div>`
    );
  }

  let lastSessionsSig = '';
  function sigSessions(list) {
    return JSON.stringify((list || []).map(s => [s.id, s.unread_count, s.last_message_time, s.user_login, s.guest_name]));
  }
  function renderSessions(tbody, sessions) {
    const sig = sigSessions(sessions);
    if (sig === lastSessionsSig) return;
    lastSessionsSig = sig;

    let html = '';
    (sessions || []).forEach(s => {
      const view = `admin.php?page=quiz_assist_chats&session_id=${s.id}`;
      const del  = `${adminPostBase}?action=${encodeURIComponent(deleteAction)}&session_id=${s.id}&_wpnonce=${encodeURIComponent(deleteNonce)}`;
      html += `<tr>
        <td>#${s.id}${s.unread_count>0?` <span class="unread-badge">${s.unread_count}</span>`:''}</td>
        <td>${detailsCell(s)}</td>
        <td>${s.last_message_time ? escapeHtml(s.last_message_time) : ''}</td>
        <td class="qa-actions">
          <a class="button button-small" href="${view}">View</a>
          <a class="button button-small button-link-delete" href="${del}">Delete</a>
        </td>
      </tr>`;
    });
    tbody.innerHTML = html || '<tr><td colspan="4">No chats yet.</td></tr>';
  }
  function startSessionsPolling() {
    const table = document.getElementById('qa-chat-sessions-table');
    if (!table) return;
    const tbody = table.querySelector('tbody');

    let inFlightSess = false;
    function tick() {
      if (inFlightSess || document.hidden) { setTimeout(tick, POLL_MS); return; }
      inFlightSess = true;
      apiGet('/chat/sessions')
        .then(r => r.json())
        .then(data => renderSessions(tbody, data.sessions || []))
        .catch(()=>{})
        .finally(() => { inFlightSess = false; setTimeout(tick, POLL_MS); });
    }
    tick();
  }

  if (parseInt(sessionId, 10) > 0) {
    startMessagePolling();
  } else {
    startSessionsPolling();
  }
})();
