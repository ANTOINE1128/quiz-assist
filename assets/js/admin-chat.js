// assets/js/admin-chat.js
(function () {
  if (!window.QA_ADMIN_CHAT) return;
  const {
    apiBase, sessionId, pollInterval, restNonce,
    adminPostBase, deleteAction, deleteNonce
  } = window.QA_ADMIN_CHAT;

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

  let visitorName = 'Visitor';

  // Fetch session meta to label "user" messages with real name/username
  function loadSessionMeta() {
    if (!parseInt(sessionId, 10)) return Promise.resolve();
    return apiGet(`/chat/session?session_id=${sessionId}`)
      .then(r => r.json())
      .then(data => {
        const s = data.session || {};
        visitorName = (parseInt(s.user_id,10) > 0)
          ? (s.user_login || 'User')
          : (s.guest_name || 'Visitor');
      }).catch(()=>{});
  }

  function renderMessages(container, msgs) {
    const frag = document.createDocumentFragment();
    msgs.forEach(m => {
      const p = document.createElement('p');
      const who   = m.sender === 'user' ? visitorName : 'Admin';
      const cls   = m.sender === 'user' ? 'user' : 'admin';
      p.className = `qa-line ${cls}`;
      p.innerHTML =
        `<strong>${escapeHtml(who)}:</strong> ${escapeHtml(m.message)}
         <span class="qa-ts">${escapeHtml(m.created_at)}</span>`;
      frag.appendChild(p);
    });
    container.innerHTML = '';
    container.appendChild(frag);
    container.scrollTop = container.scrollHeight;
  }

  function refreshMessages(container) {
    apiGet(`/chat/messages?session_id=${sessionId}`)
      .then(r => r.json())
      .then(data => renderMessages(container, data.messages || []))
      .catch(()=>{});
  }

  function startMessagePolling() {
    const container = document.getElementById('qa-chat-messages');
    if (!container) return;

    loadSessionMeta().then(() => refreshMessages(container));
    setInterval(() => refreshMessages(container), pollInterval || 1200);

    // Hook AJAX submit for admin reply (no reload)
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

        apiPost('/chat/admin/send', { session_id: Number(sessionId), message: text })
          .then(async r => {
            const j = await r.json().catch(()=>({}));
            if (!r.ok) throw new Error(j?.message || 'Failed to send');
            ta.value = '';
            refreshMessages(container);
          })
          .catch(err => {
            alert(err.message || 'Failed to send');
          })
          .finally(() => {
            if (btn) { btn.disabled = false; if (btn.value) btn.value = orig; if (btn.textContent) btn.textContent = orig; }
          });
      });
    }
  }

  /** ----- Sessions list ----- */
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

  function renderSessions(tbody, sessions) {
    let html = '';
    sessions.forEach(s => {
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
    const tick = () => {
      apiGet('/chat/sessions')
        .then(r => r.json())
        .then(data => renderSessions(tbody, data.sessions || []))
        .catch(()=>{});
    };
    tick();
    setInterval(tick, pollInterval || 1500);
  }

  if (parseInt(sessionId, 10) > 0) {
    startMessagePolling();
  } else {
    startSessionsPolling();
  }
})();
