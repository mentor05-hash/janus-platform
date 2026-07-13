/* 관문 랜딩(/) — 시안 janus_home_v2(딥 포탈) 기준 신규 구현.
 * 원칙(시안): 관문 우선 — 역할 4카드 폐기, 큰 질문 1 + 행동 타일 3. 학부모·선생님·B2B는 헤더 보조 진입.
 * CTA 위계: 골드 채움(길 찾기) = 화면당 1개. 로직 없음 — 표현 전용. LLM 의도분류 훅은 백엔드 연동 시 교체.
 * 구 잇올 랜딩(iframe)은 /legacy 병행 유지(패리티 통과 전 삭제 금지). */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { JanusLogo } from '../components/JanusLogo';

const TILES = [
  {
    icon: '◱', iconColor: 'var(--j-blue)', iconBg: 'var(--j-blue-soft)',
    tag: '진단', title: '성적으로 진단받기',
    desc: <>성적표 사진 한 장(OCR) 또는 직접 입력 → <b>배치표·격차 리포트</b>를 즉시.</>,
    chips: ['▤ 실측 기반', '◈ 신뢰도 A'], cta: '진단 시작 →', to: '/placement',
  },
  {
    icon: '✦', iconColor: 'var(--j-ai)', iconBg: 'var(--j-ai-soft)',
    tag: '가장 빠른 시작', title: '질문 올리기',
    desc: <>모르는 문제, <b>사진 한 장이면</b> AI 초안이 즉시. 이어서 선생님이 검토해 답합니다.</>,
    chips: ['✦ AI 초안 즉시', '⏱ 평균 12분'], cta: '질문 올리기 →', to: '/login',
  },
  {
    icon: '◇', iconColor: 'var(--j-gold-ink)', iconBg: 'var(--j-gold-soft)',
    tag: '처방', title: '선생님 찾기',
    desc: <>내 격차에 맞는 선생님을 상담·과외로 매칭. <b>풀별 응답시간·만족도</b>를 보고 고릅니다.</>,
    chips: ['★ 4.9 만족도', '1:1 매칭'], cta: '선생님 둘러보기 →', to: '/login',
  },
];

const CHIP_SUGGEST = ['정시·이과', '📷 사진 질문', '상담 받기', '배치표 보기'];

