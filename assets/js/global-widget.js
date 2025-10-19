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
  const isValidSid = (s) => typeof s === 'string' && /^\d+$/.test(s) && s !== '0';

  function sanitizeStoredSid() {
    const raw = localStorage.getItem(sk('sid'));
    if (!isValidSid(String(raw || ''))) {
      localStorage.removeItem(sk('sid'));
      return '';
    }
    return String(raw);
  }

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
  const countAdmins = (msgs) => (msgs || []).reduce((n,m)=>n + (m && m.sender==='admin' ? 1 : 0), 0);

  // ---------- icons ----------
  const sv = (props, d) => h('svg', Object.assign({fill:'currentColor','aria-hidden':'true'}, props), h('path',{d}));
  const IconHome     = () => sv({width:20,height:20,viewBox:'0 0 24 24'}, 'M12 3 3 10h2v10h5v-6h4v6h5V10h2L12 3z');
  const IconChat     = () => sv({width:24,height:24,viewBox:'0 0 24 24'}, 'M2 4h20v12H6l-4 4V4zm4 4v2h12V8H6z');
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
      globalActions,
      calendlyUrl,
      widgetEnabled,
      enableQuickReplies
    } = cfg || {};

    // open/close + nav
    const [isOpen, setIsOpen] = useState(false);
    const [tab, setTab] = useState('home'); // home | messages | book

    // session
    const initialSid = sanitizeStoredSid();
    const [sessionId, setSessionId] = useState(initialSid);
    const [started, setStarted] = useState(isValidSid(initialSid));

    // messages
    const [messages, setMessages] = useState([]);
    const [pending, setPending] = useState([]);
    const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);

    // synthetic admin quick-reply bubbles (persist per session until a *new* real admin reply arrives)
    const [synAdminTips, setSynAdminTips] = useState([]);
    useEffect(() => {
      try {
        if (sessionId) {
          const raw = localStorage.getItem(sk(`syn_${sessionId}`));
          setSynAdminTips(raw ? JSON.parse(raw) : []);
        } else {
          setSynAdminTips([]);
        }
      } catch(_) { setSynAdminTips([]); }
    }, [sessionId]);

    // persist / clean storage
    useEffect(() => {
      try {
        if (!sessionId) return;
        if (synAdminTips.length) {
          localStorage.setItem(sk(`syn_${sessionId}`), JSON.stringify(synAdminTips));
        } else {
          localStorage.removeItem(sk(`syn_${sessionId}`));
        }
      } catch(_) {}
    }, [synAdminTips, sessionId]);

    // CLEAR synthetic tips only when a NEW admin message arrives after they were added
    useEffect(() => {
      const currentAdminCount = countAdmins(messages);
      setSynAdminTips(prev => prev.filter(t => {
        const base = (typeof t.adminCountAtCreate === 'number') ? t.adminCountAtCreate : 0;
        return currentAdminCount <= base;
      }));
    }, [messages]);

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
      .filter(a => a && a.label && (a.user || a.text))
      .map(a => ({ label: a.label, text: a.user || a.text }));

    const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
    const phoneOk = (s) => String(s || '').replace(/\D/g, '').length >= 6;

    // ---- helpers for session ----
    function readGuestMeta(){
      try { return JSON.parse(localStorage.getItem(sk('meta')) || '{}'); }
      catch(_) { return {}; }
    }
    async function autoStartNewSession(){
      try {
        const payload = isUserLoggedIn
          ? {}
          : (() => {
              const meta = readGuestMeta();
              const name  = String(meta.name  || '').trim();
              const email = String(meta.email || '').trim();
              const phone = String(meta.phone || '').trim();
              if (!name || !email || !phone) return null;
              return { guest_name:name, guest_email:email, guest_phone:phone };
            })();

        if (!isUserLoggedIn && !payload) return null;

        const r = await fetch(`${apiBase}/chat/start`, {
          method:'POST', credentials:'same-origin',
          headers: makeHeaders({ 'Content-Type':'application/json' }),
          body: JSON.stringify(payload || {})
        });
        if (!r.ok) return null;
        const d = await r.json().catch(()=>null);
        const sid = d && String(d.session_id || '').trim();
        if (!isValidSid(sid)) return null;

        setSessionId(sid);
        setStarted(true);
        localStorage.setItem(sk('sid'), sid);
        setSynAdminTips([]);
        setError('');
        return sid;
      } catch(_) {
        return null;
      }
    }
    function clearToHome(msg){
      localStorage.removeItem(sk('sid'));
      if (sessionId) localStorage.removeItem(sk(`syn_${sessionId}`));
      setSessionId(''); setStarted(false); setSynAdminTips([]);
      setTab('home');
      setError(msg || 'This chat was closed. Please start a new chat.');
    }

    // ---- fetch FAQs once ----
    useEffect(() => {
      if (!isOpen || faqs.length) return;
      fetch(`${apiBase}/chat/faqs`, { credentials:'same-origin', headers: makeHeaders() })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => setFaqs(Array.isArray(data?.faqs) ? data.faqs : []))
        .catch(()=>{});
    }, [isOpen]);

    // poll for messages
    useEffect(() => {
      let alive = true, timer = null, gotFirst = false;

      async function poll() {
        if (!alive) return;
        if (!isValidSid(sessionId)) { setIsLoadingMsgs(false); return; }
        if (!gotFirst) setIsLoadingMsgs(true);
        try {
          const r = await fetch(`${apiBase}/chat/messages?session_id=${encodeURIComponent(sessionId)}`, {
            credentials:'same-origin', cache:'no-store', headers: makeHeaders()
          });

          // Do NOT auto-create a new session during background polling.
          // If the session is invalid or deleted, clear it and show the Home screen.
          if (r.status === 400) { clearToHome('Your chat session is invalid. Please start a new chat.'); return; }
          if (r.status === 403) { clearToHome('Your session expired. Please start a new chat.'); return; }
          if (r.status === 410) { clearToHome('This chat was closed. Please start a new chat.'); return; }

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, pollInterval, apiBase]);

    // -------- nav helpers --------
    function goHome(){ setError(''); setTab('home'); }
    function goMessages(){ setError(''); setTab('messages'); }
    function goBooking(){ setError(''); setTab('book'); }

    function restoreMetaIfAny(){
      try {
        const meta = JSON.parse(localStorage.getItem(sk('meta')) || '{}');
        if (!isUserLoggedIn && meta && (meta.name || meta.email || meta.phone)) {
          setGName(meta.name || ''); setGEmail(meta.email || ''); setGPhone(meta.phone || '');
        }
      } catch(_) {}
    }
    useEffect(()=>{ restoreMetaIfAny(); }, []);

    // Primary CTA
    function primaryAction() {
      setError('');
      if (started && isValidSid(sessionId)) { setTab('messages'); return; }
      startChat();
    }

    function startChat() {
      setError('');
      setLoadingStart(true);
      if (!isUserLoggedIn) {
        if (!gName.trim())        { setLoadingStart(false); return setError('Please enter your name.'); }
        if (!emailOk(gEmail))     { setLoadingStart(false); return setError('Please enter a valid email (e.g., name@example.com).'); }
        if (!String(gPhone || '').replace(/\D/g, '').length) { setLoadingStart(false); return setError('Please enter a valid phone number.'); }
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
          if (!isValidSid(sid)) throw new Error('Could not start chat.');
          setSessionId(sid); setStarted(true); setTab('messages');
          localStorage.setItem(sk('sid'), sid);
          setError('');
          if (!isUserLoggedIn) {
            localStorage.setItem(sk('meta'), JSON.stringify({ name:gName.trim(), email:gEmail.trim(), phone:gPhone.trim() }));
            try {
              if (gReason && gReason.trim()) {
                const first = gReason.trim();
                setGReason('');
                setTab('messages');
                sendMessageText(first);
              }
            } catch(e) {}
          } else {
            localStorage.removeItem(sk('meta'));
          }
        })
        .catch(e => setError(e.message || 'Could not start chat. Please try again.'))
        .finally(() => setLoadingStart(false));
    }

    function sendMessageText(text){
      const now = Date.now();
      if (now - (lastSentRef.current || 0) < 300) return;
      lastSentRef.current = now;

      const message = (text || input || '').trim(); if (!message) return;
      let sid = localStorage.getItem(sk('sid')) || sessionId;

      // If sid invalid or deleted, create fresh session *now* (on send), not during polling.
      const doWithValidSid = async () => {
        if (!isValidSid(String(sid || ''))) {
          const ns = await autoStartNewSession();
          if (!ns) throw new Error('forbidden');
          sid = ns;
        }
        return sid;
      };

      setError('');
      const temp = { _tempId: `${Date.now()}-${Math.random()}`, sender:'user', message, created_at: new Date().toLocaleTimeString() };
      setPending(prev => [...prev, temp]);
      setInput('');

      const doSend = (sessionToUse) => fetch(`${apiBase}/chat/send`, {
        method:'POST', credentials:'same-origin',
        headers: makeHeaders({ 'Content-Type':'application/json' }),
        body: JSON.stringify({ session_id: sessionToUse, message })
      });

      (async () => {
        const validSid = await doWithValidSid();
        let r = await doSend(validSid);

        // Handle 400/410 by auto-recreate once, then retry (only when user is sending)
        if (r.status === 400 || r.status === 410) {
          const ns = await autoStartNewSession();
          if (!ns) throw new Error('recreate_failed');
          r = await doSend(ns);
        }

        if (!r.ok) throw new Error('send_failed');

        setTimeout(()=>{ setPending(prev => prev.filter(p => p._tempId !== temp._tempId)); }, 350);
      })().catch(err=>{
        setPending(prev => prev.filter(p => p._tempId !== temp._tempId));
        const msg = String(err || '');
        if (msg.includes('forbidden')) setError('Your session expired. Please start a new chat.');
        else if (msg.includes('recreate_failed')) clearToHome('This chat was closed. Please start a new chat.');
        else setError('Message failed. Please try again.');
      });
    }

    // --- Quick Replies behave as admin answers (synthetic, no backend write) ---
    function handleQuickReplyAsAdmin(text){
      if (!text) return;
      setTab('messages');

      const now = Date.now();
      setSynAdminTips(prev => {
        const recent = prev.filter(t => now - (t.time || 0) < 2000 && t.message === text);
        if (recent.length) return prev;
        const tip = {
          _id: `syn-${now}-${Math.random()}`,
          sender:'admin',
          message:text,
          time: now,
          adminCountAtCreate: countAdmins(messages)
        };
        return [...prev, tip];
      });
    }

    // ----- UI pieces -----
    const FaqAccordion = () => (
      faqs && faqs.length ? h('div',{className:'qa-acc'},
        faqs.map((f,idx)=>h('div',{className:'qa-acc-item'+(faqOpen===idx?' open':''), key:`faq-${idx}`},
          h('button',{className:'qa-acc-head', onClick:()=>{ setError(''); setFaqOpen(faqOpen===idx?null:idx); }},
            h('div',{className:'qa-acc-icon'},'?'),
            h('div',{className:'qa-acc-title'}, f.question || ''),
            h('div',{className:'qa-acc-chevron'}, h(IconChevron))
          ),
          (faqOpen===idx) && h('div',{className:'qa-acc-panel', dangerouslySetInnerHTML:{__html: f.answer || ''}})
        ))
      ) : h('div',{className:'qa-note'}, 'No FAQs yet.')
    );

    const StartChatCard = () => {
      const hasSession = isValidSid(sessionId) && started;

      const buttonEl = h('button', {
        className: 'qa-action-go',
        onClick: primaryAction
      }, loadingStart ? 'Starting…' : (hasSession ? 'Go to Chat' : 'Start Chat'));

      if (hasSession) {
        return h('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }
        }, h('div', { className: 'qa-card qa-action' }, buttonEl));
      }

      return h('div', null,
        h('div',{className:'qa-card qa-action'},
          h('div',{className:'qa-action-main'},
            h('div',{className:'qa-action-title'}, 'Start a conversation with Professor Farhat'),
            h('div',{className:'qa-action-sub'}, isUserLoggedIn ? 'You are logged in.' : '(Guests must complete the form first)')
          ),
          buttonEl
        ),
        !!error && h('div',{className:'qa-card qa-error', style:{marginTop:'8px'}}, error)
      );
    };

    // Courtesy message for guests (persists until first real admin reply)
    function CourtesyBubble() {
      if (isUserLoggedIn) return null;
      if (!started) return null;
      const adminCount = countAdmins(messages);
      const hasUserMsg  = (messages || []).some(m => m.sender === 'user') || (pending || []).some(m => m.sender === 'user');
      if (adminCount > 0 || !hasUserMsg) return null;

      const msg = 'Thanks! Professor Farhat will reply soon. You can also WhatsApp or call him at +1 (484) 894-1008';
      return h('div',{className:'qa-msg from-admin qa-msg-courtesy'},
        h('div',{className:'qa-msg-text'}, msg)
      );
    }

    const headerTitle = 'Chat • Farhat Lectures';
    const combined = messages.concat(pending);

    return h('div', { className:'qa-floating', style:{ right:'20px', bottom: `${fabOffset}px` }},

      h('button',{
        className:'qa-fab',
        onClick:()=>setIsOpen(o=>{
          const next = !o;
          if (next) setError('');
          return next;
        }),
        'aria-label':isOpen?'Close chat':'Open chat'
      }, h(IconChat)),

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

              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_name'},'Full name'),h('input',{id:'qa_g_name',type:'text',value:gName,onChange:e=>{ setError(''); setGName(e.target.value); },placeholder:'Jane Doe',required:true})),
              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_email'},'Email'),h('input',{id:'qa_g_email',type:'email',value:gEmail,onChange:e=>{ setError(''); setGEmail(e.target.value); },placeholder:'jane@example.com',required:true})),
              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_phone'},'Phone'),h('input',{id:'qa_g_phone',type:'tel',value:gPhone,onChange:e=>{ setError(''); setGPhone(e.target.value); },placeholder:'(555) 555-5555',required:true})),

              h('div',{className:'qa-field'},
                h('label',{htmlFor:'qa_g_reason'},'Your first message'),
                h('textarea',{ id:'qa_g_reason', rows:3, value:gReason,
                  onChange:e=>{ setError(''); setGReason(e.target.value); },
                  placeholder:'Why do you want to speak with Professor Farhat?', required:true })
              )
            ),

            h(StartChatCard),

            h('div',{className:'qa-card'},
              h('div',{className:'qa-section-title'},'Helpful resources'),
              h(FaqAccordion)
            )
          ),

          tab==='messages' && h('div',{className:'qa-chat'},
            (combined.length === 0) && h('div',{className:'qa-watermark','aria-hidden':'true'}, h(IconChat)),

            (isLoadingMsgs && combined.length === 0) && h('div',{className:'qa-loading'},
              h('div',{className:'qa-spinner'}),
              h('div',{className:'qa-text'},'Loading chat… Please wait until the conversation is fully loaded.')
            ),

            h('div',{className:'qa-chat-messages'},
              combined.map((m)=>h('div',{key:keyFor(m),className:'qa-msg '+(m.sender==='user'?'from-user':'from-admin'),title:m.sender==='user'?'You':''},
                h('div',{className:'qa-msg-text'},m.message),
                h('div',{className:'qa-msg-time'},m.created_at),
                m._tempId ? h('div',{className:'qa-msg-sending'},'Sending…') : null
              )),
              synAdminTips.map(t => h('div',{key:t._id,className:'qa-msg from-admin'},
                h('div',{className:'qa-msg-text'},t.message)
              )),
              h(CourtesyBubble)
            ),

            ((isUserLoggedIn||started) && enableQuickReplies && !!quickReplies.length) && h('div',{className:'qa-quick qa-quick-row'},
              quickReplies.map((q,i)=>h('button',{className:'qa-chip-btn',key:q.label+'|'+i,onClick:()=>handleQuickReplyAsAdmin(q.text),title:`Reply: ${q.text}`},q.label))
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
