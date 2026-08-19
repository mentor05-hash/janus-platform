import { useEffect, useState } from 'react';
import { api } from '../api/client';

type Demo = { url: string; roomId: string; teacherToken: string; studentToken: string };

/**
 * 내부 툴 점검 런처 — 로그인 없이 채팅·화이트보드를 바로 연다(로컬/데모 전용).
 * API(/rooms-bridge/demo)가 데모 룸 1개 + 선생님·학생 토큰을 발급 → 아래 버튼이
 * /room?url=…&token=…&kind=chat|whiteboard 을 새 탭으로 연다.
 * 같은 룸이므로 선생님 탭·학생 탭을 각각 열면 실시간 동기화(채팅·판서)를 확인할 수 있다.
 */
export function RoomDemoLauncherPage() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [health, setHealth] = useState<'checking' | 'ok' | 'down'>('checking');
  const [busy, setBusy] = useState(false);

  async function provision(fresh = false) {
    setBusy(true); setErr(null);
    try {
      const d = await api.post<Demo>('/rooms-bridge/demo', { fresh });
      setDemo(d);
      // 룸 서비스 접속 가능 여부(브라우저→룸 URL) 즉시 점검 — 여기서 down 이면 /room 도 연결 안 됨.
      try {
        const r = await fetch(`${d.url}/api/rt/v1/health`);
        setHealth(r.ok ? 'ok' : 'down');
      } catch { setHealth('down'); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '데모 룸 생성 실패');
    } finally { setBusy(false); }
  }

  useEffect(() => { void provision(); }, []);

  function link(kind: 'chat' | 'whiteboard', token: string, title: string) {
    if (!demo) return '#';
    const q = new URLSearchParams({ url: demo.url, token, kind, title });
    return `/room?${q.toString()}`;
  }
  const open = (href: string) => window.open(href, '_blank', 'noopener');

  const btn: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '13px 16px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', fontSize: 14, marginBottom: 8 };
  const grp: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 16 };

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif', color: 'var(--ink, #16233a)' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 6px' }}>내부 툴 점검 — 채팅 · 화이트보드</h1>
      <p style={{ color: 'var(--muted, #5a6b83)', fontSize: 13.5, margin: '0 0 20px', lineHeight: 1.6 }}>
        로그인 없이 실시간 룸(<code>:3100</code>)에 바로 접속합니다. <b>선생님</b>과 <b>학생</b> 링크를 각각 다른 탭(또는 창)에서 열어야
        서로의 채팅·판서가 실시간으로 보입니다. 화이트보드/채팅은 같은 룸의 <code>kind</code> 만 다릅니다.
      </p>

      {health === 'down' && (
        <div style={{ background: '#fbeae7', border: '1px solid #f0cfc9', color: '#a64b37', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
          ⚠ 룸 서비스(<code>{demo?.url}</code>) 헬스 확인에 실패했습니다.
          {' '}<b>다만 이 점검만 실패하고 채팅·음성은 되는 경우가 있습니다</b> — 광고·추적 차단 확장이 교차 도메인
          {' '}<code>fetch</code> 만 막고 WebSocket 은 통과시키기 때문입니다. 아래 링크를 열어 실제로 연결되는지 먼저 확인해 보세요.
          {' '}그래도 "연결 중"에서 멈춘다면: <code>realtime-rooms</code> 컨테이너 기동 여부,
          {' '}공개 배포라면 위 주소가 실제로 열려 있는지(<code>{demo?.url}</code>/api/rt/v1/health),
          {' '}로컬이라면 <code>localhost:8080</code> 으로 접속했는지 확인하세요.
        </div>
      )}
      {err && (
        <div style={{ background: '#fbeae7', border: '1px solid #f0cfc9', color: '#a64b37', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
          {err} <button onClick={() => void provision()} style={{ marginLeft: 8, textDecoration: 'underline', border: 'none', background: 'none', color: 'inherit', cursor: 'pointer' }}>다시 시도</button>
        </div>
      )}

      {!demo ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>{busy ? '데모 룸 생성 중…' : '준비 중…'}</p>
      ) : (
        <>
          <div style={grp}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>💬 채팅</div>
            <button style={btn} onClick={() => open(link('chat', demo.teacherToken, '데모 채팅(선생님)'))}>선생님으로 채팅 열기 →</button>
            <button style={btn} onClick={() => open(link('chat', demo.studentToken, '데모 채팅(학생)'))}>학생으로 채팅 열기 →</button>
          </div>
          <div style={grp}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>🖊 화이트보드</div>
            <button style={btn} onClick={() => open(link('whiteboard', demo.teacherToken, '데모 화이트보드(선생님)'))}>선생님으로 화이트보드 열기 →</button>
            <button style={btn} onClick={() => open(link('whiteboard', demo.studentToken, '데모 화이트보드(학생)'))}>학생으로 화이트보드 열기 →</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            룸 상태: {health === 'ok' ? '✅ 접속 가능' : health === 'checking' ? '확인 중…' : '❌ 접속 불가'} ·
            roomId <code>{demo.roomId.slice(0, 8)}…</code> · 토큰 만료 12시간.
            <button onClick={() => void provision(true)} style={{ marginLeft: 6, textDecoration: 'underline', border: 'none', background: 'none', color: 'inherit', cursor: 'pointer' }}>새 룸 만들기</button>
          </p>
        </>
      )}
    </div>
  );
}
