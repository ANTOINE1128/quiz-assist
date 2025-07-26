// ;(function() {
//   const e = React.createElement;
//   const { useState, useEffect, useRef } = React;

//   function GlobalChat() {
//     const [open, setOpen]   = useState(false);
//     const [input, setInput] = useState('');
//     const [msgs, setMsgs]   = useState([]);
//     const panelRef          = useRef(null);

//     // close if click outside
//     useEffect(() => {
//       function onClick(e) {
//         if (open && panelRef.current && !panelRef.current.contains(e.target)) {
//           setOpen(false);
//         }
//       }
//       document.addEventListener('mousedown', onClick);
//       return () => document.removeEventListener('mousedown', onClick);
//     }, [open]);

//     // don't render on quiz pages
//     if (document.querySelector('.wpProQuiz_listItem')) return null;

//     const send = async () => {
//       const text = input.trim();
//       if (!text) return;
//       setMsgs(ms => [...ms, { role:'user', text }]);
//       setInput('');
//       try {
//         const res = await fetch(
//           QA_Assist_Global_Settings.apiBase + '/global-chat',
//           {
//             method: 'POST',
//             headers:{ 'Content-Type':'application/json' },
//             body: JSON.stringify({ message: text })
//           }
//         );
//         const { reply } = await res.json();
//         setMsgs(ms => [...ms, { role:'assistant', text: reply || '❌ No reply.' }]);
//       } catch {
//         setMsgs(ms => [...ms, { role:'assistant', text:'❌ Request failed.' }]);
//       }
//     };

//     // styles
//     const S = {
//       container: {
//         position: 'fixed',
//         bottom: '20px',
//         right: '20px',
//         zIndex: 2147483647,
//         fontFamily: 'system-ui, -apple-system, sans-serif'
//       },
//       collapsedBar: {
//         display: 'flex',
//         alignItems: 'center',
//         justifyContent: 'center',
//         width: '140px',
//         height: '40px',
//         borderRadius: '20px',
//         background: '#0073E6',
//         color: '#fff',
//         cursor: 'pointer',
//         boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
//         userSelect: 'none'
//       },
//       panel: {
//         width: '350px',
//         height: '480px',
//         background: '#fff',
//         borderRadius: '12px',
//         boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
//         display: 'flex',
//         flexDirection: 'column',
//         overflow: 'hidden'
//       },
//       header: {
//         background: '#0073E6',
//         color: '#fff',
//         padding: '12px 16px',
//         fontSize: '16px',
//         fontWeight: 600,
//         display: 'flex',
//         justifyContent: 'space-between',
//         alignItems: 'center'
//       },
//       closeBtn: {
//         background: 'transparent',
//         border: 'none',
//         color: '#fff',
//         fontSize: '20px',
//         cursor: 'pointer',
//         lineHeight: 1
//       },
//       messages: {
//         flex: 1,
//         padding: '12px',
//         overflowY: 'auto',
//         background: '#F2F6FC'
//       },
//       msgBubble: isUser => ({
//         maxWidth: '75%',
//         marginBottom: '10px',
//         padding: '8px 12px',
//         borderRadius: '16px',
//         background: isUser ? '#0073E6' : '#E1E9F5',
//         color: isUser ? '#fff' : '#1F2A37',
//         alignSelf: isUser ? 'flex-end' : 'flex-start',
//         fontSize: '14px',
//         lineHeight: 1.4
//       }),
//       inputBar: {
//         borderTop: '1px solid #DDD',
//         display: 'flex',
//         padding: '8px',
//         background: '#fff'
//       },
//       input: {
//         flex: 1,
//         border: '1px solid #CCC',
//         borderRadius: '20px',
//         padding: '8px 12px',
//         fontSize: '14px',
//         outline: 'none'
//       },
//       sendBtn: {
//         marginLeft: '8px',
//         background: '#0073E6',
//         color: '#fff',
//         border: 'none',
//         borderRadius: '20px',
//         padding: '0 16px',
//         cursor: 'pointer',
//         fontSize: '14px'
//       }
//     };

//     return e('div', { style: S.container, ref: panelRef },
//       // collapsed
//       !open
//         ? e('div',{
//             style: S.collapsedBar,
//             onClick: ()=>setOpen(true),
//             'aria-label':'Open site assistant'
//           }, 'Chat AI')
//         // expanded
//         : e('div',{ style: S.panel },
//             // header
//             e('div',{ style: S.header },
//               e('span',null,'Farhat AI Assistant'),
//               e('button',{
//                 style: S.closeBtn,
//                 onClick: ()=>setOpen(false),
//                 'aria-label':'Close'
//               }, '✕')
//             ),
//             // messages
//             e('div',{ style: S.messages },
//               msgs.map((m,i)=>
//                 e('div',{ key:i, style: S.msgBubble(m.role==='user') }, m.text)
//               )
//             ),
//             // input
//             e('div',{ style: S.inputBar },
//               e('input',{
//                 style: S.input,
//                 value: input,
//                 placeholder:'Type a question…',
//                 onChange:e=>setInput(e.target.value),
//                 onKeyDown:e=> e.key==='Enter' && send()
//               }),
//               e('button',{ style: S.sendBtn, onClick:send }, 'Send')
//             )
//           )
//     );
//   }

//   document.addEventListener('DOMContentLoaded', ()=>{
//     const mount = document.createElement('div');
//     document.body.appendChild(mount);
//     ReactDOM.render(e(GlobalChat), mount);
//   });
// })();
