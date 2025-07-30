// assets/js/global-widget.js
;(function(wp){
  const { createElement, useState } = wp.element;
  const { render }                  = wp.element;

  function GlobalChat() {
    const { apiBase, globalActions } = window.QA_Assist_Global_Settings;
    const [reply, setReply]     = useState('');
    const [loading, setLoading] = useState(false);

    const send = async idx => {
      const act = globalActions[idx];
      if (!act) return;

      setLoading(true);
      setReply('');

      try {
        const res = await fetch(`${apiBase}/global-chat`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ message: act.user })
        });
        const data = await res.json();
        setReply(data.reply || '⚠️ No answer');
      } catch (err) {
        setReply(`❌ ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (!globalActions || !globalActions.length) {
      return null;
    }

    return createElement(
      'div',
      { className: 'qa-global' },
      createElement(
        'div',
        { className: 'qa-global-buttons' },
        globalActions.map((a, i) =>
          createElement(
            'button',
            {
              key:       i,
              disabled:  loading,
              onClick:   () => send(i),
            },
            a.label
          )
        )
      ),
      createElement(
        'div',
        { className: 'qa-global-reply' },
        loading ? 'Thinking…' : reply
      )
    );
  }

  // Wait for the footer-placeholder to exist...
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('qa-global-root');
    if (root) {
      render(createElement(GlobalChat), root);
    }
  });
})(window.wp);
