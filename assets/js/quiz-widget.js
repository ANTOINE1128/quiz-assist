;(function (wp) {
  const { createElement: h, useEffect, useRef, useState } = wp.element;
  const { render } = wp.element;

  function QuizApp() {
    const {
      apiBase,
      quizActions,
      isUserLoggedIn,
      restNonce,                 // from PHP (only when logged-in)
      publicHeader = 'X-QA-Public',
      publicToken  = ''
    } = window.QA_Assist_Quiz_Settings || { apiBase: '', quizActions: [] };

    const [questionText, setQuestionText] = useState('');
    const [questionId, setQuestionId] = useState('');
    const [quizAnswers, setQuizAnswers] = useState([]);
    const [answersLoading, setAnswersLoading] = useState(false);
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [currentAction, setCurrentAction] = useState(null);
    const [onQuizPage, setOnQuizPage] = useState(false);
    const [minimized, setMinimized] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);

    // Track last (id|text) to avoid bouncing
    const lastKeyRef = useRef('');

    /* ------------------ DOM helpers ------------------ */

    function getVisibleListItem() {
      const items = document.querySelectorAll('.wpProQuiz_listItem');
      for (const el of items) {
        const cs = getComputedStyle(el);
        if (
          el.offsetParent !== null &&
          cs.visibility !== 'hidden' &&
          cs.display !== 'none' &&
          el.getBoundingClientRect().height > 0
        ) {
          return el;
        }
      }
      return null;
    }

    function getQuestionIdFromItem(item) {
      const ul = item.querySelector('ul.wpProQuiz_questionList');
      if (!ul) return '';
      return (
        (ul.dataset && (ul.dataset.question_id || ul.dataset.questionId)) ||
        ul.getAttribute('data-question_id') ||
        ''
      );
    }

    // Pull full stem (paragraphs + lists + <br> + images)
    function extractFullQuestionText(item) {
      const block = item.querySelector('.wpProQuiz_question_text');
      if (!block) return '';

      const clone = block.cloneNode(true);
      [
        '.wpProQuiz_questionList',
        '.wpProQuiz_buttons',
        '.wpProQuiz_reviewQuestion',
        '.wpProQuiz_solution',
        'script',
        'style',
      ].forEach((sel) => clone.querySelectorAll(sel).forEach((n) => n.remove()));

      clone.querySelectorAll('img').forEach((img) => {
        const alt = (img.getAttribute('alt') || img.getAttribute('title') || '').trim();
        const src = img.src || img.getAttribute('src') || '';
        const label = alt ? `Image: ${alt}` : `Image: ${src}`;
        img.replaceWith(document.createTextNode(`[${label}]`));
      });

      clone.querySelectorAll('li').forEach((li) => {
        li.textContent = '• ' + li.textContent.trim();
      });

      clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));

      const text = clone.innerText
        .replace(/\r/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      return text;
    }

    function pickQuestion() {
      const item = getVisibleListItem();
      setOnQuizPage(!!item);
      if (!item) return;

      const id = getQuestionIdFromItem(item);
      const text = extractFullQuestionText(item);

      const key = `${id}|${text}`;
      if (!text || !id || key === lastKeyRef.current) return;

      lastKeyRef.current = key;
      setQuestionId(id);
      setQuestionText(text);
      setResponse('');
      setCurrentAction(null);
    }

    // Observe quiz DOM for changes (no stale reads)
    useEffect(() => {
      const container =
        document.querySelector('.wpProQuiz_content') ||
        document.querySelector('.learndash') ||
        document.body;

      pickQuestion();

      const mo = new MutationObserver(() => {
        clearTimeout(pickQuestion._t);
        pickQuestion._t = setTimeout(pickQuestion, 40);
      });
      mo.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      const iv = setInterval(pickQuestion, 1000);
      return () => { mo.disconnect(); clearInterval(iv); };
    }, []);

    /* ------------------ Fetch answers ------------------ */
    useEffect(() => {
      if (!questionId) return;
      setAnswersLoading(true);
      const headers = { 'Accept': 'application/json' };
      // Only send nonce if the user is logged in (guests don't have a valid REST nonce)
      if (isUserLoggedIn && restNonce) headers['X-WP-Nonce'] = restNonce;

      fetch(`${apiBase}/question/${encodeURIComponent(questionId)}`, {
        method: 'GET',
        credentials: 'same-origin',
        headers
      })
        .then((res) => res.json())
        .then((data) => setQuizAnswers(Array.isArray(data.answers) ? data.answers : []))
        .catch(() => setQuizAnswers([]))
        .finally(() => setAnswersLoading(false));
    }, [questionId]);

    /* ------------------ Send to GPT (robust) ------------------ */
    const sendToGPT = async (idx) => {
      if (!questionId || answersLoading || loading) return;
      setLoading(true);
      setCurrentAction(idx);
      setResponse('');

      const payload = {
        questionText,
        answers: quizAnswers,
        promptType: idx,
        courseName: getCourseNameFromURL(),
      };

      try {
        const headers = {
          'Content-Type': 'application/json',
          [publicHeader]: publicToken
        };
        if (isUserLoggedIn && restNonce) headers['X-WP-Nonce'] = restNonce;

        const resp = await fetch(`${apiBase}/ask-bot`, {
          method: 'POST',
          credentials: 'same-origin',
          headers,
          body: JSON.stringify(payload),
        });

        // Try to parse JSON; if server sent HTML (e.g., error page), we
        // still throw a readable error instead of dumping HTML to the UI.
        const text = await resp.text();
        let data = {};
        try { data = JSON.parse(text); } catch (_) {}

        if (!resp.ok) {
          const msg = (data && data.message) ? data.message : `HTTP ${resp.status}`;
          throw new Error(msg);
        }
        const reply = (data && data.reply) ? String(data.reply).trim() : '';
        if (!reply) throw new Error('Received empty reply from server');

        setResponse(reply);
      } catch (err) {
        setResponse(`❌ ${err.message}`);
      } finally {
        setLoading(false);
        setCurrentAction(null);
      }
    };

    function getCourseNameFromURL() {
      const m = location.pathname.match(/courses\/([^/]+)/);
      return m ? decodeURIComponent(m[1]).replace(/-/g, ' ') : '';
    }

    /* ------------------ UI ------------------ */
    if (minimized) {
      return h(
        'div',
        { className: 'qa-min-bar', onClick: () => setMinimized(false), role: 'button', tabIndex: 0 },
        '💬 Quiz Assistant'
      );
    }
    if (!onQuizPage) return null;

    return h(
      'div',
      { className: `qa-overlay${fullscreen ? ' qa-fullscreen' : ''}` },
      h(
        'div',
        { className: `qa-container${fullscreen ? ' qa-container-fullscreen' : ''}` },
        h(
          'div',
          { className: 'qa-header' },
          h('span', { className: 'qa-header-title' }, 'Farhat.AI (Beta)'),
          h(
            'div',
            { className: 'qa-header-controls' },
            h(
              'button',
              {
                className: `qa-btn${fullscreen ? ' active' : ''}`,
                onClick: (e) => { e.currentTarget.blur(); setFullscreen((f) => !f); },
                'aria-label': fullscreen ? 'Exit Fullscreen' : 'Full Screen',
                title: fullscreen ? 'Exit Fullscreen' : 'Full Screen',
              },
              fullscreen
                ? h('svg', { viewBox: '0 0 24 24' },
                    h('polyline', { points: '9 15 5 15 5 19' }),
                    h('polyline', { points: '15 9 19 9 19 5' }),
                    h('line', { x1: 19, y1: 19, x2: 15, y2: 15 }),
                    h('line', { x1: 5, y1: 5, x2: 9, y2: 9 }))
                : h('svg', { viewBox: '0 0 24 24' },
                    h('polyline', { points: '15 3 21 3 21 9' }),
                    h('polyline', { points: '9 21 3 21 3 15' }),
                    h('line', { x1: 21, y1: 3, x2: 14, y2: 10 }),
                    h('line', { x1: 3, y1: 21, x2: 10, y2: 14 }))
            ),
            h(
              'button',
              {
                className: 'qa-btn',
                onClick: () => { setMinimized(true); setFullscreen(false); },
                'aria-label': 'Minimize',
                title: 'Minimize',
              },
              h('svg', { viewBox: '0 0 24 24' }, h('line', { x1: 5, y1: 12, x2: 19, y2: 12, strokeWidth: 2 }))
            )
          )
        ),

        h(
          'div',
          { className: 'qa-response' },
          response
            ? h('div', { className: 'qa-text' }, response)
            : h('p', { className: 'qa-placeholder' }, answersLoading ? 'Loading answers…' : 'Select an action below')
        ),

        h(
          'div',
          { className: 'qa-actions' },
          (quizActions || []).map((act, i) =>
            h(
              'button',
              {
                key: i,
                className: 'qa-button',
                disabled: answersLoading || loading,
                onClick: () => sendToGPT(i),
              },
              loading && currentAction === i ? 'Thinking…' : act.label
            )
          )
        )
      )
    );
  }

  document.addEventListener('DOMContentLoaded', function () {
    const mountId = 'qa-quiz-widget-root';
    let mount = document.getElementById(mountId);
    if (!mount) {
      mount = document.createElement('div');
      mount.id = mountId;
      document.body.appendChild(mount);
    }
    render(h(QuizApp), mount);
  });
})(window.wp);
