/* 관문 랜딩(/) — 최신 홈 시안 janus_web2d_v1(포털형) 기준.
 * 구성: 유틸리티 바 → GNB → 히어로 배너 슬라이더(관문/이벤트/Q&A) → 빠른 진입 타일 4
 *      → 지금 필요한 강좌 → 실시간 인기 학과 + 공지 탭 → 신뢰 지표 밴드 → 푸터.
 * 길 찾기 = POST /gateway/interpret (LlmProvider 경유·마스킹·일 상한) — 실패 시 로컬 규칙 폴백(W2 D5).
 * 강좌·인기 학과·공지·지표는 예시 데이터(백엔드 연동 전 — '예시' 라벨 유지).
 * 구 잇올 랜딩(iframe)은 /legacy 병행 유지(패리티 통과 전 삭제 금지). */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { roleHome } from '../auth/roleHome';
import { JanusLogo } from '../components/JanusLogo';
import { LandingIntro, type IntroKey } from '../components/LandingIntro';

/* ── 길 찾기(관문 해석) ── */
interface FindCard { title: string; desc: string; service: string; to: string }
interface FindResult { intent: string; summary: string; cards: FindCard[]; source: 'llm' | 'rules'; reason?: string }

/* 로컬 규칙 폴백 — API 자체가 실패(네트워크 등)해도 막다른 화면 금지(서버 규칙의 축약판) */
function localFallback(s: string): FindResult {
  const has = (kws: string[]) => kws.some((k) => s.includes(k));
  let intent = 'diagnosis';
  if (has(['불안', '멘탈', '슬럼프', '잠', '컨디션'])) intent = 'mental';
  else if (has(['질문', '문제', '모르', '풀이', '해설'])) intent = 'qna';
  else if (has(['상담', '컨설팅', '전략', '전형'])) intent = 'consulting';
  else if (has(['과외', '선생님', '1:1'])) intent = 'tutoring';
  else if (has(['강의', '인강', '강좌'])) intent = 'lecture';
  const cards: Record<string, FindCard[]> = {
    diagnosis: [{ title: '배치표로 지금 위치 확인', desc: '안정·적정·소신·상향 4구간', service: 'diagnosis', to: '/placement' }],
    qna: [{ title: '질문 올리기', desc: '사진 한 장 → ✦ AI 초안 즉시', service: 'qna', to: '/student/qna' }],
    consulting: [{ title: '상담 신청', desc: '진단 근거 위 1:1 전략 상담', service: 'consulting', to: '/consulting/apply' }],
    tutoring: [{ title: '선생님 찾기', desc: '풀별 응답시간·만족도 1:1 매칭', service: 'tutoring', to: '/student/search' }],
    lecture: [{ title: '커리큘럼에서 강의로', desc: '처방 카드에서 강의로 연결', service: 'lecture', to: '/services/lecture' }],
    mental: [{ title: '컨디션·불안 관리', desc: '차분하게, 지킨 것부터', service: 'mental', to: '/services' }],
  };
  return { intent, summary: '연결이 원활하지 않아 규칙으로 해석했어요.', cards: cards[intent], source: 'rules', reason: 'offline' };
}

const SVC_COLOR: Record<string, { c: string; bg: string; icon: string }> = {
  diagnosis: { c: 'var(--j-blue)', bg: 'var(--j-blue-soft)', icon: '◱' },
  qna: { c: 'var(--j-ai)', bg: 'var(--j-ai-soft)', icon: '✦' },
  consulting: { c: 'var(--j-gold-ink)', bg: 'var(--j-gold-soft)', icon: '◇' },
  tutoring: { c: 'var(--j-blue)', bg: 'var(--j-blue-soft)', icon: '◉' },
  lecture: { c: 'var(--j-blue)', bg: 'var(--j-blue-soft)', icon: '▶' },
  mental: { c: 'var(--j-dom-mental)', bg: 'var(--j-aug-soft)', icon: '♡' },
  curriculum: { c: 'var(--j-gold-ink)', bg: 'var(--j-gold-soft)', icon: '◈' },
};

