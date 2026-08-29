import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:8900/ws');
const t = setTimeout(() => { console.log('TIMEOUT, no over'); process.exit(1); }, 110000);
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.type === 'frame') return;
  if (m.type === 'over') {
    console.log('OVER keys:', Object.keys(m).join(','));
    console.log('has faulted?', Object.prototype.hasOwnProperty.call(m, 'faulted'));
    console.log(JSON.stringify({ ...m, stats: '<omitted>' }));
    clearTimeout(t); ws.close(); process.exit(0);
  } else {
    console.log(m.type, m.matchId || '');
  }
});
ws.on('error', (e) => { console.log('ERR', e.message); process.exit(1); });
