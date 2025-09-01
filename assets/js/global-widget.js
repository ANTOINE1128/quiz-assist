;((wp) => {
  if (!wp || !wp.element) return;

  const { createElement: h, useEffect, useState, useRef } = wp.element;
  const { render } = wp.element;

  // -------- boot options --------
  const PAGE = window.QA_Assist_Global_SETTINGS || {};
  const BOOT = window.QA_Assist_BOOT || {};
  const CONFIG_URL = BOOT.configEndpoint || '/wp-json/quiz-assist/v1/public-config';
  const fabOffset = Number(BOOT.fabOffset) || 86;
  const panelLift  = Number(BOOT.panelLift)  || 70;

  async function fetchPublicConfigWithMerge() {
    const base = {
      apiBase: PAGE.apiBase || '/wp-json/quiz-assist/v1',
      isUserLoggedIn: !!PAGE.isUserLoggedIn,
      currentUserName: PAGE.currentUserName || '',
      restNonce: PAGE.restNonce || '',
      globalActions: Array.isArray(PAGE.globalActions) ? PAGE.globalActions : [],
      calendlyUrl: PAGE.calendlyUrl || '',
      publicHeader: PAGE.publicHeader || '',
      publicToken: PAGE.publicToken || '',
      sessionHeader: PAGE.sessionHeader || '',
      widgetEnabled: (typeof PAGE.widgetEnabled === 'boolean') ? PAGE.widgetEnabled : true,
      pollInterval: PAGE.pollInterval || 2000,
      enableQuickReplies: (typeof PAGE.enableQuickReplies === 'boolean') ? PAGE.enableQuickReplies : true,
    };

    try {
      const res = await fetch(CONFIG_URL, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const remote = await res.json();
      return {
        ...remote,
        apiBase: base.apiBase,
        isUserLoggedIn: base.isUserLoggedIn,
        currentUserName: base.currentUserName,
        restNonce: base.restNonce,
        sessionHeader: base.sessionHeader,
        pollInterval: base.pollInterval,
        enableQuickReplies: base.enableQuickReplies
      };
    } catch (_) {
      return base;
    }
  }

  // ---------- utils ----------
  const sk = (k) => `qa_gl_${k}`;
  function makeHeaders(extra = {}) {
    const h = Object.assign({ 'Accept': 'application/json' }, extra || {});
    const nonce = (PAGE && PAGE.restNonce) ? PAGE.restNonce : '';
    if (nonce) h['X-WP-Nonce'] = nonce;
    return h;
  }
  function keyFor(m) {
    return m.id ? `id-${m.id}` : (m._tempId ? `t-${m._tempId}` : `k-${(m.created_at || '')}-${(m.message || '').slice(0,16)}`);
  }
  function sameMsgList(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (x.sender !== y.sender) return false;
      if (x.message !== y.message) return false;
      if (x.created_at !== y.created_at) return false;
      if ((x.id ?? null) !== (y.id ?? null)) return false;
    }
    return true;
  }

  // ---------- icons ----------
  const sv = (props, d) => h('svg', Object.assign({fill:'currentColor','aria-hidden':'true'}, props), h('path',{d}));
  const IconHome     = () => sv({width:20,height:20,viewBox:'0 0 24 24'}, 'M12 3 3 10h2v10h5v-6h4v6h5V10h2L12 3z');
  const IconChat     = () => sv({width:24,height:24,viewBox:'0 0 24 24'}, 'M2 4h20v12H6l-4 4V4zm4 4v2h12V8H6z');
  // Stroke-based close icon (always visible on colored header)
  const IconClose    = () => h('svg',{width:20,height:20,viewBox:'0 0 24 24','aria-hidden':'true'},
                           h('path',{d:'M6 6l12 12M18 6 6 18', fill:'none', stroke:'currentColor', strokeWidth:2.25, strokeLinecap:'round'}));
  const IconCalendar = () => sv({width:20,height:20,viewBox:'0 0 24 24'}, 'M7 2v3H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2V2h-2v3H9V2H7zm0 7h10v9H7V9z');
  const IconChevron  = () => sv({width:18,height:18,viewBox:'0 0 24 24'}, 'M7 10l5 5 5-5');

  // ---------- main ----------
  function GlobalWidget({ cfg }) {
    const {
      apiBase,
      pollInterval,
      isUserLoggedIn,
      currentUserName,
      globalActions,
      calendlyUrl,
      widgetEnabled,
      enableQuickReplies
    } = cfg || {};

    // open/close + nav
    const [isOpen, setIsOpen] = useState(false);
    const [tab, setTab] = useState('home'); // home | messages | book

    // session
    const [sessionId, setSessionId] = useState(localStorage.getItem(sk('sid')) || '');
    const [started, setStarted] = useState(!!sessionId);

    // messages
    const [messages, setMessages] = useState([]);
    const [pending, setPending] = useState([]);
    const [isLoadingMsgs, setIsLoadingMsgs] = useState(false); // <<< NEW

    // FAQs
    const [faqs, setFaqs] = useState([]);
    const [faqOpen, setFaqOpen] = useState(null);

    // inputs
    const [input, setInput] = useState('');
    const [loadingStart, setLoadingStart] = useState(false);
    const [error, setError] = useState('');

    // guest profile
    const [gName, setGName] = useState('');
    const [gEmail, setGEmail] = useState('');
    const [gPhone, setGPhone] = useState('');
    const [gReason, setGReason] = useState('');
    const lastSentRef = useRef(0);

    // quick replies
    const quickReplies = (enableQuickReplies ? globalActions : [])
      .filter(a => a && a.label && a.user)
      .map(a => ({ label: a.label, text: a.user }));

    const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
    const phoneOk = (s) => String(s || '').replace(/\D/g, '').length >= 6;
    const canStart = isUserLoggedIn || (gName.trim() && emailOk(gEmail) && phoneOk(gPhone) && (gReason.trim().length >= 8));

    // ---- fetch FAQs once (when widget opens first time) ----
    useEffect(() => {
      if (!isOpen || faqs.length) return;
      fetch(`${apiBase}/chat/faqs`, { credentials:'same-origin', headers: makeHeaders() })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => setFaqs(Array.isArray(data?.faqs) ? data.faqs : []))
        .catch(()=>{});
    }, [isOpen]);

    // poll for messages (with visible loading overlay before first payload)
    useEffect(() => {
      let alive = true, timer = null, gotFirst = false;

      async function poll() {
        if (!alive || !sessionId) return;
        if (!gotFirst) setIsLoadingMsgs(true);
        try {
          const r = await fetch(`${apiBase}/chat/messages?session_id=${encodeURIComponent(sessionId)}`, {
            credentials:'same-origin', cache:'no-store', headers: makeHeaders()
          });
          if (!r.ok) throw new Error(String(r.status));
          const data = await r.json();
          const msgs = Array.isArray(data?.messages) ? data.messages : (Array.isArray(data) ? data : []);
          if (alive && Array.isArray(msgs) && !sameMsgList(messages, msgs)) {
            setMessages(msgs);
          }
          gotFirst = true;
        } catch (_) {
          // keep trying silently
        } finally {
          if (!alive) return;
          setIsLoadingMsgs(false);
          timer = setTimeout(poll, pollInterval || 2000);
        }
      }

      if (sessionId) poll();
      return () => { alive = false; if (timer) clearTimeout(timer); };
      // intentionally NOT depending on `messages` to avoid loopy re-renders
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, pollInterval, apiBase]);

    function goHome(){ setTab('home'); }
    function goMessages(){ setTab('messages'); }
    function goBooking(){ setTab('book'); }

    function restoreMetaIfAny(){
      try {
        const meta = JSON.parse(localStorage.getItem(sk('meta')) || '{}');
        if (!isUserLoggedIn && meta && (meta.name || meta.email || meta.phone)) {
          setGName(meta.name || ''); setGEmail(meta.email || ''); setGPhone(meta.phone || '');
        }
      } catch(_) {}
    }
    useEffect(()=>{ restoreMetaIfAny(); }, []);

    function startChat() {
      setError('');
      setLoadingStart(true);
      if (!isUserLoggedIn) {
        if (!gName.trim())        { setLoadingStart(false); return setError('Please enter your name.'); }
        if (!emailOk(gEmail))     { setLoadingStart(false); return setError('Please enter a valid email (e.g., name@example.com).'); }
        if (!phoneOk(gPhone))     { setLoadingStart(false); return setError('Please enter a valid phone number.'); }
        if (!gReason.trim() || gReason.trim().length < 8) { setLoadingStart(false); return setError('Please write a short first message about why you want to speak with Professor Farhat.'); }
      }
      const payload = isUserLoggedIn ? {} : { guest_name:gName.trim(), guest_email:gEmail.trim(), guest_phone:gPhone.trim() };

      fetch(`${apiBase}/chat/start`, {
        method:'POST', credentials:'same-origin',
        headers: makeHeaders({ 'Content-Type':'application/json' }),
        body: JSON.stringify(payload || {})
      })
        .then(async r => { if (!r.ok) { const j = await r.json().catch(()=>({})); throw new Error(j?.message || 'Could not start chat.'); } return r.json(); })
        .then(d => {
          const sid = String(d.session_id || '').trim();
          if (!sid) throw new Error('Could not start chat.');
          setSessionId(sid); setStarted(true); setTab('messages');
          localStorage.setItem(sk('sid'), sid);

          if (!isUserLoggedIn) {
            localStorage.setItem(sk('meta'), JSON.stringify({ name:gName.trim(), email:gEmail.trim(), phone:gPhone.trim() }));
            try {
              if (gReason && gReason.trim()) {
                const first = gReason.trim();
                setGReason('');
                setTab('messages');
                sendMessageText(first);
                setTimeout(() => {
                  setMessages(prev => prev.concat([{
                    sender: 'admin',
                    message: 'Thanks! Professor Farhat will reply to your message as soon as possible.',
                    created_at: new Date().toLocaleTimeString()
                  }]));
                }, 350);
              }
            } catch(e) {}
          } else {
            localStorage.removeItem(sk('meta'));
          }
        })
        .catch(e => setError(e.message || 'Could not start chat. Please try again.'))
        .finally(() => setLoadingStart(false));
    }

    function goToBooking(){ if (!isUserLoggedIn) setTab('book'); }

    function sendMessageText(text){
      const now = Date.now();
      if (now - (lastSentRef.current || 0) < 300) return;
      lastSentRef.current = now;

      const message = (text || input || '').trim(); if (!message) return;
      const sid = localStorage.getItem(sk('sid')) || sessionId;
      if (!sid){ setTab('home'); setError('Your session expired. Please start a new chat.'); return; }

      const temp = { _tempId: `${Date.now()}-${Math.random()}`, sender:'user', message, created_at: new Date().toLocaleTimeString() };
      setPending(prev => [...prev, temp]);
      setInput('');

      fetch(`${apiBase}/chat/send`, {
        method:'POST', credentials:'same-origin',
        headers: makeHeaders({ 'Content-Type':'application/json' }),
        body: JSON.stringify({ session_id: sid, message })
      })
        .then(r => {
          if (!r.ok) {
            if (r.status === 403) throw new Error('forbidden');
            throw new Error('send_failed');
          }
          setTimeout(()=>{ setPending(prev => prev.filter(p => p._tempId !== temp._tempId)); }, 350);
        })
        .catch(err=>{
          setPending(prev => prev.filter(p => p._tempId !== temp._tempId));
          if (String(err || '').includes('forbidden')) setError('Your session expired. Please start a new chat.');
          else setError('Message failed. Please try again.');
        });
    }

    // ----- pieces -----
    const IconChevronEl = h(IconChevron);
    const QuickReplies = () => (
      (isUserLoggedIn || started) && enableQuickReplies && !!quickReplies.length
        ? h('div',{className:'qa-quick qa-quick-row'},
            quickReplies.map((q,i)=>h('button',{className:'qa-chip-btn',key:q.label+'|'+i,onClick:()=>sendMessageText(q.text),title:`Send: ${q.text}`},q.label)))
        : null
    );

    const FaqAccordion = () => (
      faqs && faqs.length ? h('div',{className:'qa-acc'},
        faqs.map((f,idx)=>h('div',{className:'qa-acc-item'+(faqOpen===idx?' open':''), key:`faq-${idx}`},
          h('button',{className:'qa-acc-head', onClick:()=>setFaqOpen(faqOpen===idx?null:idx)},
            h('div',{className:'qa-acc-icon'},'?'),
            h('div',{className:'qa-acc-title'}, f.question || ''),
            h('div',{className:'qa-acc-chevron'}, IconChevronEl)
          ),
          (faqOpen===idx) && h('div',{className:'qa-acc-panel', dangerouslySetInnerHTML:{__html: f.answer || ''}})
        ))
      ) : h('div',{className:'qa-note'}, 'No FAQs yet.')
    );

    const StartChatCard = () => (
      h('div', null,
        h('div',{className:'qa-card qa-action'},
          h('div',{className:'qa-action-main'},
            h('div',{className:'qa-action-title'},'Click Start Chat to speak with Professor Farhat'),
            h('div',{className:'qa-action-sub'}, isUserLoggedIn ? 'You are logged in.' : '(Guests must complete the form first)')
          ),
          h('button',{className:'qa-action-go',onClick:startChat}, loadingStart?'Starting…':(started?'Go to Chat':'Start Chat'))
        ),
        !!error && h('div',{className:'qa-card qa-error', style:{marginTop:'8px'}}, error)
      )
    );

    const headerTitle = 'Chat • Farhat Lectures';
    const combined = messages.concat(pending);

    return h('div', { className:'qa-floating', style:{ right:'20px', bottom: `${fabOffset}px` }},

      h('button',{className:'qa-fab',onClick:()=>setIsOpen(o=>!o),'aria-label':isOpen?'Close chat':'Open chat'}, h(IconChat)),

      isOpen && h('div',{className:'qa-panel', style:{ right:'20px', bottom: `${fabOffset + panelLift}px` }},
        h('div',{className:'qa-header'},
          h('div',{className:'qa-title'},headerTitle),
          h('button',{className:'qa-close',onClick:()=>setIsOpen(false),'aria-label':'Close'},h(IconClose))
        ),

        h('div',{className:'qa-body'},

          tab==='home' && h('div',{className:'qa-home'},

            (!isUserLoggedIn && !started) && h('div',{className:'qa-card qa-guest'},
              h('div',{className:'qa-hint'}, 'Fill this short form to start a chat. We’ll notify Professor Farhat.'),
              h('ol',{className:'qa-steps'},
                h('li',null,'1) Your info'),
                h('li',null,'2) First message'),
                h('li',null,'3) Start chat')
              ),

              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_name'},'Full name'),h('input',{id:'qa_g_name',type:'text',value:gName,onChange:e=>setGName(e.target.value),placeholder:'Jane Doe',required:true})),
              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_email'},'Email'),h('input',{id:'qa_g_email',type:'email',value:gEmail,onChange:e=>setGEmail(e.target.value),placeholder:'jane@example.com',required:true})),
              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_phone'},'Phone'),h('input',{id:'qa_g_phone',type:'tel',value:gPhone,onChange:e=>setGPhone(e.target.value),placeholder:'(555) 555-5555',required:true})),

              h('div',{className:'qa-field'},
                h('label',{htmlFor:'qa_g_reason'},'Your first message'),
                h('textarea',{
                  id:'qa_g_reason', rows:3,
                  value:gReason,
                  onChange:e=>setGReason(e.target.value),
                  placeholder:'Why do you want to speak with Professor Farhat?',
                  required:true
                })
              )
            ),

            h(StartChatCard),

            h(QuickReplies),
            h('div',{className:'qa-card'},
              h('div',{className:'qa-section-title'},'Helpful resources'),
              h(FaqAccordion)
            )
          ),

          tab==='messages' && h('div',{className:'qa-chat'},
            (combined.length === 0) && h('div',{className:'qa-watermark','aria-hidden':'true'}, h(IconChat)),

            /* Loading overlay while first messages are fetched */
            (isLoadingMsgs && combined.length === 0) && h('div',{className:'qa-loading'},
              h('div',{className:'qa-spinner'}),
              h('div',{className:'qa-text'},'Loading chat… Please wait until the conversation is fully loaded.')
            ),

            h('div',{className:'qa-chat-messages'},
              combined.map((m)=>h('div',{key:keyFor(m),className:'qa-msg '+(m.sender==='user'?'from-user':'from-admin'),title:m.sender==='user'?'You':''},
                h('div',{className:'qa-msg-text'},m.message),
                h('div',{className:'qa-msg-time'},m.created_at),
                m._tempId ? h('div',{className:'qa-msg-sending'},'Sending…') : null
              ))
            ),

            ((isUserLoggedIn||started) && enableQuickReplies && !!quickReplies.length) && h('div',{className:'qa-quick qa-quick-row'},
              quickReplies.map((q,i)=>h('button',{className:'qa-chip-btn',key:q.label+'|'+i,onClick:()=>sendMessageText(q.text),title:`Send: ${q.text}`},q.label))
            ),
            h('div',{className:'qa-chat-input'},
              h('input',{type:'text',value:input,placeholder:'Type your message…',onChange:e=>setInput(e.target.value),onKeyDown:e=>{ if(e.key==='Enter') sendMessageText(); }}),
              h('button',{onClick:()=>sendMessageText()},'Send')
            ),
            !!error && h('div',{className:'qa-chat-error qa-error'}, error)
          ),

          (!isUserLoggedIn && tab==='book') && h('div',{className:'qa-book'},
            calendlyUrl ? h('iframe',{src:calendlyUrl, className:'calendly-inline-widget', title:'Book with Farhat Lectures'}) : h('div',{className:'qa-card'}, 'Booking is not configured yet.')
          )
        ),

        h('div',{className:'qa-nav'},
          h('button',{className:'qa-tab '+(tab==='home'?'active':''),onClick:goHome}, h(IconHome), h('span',null,'Home')),
          h('button',{className:'qa-tab '+(tab==='messages'?'active':''),onClick:goMessages}, h(IconChat), h('span',null,'Messages')),
          (!isUserLoggedIn) && h('button',{className:'qa-tab '+(tab==='book'?'active':''),onClick:goBooking}, h(IconCalendar), h('span',null,'Book'))
        )
      )
    );
  }

  function Boot() {
    const [cfg, setCfg] = useState(null);
    useEffect(() => { fetchPublicConfigWithMerge().then(setCfg); }, []);
    if (!cfg || cfg.widgetEnabled === false) return null;
    return h(GlobalWidget, { cfg });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const mount = document.getElementById('qa-global-root');
    if (mount) render(h(Boot), mount);
  });
})(window.wp);
