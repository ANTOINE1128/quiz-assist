;(function(wp){
  const { createElement: h, useEffect, useState, useRef } = wp.element;
  const { render } = wp.element;

  const {
    apiBase,
    pollInterval,
    isUserLoggedIn,
    currentUserName,
    restNonce
  } = window.QA_Assist_Global_SETTINGS || {};

  function IconHome() {
    return h('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},
      h('path',{d:'M12 3 3 10h2v10h5v-6h4v6h5V10h2L12 3z'}));
  }
  function IconChat() {
    return h('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},
      h('path',{d:'M2 4h20v12H6l-4 4V4zm4 4v2h12V8H6z'}));
  }
  function IconClose() {
    return h('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},
      h('path',{d:'M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.3 10.59 10.6 16.89 4.3z'}));
  }

  function FAQAccordion({ items }) {
    const [openId, setOpenId] = useState(null);
    return h('div', { className:'qa-faq-list' },
      items.map((f) => {
        const isOpen = openId === f.id;
        return h('div', { key:f.id, className:'qa-faq-item', style:{flexDirection:'column', alignItems:'stretch'} },
          h('button', {
            className: 'qa-faq-toggle',
            onClick: ()=> setOpenId(isOpen ? null : f.id),
            style:{
              display:'flex',justifyContent:'space-between',alignItems:'center',
              width:'100%',background:'transparent',border:0, padding:0, cursor:'pointer',
              fontWeight:600, textAlign:'left'
            },
            'aria-expanded': isOpen ? 'true' : 'false'
          },
            h('span', null, f.question),
            h('span', { className:'qa-faq-arrow' }, isOpen ? '▾' : '▸')
          ),
          isOpen && h('div', {
            className:'qa-faq-answer',
            style:{ marginTop:8, fontSize:13, color:'#374151' },
            dangerouslySetInnerHTML: { __html: f.answer }
          })
        );
      })
    );
  }

  function GlobalWidget(){
    const [isOpen, setIsOpen]       = useState(false);
    const [tab, setTab]             = useState('home'); // 'home' | 'messages'
    const [started, setStarted]     = useState(false);
    const [sessionId, setSessionId] = useState('');
    const [messages, setMessages]   = useState([]);
    const [input, setInput]         = useState('');
    const [faqs, setFaqs]           = useState([]);
    const [error, setError]         = useState('');
    const [loadingStart, setLoadingStart] = useState(false);

    // Guest form
    const [gName, setGName]   = useState('');
    const [gEmail, setGEmail] = useState('');
    const [gPhone, setGPhone] = useState('');
    const lastSentRef = useRef(0);

    const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'').trim());
    const phoneOk = (s) => String(s||'').replace(/\D/g,'').length >= 6;
    const canStart = isUserLoggedIn || (gName.trim() && emailOk(gEmail) && phoneOk(gPhone));

    // Persisted session
    useEffect(()=>{
      const sid = localStorage.getItem('qa_chat_session');
      const meta = JSON.parse(localStorage.getItem('qa_chat_session_meta') || '{}');
      if (sid) {
        setSessionId(sid);
        setStarted(true);
        setIsOpen(true);
        setTab('messages');
        if (!isUserLoggedIn) {
          setGName(meta.name || '');
          setGEmail(meta.email || '');
          setGPhone(meta.phone || '');
        }
      }
    },[]);

    // Load FAQs once opened
    useEffect(()=>{
      if (!isOpen || faqs.length) return;
      fetch(`${apiBase}/chat/faqs`, {
        credentials:'same-origin',
        headers:{ 'Accept':'application/json' }
      })
        .then(r=>r.json())
        .then(d=> Array.isArray(d.faqs) ? setFaqs(d.faqs.slice(0,50)) : setFaqs([]))
        .catch(()=> setFaqs([]));
    },[isOpen]);

    // Poll messages
    useEffect(()=>{
      if (!started || !sessionId) return;
      let timer;
      const load = () => {
        if (document.hidden) return;
        fetch(`${apiBase}/chat/messages?session_id=${encodeURIComponent(sessionId)}`, {
          method:'GET',
          credentials:'same-origin',
          headers:{ 'X-WP-Nonce': restNonce || '', 'Accept': 'application/json' }
        })
          .then(r=>{ if (!r.ok) throw new Error('no_session'); return r.json(); })
          .then(d => setMessages(Array.isArray(d.messages) ? d.messages : []))
          .catch(err=>{
            if (String(err.message) === 'no_session') {
              localStorage.removeItem('qa_chat_session');
              localStorage.removeItem('qa_chat_session_meta');
              setSessionId('');
              setStarted(false);
              setTab('home');
              setError('Your session expired. Please start a new chat.');
            }
          });
      };
      load();
      timer = setInterval(load, pollInterval || 2000);
      const onVis = () => {
        clearInterval(timer);
        if (!document.hidden) {
          load();
          timer = setInterval(load, pollInterval || 2000);
        }
      };
      document.addEventListener('visibilitychange', onVis);
      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVis);
      };
    },[started, sessionId]);

    function startChat() {
      setError('');
      if (started && sessionId) { setTab('messages'); return; }
      if (!isUserLoggedIn) {
        if (!canStart) {
          if (!gName.trim()) return setError('Please enter your name.');
          if (!emailOk(gEmail)) return setError('Please enter a valid email (e.g., name@example.com).');
          if (!phoneOk(gPhone)) return setError('Please enter a valid phone number.');
        }
      }
      setLoadingStart(true);
      const payload = isUserLoggedIn ? {} : {
        guest_name:  gName.trim(),
        guest_email: gEmail.trim(),
        guest_phone: gPhone.trim()
      };
      fetch(`${apiBase}/chat/start`, {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Content-Type':'application/json', 'X-WP-Nonce': restNonce || '' },
        body: JSON.stringify(payload || {})
      })
      .then(async r=>{
        if (!r.ok) {
          const j = await r.json().catch(()=>null);
          const msg = j?.message || 'Could not start chat.';
          throw new Error(msg);
        }
        return r.json();
      })
      .then(d=>{
        const sid = String(d.session_id || '');
        if (!sid) throw new Error('Could not start chat.');
        setSessionId(sid);
        setStarted(true);
        setTab('messages');
        localStorage.setItem('qa_chat_session', sid);
        if (!isUserLoggedIn) {
          localStorage.setItem('qa_chat_session_meta', JSON.stringify({
            name: gName.trim(),
            email: gEmail.trim(),
            phone: gPhone.trim()
          }));
        } else {
          localStorage.removeItem('qa_chat_session_meta');
        }
      })
      .catch(e=> setError(e.message || 'Could not start chat. Please try again.'))
      .finally(()=> setLoadingStart(false));
    }

    function sendMessage() {
      const now = Date.now();
      if (now - (lastSentRef.current||0) < 800) return;
      lastSentRef.current = now;

      const text = (input||'').trim();
      if (!text) return;

      if (!sessionId) {
        setTab('home');
        setError('Your session expired. Please start a new chat.');
        return;
      }

      setMessages(prev => [...prev, {
        sender:'user',
        message:text,
        created_at: new Date().toLocaleTimeString()
      }]);
      setInput('');

      fetch(`${apiBase}/chat/send`, {
        method:'POST',
        credentials:'same-origin',
        headers:{ 'Content-Type':'application/json', 'X-WP-Nonce': restNonce || '' },
        body: JSON.stringify({ session_id: sessionId, message: text })
      })
      .then(r=>{ if (!r.ok) throw new Error('send_failed'); })
      .catch(()=>{
        setMessages(prev => prev.filter(m => !(m.sender==='user' && m.message===text)));
        setError('Failed to send. Please try again.');
      });
    }

    const headerTitle = tab === 'home'
      ? `Hi ${isUserLoggedIn ? currentUserName : (gName || 'there')} 👋`
      : 'Messages';

    const visitorTooltip = isUserLoggedIn ? '' :
      (gName && gEmail && gPhone) ? `Name: ${gName}\nEmail: ${gEmail}\nPhone: ${gPhone}` : '';

    return h('div', { className:'qa-floating' },

      h('button', {
        className:'qa-fab',
        onClick:()=> setIsOpen(o=>!o),
        'aria-label': isOpen ? 'Close chat' : 'Open chat'
      }, h(IconChat,null)),

      isOpen && h('div', { className:'qa-panel' },

        h('div', { className:'qa-header' },
          h('div', { className:'qa-title' }, headerTitle),
          h('button', { className:'qa-close', onClick:()=>setIsOpen(false), 'aria-label':'Close' }, h(IconClose,null))
        ),

        h('div', { className:'qa-body' },

          tab==='home' && h('div', { className:'qa-home' },

            h('div', { className:'qa-card qa-action' },
              h('div', { className:'qa-action-main' },
                h('div', { className:'qa-action-title' }, 'Send us a message'),
                h('div', { className:'qa-action-sub' }, "We'll be back online on Monday")
              ),
              h('button', { className:'qa-action-go', onClick: startChat, disabled: loadingStart || (!isUserLoggedIn && !canStart) },
                loadingStart ? 'Starting…' : (started ? 'Go to Chat' : 'Start Chat')
              )
            ),

            (!isUserLoggedIn && !started) && h('div', { className:'qa-card qa-guest' },
              h('div', { className:'qa-field' },
                h('label', { htmlFor:'qa_g_name' }, 'Your Name'),
                h('input', { id:'qa_g_name', type:'text', value:gName, onChange:e=>setGName(e.target.value), placeholder:'Jane Doe', required:true })
              ),
              h('div', { className:'qa-field' },
                h('label', { htmlFor:'qa_g_email' }, 'Your Email'),
                h('input', { id:'qa_g_email', type:'email', value:gEmail, onChange:e=>setGEmail(e.target.value), placeholder:'jane@example.com', required:true })
              ),
              h('div', { className:'qa-field' },
                h('label', { htmlFor:'qa_g_phone' }, 'Phone'),
                h('input', { id:'qa_g_phone', type:'tel', value:gPhone, onChange:e=>setGPhone(e.target.value), placeholder:'(555) 555-5555', required:true })
              ),
              !!error && h('div', { className:'qa-error' }, error)
            ),

            (!isUserLoggedIn && started) && h('div', { className:'qa-card' },
              h('div', { className:'qa-section-title' }, 'Session active'),
              h('div', null, `You are chatting as ${gName || 'Guest'} (${gEmail || '—'})`)
            ),

            h('div', { className:'qa-card' },
              h('div', { className:'qa-section-title' }, 'Resources for Getting Started'),
              (faqs.length ? h(FAQAccordion, { items: faqs }) : h('div', { className:'qa-empty' }, 'No FAQs found.'))
            )
          ),

          tab==='messages' && h('div', { className:'qa-chat' },
            h('div', { className:'qa-chat-messages' },
              messages.map((m, i)=> h('div', {
                  key:i,
                  className: 'qa-msg ' + (m.sender==='user' ? 'from-user' : 'from-admin'),
                  title: m.sender==='user' ? visitorTooltip : ''
                },
                h('div', { className:'qa-msg-text' }, m.message),
                h('div', { className:'qa-msg-time' }, m.created_at)
              ))
            ),
            h('div', { className:'qa-chat-input' },
              h('input', {
                type:'text',
                value: input,
                placeholder:'Type a message…',
                onChange: e=>setInput(e.target.value),
                onKeyDown: e=> (e.key==='Enter' && sendMessage())
              }),
              h('button', { onClick: sendMessage }, 'Send')
            ),
            !!error && h('div', { className:'qa-error qa-chat-error' }, error)
          )
        ),

        h('div', { className:'qa-nav' },
          h('button', { className: 'qa-tab' + (tab==='home' ? ' active' : ''), onClick:()=>setTab('home') },
            h(IconHome,null), h('span', null, 'Home')
          ),
          h('button', { className: 'qa-tab' + (tab==='messages' ? ' active' : ''), onClick:()=> setTab('messages'), disabled: !started },
            h(IconChat,null), h('span', null, 'Messages')
          )
        )
      )
    );
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const mount = document.getElementById('qa-global-root');
    if (mount) render(h(GlobalWidget), mount);
  });

})(window.wp);