const CHIP_SUGGEST = ['정시', '수시', '성적 입력', '재수', '학부모'];

/* ── 예시 콘텐츠(백엔드 연동 전) ── */
const COURSES = [
  { subj: '수학', title: '2주 완성 미적분 오답 정복', by: '박선생 · 검증 배지', star: '4.9', n: '1,284' },
  { subj: '영어', title: '역접 단서로 빈칸 뚫기', by: '이선생 · 검증 배지', star: '4.8', n: '976' },
  { subj: '국어', title: '화자의 태도 변화 짚기', by: '정선생 · 검증 배지', star: '4.9', n: '803' },
  { subj: '탐구', title: '유전 계산 3일 특강', by: '최선생 · 검증 배지', star: '4.7', n: '612' },
];
const RANK = [
  { r: 1, dept: '컴퓨터공학과', univ: '한서대', cut: '91.0', sig: '소신', cls: 'sig-reach' },
  { r: 2, dept: '전자공학과', univ: '한서대', cut: '88.0', sig: '적정', cls: 'sig-fit' },
  { r: 3, dept: '기계공학과', univ: '대현대', cut: '86.0', sig: '적정', cls: 'sig-fit' },
  { r: 4, dept: '산업경영공학과', univ: '대현대', cut: '84.0', sig: '안정', cls: 'sig-stable' },
  { r: 5, dept: '정보통신공학과', univ: '서강북대', cut: '79.0', sig: '안정', cls: 'sig-stable' },
];
const NOTICES: Record<string, { tag: string; title: string; date: string }[]> = {
  공지: [
    { tag: '데이터', title: '2026학년도 정시 입결 반영 완료 안내', date: '07.11' },
    { tag: '점검', title: '7/15 새벽 정기 점검 (02:00~04:00)', date: '07.09' },
    { tag: '정책', title: '환불 정책 개정 안내 (v2026.08)', date: '07.05' },
    { tag: '기능', title: '✦ AI 초안 응답 속도 개선 업데이트', date: '07.01' },
  ],
  이벤트: [
    { tag: '진행중', title: '친구 초대하면 선생님 답변 5회 추가', date: '~07.31' },
    { tag: '신규', title: '첫 달 멤버십 50% — 모평 대비 패키지', date: '~08.15' },
    { tag: '예정', title: '9월 모평 실시간 채점 이벤트', date: '09.04' },
  ],
  뉴스: [
    { tag: '분석', title: '2027 입시 지원 경향 — 자연계 상향 심화', date: '07.10' },
    { tag: '분석', title: '6·9월 모평 표본으로 본 등급컷 흐름', date: '07.06' },
    { tag: '일정', title: '9월 수시 원서 접수 주요 일정 정리', date: '07.02' },
  ],
};

const GNB_TABS: { label: string; key: IntroKey }[] = [
  { label: '배치표', key: 'baechi' },
  { label: '질문·답변', key: 'qna' },
  { label: '강좌', key: 'lecture' },
  { label: '1:1 상담', key: 'consult' },
  { label: '서비스', key: 'services' },
];

