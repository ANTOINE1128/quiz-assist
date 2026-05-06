;(function (wp) {
  const { createElement: h, useEffect, useMemo, useRef, useState } = wp.element;
  const { render } = wp.element;


  // ---------- draggable floating widgets ----------
  function qaClamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function qaReadPos(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
      return p;
    } catch (_) { return null; }
  }
  function qaSavePos(key, x, y) {
    try { localStorage.setItem(key, JSON.stringify({ x, y })); } catch (_) {}
  }
  function qaApplyFixedPos(el, key) {
    if (!el) return;
    const p = qaReadPos(key);
    if (!p) return;
    const rect = el.getBoundingClientRect();
    const w = rect.width || el.offsetWidth || 80;
    const hgt = rect.height || el.offsetHeight || 80;
    const x = qaClamp(p.x, 8, Math.max(8, window.innerWidth - w - 8));
    const y = qaClamp(p.y, 8, Math.max(8, window.innerHeight - hgt - 8));
    el.style.setProperty('left', x + 'px', 'important');
    el.style.setProperty('top', y + 'px', 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('bottom', 'auto', 'important');
  }
  function qaInstallDrag({ targetSelector, handleSelector, key, ignoreInteractive = true, onApply = null }) {
    let installedKey = '__qaDragInstalled_' + key;
    if (window[installedKey]) return;
    window[installedKey] = true;

    let suppressClickUntil = 0;

    function apply() {
      document.querySelectorAll(targetSelector).forEach((el) => {
        qaApplyFixedPos(el, key);
        if (typeof onApply === 'function') onApply(el, key);
      });
    }

    const mo = new MutationObserver(apply);
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
    window.addEventListener('resize', apply, { passive: true });
    setInterval(apply, 800);
    setTimeout(apply, 60);
    setTimeout(apply, 600);

    document.addEventListener('click', function(e) {
      if (Date.now() < suppressClickUntil) {
        const handle = e.target && e.target.closest && e.target.closest(handleSelector);
        if (handle) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }
      }
    }, true);

    document.addEventListener('pointerdown', function(e) {
      if (!e.target || !e.target.closest) return;
      const handle = e.target.closest(handleSelector);
      if (!handle) return;

      if (ignoreInteractive && !handle.matches('.qa-launcher,.qa-fab')) {
        const interactive = e.target.closest('button,a,input,textarea,select,[role="button"]');
        if (interactive && interactive !== handle) return;
      }

      const target = handle.closest(targetSelector) || document.querySelector(targetSelector);
      if (!target) return;

      qaApplyFixedPos(target, key);
      if (typeof onApply === 'function') onApply(target, key);

      const startX = e.clientX;
      const startY = e.clientY;
      const rect = target.getBoundingClientRect();
      const offsetX = startX - rect.left;
      const offsetY = startY - rect.top;
      let moved = false;

      function move(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true;
        const w = rect.width || target.offsetWidth || 80;
        const h = rect.height || target.offsetHeight || 80;
        const x = qaClamp(ev.clientX - offsetX, 8, Math.max(8, window.innerWidth - w - 8));
        const y = qaClamp(ev.clientY - offsetY, 8, Math.max(8, window.innerHeight - h - 8));
        target.style.setProperty('left', x + 'px', 'important');
        target.style.setProperty('top', y + 'px', 'important');
        target.style.setProperty('right', 'auto', 'important');
        target.style.setProperty('bottom', 'auto', 'important');
        qaSavePos(key, x, y);
        if (typeof onApply === 'function') onApply(target, key);
        ev.preventDefault();
      }

      function up() {
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('pointerup', up, true);
        document.removeEventListener('pointercancel', up, true);
        if (moved) suppressClickUntil = Date.now() + 350;
      }

      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', up, true);
      document.addEventListener('pointercancel', up, true);
    }, true);
  }


  function QuizApp() {
    const {
      apiBase,
      quizActions,
      isUserLoggedIn = false,
      restNonce = '',
      publicHeader = 'X-QA-Public',
      publicToken = '',
      assets = {}
    } = window.QA_Assist_Quiz_Settings || { apiBase: '', quizActions: [] };

    const [questionText, setQuestionText] = useState('');
    const [questionId, setQuestionId] = useState('');
    const [quizAnswers, setQuizAnswers] = useState([]);
    const [answersLoading, setAnswersLoading] = useState(false);
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [currentAction, setCurrentAction] = useState(null);
    const [lastActionLabel, setLastActionLabel] = useState('');
    const [onQuizPage, setOnQuizPage] = useState(false);
    const [minimized, setMinimized] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);
    const [showGreeting, setShowGreeting] = useState(true);
    const [typedGreeting, setTypedGreeting] = useState('');
    const [greetingRun, setGreetingRun] = useState(0);
    const lastKeyRef = useRef('');
    const initialGreetingShownRef = useRef(false);
    const greetTimerRef = useRef(null);
    const typeTimerRef = useRef(null);
    const greetingText = 'Hello,\nthis is\nFarhat.AI.\nHow can I\nhelp you\ntoday?';

    useEffect(() => {
      qaInstallDrag({
        targetSelector: '.qa-launcher',
        handleSelector: '.qa-launcher',
        key: 'qa_quiz_launcher_pos',
        ignoreInteractive: false
      });
      qaInstallDrag({
        targetSelector: '.qa-overlay:not(.qa-fullscreen)',
        handleSelector: '.qa-overlay:not(.qa-fullscreen) .qa-header',
        key: 'qa_quiz_panel_pos',
        ignoreInteractive: true
      });
    }, []);


    function scheduleGreetingAutoHide(ms = 6200) {
      if (greetTimerRef.current) clearTimeout(greetTimerRef.current);
      if (typeTimerRef.current) clearInterval(typeTimerRef.current);
      setTypedGreeting('');
      setShowGreeting(true);
      setGreetingRun((v) => v + 1);
      greetTimerRef.current = setTimeout(() => setShowGreeting(false), ms);
    }

    function openWidget() {
      setMinimized(false);
      setShowGreeting(false);
      if (greetTimerRef.current) clearTimeout(greetTimerRef.current);
      if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    }

    function minimizeWidget(showHint = true) {
      setMinimized(true);
      setFullscreen(false);
      if (showHint) scheduleGreetingAutoHide();
    }

    function getVisibleListItem() {
      const items = document.querySelectorAll('.wpProQuiz_listItem');
      for (const el of items) {
        const cs = getComputedStyle(el);
        if (el.offsetParent !== null && cs.visibility !== 'hidden' && cs.display !== 'none' && el.getBoundingClientRect().height > 0) {
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

      return clone.innerText
        .replace(/\r/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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
      setLastActionLabel('');
      setMinimized(true);
      scheduleGreetingAutoHide();
    }

    function escapeHtml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderRichText(text) {
      const raw = String(text || '').trim();
      if (!raw) return '';

      try {
        if (window.marked && typeof window.marked.parse === 'function') {
          const html = window.marked.parse(raw, { breaks: true, gfm: true });
          if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
            return window.DOMPurify.sanitize(html, {
              ALLOWED_TAGS: ['p','br','strong','b','em','i','ul','ol','li','code','pre','blockquote','h1','h2','h3','h4','h5','h6','table','thead','tbody','tr','th','td','a','hr'],
              ALLOWED_ATTR: ['href','target','rel']
            });
          }
          return html;
        }
      } catch (_) {}

      return raw
        .split(/\n{2,}/)
        .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
        .join('');
    }

    useEffect(() => {
      if (!showGreeting) {
        if (typeTimerRef.current) clearInterval(typeTimerRef.current);
        return;
      }

      if (typeTimerRef.current) clearInterval(typeTimerRef.current);
      setTypedGreeting('');
      let i = 0;
      const startTimer = setTimeout(() => {
        typeTimerRef.current = setInterval(() => {
          i += 1;
          setTypedGreeting(greetingText.slice(0, i));
          if (i >= greetingText.length && typeTimerRef.current) {
            clearInterval(typeTimerRef.current);
            typeTimerRef.current = null;
          }
        }, 24);
      }, 240);

      return () => {
        clearTimeout(startTimer);
        if (typeTimerRef.current) clearInterval(typeTimerRef.current);
      };
    }, [showGreeting, greetingRun]);

    useEffect(() => {
      if (!onQuizPage || !minimized || initialGreetingShownRef.current) return;
      initialGreetingShownRef.current = true;
      const t = setTimeout(() => scheduleGreetingAutoHide(7600), 350);
      return () => clearTimeout(t);
    }, [onQuizPage, minimized]);

    useEffect(() => {
      const container = document.querySelector('.wpProQuiz_content') || document.querySelector('.learndash') || document.body;
      pickQuestion();

      const mo = new MutationObserver(() => {
        clearTimeout(pickQuestion._t);
        pickQuestion._t = setTimeout(pickQuestion, 40);
      });
      mo.observe(container, { childList: true, subtree: true, attributes: true, characterData: true });

      const iv = setInterval(pickQuestion, 1000);
      return () => {
        mo.disconnect();
        clearInterval(iv);
        if (greetTimerRef.current) clearTimeout(greetTimerRef.current);
        if (typeTimerRef.current) clearInterval(typeTimerRef.current);
      };
    }, []);

    useEffect(() => {
      if (!questionId) return;
      setAnswersLoading(true);
      const headers = { Accept: 'application/json' };
      if (isUserLoggedIn && restNonce) headers['X-WP-Nonce'] = restNonce;

      fetch(`${apiBase}/question/${encodeURIComponent(questionId)}`, {
        method: 'GET',
        credentials: 'same-origin',
        headers,
      })
        .then((res) => res.json())
        .then((data) => setQuizAnswers(Array.isArray(data.answers) ? data.answers : []))
        .catch(() => setQuizAnswers([]))
        .finally(() => setAnswersLoading(false));
    }, [questionId]);

    const sendToGPT = async (idx) => {
      if (!questionId || answersLoading || loading) return;
      setLoading(true);
      setCurrentAction(idx);
      setLastActionLabel((Array.isArray(quizActions) && quizActions[idx] && quizActions[idx].label) ? quizActions[idx].label : 'Selected action');
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
          [publicHeader]: publicToken,
        };
        if (isUserLoggedIn && restNonce) headers['X-WP-Nonce'] = restNonce;

        const resp = await fetch(`${apiBase}/ask-bot`, {
          method: 'POST',
          credentials: 'same-origin',
          headers,
          body: JSON.stringify(payload),
        });

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

    const actions = Array.isArray(quizActions) ? quizActions : [];
    const hasResponse = !!response;
    const renderedResponse = useMemo(() => renderRichText(response), [response]);

    if (!onQuizPage) return null;

    if (minimized) {
      return h(
        'button',
        {
          className: 'qa-launcher show',
          type: 'button',
          onClick: openWidget,
          'aria-label': 'Open Farhat.AI quiz assistant',
          title: 'Open Farhat.AI',
        },
        showGreeting ? h('span', { className: 'qa-bubble-tip qa-bubble-tip-visible' }, typedGreeting) : null,
        h('span', { className: 'qa-bubble-ico', 'aria-hidden': 'true' },
          h('span', { className: 'qa-bubble-robot' })
        )
      );
    }

    return h(
      'div',
      { className: `qa-overlay${fullscreen ? ' qa-fullscreen' : ''}` },
      h(
        'div',
        { className: `qa-widget qa-theme-farhat${fullscreen ? ' qa-widget-fullscreen' : ''}` },
        h(
          'div',
          { className: 'qa-header' },
          h(
            'div',
            { className: 'qa-title' },
            h('span', { className: 'qa-title-bot', 'aria-hidden': 'true' }),
            h('span', null, 'Farhat.AI')
          ),
          h(
            'div',
            { className: 'qa-header-btns' },
            h('button', {
              className: 'qa-btn qa-fullscreen-btn',
              type: 'button',
              onClick: (e) => { e.currentTarget.blur(); setFullscreen((f) => !f); },
              'aria-label': fullscreen ? 'Exit full screen' : 'Full screen',
              title: fullscreen ? 'Exit full screen' : 'Full screen',
            }),
            h('button', {
              className: 'qa-btn qa-close-btn',
              type: 'button',
              onClick: () => minimizeWidget(true),
              'aria-label': 'Minimize',
              title: 'Minimize',
            })
          )
        ),
        h(
          'div',
          { className: 'qa-body' },
          h(
            'div',
            { className: `qa-messages${hasResponse ? ' qa-has-response' : ''}` },
            h(
              'div',
              { className: `qa-welcome${hasResponse ? ' qa-welcome-compact' : ''}` },
              h(
                'div',
                { className: 'qa-welcome-copy' },
                h('p', { className: 'qa-welcome-title' }, hasResponse ? 'Quiz guidance is ready.' : "Hi! I'm Farhat.AI."),
                h('p', { className: 'qa-welcome-sub' }, hasResponse ? 'Review the explanation below or choose another quiz action.' : 'How can I help you with this quiz?')
              ),
              h(
                'div',
                { className: 'qa-actions', role: 'group', 'aria-label': 'Quiz actions' },
                actions.map((act, i) =>
                  h(
                    'button',
                    {
                      key: i,
                      className: 'qa-action-btn',
                      disabled: answersLoading || loading,
                      onClick: () => sendToGPT(i),
                      type: 'button',
                    },
                    loading && currentAction === i ? 'Thinking…' : act.label
                  )
                )
              )
            ),
            loading && !hasResponse
              ? h('div', { className: 'qa-thinking' }, 'Thinking…')
              : null,
            hasResponse ? h(
              'div',
              { className: 'qa-conversation' },
              lastActionLabel ? h('div', { className: 'qa-msg qa-user' }, lastActionLabel) : null,
              h('div', { className: 'qa-msg qa-assistant', dangerouslySetInnerHTML: { __html: renderedResponse } })
            ) : (!loading ? h('div', { className: 'qa-empty' }, answersLoading ? 'Loading quiz answers…' : 'Select one of the quiz actions to begin.') : null)
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
