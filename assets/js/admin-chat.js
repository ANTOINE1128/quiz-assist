// assets/js/admin-chat.js
(function(){
  if ( ! window.QA_ADMIN_CHAT ) return;
  const { apiBase, sessionId, pollInterval } = window.QA_ADMIN_CHAT;

  if ( window.Notification && Notification.permission !== 'granted' ) {
    Notification.requestPermission();
  }

  // Poll messages in an open session
  function pollMessages(){
    const container = document.getElementById('qa-chat-messages');
    if ( ! container ) return;
    let lastCount = container.children.length;
    fetch(`${apiBase}/chat/messages?session_id=${sessionId}`)
      .then(r => r.json())
      .then(data => {
        const msgs = data.messages || [];
        if ( msgs.length > lastCount ) {
          msgs.slice(lastCount).forEach(m => {
            const p = document.createElement('p');
            const who = m.sender === 'user' ? 'Visitor' : 'Admin';
            const color = m.sender === 'user' ? '#000' : '#0052cc';
            p.innerHTML = `<strong style="color:${color}">${who}:</strong> ${m.message}
                           <em style="font-size:10px;color:#666;">${m.created_at}</em>`;
            container.appendChild(p);
            if ( m.sender === 'user' && Notification.permission === 'granted' ) {
              new Notification('New visitor message', { body: m.message });
            }
          });
          container.scrollTop = container.scrollHeight;
          lastCount = msgs.length;
        }
      });
  }

  // Poll sessions list
  function pollSessions(){
    const table = document.getElementById('qa-chat-sessions-table');
    if ( ! table ) return;
    const tbody = table.querySelector('tbody');
    fetch(`${apiBase}/chat/sessions`)
      .then(r => r.json())
      .then(data => {
        const sessions = data.sessions || [];
        let html = '';
        sessions.forEach(s => {
          html += `<tr>
                     <td>${s.id}${s.unread_count>0?` <span class="unread-badge">${s.unread_count}</span>`:''}</td>
                     <td>${s.last_message_time}</td>
                     <td><a href="admin.php?page=quiz_assist_chats&session_id=${s.id}">View</a></td>
                   </tr>`;
        });
        tbody.innerHTML = html;
      });
  }

  // Kick off
  if ( sessionId > 0 ) {
    pollMessages();
    setInterval(pollMessages, pollInterval);
  } else {
    pollSessions();
    setInterval(pollSessions, pollInterval);
  }

})();
