;((wp) => {
  if (!wp || !wp.element) return;

  const { createElement: h, useEffect, useState, useRef } = wp.element;
  const { render } = wp.element;

  // -------- boot options --------
  const PAGE = window.QA_Assist_Global_SETTINGS || {}; // localized from PHP (has real login state)
  const BOOT = window.QA_Assist_BOOT || {};
  const CONFIG_URL = BOOT.configEndpoint || '/wp-json/quiz-assist/v1/public-config';
  const fabOffset = Number(BOOT.fabOffset) || 86;   // lift the FAB up a bit
  const panelLift = Number(BOOT.panelLift)  || 70;  // panel sits above FAB

  async function fetchPublicConfigWithMerge() {
    // Start with PAGE (authoritative for auth-related fields).
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
    };

    // Try to fetch public config (cache-busting, quick replies, etc.)
    try {
      const headers = { Accept: 'application/json' };
      // If logged-in, send the REST nonce so WP can see the user in the REST request.
      if (base.isUserLoggedIn && base.restNonce) headers['X-WP-Nonce'] = base.restNonce;

      const res = await fetch(CONFIG_URL, { credentials: 'same-origin', headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const remote = await res.json();

      // Merge: NEVER let remote override auth-critical fields.
      return {
        // non-auth values from remote
        ...remote,
        // auth & critical values from base take precedence
        apiBase: base.apiBase || remote.apiBase || '/wp-json/quiz-assist/v1',
        isUserLoggedIn: base.isUserLoggedIn,
        currentUserName: base.currentUserName || remote.currentUserName || '',
        restNonce: base.isUserLoggedIn ? (base.restNonce || remote.restNonce || '') : '',
        // client buttons / calendly can come from either; prefer PAGE if present
        globalActions: base.globalActions.length ? base.globalActions : (remote.globalActions || []),
        calendlyUrl: base.calendlyUrl || remote.calendlyUrl || '',
        publicHeader: base.publicHeader || remote.publicHeader || '',
        publicToken: base.publicToken || remote.publicToken || '',
        sessionHeader: base.sessionHeader || remote.sessionHeader || '',
        widgetEnabled: (typeof remote.widgetEnabled === 'boolean') ? remote.widgetEnabled : base.widgetEnabled,
        pollInterval: base.pollInterval || remote.pollInterval || 2000,
      };
    } catch (e) {
      // Fall back to PAGE only (still fully functional)
      console.error('QA Assist: config fetch failed. Using PAGE settings.', e);
      return base;
    }
  }

  // ---------- helpers ----------
  function keyFor(m) {
    if (m && typeof m.id !== 'undefined' && m.id !== null) return 'id:' + String(m.id);
    if (m && m._tempId) return 'tmp:' + m._tempId;
    const s = (m?.sender||'') + '|' + (m?.created_at||'') + '|' +
              String(m?.message||'').length + '|' + String(m?.message||'').slice(0,20);
    return 'fx:' + s;
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
  const IconChat     = () => sv({width:20,height:20,viewBox:'0 0 24 24'}, 'M2 4h20v12H6l-4 4V4zm4 4v2h12V8H6z');
  const IconClose    = () => sv({width:16,height:16,viewBox:'0 0 24 24'}, 'M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.3 10.59 10.6 16.89 4.3z');
  const IconUser     = () => sv({width:20,height:20,viewBox:'0 0 24 24'}, 'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z');
  const IconCalendar = () => sv({width:20,height:20,viewBox:'0 0 24 24'}, 'M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm12 6H5v12h14V8zM7 10h4v4H7v-4z');
  const Chevron      = () => sv({width:18,height:18,viewBox:'0 0 24 24'}, 'M8.12 9.29 12 13.17l3.88-3.88 1.41 1.41L12 16l-5.29-5.29 1.41-1.42z');

  // ---------- mini accordion ----------
  function MiniAccordion({ items }) {
    const [openId, setOpenId] = useState(null);
    return h('div', { className: 'qa-acc' },
      items.map(f => {
        const isOpen = openId === f.id;
        return h('div', { key: f.id, className: 'qa-acc-item' + (isOpen ? ' open' : '') },
          h('button', {
            type: 'button',
            className: 'qa-acc-head',
            onClick: () => setOpenId(isOpen ? null : f.id),
            'aria-expanded': isOpen ? 'true' : 'false',
            'aria-controls': `qa-acc-panel-${f.id}`,
            id: `qa-acc-head-${f.id}`
          },
            h('span', { className: 'qa-acc-title' }, f.question),
            h('span', { className: 'qa-acc-chevron', 'aria-hidden': 'true' }, h(Chevron))
          ),
          isOpen && h('div', {
            id: `qa-acc-panel-${f.id}`,
            className: 'qa-acc-panel',
            role: 'region',
            'aria-labelledby': `qa-acc-head-${f.id}`,
            dangerouslySetInnerHTML: { __html: f.answer }
          })
        );
      })
    );
  }

  // ---------- Calendly inline ----------
  function CalendlyInline({ url, active }) {
    const ref = useRef(null);
    useEffect(() => {
      if (!url || !ref.current) return;
      const SRC = 'https://assets.calendly.com/assets/external/widget.js';
      const CSS = 'https://assets.calendly.com/assets/external/widget.css';

      if (!document.querySelector(`link[href="${CSS}"]`)) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = CSS;
        document.head.appendChild(l);
      }

      const ensureInit = () => {
        if (window.Calendly && window.Calendly.initInlineWidget && ref.current) {
          while (ref.current.firstChild) ref.current.removeChild(ref.current.firstChild);
          const u = url + (url.includes('?') ? '&' : '?') + 'hide_event_type_details=1&hide_landing_page_details=1';
          window.Calendly.initInlineWidget({ url: u, parentElement: ref.current, prefill: {}, utm: {} });
        }
      };

      let s = document.querySelector(`script[src="${SRC}"]`);
      if (!s) {
        s = document.createElement('script');
        s.src = SRC;
        s.async = true;
        s.onload = ensureInit;
        document.head.appendChild(s);
      } else {
        ensureInit();
      }
    }, [url, active]);

    return h('div', { ref, style: { minWidth: '320px', height: '520px', display: active ? 'block' : 'none' } });
  }

  // ------------------------------ Widget ------------------------------
  function GlobalWidget({ cfg }) {
    const {
      apiBase,
      pollInterval = 2000,
      isUserLoggedIn,
      currentUserName,
      restNonce,
      globalActions = [],
      calendlyUrl,
      publicHeader,
      publicToken,
      sessionHeader,
    } = cfg || {};

    // --- storage namespace: separate for guest vs logged-in ---
    const storagePrefix = isUserLoggedIn ? 'qa_u' : 'qa_g';
    const sk = (suffix) => `${storagePrefix}_${suffix}`;
    const clearSessionStorage = () => {
      localStorage.removeItem(sk('sid'));
      localStorage.removeItem(sk('meta'));
      localStorage.removeItem(sk('tok'));
    };

    function makeHeaders(extra, sessionToken) {
      const hh = Object.assign({ Accept: 'application/json' }, extra || {});
      if (isUserLoggedIn && restNonce) hh['X-WP-Nonce'] = restNonce;
      if (publicHeader && publicToken) hh[publicHeader] = publicToken;
      if (sessionHeader && sessionToken) hh[sessionHeader] = sessionToken;
      return hh;
    }

    const [isOpen, setIsOpen] = useState(false);
    const [tab, setTab] = useState('home'); // home|messages|profile|book
    const [started, setStarted] = useState(false);
    const [messages, setMessages] = useState([]);
    const messagesRef = useRef(messages);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    const [pending, setPending] = useState([]);
    const [input, setInput] = useState('');
    const [faqs, setFaqs] = useState([]);
    const [error, setError] = useState('');
    const [loadingStart, setLoadingStart] = useState(false);

    const [sessionToken, setSessionToken] = useState('');
    const [sessionId, setSessionId] = useState('');

    // guest profile
    const [gName, setGName] = useState('');
    const [gEmail, setGEmail] = useState('');
    const [gPhone, setGPhone] = useState('');
    const lastSentRef = useRef(0);

    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState('');

    const quickReplies = (globalActions || [])
      .filter(a => a && a.label && a.user)
      .map(a => ({ label: a.label, text: a.user }));

    const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
    const phoneOk = (s) => String(s || '').replace(/\D/g, '').length >= 6;
    const canStart = isUserLoggedIn || (gName.trim() && emailOk(gEmail) && phoneOk(gPhone));

    const calUrl =
      typeof calendlyUrl === 'string' &&
      /^https:\/\/(?:www\.)?calendly\.com\//i.test((calendlyUrl || '').trim())
        ? calendlyUrl.trim()
        : '';

    // load persisted session/meta (per-role)
    useEffect(() => {
      const sid = localStorage.getItem(sk('sid'));
      const meta = JSON.parse(localStorage.getItem(sk('meta')) || '{}');
      const tok  = localStorage.getItem(sk('tok'));
      if (meta && !isUserLoggedIn) {
        if (meta.name) setGName(meta.name);
        if (meta.email) setGEmail(meta.email);
        if (meta.phone) setGPhone(meta.phone);
      }
      if (sid) {
        setSessionId(sid);
        if (tok) setSessionToken(tok);
        setStarted(true);
        setIsOpen(true);
        setTab('messages');
      }
    }, [isUserLoggedIn]);

    // persist guest meta as they type (guest namespace only)
    useEffect(() => {
      if (!isUserLoggedIn) {
        localStorage.setItem(sk('meta'), JSON.stringify({ name: gName, email: gEmail, phone: gPhone }));
      }
    }, [gName, gEmail, gPhone, isUserLoggedIn]);

    // FAQs
    useEffect(() => {
      const canSeeResources = isUserLoggedIn || started;
      if (!isOpen || !canSeeResources || faqs.length) return;
      fetch(`${apiBase}/chat/faqs`, { credentials:'same-origin', headers: makeHeaders() })
        .then(r => r.json())
        .then(d => Array.isArray(d.faqs) ? setFaqs(d.faqs.slice(0,50)) : setFaqs([]))
        .catch(() => setFaqs([]));
    }, [isOpen, started, isUserLoggedIn, faqs.length, apiBase]);

    // poll messages
    useEffect(() => {
      if (!started || !sessionId) return;
      let timer;
      const load = () => {
        if (document.hidden) return;
        fetch(`${apiBase}/chat/messages?session_id=${encodeURIComponent(sessionId)}`, {
          method: 'GET',
          credentials: 'same-origin',
          headers: makeHeaders({}, sessionToken),
        })
          .then(r => {
            if (!r.ok) {
              if (r.status === 403) throw new Error('forbidden');
              throw new Error('no_session');
            }
            return r.json();
          })
          .then(d => {
            const serverMsgs = Array.isArray(d.messages) ? d.messages : [];
            if (!sameMsgList(messagesRef.current, serverMsgs)) setMessages(serverMsgs);
          })
          .catch(err => {
            if (err.message === 'forbidden' || err.message === 'no_session') {
              clearSessionStorage();
              setSessionId(''); setSessionToken('');
              setStarted(false); setTab('home');
              setError(err.message === 'forbidden'
                ? 'This chat session can’t be accessed from your current account.'
                : 'Your session expired. Please start a new chat.');
            }
          });
      };
      load();
      timer = setInterval(load, pollInterval || 2000);
      const onVis = () => { clearInterval(timer); if (!document.hidden) { load(); timer = setInterval(load, pollInterval || 2000); } };
      document.addEventListener('visibilitychange', onVis);
      return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
    }, [started, sessionId, sessionToken, apiBase, pollInterval]);

    function startChat() {
      setError('');
      if (started && sessionId) { setTab('messages'); return; }
      if (!isUserLoggedIn && !canStart) {
        if (!gName.trim())        return setError('Please enter your name.');
        if (!emailOk(gEmail))     return setError('Please enter a valid email (e.g., name@example.com).');
        if (!phoneOk(gPhone))     return setError('Please enter a valid phone number.');
      }
      setLoadingStart(true);
      const payload = isUserLoggedIn ? {} : { guest_name:gName.trim(), guest_email:gEmail.trim(), guest_phone:gPhone.trim() };
      fetch(`${apiBase}/chat/start`, {
        method:'POST', credentials:'same-origin',
        headers: makeHeaders({'Content-Type':'application/json'}),
        body: JSON.stringify(payload || {})
      })
        .then(async r => { if (!r.ok) { const j = await r.json().catch(()=>null); throw new Error(j?.message || 'Could not start chat.'); } return r.json(); })
        .then(d => {
          const sid = String(d.session_id || ''); if (!sid) throw new Error('Could not start chat.');
          const tok = d.session_token ? String(d.session_token) : '';
          setSessionId(sid); setStarted(true); setTab('messages');
          localStorage.setItem(sk('sid'), sid);
          if (tok) { setSessionToken(tok); localStorage.setItem(sk('tok'), tok); }
          else { localStorage.removeItem(sk('tok')); setSessionToken(''); }
          if (!isUserLoggedIn) {
            localStorage.setItem(sk('meta'), JSON.stringify({ name:gName.trim(), email:gEmail.trim(), phone:gPhone.trim() }));
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
      if (now - (lastSentRef.current || 0) < 400) return; // debounce
      lastSentRef.current = now;

      const message = (text || input || '').trim(); if (!message) return;
      if (!sessionId){ setTab('home'); setError('Your session expired. Please start a new chat.'); return; }

      const temp = { _tempId: `${Date.now()}-${Math.random()}`, sender:'user', message, created_at: new Date().toLocaleTimeString() };
      setPending(prev => [...prev, temp]);
      setInput('');

      fetch(`${apiBase}/chat/send`, {
        method:'POST', credentials:'same-origin',
        headers: makeHeaders({'Content-Type':'application/json'}, sessionToken),
        body: JSON.stringify({ session_id: sessionId, message })
      })
        .then(r => {
          if (!r.ok) {
            if (r.status === 403) throw new Error('forbidden');
            throw new Error('send_failed');
          }
          setTimeout(()=>{ setPending(prev => prev.filter(p => p._tempId !== temp._tempId)); }, 400);
        })
        .catch(err=>{
          setPending(prev => prev.filter(p => p._tempId !== temp._tempId));
          if (err.message === 'forbidden') {
            clearSessionStorage(); setSessionId(''); setSessionToken(''); setStarted(false); setTab('home');
            setError('This chat session can’t be accessed from your current account.');
          } else {
            setError('Failed to send. Please try again.');
          }
        });
    }
    const sendMessage = () => sendMessageText(input);

    function saveProfile(e){
      e && e.preventDefault();
      setProfileMsg('');
      if (!gName.trim() || !emailOk(gEmail) || !phoneOk(gPhone)) { setProfileMsg('Please provide a valid name, email, and phone.'); return; }
      localStorage.setItem(sk('meta'), JSON.stringify({ name:gName.trim(), email:gEmail.trim(), phone:gPhone.trim() }));
      setProfileMsg('Saved!');
    }

    const headerTitle =
      tab==='home'    ? `Hi ${isUserLoggedIn ? currentUserName : (gName || 'there')} 👋` :
      tab==='profile' ? 'Profile' :
      tab==='book'    ? 'Book a demo' :
                        'Messages';

    const visitorTooltip = isUserLoggedIn ? '' : (gName&&gEmail&&gPhone) ? `Name: ${gName}\nEmail: ${gEmail}\nPhone: ${gPhone}` : '';
    const canSeeResources = isUserLoggedIn || started;

    const QuickReplies = () => {
      const disabled = !isUserLoggedIn && !started;
      if (!quickReplies.length) return null;
      return h('div',{className:'qa-card'},
        h('div',{className:'qa-section-title'},'Quick replies'),
        h('div',{className:'qa-quick'},
          quickReplies.map((q,i)=>h('button',{
            key:q.label+'|'+i, className:'qa-chip-btn'+(disabled?' disabled':''), onClick:()=>!disabled&&sendMessageText(q.text),
            title: disabled ? 'Start chat first' : `Send: ${q.text}`
          }, q.label))
        ),
        disabled && h('div',{className:'qa-note'},'Fill the form and start a chat to use quick replies.')
      );
    };

    const BookingPane = ({ active }) => {
      const style = { display: active ? 'block' : 'none' };
      if (isUserLoggedIn) return h('div',{className:'qa-card',style}, h('div',{className:'qa-note'}, 'Booking is only available for guests.'));
      if (!calUrl)       return h('div',{className:'qa-card',style}, h('div',{className:'qa-note'}, 'Booking link not configured yet.'));
      return h('div',{className:'qa-book',style}, h(CalendlyInline, { url: calUrl, active }));
    };

    const HomePathways = () => (
      h('div', { className:'qa-home-stack' },
        h('div',{className:'qa-card qa-action'},
          h('div',{className:'qa-action-main'},
            h('div',{className:'qa-action-title'},'Click Start Chat to speak with Professor Farhat'),
            h('div',{className:'qa-action-sub'},'(Guests must complete the form first)')
          ),
          h('button',{className:'qa-action-go',onClick:startChat,disabled:loadingStart||(!isUserLoggedIn&&!canStart)}, loadingStart?'Starting…':(started?'Go to Chat':'Start Chat'))
        ),
        (!isUserLoggedIn) && h('div',{className:'qa-card qa-action'},
          h('div',{className:'qa-action-main'},
            h('div',{className:'qa-action-title'},'Book a demo'),
            h('div',{className:'qa-action-sub'},'Pick a time that suits you')
          ),
          h('button',{className:'qa-action-go',onClick:goToBooking}, 'Book now')
        )
      )
    );

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
            h(HomePathways),

            (!isUserLoggedIn && !started) && h('div',{className:'qa-card qa-guest'},
              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_name'},'Your Name'),h('input',{id:'qa_g_name',type:'text',value:gName,onChange:e=>setGName(e.target.value),placeholder:'Jane Doe',required:true})),
              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_email'},'Your Email'),h('input',{id:'qa_g_email',type:'email',value:gEmail,onChange:e=>setGEmail(e.target.value),placeholder:'jane@example.com',required:true})),
              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_phone'},'Phone'),h('input',{id:'qa_g_phone',type:'tel',value:gPhone,onChange:e=>setGPhone(e.target.value),placeholder:'(555) 555-5555',required:true})),
              !!error && h('div',{className:'qa-error'},error)
            ),

            h(QuickReplies),

            (canSeeResources) && h('div',{className:'qa-card'},
              h('div',{className:'qa-section-title'},'Resources for Getting Started'),
              (faqs.length ? h(MiniAccordion,{items:faqs}) : h('div',{className:'qa-empty'},'No FAQs found.'))
            )
          ),

          tab==='messages' && h('div',{className:'qa-chat'},
            (combined.length === 0) && h('div',{className:'qa-watermark','aria-hidden':'true'}, h(IconChat)),
            h('div',{className:'qa-chat-messages'},
              combined.map((m)=>h('div',{key:keyFor(m),className:'qa-msg '+(m.sender==='user'?'from-user':'from-admin'),title:m.sender==='user'?visitorTooltip:''},
                h('div',{className:'qa-msg-text'},m.message),
                h('div',{className:'qa-msg-time'},m.created_at),
                m._tempId ? h('div',{className:'qa-msg-sending'},'Sending…') : null
              ))
            ),
            ((isUserLoggedIn||started)&&quickReplies.length) && h('div',{className:'qa-quick qa-quick-row'},
              quickReplies.map((q,i)=>h('button',{key:q.label+'|'+i,className:'qa-chip-btn',onClick:()=>sendMessageText(q.text),title:`Send: ${q.text}`},q.label))
            ),
            h('div',{className:'qa-chat-input'},
              h('input',{type:'text',value:input,placeholder:'Type a message…',onChange:e=>setInput(e.target.value),onKeyDown:e=>(e.key==='Enter'&&sendMessage())}),
              h('button',{onClick:sendMessage},'Send')
            ),
            !!error && h('div',{className:'qa-error qa-chat-error'},error)
          ),

          (tab==='profile' && !isUserLoggedIn) && h('form',{className:'qa-card qa-profile',onSubmit:saveProfile},
            h('div',{className:'qa-section-title'},'Your profile'),
            h('div',{className:'qa-field'},h('label',{htmlFor:'qa_p_name'},'Name'),h('input',{id:'qa_p_name',type:'text',value:gName,onChange:e=>setGName(e.target.value),required:true})),
            h('div',{className:'qa-field'},h('label',{htmlFor:'qa_p_email'},'Email'),h('input',{id:'qa_p_email',type:'email',value:gEmail,onChange:e=>setGEmail(e.target.value),required:true})),
            h('div',{className:'qa-field'},h('label',{htmlFor:'qa_p_phone'},'Phone'),h('input',{id:'qa_p_phone',type:'tel',value:gPhone,onChange:e=>setGPhone(e.target.value),required:true})),
            h('div',{className:'qa-profile-actions'},h('button',{type:'submit',className:'qa-action-go',disabled:profileSaving},profileSaving?'Saving…':'Save')),
            !!profileMsg && h('div',{className:'qa-note'},profileMsg)
          ),

          h(BookingPane,{active: tab==='book'})
        ),

        h('div',{className:'qa-nav'},
          h('button',{className:'qa-tab'+(tab==='home'?' active':''),onClick:()=>setTab('home')},h(IconHome),h('span',null,'Home')),
          h('button',{className:'qa-tab'+(tab==='messages'?' active':''),onClick:()=>setTab('messages'),disabled:!started},h(IconChat),h('span',null,'Messages')),
          (!isUserLoggedIn) && h('button',{className:'qa-tab'+(tab==='book'?' active':''),onClick:goToBooking},h(IconCalendar),h('span',null,'Book')),
          (!isUserLoggedIn) && h('button',{className:'qa-tab'+(tab==='profile'?' active':''),onClick:()=>setTab('profile')},h(IconUser),h('span',null,'Profile'))
        )
      )
    );
  }

  // Boot: merge PAGE + /public-config, then render
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