export function JanusLandingPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  // 길 찾기 — LLM 의도분류 훅 연동 전 임시 라우팅(키워드 휴리스틱 폴백)
  function onFind(e: FormEvent) {
    e.preventDefault();
    const s = q.trim();
    if (/질문|문제|모르/.test(s)) navigate('/login');
    else navigate('/placement');
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* 유틸리티 바 — 보조 진입(학부모·선생님·B2B) */}
      <div style={{ background: 'var(--j-chrome)', height: 36 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', height: '100%', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 18 }}>
          <span style={{ fontSize: 12, color: '#7d92ac', whiteSpace: 'nowrap' }}>학부모이신가요?</span>
          <span style={{ width: 1, height: 11, background: '#24405f' }} />
          <span style={{ fontSize: 12, color: '#7d92ac', whiteSpace: 'nowrap' }}>가르치러 오셨나요?</span>
          <span style={{ width: 1, height: 11, background: '#24405f' }} />
          <span style={{ fontSize: 12, color: '#7d92ac', whiteSpace: 'nowrap' }}>기업·학원 B2B</span>
          <span style={{ width: 1, height: 11, background: '#24405f' }} />
          <Link to="/login" style={{ fontSize: 12, color: '#aab8ca', whiteSpace: 'nowrap', textDecoration: 'none' }}>로그인</Link>
          <Link to="/signup" style={{ fontSize: 12, fontWeight: 700, color: '#e3b45c', whiteSpace: 'nowrap', textDecoration: 'none' }}>시작하기</Link>
        </div>
      </div>

      {/* GNB */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', height: 66, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 30 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <JanusLogo size={30} />
            <span style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>야누스</span>
          </span>
          <nav style={{ display: 'flex', gap: 6, flex: 1 }}>
            <Link to="/placement" style={{ display: 'inline-flex', alignItems: 'center', fontSize: 15.5, fontWeight: 700, color: 'var(--ink)', padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap', textDecoration: 'none' }}>배치표</Link>
            <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', fontSize: 15.5, fontWeight: 600, color: 'var(--ink-body)', padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap', textDecoration: 'none' }}>질문·답변</Link>
            <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', fontSize: 15.5, fontWeight: 600, color: 'var(--ink-body)', padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap', textDecoration: 'none' }}>선생님</Link>
            <Link to="/consulting/apply" style={{ display: 'inline-flex', alignItems: 'center', fontSize: 15.5, fontWeight: 600, color: 'var(--ink-body)', padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap', textDecoration: 'none' }}>상담 신청</Link>
          </nav>
          <Link to="/legacy" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--j-ghost-bg)', border: '1px solid var(--j-ghost-border)', borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap', textDecoration: 'none' }}>구버전 보기</Link>
        </div>
      </header>

      {/* 히어로 — 딥 네이비 포탈 */}
      <section style={{ background: 'radial-gradient(90% 120% at 50% 0%, #16283f 0%, #0d1626 65%)', color: '#fff', padding: '72px 20px 84px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', left: '50%', bottom: -180, transform: 'translateX(-50%)', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(77,147,218,.28), transparent 70%)' }} />
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--j-font-mono)', fontSize: 12, letterSpacing: '.18em', color: '#8fb8de', marginBottom: 18 }}>
            미래를 여는 문 · JANUS
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(34px, 5vw, 56px)', fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.18, color: '#fff' }}>
            무엇을 준비하고 있나요?
          </h1>
          <p style={{ margin: '16px auto 26px', fontSize: 17, lineHeight: 1.65, color: '#c3d2e6', maxWidth: 560 }}>
            한 줄이면 됩니다. 야누스가 지난 입시 데이터를 읽어, 지금의 당신에게 맞는 다음 문을 엽니다.
          </p>
          <form onSubmit={onFind} style={{ display: 'flex', gap: 8, maxWidth: 560, margin: '0 auto' }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="정시로 컴공에 가고 싶어요"
              aria-label="무엇을 준비하고 있나요?"
              style={{ flex: 1, minWidth: 0, padding: '15px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 15.5, outline: 'none' }}
            />
            {/* 골드 채움 — 이 화면의 핵심 전환(1개) */}
            <button type="submit" style={{ padding: '15px 24px', borderRadius: 12, border: 'none', background: 'var(--j-gold)', color: '#fff', fontSize: 15.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
              길 찾기 →
            </button>
          </form>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
            {CHIP_SUGGEST.map((c) => (
              <button key={c} type="button" onClick={() => setQ(c)} style={{ fontSize: 12.5, fontWeight: 600, color: '#c3d2e6', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '6px 13px', whiteSpace: 'nowrap' }}>
                {c}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 26, fontSize: 12.5, color: '#8aa0bd', display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <span>평균 답변 12분</span>·<span>실측 데이터 기반</span>·<span>무료로 시작</span>
          </div>
        </div>
      </section>

      {/* 즉시 행동 타일 3 */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '46px 20px 10px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>바로 시작하기</div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>로그인 없이 · 무료로 시작</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {TILES.map((t) => (
            <Link key={t.title} to={t.to} className="card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 10, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, color: t.iconColor, background: t.iconBg }}>{t.icon}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: t.iconColor, letterSpacing: '.04em' }}>{t.tag}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>{t.title}</div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--ink-body)', flex: 1 }}>{t.desc}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {t.chips.map((c) => (
                  <span key={c} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--j-ghost-bg)', border: '1px solid var(--j-ghost-border)', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>{c}</span>
                ))}
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: t.iconColor }}>{t.cta}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 근거가 곧 신뢰 밴드 */}
      <section style={{ maxWidth: 1180, margin: '26px auto 0', padding: '0 20px', width: '100%' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '22px 26px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--j-font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase' }}>근거가 곧 신뢰</span>
          <div style={{ flex: 1, minWidth: 240, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-body)' }}>
            작년 70%컷은 &lsquo;안정&rsquo;이 아닙니다 — <b style={{ color: 'var(--j-high)' }}>실제 합격률 37%.</b>{' '}
            단정 대신 근거, 공포 대신 다음 행동.
          </div>
          <Link to="/placement" style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--j-blue)', textDecoration: 'none', whiteSpace: 'nowrap' }}>방법 보기 →</Link>
        </div>
      </section>

      {/* 푸터 */}
      <footer style={{ marginTop: 56, borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <JanusLogo size={22} />
            <b style={{ fontSize: 14, color: 'var(--ink)' }}>야누스</b>
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>미래를 여는 문 · 치열한 현재에서 안정된 미래로</span>
          <span style={{ flex: 1 }} />
          <Link to="/terms" style={{ fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>이용약관</Link>
          <Link to="/privacy" style={{ fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>개인정보 처리방침</Link>
          <span style={{ fontFamily: 'var(--j-font-mono)', fontSize: 11, color: 'var(--caption)' }}>© 2026 JANUS</span>
        </div>
      </footer>
    </div>
  );
}
