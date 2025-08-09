;(function(wp){
  const { createElement, useState, useEffect } = wp.element;
  const { render } = wp.element;
  const {
    apiBase,
    pollInterval,
    isUserLoggedIn,
    currentUserName,
    restNonce
  } = window.QA_Assist_Global_SETTINGS || {};

  function GlobalWidget() {
    const [open, setOpen]         = useState(false);
    const [started, setStarted]   = useState(false);
    const [sessionId, setSession] = useState('');
    const [messages, setMessages] = useState([]);
    const [input, setInput]       = useState('');
    const [guestName, setGuestName]   = useState('');
    const [guestEmail, setGuestEmail] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [lastSentAt, setLastSentAt] = useState(0);
    const [starting, setStarting]     = useState(false);
    const [error, setError]           = useState('');

    const authHeaders = () => {
      const h = { 'Content-Type':'application/json' };
      if (restNonce) h['X-WP-Nonce'] = restNonce;
      return h;
    };

    // Hydrate session from storage
    useEffect(() => {
      const s = localStorage.getItem('qa_chat_session');
      if (s) { setSession(s); setStarted(true); setOpen(true); }
    }, []);

    // Start session
    useEffect(() => {
      if (!open || !started || sessionId) return;
      (async () => {
        try {
          setStarting(true); setError('');
          const payload = {};
          if (!isUserLoggedIn) {
            payload.guest_name  = (guestName||'').trim();
            payload.guest_email = (guestEmail||'').trim();
            payload.guest_phone = (guestPhone||'').trim();
            if (!payload.guest_name || !payload.guest_email || !payload.guest_phone) {
              setError('Please fill your name, email and phone.');
              setStarting(false);
              setStarted(false);
              return;
            }
          }
          const res = await fetch(`${apiBase}/chat/start`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload || {})
          });
          if (!res.ok) {
            const j = await res.json().catch(()=>({}));
            setError(j && j.message ? j.message : 'Could not start chat. Please try again.');
            setStarting(false);
            setStarted(false);
            return;
          }
          const d = await res.json();
          if (d.session_id) {
            setSession(d.session_id);
            localStorage.setItem('qa_chat_session', d.session_id);
          } else {
            setError('Could not start chat. Please try again.');
            setStarting(false);
            setStarted(false);
          }
        } catch(e) {
          setError('Network error. Please try again.');
          setStarting(false);
          setStarted(false);
        } finally {
          setStarting(false);
        }
      })();
    }, [open, started, sessionId, guestName, guestEmail, guestPhone]);

    // Poll messages; if server says no_session, reset widget
    useEffect(() => {
      if (!open || !started || !sessionId) return;
      let iv;
      const resetToPrechat = () => {
        localStorage.removeItem('qa_chat_session');
        setSession('');
        setStarted(false);
        setMessages([]);
      };
      const load = async () => {
        try {
          if (document.hidden) return;
          const r = await fetch(`${apiBase}/chat/messages?session_id=${sessionId}`, {
            headers: restNonce ? { 'X-WP-Nonce': restNonce } : {}
          });
          if (!r.ok) {
            let j = {};
            try { j = await r.json(); } catch(_){}
            if (j && j.code === 'no_session') resetToPrechat();
            return;
          }
          const d = await r.json();
          setMessages(d.messages || []);
        } catch(e) { /* ignore */ }
      };
      load();
      iv = setInterval(load, pollInterval);
      const onVis = () => {
        clearInterval(iv);
        if (!document.hidden) {
          load();
          iv = setInterval(load, pollInterval);
        }
      };
      document.addEventListener('visibilitychange', onVis);
      return () => {
        clearInterval(iv);
        document.removeEventListener('visibilitychange', onVis);
      };
    }, [open, started, sessionId]);

    const sendMessage = async () => {
      const now = Date.now();
      if (!input.trim() || !sessionId || now - lastSentAt < 800) return;
      setLastSentAt(now);
      const txt = input.trim();
      setMessages(m => [...m, { sender:'user', message:txt, created_at:new Date().toLocaleTimeString() }]);
      setInput('');
      try {
        const r = await fetch(`${apiBase}/chat/send`, {
          method:'POST',
          headers: authHeaders(),
          body: JSON.stringify({ session_id: sessionId, message: txt })
        });
        if (!r.ok) {
          let j = {};
          try { j = await r.json(); } catch(_){}
          if (j && j.code === 'no_session') {
            localStorage.removeItem('qa_chat_session');
            setSession(''); setStarted(false); setMessages([]);
          }
        }
      } catch(e) {}
    };

    const beginChat = () => {
      setError('');
      if (isUserLoggedIn) {
        setStarted(true); setOpen(true);
      } else {
        if (guestName && guestEmail && guestPhone) setStarted(true);
        else setError('Please fill your name, email and phone.');
      }
    };

    const lastIsUser = messages.length && messages[messages.length-1].sender === 'user';

    return createElement('div',{className:'qa-global'},
      createElement('button',{className:'qa-chat-toggle',onClick:()=>setOpen(o=>!o)},
        open ? '×' : 'Chat with us'
      ),

      // Modal (pre-chat)
      open && !started && createElement('div',{className:'qa-modal'},
        createElement('div',{className:'qa-modal-content'},
          createElement('h2',null,'Welcome ' + (isUserLoggedIn ? (currentUserName || 'User') : 'Guest')),
          !isUserLoggedIn && createElement('div',{className:'qa-guest-form'},
            createElement('input',{type:'text',placeholder:'Your Name',value:guestName,onChange:e=>setGuestName(e.target.value)}),
            createElement('input',{type:'email',placeholder:'Your Email',value:guestEmail,onChange:e=>setGuestEmail(e.target.value)}),
            createElement('input',{type:'tel',placeholder:'Phone',value:guestPhone,onChange:e=>setGuestPhone(e.target.value)})
          ),
          error && createElement('div',{style:{color:'#b91c1c',marginTop:8,fontSize:13}}, error),
          createElement('button',{className:'qa-start-btn',onClick:beginChat, disabled:starting},
            starting ? 'Starting…' : 'Start Chat'
          )
        )
      ),

      // Chat UI
      open && started && createElement('div',{className:'qa-chat-box'},
        createElement('div',{className:'qa-chat-header'},'Chat with Support'),
        createElement('div',{className:'qa-chat-messages'},
          messages.map((m,i)=> createElement('div',{key:i,className:`qa-chat-message ${m.sender}`},
            m.message,
            createElement('div',{className:'qa-chat-timestamp'}, m.created_at)
          )),
          lastIsUser && createElement('div',{className:'qa-chat-waiting'}, 'Waiting for reply…')
        ),
        createElement('div',{className:'qa-chat-input'},
          createElement('input',{
            type:'text',placeholder:'Type a message…',value:input,
            onChange:e=>setInput(e.target.value),
            onKeyDown:e=>e.key==='Enter'&&sendMessage()
          }),
          createElement('button',{onClick:sendMessage},'Send')
        )
      )
    );
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const root = document.getElementById('qa-global-root');
    if(root) render(createElement(GlobalWidget), root);
  });
})(window.wp);
