// assets/js/global-widget.js
;(function(wp){
  const { createElement, useState, useEffect } = wp.element;
  const { render } = wp.element;
  const { apiBase, pollInterval } = window.QA_Assist_Global_SETTINGS;

  function GlobalWidget() {
    const [open, setOpen]         = useState(false);
    const [started, setStarted]   = useState(false);
    const [sessionId, setSession] = useState('');
    const [messages, setMessages] = useState([]);
    const [input, setInput]       = useState('');
    const [lastSentAt, setLastSentAt] = useState(0);

    // Hydrate session from localStorage on mount
    useEffect(() => {
      const saved = localStorage.getItem('qa_chat_session');
      if (saved) {
        setSession(saved);
        setStarted(true);
        setOpen(true);
      }
    }, []);

    // Kick off a new session once user opens & starts
    useEffect(() => {
      if (open && started && !sessionId) {
        fetch(`${apiBase}/chat/start`, { method: 'POST' })
          .then(r => r.json())
          .then(d => {
            if ( d.session_id ) {
              setSession(d.session_id);
              localStorage.setItem('qa_chat_session', d.session_id);
            }
          })
          .catch(console.error);
      }
    }, [open, started, sessionId]);

    // Poll for new messages only when open & session exists
    useEffect(() => {
      if (!open || !started || !sessionId) return;

      let iv;
      const load = () => {
        // if tab hidden, skip
        if (document.hidden) return;
        fetch(`${apiBase}/chat/messages?session_id=${sessionId}`)
          .then(r => r.ok ? r.json() : Promise.reject(r.status))
          .then(data => setMessages(data.messages || []))
          .catch(console.error);
      };

      // start polling
      load();
      iv = setInterval(load, pollInterval);

      // pause/resume on visibility change
      const onVis = () => {
        if (document.hidden) {
          clearInterval(iv);
        } else {
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

    // Send a message (debounced to 1s cooldown)
    const sendMessage = () => {
      const now = Date.now();
      if (!input.trim() || !sessionId || now - lastSentAt < 1000) return;

      setLastSentAt(now);
      const text = input.trim();

      // immediately update UI
      setMessages(prev => [
        ...prev,
        { sender: 'user', message: text, created_at: new Date().toLocaleTimeString() }
      ]);
      setInput('');

      // fire-and-forget
      fetch(`${apiBase}/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text })
      }).catch(console.error);
    };

    const beginChat = () => {
      setStarted(true);
      setOpen(true);
    };
    const lastIsUser = messages.length > 0 && messages[messages.length-1].sender === 'user';

    return createElement(
      'div',
      { className: 'qa-global' },

      // Toggle button
      createElement(
        'div',
        { className: 'qa-chat-toggle', onClick: () => setOpen(o => !o) },
        open ? '×' : 'Send us a message'
      ),

      // Pre-chat state
      open && !started && createElement(
        'div',
        { className: 'qa-chat-box' },
        createElement('div', { className: 'qa-chat-header' }, 'Hi there 👋 How can we help?'),
        createElement('div', { className: 'qa-chat-links' },
          createElement('button', { className: 'qa-link-btn', onClick: beginChat }, 'Send us a message'),
          createElement('a', {
            className: 'qa-link-btn',
            href:      '/faq#getting-started',
            target:    '_blank'
          }, 'Resources for Getting Started'),
          createElement('a', {
            className: 'qa-link-btn',
            href:      '/pricing#plans',
            target:    '_blank'
          }, 'Compare Pricing Plans')
        )
      ),

      // Chat UI
      open && started && createElement(
        'div',
        { className: 'qa-chat-box' },

        // Header
        createElement('div', { className: 'qa-chat-header' }, 'Chat with us'),

        // Message list
        createElement('div', { className: 'qa-chat-messages' },
          messages.map((m, i) =>
            createElement(
              'div',
              { key: i, className: `qa-chat-message ${m.sender}` },
              m.message,
              createElement('div', { className: 'qa-chat-timestamp' }, m.created_at)
            )
          ),
          lastIsUser && createElement(
            'div',
            { className: 'qa-chat-waiting' },
            'Waiting for a teammate…'
          )
        ),

        // Input
        createElement('div', { className: 'qa-chat-input' },
          createElement('input', {
            type:        'text',
            placeholder: 'Type a message…',
            value:       input,
            onChange:    e => setInput(e.target.value),
            onKeyDown:   e => e.key === 'Enter' && sendMessage(),
          }),
          createElement(
            'button',
            { onClick: sendMessage },
            'Send'
          )
        )
      )
    );
  }

  // Mount on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('qa-global-root');
    if (root) render(createElement(GlobalWidget), root);
  });

})(window.wp);
