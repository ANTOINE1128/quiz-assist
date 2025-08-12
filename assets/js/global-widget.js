;(function(wp){
  const { createElement: h, useEffect, useState, useRef } = wp.element;
  const { render } = wp.element;

  const {
    apiBase,
    pollInterval,
    isUserLoggedIn,
    currentUserName,
    restNonce,
    globalActions,
    calendlyUrl
  } = window.QA_Assist_Global_SETTINGS || {};

  // Icons
  function IconHome(){return h('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},h('path',{d:'M12 3 3 10h2v10h5v-6h4v6h5V10h2L12 3z'}))}
  function IconChat(){return h('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},h('path',{d:'M2 4h20v12H6l-4 4V4zm4 4v2h12V8H6z'}))}
  function IconClose(){return h('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},h('path',{d:'M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.3 10.59 10.6 16.89 4.3z'}))}
  function IconUser(){return h('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},h('path',{d:'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z'}))}
  function IconCalendar(){return h('svg',{width:20,height:20,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},h('path',{d:'M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm12 6H5v12h14V8zM7 10h4v4H7v-4z'}))}
  function Chevron(){return h('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'currentColor','aria-hidden':'true'},h('path',{d:'M8.12 9.29 12 13.17l3.88-3.88 1.41 1.41L12 16l-5.29-5.29 1.41-1.42z'}))}

  /** Mini accordion (Resources) */
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
            h('span', { className: 'qa-acc-chevron', 'aria-hidden': 'true' }, h(Chevron, null))
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

  /** Calendly inline embed (stable, no flicker) */
  function CalendlyInline({ url }) {
    const ref = wp.element.useRef(null);

    useEffect(() => {
      if (!url || !ref.current) return;

      // Ensure script loaded once
      const SRC = 'https://assets.calendly.com/assets/external/widget.js';
      const already = document.querySelector(`script[src="${SRC}"]`);
      if (!already) {
        const s = document.createElement('script');
        s.src = SRC;
        s.async = true;
        s.onload = () => window.Calendly && window.Calendly.initInlineWidgets && window.Calendly.initInlineWidgets();
        document.head.appendChild(s);
      } else {
        // If script exists and Calendly is ready, init widgets in case of re-mount
        if (window.Calendly && window.Calendly.initInlineWidgets) {
          window.Calendly.initInlineWidgets();
        }
      }
    }, [url]);

    // Note: data-url is Calendly's recommended way
    return h('div', {
      ref,
      className: 'calendly-inline-widget',
      'data-url': url + (url.includes('?') ? '&' : '?') + 'hide_event_type_details=1&hide_landing_page_details=1',
      style: { minWidth: '320px', height: '520px' }
    });
  }

  function GlobalWidget(){
    const [isOpen,setIsOpen]=useState(false);
    const [tab,setTab]=useState('home'); // home|messages|profile|book
    const [started,setStarted]=useState(false);
    const [sessionId,setSessionId]=useState('');
    const [messages,setMessages]=useState([]);
    const [input,setInput]=useState('');
    const [faqs,setFaqs]=useState([]);
    const [error,setError]=useState('');
    const [loadingStart,setLoadingStart]=useState(false);

    // Guest profile (powers guest form too)
    const [gName,setGName]=useState('');
    const [gEmail,setGEmail]=useState('');
    const [gPhone,setGPhone]=useState('');
    const lastSentRef=useRef(0);

    const [profileSaving,setProfileSaving]=useState(false);
    const [profileMsg,setProfileMsg]=useState('');

    const quickReplies=(globalActions||[]).filter(a=>a&&a.label&&a.user).map(a=>({label:a.label,text:a.user}));

    const emailOk=(s)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s||'').trim());
    const phoneOk=(s)=>String(s||'').replace(/\D/g,'').length>=6;
    const canStart=isUserLoggedIn||(gName.trim()&&emailOk(gEmail)&&phoneOk(gPhone));

    const calUrl = (typeof calendlyUrl==='string' && /^https:\/\/(?:www\.)?calendly\.com\//i.test((calendlyUrl||'').trim()))
      ? calendlyUrl.trim() : '';

    // Load persisted session & meta
    useEffect(()=>{
      const sid=localStorage.getItem('qa_chat_session');
      const meta=JSON.parse(localStorage.getItem('qa_chat_session_meta')||'{}');
      if(meta && !isUserLoggedIn){
        if(meta.name) setGName(meta.name);
        if(meta.email) setGEmail(meta.email);
        if(meta.phone) setGPhone(meta.phone);
      }
      if(sid){ setSessionId(sid); setStarted(true); setIsOpen(true); setTab('messages'); }
    },[]);

    // Persist guest meta as they type
    useEffect(()=>{
      if(!isUserLoggedIn){
        localStorage.setItem('qa_chat_session_meta', JSON.stringify({name:gName,email:gEmail,phone:gPhone}));
      }
    },[gName,gEmail,gPhone]);

    // Fetch FAQs (users any time; guests after start)
    useEffect(()=>{
      const canSeeResources=isUserLoggedIn||started;
      if(!isOpen||!canSeeResources||faqs.length) return;
      fetch(`${apiBase}/chat/faqs`,{credentials:'same-origin',headers:{'Accept':'application/json'}})
        .then(r=>r.json())
        .then(d=>Array.isArray(d.faqs)?setFaqs(d.faqs.slice(0,50)):setFaqs([]))
        .catch(()=>setFaqs([]));
    },[isOpen,started]);

    // Poll messages
    useEffect(()=>{
      if(!started||!sessionId) return;
      let timer;
      const load=()=>{
        if(document.hidden) return;
        fetch(`${apiBase}/chat/messages?session_id=${encodeURIComponent(sessionId)}`,{
          method:'GET',credentials:'same-origin',headers:{'X-WP-Nonce':restNonce||'','Accept':'application/json'}
        })
          .then(r=>{if(!r.ok) throw new Error('no_session'); return r.json();})
          .then(d=>setMessages(Array.isArray(d.messages)?d.messages:[]))
          .catch(err=>{
            if(String(err.message)==='no_session'){
              localStorage.removeItem('qa_chat_session'); localStorage.removeItem('qa_chat_session_meta');
              setSessionId(''); setStarted(false); setTab('home'); setError('Your session expired. Please start a new chat.');
            }
          });
      };
      load();
      timer=setInterval(load,pollInterval||2000);
      const onVis=()=>{clearInterval(timer); if(!document.hidden){load(); timer=setInterval(load,pollInterval||2000);}};
      document.addEventListener('visibilitychange',onVis);
      return ()=>{clearInterval(timer); document.removeEventListener('visibilitychange',onVis);};
    },[started,sessionId]);

    function startChat(){
      setError('');
      if(started&&sessionId){ setTab('messages'); return; }
      if(!isUserLoggedIn && !canStart){
        if(!gName.trim()) return setError('Please enter your name.');
        if(!emailOk(gEmail)) return setError('Please enter a valid email (e.g., name@example.com).');
        if(!phoneOk(gPhone)) return setError('Please enter a valid phone number.');
      }
      setLoadingStart(true);
      const payload=isUserLoggedIn?{}:{guest_name:gName.trim(),guest_email:gEmail.trim(),guest_phone:gPhone.trim()};
      fetch(`${apiBase}/chat/start`,{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-WP-Nonce':restNonce||''},
        body:JSON.stringify(payload||{})
      })
        .then(async r=>{if(!r.ok){const j=await r.json().catch(()=>null);throw new Error(j?.message||'Could not start chat.');} return r.json();})
        .then(d=>{
          const sid=String(d.session_id||''); if(!sid) throw new Error('Could not start chat.');
          setSessionId(sid); setStarted(true); setTab('messages'); localStorage.setItem('qa_chat_session',sid);
          if(!isUserLoggedIn){ localStorage.setItem('qa_chat_session_meta',JSON.stringify({name:gName.trim(),email:gEmail.trim(),phone:gPhone.trim()})); }
          else{ localStorage.removeItem('qa_chat_session_meta'); }
        })
        .catch(e=>setError(e.message||'Could not start chat. Please try again.'))
        .finally(()=>setLoadingStart(false));
    }

    function goToBooking(){ if(!isUserLoggedIn) setTab('book'); }

    function sendMessageText(text){
      const now=Date.now(); if(now-(lastSentRef.current||0)<800) return; lastSentRef.current=now;
      const message=(text||input||'').trim(); if(!message) return;
      if(!sessionId){ setTab('home'); setError('Your session expired. Please start a new chat.'); return; }
      setMessages(prev=>[...prev,{sender:'user',message,created_at:new Date().toLocaleTimeString()}]); setInput('');
      fetch(`${apiBase}/chat/send`,{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-WP-Nonce':restNonce||''},
        body:JSON.stringify({session_id:sessionId,message})
      }).then(r=>{if(!r.ok) throw new Error('send_failed');})
        .catch(()=>{ setMessages(prev=>prev.filter(m=>!(m.sender==='user'&&m.message===message))); setError('Failed to send. Please try again.'); });
    }
    function sendMessage(){ sendMessageText(input); }

    function saveProfile(e){
      e&&e.preventDefault();
      setProfileMsg('');
      if(!gName.trim()||!emailOk(gEmail)||!phoneOk(gPhone)){ setProfileMsg('Please provide a valid name, email, and phone.'); return; }
      localStorage.setItem('qa_chat_session_meta', JSON.stringify({name:gName.trim(),email:gEmail.trim(),phone:gPhone.trim()}));
      setProfileMsg('Saved!');
    }

    const headerTitle =
      tab==='home'     ? `Hi ${isUserLoggedIn?currentUserName:(gName||'there')} 👋` :
      tab==='profile'  ? 'Profile' :
      tab==='book'     ? 'Book a demo' :
                         'Messages';

    const visitorTooltip = isUserLoggedIn ? '' : (gName&&gEmail&&gPhone) ? `Name: ${gName}\nEmail: ${gEmail}\nPhone: ${gPhone}` : '';
    const canSeeResources = isUserLoggedIn || started;

    const QuickReplies = () => {
      const disabled=!isUserLoggedIn && !started;
      if(!quickReplies.length) return null;
      return h('div',{className:'qa-card'},
        h('div',{className:'qa-section-title'},'Quick replies'),
        h('div',{className:'qa-quick'},
          quickReplies.map((q,i)=>h('button',{key:i,className:'qa-chip-btn'+(disabled?' disabled':''),onClick:()=>!disabled&&sendMessageText(q.text),title:disabled?'Start chat first':`Send: ${q.text}`},q.label))
        ),
        disabled && h('div',{className:'qa-note'},'Fill the form and start a chat to use quick replies.')
      );
    };

    const BookingPane = () => {
      if (isUserLoggedIn) return h('div',{className:'qa-card'}, h('div',{className:'qa-note'}, 'Booking is only available for guests.'));
      if (!calUrl)        return h('div',{className:'qa-card'}, h('div',{className:'qa-note'}, 'Booking link not configured yet.'));
      return h('div',{className:'qa-book'}, h(CalendlyInline,{url:calUrl}));
    };

    const HomePathways = () => (
      h('div', { className:'qa-home-stack' },
        h('div',{className:'qa-card qa-action'},
          h('div',{className:'qa-action-main'},
            h('div',{className:'qa-action-title'},'Fill the form then click Start Chat to speak with Professor Farhat'),
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

    return h('div',{className:'qa-floating'},
      h('button',{className:'qa-fab',onClick:()=>setIsOpen(o=>!o),'aria-label':isOpen?'Close chat':'Open chat'},h(IconChat,null)),

      isOpen && h('div',{className:'qa-panel'},
        h('div',{className:'qa-header'},
          h('div',{className:'qa-title'},headerTitle),
          h('button',{className:'qa-close',onClick:()=>setIsOpen(false),'aria-label':'Close'},h(IconClose,null))
        ),

        h('div',{className:'qa-body'},

          tab==='home' && h('div',{className:'qa-home'},
            h(HomePathways,null),

            // Guest form (hide after chat starts)
            (!isUserLoggedIn && !started) && h('div',{className:'qa-card qa-guest'},
              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_name'},'Your Name'),h('input',{id:'qa_g_name',type:'text',value:gName,onChange:e=>setGName(e.target.value),placeholder:'Jane Doe',required:true})),
              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_email'},'Your Email'),h('input',{id:'qa_g_email',type:'email',value:gEmail,onChange:e=>setGEmail(e.target.value),placeholder:'jane@example.com',required:true})),
              h('div',{className:'qa-field'},h('label',{htmlFor:'qa_g_phone'},'Phone'),h('input',{id:'qa_g_phone',type:'tel',value:gPhone,onChange:e=>setGPhone(e.target.value),placeholder:'(555) 555-5555',required:true})),
              !!error && h('div',{className:'qa-error'},error)
            ),

            h(QuickReplies,null),

            // Resources — mini accordion
            (canSeeResources) && h('div',{className:'qa-card'},
              h('div',{className:'qa-section-title'},'Resources for Getting Started'),
              (faqs.length ? h(MiniAccordion,{items:faqs}) : h('div',{className:'qa-empty'},'No FAQs found.'))
            )
          ),

          tab==='messages' && h('div',{className:'qa-chat'},
            h('div',{className:'qa-chat-messages'},
              messages.map((m,i)=>h('div',{key:i,className:'qa-msg '+(m.sender==='user'?'from-user':'from-admin'),title:m.sender==='user'?visitorTooltip:''},
                h('div',{className:'qa-msg-text'},m.message),
                h('div',{className:'qa-msg-time'},m.created_at)
              ))
            ),
            ((isUserLoggedIn||started)&&quickReplies.length) && h('div',{className:'qa-quick qa-quick-row'},
              quickReplies.map((q,i)=>h('button',{key:i,className:'qa-chip-btn',onClick:()=>sendMessageText(q.text),title:`Send: ${q.text}`},q.label))
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

          (tab==='book') && h(BookingPane,null)
        ),

        h('div',{className:'qa-nav'},
          h('button',{className:'qa-tab'+(tab==='home'?' active':''),onClick:()=>setTab('home')},h(IconHome,null),h('span',null,'Home')),
          h('button',{className:'qa-tab'+(tab==='messages'?' active':''),onClick:()=>setTab('messages'),disabled:!started},h(IconChat,null),h('span',null,'Messages')),
          (!isUserLoggedIn) && h('button',{className:'qa-tab'+(tab==='book'?' active':''),onClick:goToBooking},h(IconCalendar,null),h('span',null,'Book')),
          (!isUserLoggedIn) && h('button',{className:'qa-tab'+(tab==='profile'?' active':''),onClick:()=>setTab('profile')},h(IconUser,null),h('span',null,'Profile'))
        )
      )
    );
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const mount = document.getElementById('qa-global-root');
    if (mount) render(h(GlobalWidget), mount);
  });
})(window.wp);