export function JanusLandingPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const rawSec = params.get('sec');
  const sec: IntroKey | null = GNB_TABS.some((t) => t.key === rawSec) ? (rawSec as IntroKey) : null; // null = 홈(기본 랜딩)
  const goSec = (s: IntroKey | 'home') => setParams(s === 'home' ? {} : { sec: s });
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);
  const [slide, setSlide] = useState(0);
  const [noticeTab, setNoticeTab] = useState<'공지' | '이벤트' | '뉴스'>('공지');

  async function interpret(s: string) {
    if (!s || busy) return;
    setBusy(true);
    try {
      setResult(await api.post<FindResult>('/gateway/interpret', { q: s }));
    } catch {
      setResult(localFallback(s));
    } finally {
      setBusy(false);
    }
  }
  function onFind(e: FormEvent) {
    e.preventDefault();
    void interpret(q.trim());
  }
  // 딥링크: /?q=... 진입 시 자동 해석(제안 칩·외부 링크 공유용)
  useEffect(() => {
    const initial = params.get('q')?.trim();
    if (initial) void interpret(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nSlides = 3;
  const nav = (d: number) => setSlide((s) => (s + d + nSlides) % nSlides);

  // 히어로 자동 전환(6초) — 입력·검색 중이거나 모션 최소화 설정이면 정지.
  //  slide 를 deps 에 넣어 수동 이동 직후에도 6초 뒤부터 다시 흐르게 한다.
  useEffect(() => {
    if (q || result || busy) return; // 사용자가 입력/검색 중이면 자동전환 멈춤(방해 금지)
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % nSlides), 6000);
    return () => clearInterval(t);
  }, [q, result, busy, slide]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* 유틸리티 바 — 보조 진입 */}
      <div style={{ background: 'var(--j-chrome)', height: 36 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', height: '100%', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 18 }}>
          <span style={{ fontSize: 12, color: '#7d92ac', whiteSpace: 'nowrap' }}>학부모이신가요?</span>
          <span style={{ width: 1, height: 11, background: '#24405f' }} />
          <span style={{ fontSize: 12, color: '#7d92ac', whiteSpace: 'nowrap' }}>가르치러 오셨나요?</span>
          <span style={{ width: 1, height: 11, background: '#24405f' }} />
          <span style={{ fontSize: 12, color: '#7d92ac', whiteSpace: 'nowrap' }}>기업·학원 B2B</span>
          <span style={{ width: 1, height: 11, background: '#24405f' }} />
          {!user && (
            <>
              <Link to="/login" style={{ fontSize: 12, color: '#aab8ca', whiteSpace: 'nowrap', textDecoration: 'none' }}>로그인</Link>
              <Link to="/signup" style={{ fontSize: 12, fontWeight: 700, color: '#e3b45c', whiteSpace: 'nowrap', textDecoration: 'none' }}>시작하기</Link>
            </>
          )}
        </div>
      </div>

      {/* GNB */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', height: 66, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
            <button type="button" onClick={() => goSec('home')} title="처음 화면으로"
              style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <JanusLogo size={30} />
              <span style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>야누스</span>
            </button>
            {user && (
              <Link to={roleHome(user.role)} style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--j-gold-ink, #a9791f)', whiteSpace: 'nowrap', textDecoration: 'none', paddingLeft: 39 }}>내 관문으로 →</Link>
            )}
          </div>
          <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
            {GNB_TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => goSec(t.key)} style={{
                display: 'inline-flex', alignItems: 'center', fontSize: 15.5, whiteSpace: 'nowrap', cursor: 'pointer',
                fontWeight: sec === t.key ? 800 : 600,
                color: sec === t.key ? 'var(--j-blue)' : 'var(--ink-body)',
                background: sec === t.key ? 'var(--j-blue-soft)' : 'transparent',
                border: 'none', padding: '8px 12px', borderRadius: 8,
              }}>{t.label}</button>
            ))}
          </nav>
        </div>
      </header>

      {sec ? (
        <LandingIntro sec={sec} user={user} />
      ) : (
      <>
      {/* 히어로 배너 슬라이더 — 관문 / 이벤트 / Q&A */}
      <section style={{ position: 'relative', background: 'radial-gradient(90% 130% at 50% 0%, #16283f 0%, #0d1626 70%)', color: '#fff', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 20px', minHeight: 430, display: 'flex', alignItems: 'center' }}>
          {/* 슬라이드 1 — 관문(딥 포탈) */}
          {slide === 0 && (
            <div style={{ width: '100%', textAlign: 'center', padding: '46px 0 60px' }}>
              <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 12, letterSpacing: '.18em', color: '#8fb8de', marginBottom: 16 }}>미래를 여는 문 · JANUS</div>
              <h1 style={{ margin: 0, fontSize: 'clamp(32px, 4.6vw, 52px)', fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.18, color: '#fff' }}>무엇을 준비하고 있나요?</h1>
              <p style={{ margin: '14px auto 24px', fontSize: 17, lineHeight: 1.65, color: '#c3d2e6', maxWidth: 560 }}>
                한 줄이면 됩니다. 야누스가 지난 입시 데이터를 읽어, 지금의 당신에게 맞는 길을 엽니다.
              </p>
              <form onSubmit={onFind} style={{ display: 'flex', gap: 8, maxWidth: 560, margin: '0 auto' }}>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="예: 정시로 컴퓨터공학에 가고 싶어요"
                  aria-label="무엇을 준비하고 있나요?"
                  style={{ flex: 1, minWidth: 0, padding: '15px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 15.5, outline: 'none' }}
                />
                {/* 골드 채움 — 이 화면의 핵심 전환(1개) */}
                <button type="submit" disabled={busy} style={{ padding: '15px 24px', borderRadius: 12, border: 'none', background: 'var(--j-gold)', color: '#fff', fontSize: 15.5, fontWeight: 800, whiteSpace: 'nowrap', opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}>
                  {busy ? '해석 중…' : '길 찾기 →'}
                </button>
              </form>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 13 }}>
                {CHIP_SUGGEST.map((c) => (
                  <button key={c} type="button" onClick={() => setQ(c)} style={{ fontSize: 12.5, fontWeight: 600, color: '#c3d2e6', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 999, padding: '6px 13px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                    {c}
                  </button>
                ))}
              </div>

              {/* 해석 결과 — 커리큘럼 카드(AI 투명성 라벨 필수) */}
              {result && (
                <div style={{ maxWidth: 560, margin: '18px auto 0', textAlign: 'left', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {result.source === 'llm' ? (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b9addf', background: 'rgba(154,139,232,.2)', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>✦ AI 초안</span>
                    ) : (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#93a7bd', background: 'rgba(255,255,255,.08)', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>규칙 분류</span>
                    )}
                    <span style={{ fontSize: 13, color: '#c3d2e6', lineHeight: 1.5 }}>{result.summary}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.cards.map((c) => {
                      const s = SVC_COLOR[c.service] ?? SVC_COLOR.diagnosis;
                      return (
                        <Link key={c.title} to={c.to} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', textDecoration: 'none' }}>
                          <span style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: s.c, background: s.bg, flexShrink: 0 }}>{s.icon}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <b style={{ display: 'block', fontSize: 14, color: '#eef3fb' }}>{c.title}</b>
                            <span style={{ fontSize: 12, color: '#8aa0bd' }}>{c.desc}</span>
                          </span>
                          <span style={{ color: '#e3b45c', fontWeight: 800 }}>›</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 슬라이드 2 — 이벤트(멤버십) */}
          {slide === 1 && (
            <div className="jz-hero-grid" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 30, alignItems: 'center', padding: '46px 0 60px' }}>
              <div>
                <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 12, letterSpacing: '.16em', color: '#e3b45c', marginBottom: 14 }}>EVENT · 8/15까지</div>
                <h2 style={{ margin: 0, fontSize: 'clamp(28px, 3.6vw, 42px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.25 }}>
                  첫 달 멤버십 <span style={{ color: '#e3b45c' }}>50%</span>
                </h2>
                <p style={{ margin: '12px 0 22px', fontSize: 16, lineHeight: 1.7, color: '#c3d2e6', maxWidth: 480 }}>
                  9월 모평 대비 패키지 — AI 답변 무제한에 <b style={{ color: '#eef3fb' }}>선생님 답변 월 30회</b>까지 한 번에.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link to="/student/membership" style={{ padding: '13px 24px', borderRadius: 11, background: 'var(--j-gold)', color: '#fff', fontSize: 14.5, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}>멤버십 살펴보기 →</Link>
                  <span style={{ padding: '13px 20px', borderRadius: 11, border: '1px solid rgba(255,255,255,.18)', color: '#c3d2e6', fontSize: 14, whiteSpace: 'nowrap' }}>이벤트 전체 보기</span>
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16, padding: 22 }}>
                <div style={{ fontSize: 12, color: '#8aa0bd', marginBottom: 6 }}>첫 달 한정</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="mono" style={{ fontSize: 15, color: '#8aa0bd', textDecoration: 'line-through' }}>49,000원</span>
                  <span className="mono" style={{ fontSize: 30, fontWeight: 800, color: '#e3b45c' }}>24,500원</span>
                  <span style={{ fontSize: 13, color: '#c3d2e6' }}>/월</span>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', marginTop: 14, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13.5, color: '#c3d2e6' }}>
                  <span><b style={{ color: '#9a8be8' }}>✦</b> AI 답변 무제한</span>
                  <span><b style={{ color: '#4d93da' }}>✓</b> 선생님 답변 월 30회</span>
                  <span><b style={{ color: '#8fb8de' }}>◱</b> 배치표·격차 리포트 포함</span>
                </div>
              </div>
            </div>
          )}

          {/* 슬라이드 3 — Q&A */}
          {slide === 2 && (
            <div className="jz-hero-grid" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 30, alignItems: 'center', padding: '46px 0 60px' }}>
              <div>
                <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 12, letterSpacing: '.16em', color: '#9a8be8', marginBottom: 14 }}>질문·답변</div>
                <h2 style={{ margin: 0, fontSize: 'clamp(28px, 3.6vw, 42px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.25 }}>모르는 문제, 평균 12분</h2>
                <p style={{ margin: '12px 0 22px', fontSize: 16, lineHeight: 1.7, color: '#c3d2e6', maxWidth: 460 }}>
                  AI 초안이 1분 내 먼저 도착하고, 선생님이 검수하면 <b style={{ color: '#4d93da' }}>✓ 선생님 답변</b>으로 게시됩니다.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link to="/services/qna" style={{ padding: '13px 24px', borderRadius: 11, background: 'var(--j-blue)', color: '#fff', fontSize: 14.5, fontWeight: 800, textDecoration: 'none', whiteSpace: 'nowrap' }}>질문·답변 둘러보기 →</Link>
                  <Link to="/services/tutoring" style={{ padding: '13px 20px', borderRadius: 11, border: '1px solid rgba(255,255,255,.18)', color: '#c3d2e6', fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' }}>선생님 프로필 보기</Link>
                </div>
                <div style={{ marginTop: 18, fontSize: 12.5, color: '#8aa0bd' }}>검증 선생님 320명 · 평균 응답 12분</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ background: 'rgba(154,139,232,.12)', border: '1px solid rgba(154,139,232,.3)', borderRadius: 13, padding: '13px 15px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#9a8be8', marginBottom: 5 }}>✦ AI 초안 <span style={{ fontWeight: 600, color: '#8aa0bd' }}>· 1분 내 도착</span></div>
                  <div style={{ fontSize: 13, color: '#c3d2e6', lineHeight: 1.6 }}>u=sinx로 치환하면 적분 구간을 du 기준으로 다시 읽어야 해요…</div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 11.5, color: '#657b95' }}>↓ 선생님 검수</div>
                <div style={{ background: 'rgba(77,147,218,.12)', border: '1px solid rgba(77,147,218,.3)', borderRadius: 13, padding: '13px 15px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#4d93da', marginBottom: 5 }}>✓ 선생님 답변 <span style={{ fontWeight: 600, color: '#8aa0bd' }}>· 박선생 · 12분 전</span></div>
                  <div style={{ fontSize: 13, color: '#c3d2e6', lineHeight: 1.6 }}>풀이 3단계로 정리했어요. 유사 기출 2문항도 함께 확인해 보세요.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 슬라이더 컨트롤 */}
        <div style={{ position: 'absolute', right: 20, bottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mono" style={{ fontSize: 11.5, color: '#8aa0bd' }}>{slide + 1} / {nSlides}</span>
          <button type="button" aria-label="이전 배너" onClick={() => nav(-1)} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.06)', color: '#c3d2e6', cursor: 'pointer' }}>‹</button>
          <button type="button" aria-label="다음 배너" onClick={() => nav(1)} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.06)', color: '#c3d2e6', cursor: 'pointer' }}>›</button>
        </div>
      </section>

      {/* 빠른 진입 타일 4 */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 20px 6px', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {[
            { icon: '◱', c: 'var(--j-blue)', bg: 'var(--j-blue-soft)', t: '실측 배치표', d: '근거·신뢰도까지', to: '/placement' },
            { icon: '✦', c: 'var(--j-ai)', bg: 'var(--j-ai-soft)', t: '질문·답변', d: 'AI 초안 + 선생님 검수', to: '/services/qna' },
            { icon: '◇', c: 'var(--j-gold-ink)', bg: 'var(--j-gold-soft)', t: '1:1 상담', d: '전문가 컨설팅', to: '/consulting/apply' },
            { icon: '▶', c: 'var(--j-blue)', bg: 'var(--j-blue-soft)', t: '강좌', d: '격차 리포트 처방', to: '/services/lecture' },
          ].map((x) => (
            <Link key={x.t} to={x.to} className="card" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '15px 17px' }}>
              <span style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: x.c, background: x.bg, flexShrink: 0 }}>{x.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)' }}>{x.t}</b>
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{x.d}</span>
              </span>
              <span style={{ color: 'var(--j-arrow-muted)', fontWeight: 700 }}>›</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 지금 필요한 강좌 */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 20px 6px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>지금 필요한 강좌</h2>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>격차 리포트가 처방한 것만 — 무한 카탈로그가 아닙니다</span>
          <span style={{ flex: 1 }} />
          <Link to="/services/lecture" style={{ fontSize: 13, fontWeight: 700, color: 'var(--j-blue)', textDecoration: 'none', whiteSpace: 'nowrap' }}>전체보기 ›</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {COURSES.map((c) => (
            <Link key={c.title} to="/services/lecture" className="card" style={{ textDecoration: 'none', padding: 16 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--j-blue)', background: 'var(--j-blue-soft)', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' }}>{c.subj}</span>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', margin: '9px 0 5px', lineHeight: 1.45 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.by}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 9, fontSize: 12, color: 'var(--ink-body)' }}>
                <span style={{ color: 'var(--j-gold-ink)', fontWeight: 700 }}>★ {c.star}</span>
                <span className="mono">수강 {c.n}</span>
              </div>
            </Link>
          ))}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--caption)' }}>예시 콘텐츠 — 강좌 연동 전</p>
      </section>

      {/* 실시간 인기 학과 + 공지 탭 */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 20px 6px', width: '100%' }}>
        <div className="jz-two-col" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ fontSize: 15, color: 'var(--ink)' }}>실시간 인기 학과</b>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--j-blue)', background: 'var(--j-blue-soft)', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>자연 계열</span>
              <span style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: 11, color: 'var(--caption)' }}>백분위 87 기준 · 예시</span>
            </div>
            <table className="dtable" style={{ fontSize: 13.5 }}>
              <thead>
                <tr><th style={{ width: 44 }}>순위</th><th>학과</th><th>대학</th><th className="num">작년 컷</th><th>신호</th></tr>
              </thead>
              <tbody>
                {RANK.map((r) => (
                  <tr key={r.r}>
                    <td className="mono" style={{ fontWeight: 700, color: r.r <= 3 ? 'var(--j-gold-ink)' : 'var(--muted)' }}>{r.r}</td>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.dept}</td>
                    <td>{r.univ}</td>
                    <td className="num">{r.cut}</td>
                    <td><span className={`chip ${r.cls}`} style={{ fontSize: 10.5, padding: '3px 9px' }}>● {r.sig}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--line-soft)' }}>
              {(['공지', '이벤트', '뉴스'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setNoticeTab(t)} style={{
                  flex: 1, padding: '12px 0', border: 'none', background: 'none', fontSize: 13.5, cursor: 'pointer',
                  fontWeight: noticeTab === t ? 800 : 600, color: noticeTab === t ? 'var(--j-blue)' : 'var(--muted)',
                  borderBottom: noticeTab === t ? '2px solid var(--j-blue)' : '2px solid transparent',
                }}>{t}</button>
              ))}
            </div>
            <div>
              {NOTICES[noticeTab].map((n) => (
                <div key={n.title} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px', borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--j-ghost-bg)', border: '1px solid var(--j-ghost-border)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{n.tag}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--ink-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--caption)', whiteSpace: 'nowrap' }}>{n.date}</span>
                </div>
              ))}
              <p style={{ margin: 0, padding: '9px 15px', fontSize: 11, color: 'var(--caption)' }}>예시 콘텐츠 — 공지 연동 전</p>
            </div>
          </div>
        </div>
      </section>

      {/* 신뢰 지표 밴드 */}
      <section style={{ maxWidth: 1180, margin: '26px auto 0', padding: '0 20px', width: '100%' }}>
        <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, textAlign: 'center', padding: '20px 16px' }}>
          {[
            { v: '12.4만', l: '누적 배치 표본' },
            { v: '±0.4', l: '작년 실측 오차(백분위)' },
            { v: '84만', l: '누적 질문·답변' },
            { v: '320명', l: '검증 선생님' },
          ].map((s) => (
            <div key={s.l}>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--j-navy)' }}>{s.v}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--caption)', textAlign: 'center' }}>지표는 예시이며 실서비스 수치로 교체됩니다</p>
      </section>
      </>
      )}

      {/* 푸터 — 3컬럼 + 사업자 정보 */}
      <footer style={{ marginTop: 46, borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div className="jz-footer-grid" style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 20px 14px', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 20 }}>
          <div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <JanusLogo size={24} />
              <b style={{ fontSize: 15, color: 'var(--ink)' }}>야누스</b>
            </span>
            <p style={{ margin: '9px 0 0', fontSize: 12.5, lineHeight: 1.7, color: 'var(--muted)' }}>성적이 문이 되는 곳.<br />실측 데이터로 진단부터 처방까지.</p>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>서비스</div>
            {[['배치표', '/placement'], ['카이로스', '/placement/hub'], ['질문·답변', '/services/qna'], ['강좌', '/services/lecture'], ['1:1 상담', '/consulting/apply']].map(([l, to]) => (
              <Link key={l} to={to} style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none', padding: '3px 0' }}>{l}</Link>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>고객지원</div>
            {['공지사항', '자주 묻는 질문', '1:1 문의'].map((l) => (
              <span key={l} style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', padding: '3px 0' }}>{l}</span>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>정책</div>
            <Link to="/terms" style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none', padding: '3px 0' }}>이용약관</Link>
            <Link to="/privacy" style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none', padding: '3px 0' }}>개인정보처리방침</Link>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', padding: '3px 0' }}>청소년보호정책</span>
          </div>
        </div>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '12px 20px 26px', borderTop: '1px solid var(--line-soft)', fontSize: 11, lineHeight: 1.8, color: 'var(--caption)' }}>
          (주)야누스에듀 · 대표 000 · 서울특별시 000구 000로 00 · 사업자등록번호 000-00-00000 · 통신판매업신고 2026-서울000-0000 · 고객센터 <b className="mono">1600-0000</b> (평일 10:00~18:00)<br />
          © 2026 JANUS EDU. All rights reserved. · 등록번호·수치는 예시입니다.
        </div>
      </footer>

      <style>{`
        @media (max-width: 760px) {
          .jz-hero-grid { grid-template-columns: 1fr !important; }
          .jz-two-col { grid-template-columns: 1fr !important; }
          .jz-footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
