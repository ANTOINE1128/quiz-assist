;(function(wp){
  const { createElement: h, useEffect, useState } = wp.element;
  const { render } = wp.element;

  function QuizApp() {
    const { apiBase, quizActions } = window.QA_Assist_Quiz_Settings || { apiBase:'', quizActions:[] };

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

    // 1) Detect active question
    useEffect(() => {
      const iv = setInterval(() => {
        document.querySelectorAll('.wpProQuiz_listItem').forEach(el => {
          if (getComputedStyle(el).display !== 'none') {
            const qEl   = el.querySelector('.wpProQuiz_question_text p');
            const list  = el.querySelector('ul.wpProQuiz_questionList');
            const text  = qEl?.innerText.trim() || '';
            const id    = list?.dataset.question_id || '';
            if (text && id && id !== questionId) {
              setQuestionText(text);
              setQuestionId(id);
              setOnQuizPage(true);
              setResponse('');
              setCurrentAction(null);
            }
          }
        });
      }, 500);
      return () => clearInterval(iv);
    }, [questionId]);

    // 2) Fetch answers
    useEffect(() => {
      if (!questionId) return;
      setAnswersLoading(true);
      fetch(`${apiBase}/question/${encodeURIComponent(questionId)}`)
        .then(res => res.json())
        .then(data => setQuizAnswers(Array.isArray(data.answers) ? data.answers : []))
        .catch(()=> setQuizAnswers([]))
        .finally(() => setAnswersLoading(false));
    }, [questionId]);

    // 3) Send to GPT
    const sendToGPT = async idx => {
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
        const resp = await fetch(`${apiBase}/ask-bot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);
        if (!data.reply || !String(data.reply).trim()) throw new Error('Received empty reply from server');
        setResponse(String(data.reply).trim());
      } catch (err) {
        setResponse(`❌ ${err.message}`);
      } finally {
        setLoading(false);
        setCurrentAction(null);
      }
    };

    const getCourseNameFromURL = () => {
      const m = location.pathname.match(/courses\/([^/]+)/);
      return m ? decodeURIComponent(m[1]).replace(/-/g, ' ') : '';
    };

    if (minimized) {
      return h('div', { className:'qa-min-bar', onClick:()=>setMinimized(false), role:'button', tabIndex:0 }, '💬 Quiz Assistant');
    }
    if (!onQuizPage) return null;

    return h('div', { className:`qa-overlay${fullscreen ? ' qa-fullscreen' : ''}` },
      h('div', { className:`qa-container${fullscreen ? ' qa-container-fullscreen' : ''}` },
        // Header
        h('div', { className:'qa-header' },
          h('span', { className:'qa-header-title' }, 'Farhat.AI (Beta)'),
          h('div', { className:'qa-header-controls' },
            h('button', {
              className:`qa-btn${fullscreen ? ' active' : ''}`,
              onClick:(e)=>{ e.currentTarget.blur(); setFullscreen(f=>!f); },
              'aria-label': (fullscreen ? 'Exit Fullscreen' : 'Full Screen'),
              title: (fullscreen ? 'Exit Fullscreen' : 'Full Screen')
            },
              fullscreen
                ? h('svg', { viewBox:'0 0 24 24' },
                    h('polyline', { points:'9 15 5 15 5 19' }),
                    h('polyline', { points:'15 9 19 9 19 5' }),
                    h('line', { x1:19, y1:19, x2:15, y2:15 }),
                    h('line', { x1:5, y1:5,  x2:9,  y2:9  })
                  )
                : h('svg', { viewBox:'0 0 24 24' },
                    h('polyline', { points:'15 3 21 3 21 9' }),
                    h('polyline', { points:'9 21 3 21 3 15' }),
                    h('line', { x1:21, y1:3,  x2:14, y2:10 }),
                    h('line', { x1:3,  y1:21, x2:10, y2:14 })
                  )
            ),
            h('button', {
              className:'qa-btn',
              onClick:()=>{ setMinimized(true); setFullscreen(false); },
              'aria-label':'Minimize',
              title:'Minimize'
            },
              h('svg', { viewBox:'0 0 24 24' }, h('line', { x1:5, y1:12, x2:19, y2:12, strokeWidth:2 }))
            )
          )
        ),

        // Response
        h('div', { className:'qa-response' },
          response
            ? h('div', { className:'qa-text' }, response)
            : h('p', { className:'qa-placeholder' }, answersLoading ? 'Loading answers…' : 'Select an action below')
        ),

        // Actions
        h('div', { className:'qa-actions' },
          (quizActions || []).map((act, i) => h('button', {
              key:i,
              className:'qa-button',
              disabled:answersLoading || loading,
              onClick:()=>sendToGPT(i)
            }, (loading && currentAction === i) ? 'Thinking…' : act.label )
          )
        )
      )
    );
  }

  document.addEventListener('DOMContentLoaded', function(){
    // Mount into a detached container so styling is independent
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
