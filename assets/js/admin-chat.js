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

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])
    );
  }

  /** ----- Messages view ----- */
  function renderMessages(container, msgs) {
    const frag = document.createDocumentFragment();
    msgs.forEach(m => {
      const p = document.createElement('p');
      const who   = m.sender === 'user' ? 'Visitor' : 'Admin';
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

  function startMessagePolling() {
    const container = document.getElementById('qa-chat-messages');
    if (!container) return;
    let lastJSON = '';
    const tick = () => {
      apiGet(`/chat/messages?session_id=${sessionId}`)
        .then(r => r.json())
        .then(data => {
          const json = JSON.stringify(data.messages || []);
          if (json !== lastJSON) {
            renderMessages(container, data.messages || []);
            lastJSON = json;
          }
        }).catch(()=>{});
    };
    tick();
    setInterval(tick, pollInterval || 1200);
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
    let lastJSON = '';
    const tick = () => {
      apiGet('/chat/sessions')
        .then(r => r.json())
        .then(data => {
          const arr = data.sessions || [];
          const json = JSON.stringify(arr);
          if (json !== lastJSON) {
            renderSessions(tbody, arr);
            lastJSON = json;
          }
        }).catch(()=>{});
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
