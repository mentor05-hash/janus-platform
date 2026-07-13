/* 배치표(/placement) — 시안 "야누스 배치표" 무료 티어 UI 신규 구현.
 * ⚠ 데이터: 전부 예시(샘플)값 — 저작권 데이터(어디가·실측 컷 등)는 repo 반입 금지(JANUS_DATA_DIR 연동은 생성기 v23에서).
 * 로직(3모드 환산·gbias·relTier·janus_score)은 배치표_DDD_v2 생성기 소관 — 이 페이지는 표현+티어 게이팅 UI만.
 * 무료 티어: 구간별 대표 3개 + 잠금 표시 + 업셀 CTA(골드 1개). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { JanusLogo } from '../components/JanusLogo';

type Mode = '표준점수' | '백분위' | '등급';

const SIGNALS = [
  {
    key: 'stable', name: '안정', color: 'var(--j-stable)', soft: 'var(--j-stable-soft)',
    copy: '떨어질 이유를 찾기 어려운 곳',
    rows: [
      { univ: '한국대 산업공학', score: 88, trend: '▲ 3개년 상승' },
      { univ: '중부대 소프트웨어', score: 86, trend: '― 3개년 유지' },
      { univ: '동서대 데이터과학', score: 85, trend: '▲ 3개년 상승' },
    ],
  },
  {
    key: 'fit', name: '적정', color: 'var(--j-fit)', soft: 'var(--j-fit-soft)',
    copy: '가장 합리적인 주력 카드',
    rows: [
      { univ: '아주대 소프트웨어', score: 82, trend: '▲ 3개년 상승' },
      { univ: '국민대 AI학부', score: 81, trend: '― 3개년 유지' },
      { univ: '세종대 컴퓨터공학', score: 80, trend: '▼ 3개년 하락' },
    ],
  },
  {
    key: 'reach', name: '소신', color: 'var(--j-reach)', soft: 'var(--j-reach-soft)',
    copy: '붙으면 이득, 계산된 도전',
    rows: [
      { univ: '서강대 컴퓨터공학', score: 74, trend: '― 3개년 유지' },
      { univ: '한양대 데이터사이언스', score: 72, trend: '▲ 3개년 상승' },
      { univ: '성균관대 소프트웨어', score: 71, trend: '― 3개년 유지' },
    ],
  },
  {
    key: 'high', name: '상향', color: 'var(--j-high)', soft: 'var(--j-high-soft)',
    copy: '판을 흔드는 한 장',
    rows: [
      { univ: '고려대 컴퓨터학과', score: 63, trend: '▼ 3개년 하락' },
      { univ: '연세대 인공지능', score: 61, trend: '― 3개년 유지' },
      { univ: '서울대 컴퓨터공학', score: 55, trend: '― 3개년 유지' },
    ],
  },
];

const EVIDENCE = [
  { icon: '▤', title: '실측 70%컷', desc: '작년 실제 합격자 하위 30% 지점 — 발표 컷이 아니라 실측 분포로 판단합니다.' },
  { icon: '↗', title: '다년 추세', desc: '3개년 컷 이동 방향을 함께 표시 — 한 해 반짝 컷에 속지 않게.' },
  { icon: '≈', title: '변동성', desc: '해마다 출렁이는 학과는 같은 점수라도 위험이 다릅니다 — 표준편차로 공개.' },
  { icon: '◈', title: '신뢰도 등급', desc: '표본 수·자료 최신성 기준 A~C 등급 — 근거가 약하면 약하다고 말합니다.' },
];

export function PlacementPage() {
  const [mode, setMode] = useState<Mode>('백분위');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* GNB(간이) */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', height: 66, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <JanusLogo size={30} />
            <span style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>야누스</span>
          </Link>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--j-blue)', background: 'var(--j-blue-soft)', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap' }}>입시배치표</span>
          <span style={{ flex: 1 }} />
          <span className="chip sig-fit">무료 미리보기</span>
          <Link to="/placement/hub" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--j-ghost-bg)', border: '1px solid var(--j-ghost-border)', borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap', textDecoration: 'none' }}>배치표 허브 →</Link>
          <Link to="/signup" className="btn sm" style={{ textDecoration: 'none' }}>회원 시작하기</Link>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 20px 60px' }}>
        {/* 입력부 — 3모드(표현만: 환산 로직은 생성기 v23 연동 예정) */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>내 성적 입력</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>표준점수 · 백분위 · 등급 중 편한 것으로 — 환산은 야누스가 합니다</div>
          </div>
          <div style={{ display: 'inline-flex', padding: 4, gap: 3, borderRadius: 12, background: 'var(--j-ghost-bg)', border: '1px solid var(--j-ghost-border)' }}>
            {(['표준점수', '백분위', '등급'] as Mode[]).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} style={{
                padding: '8px 16px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                background: mode === m ? 'var(--j-blue)' : 'transparent', color: mode === m ? '#fff' : 'var(--muted)',
              }}>{m}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 260 }}>
            {['국어', '수학', '영어', '탐구1', '탐구2'].map((s) => (
              <input key={s} placeholder={s} disabled className="input" style={{ width: 76, textAlign: 'center', fontFamily: 'var(--j-font-mono)' }} />
            ))}
          </div>
          <span className="chip cancelled" title="성적 입력·실시간 환산은 회원 기능">회원부터 · 예시 화면</span>
        </div>

        {/* 신호등 4구간 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
          {SIGNALS.map((sig) => (
            <section key={sig.key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'baseline', gap: 8, background: sig.soft }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: sig.color }}>● {sig.name}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-body)', fontWeight: 600 }}>{sig.copy}</span>
              </div>
              <div>
                {sig.rows.map((r) => (
                  <div key={r.univ} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.univ}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{r.trend}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--j-font-mono)', fontSize: 16, fontWeight: 700, color: sig.color }}>{r.score}</span>
                  </div>
                ))}
                {/* 무료 티어 잠금 행 */}
                <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--caption)' }}>
                  <span style={{ fontSize: 13 }}>🔒</span>
                  <span style={{ fontSize: 12.5 }}>실측 컷 · 검색 · 상세는 <b style={{ color: 'var(--ink-body)' }}>회원부터</b></span>
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* 업셀 CTA — 이 화면의 골드 1개 */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '26px 0 8px' }}>
          <Link to="/signup" className="btn gold" style={{ textDecoration: 'none', padding: '14px 34px', fontSize: 15.5 }}>
            무료 회원으로 전체 배치표 열기 →
          </Link>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', margin: '0 0 34px' }}>구간별 대표 3개만 표시 중 · 회원은 전체 학과 + 실측 컷 + 검색</p>

        {/* 블랙박스가 아닙니다 — 근거 4종 */}
        <section>
          <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase', paddingBottom: 9, borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
            블랙박스가 아닙니다 — 근거 4종
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {EVIDENCE.map((e) => (
              <div key={e.title} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--j-blue)', background: 'var(--j-blue-soft)', fontSize: 15 }}>{e.icon}</span>
                  <b style={{ fontSize: 14, color: 'var(--ink)' }}>{e.title}</b>
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--ink-body)' }}>{e.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 워터마크·면책 */}
        <p style={{ marginTop: 30, fontSize: 11.5, lineHeight: 1.7, color: 'var(--caption)', textAlign: 'center' }}>
          위 표는 <b>예시 데이터</b>입니다 — 실제 지원 판단에 사용하지 마세요. 무단 캡처·재배포 금지.<br />
          야누스 배치표는 참고 자료이며 최종 지원 결정과 결과의 책임은 지원자 본인에게 있습니다. © 2026 JANUS
        </p>
      </main>
    </div>
  );
}
