import { Link } from 'react-router-dom';
import type { Me } from '../api/types';

/** 메인 GNB 항목별 소개 패널 — 실제 회원 툴로 급격히 전환하지 않고, 상단 메뉴는 고정한 채
 *  이 영역만 스왑되어 항목의 세부내용을 '소개'한다(익숙치 않은 방문자에게 정돈된 흐름). */
export type IntroKey = 'baechi' | 'qna' | 'lecture' | 'consult' | 'services';

interface Feature { icon: string; title: string; desc: string }
interface Cta { label: string; to: string; toAuth?: string; gold?: boolean; memberOnly?: boolean }
interface Section {
  eyebrow: string;
  title: string;
  lead: string;
  features: Feature[];
  ctas: Cta[];
  note?: string;
}

const SECTIONS: Record<IntroKey, Section> = {
  baechi: {
    eyebrow: '입시 배치표 · IANUS',
    title: '실측으로 판단하는 지원 가능선',
    lead: '발표 컷이 아니라 작년 실제 합격자 분포로 봅니다. 표준점수·백분위·등급 중 편한 것으로 넣으면, 야누스가 환산해 안정·적정·소신·상향 네 구간으로 정리해줘요.',
    features: [
      { icon: '▤', title: '실측 70%컷', desc: '작년 합격자 하위 30% 지점 — 발표 컷이 아닌 실측 분포로 판단.' },
      { icon: '↗', title: '다년 추세', desc: '3개년 컷 이동 방향까지 표시 — 한 해 반짝 컷에 속지 않게.' },
      { icon: '≈', title: '변동성·신뢰도', desc: '출렁이는 학과는 표준편차로, 표본·최신성은 A~C 등급으로 공개.' },
      { icon: '◱', title: '격차 리포트', desc: '내 성적과 목표컷의 격차를 근거와 함께 — 무엇을 얼마나 올려야 하는지.' },
    ],
    ctas: [
      { label: '무료 미리보기 열기 →', to: '/placement', gold: true },
      { label: '전체 배치표 허브', to: '/placement/hub', toAuth: '/student/placement/hub', memberOnly: true },
    ],
    note: '구간별 대표 학과는 무료 · 실측 컷·검색·전체 학과는 회원부터.',
  },
  qna: {
    eyebrow: '질문·답변 · IANUS',
    title: '막힌 한 문제, 그 자리에서 풀립니다',
    lead: '선생님 1:1 답변과 무료 커뮤니티, 두 갈래로. 급한 질문은 강제배정 SLA로 빠르게, 가벼운 질문은 커뮤니티에서 전원이 함께 — AI 1차 초안이 먼저 방향을 잡아줍니다.',
    features: [
      { icon: '⚡', title: '빠른 배정', desc: '공개 질문은 선착순·강제배정으로 방치 없이 답변 연결.' },
      { icon: '✦', title: 'AI 1차 초안', desc: '등록 즉시 AI가 초안을 붙여 방향을 먼저 잡아줍니다(투명 표기).' },
      { icon: '✓', title: '채택·재답변', desc: '만족스러우면 채택, 아쉬우면 다른 선생님께 재답변 요청.' },
      { icon: '◎', title: '무료 커뮤니티', desc: '3부 공개 게시판 — 학생도 답변하고 채택되는 열린 Q&A.' },
    ],
    ctas: [
      { label: '질문·답변 살펴보기 →', to: '/services/qna', gold: true },
      { label: '커뮤니티 바로가기', to: '/login', toAuth: '/student/community/board', memberOnly: true },
    ],
  },
  lecture: {
    eyebrow: '강좌 · IANUS',
    title: '필요한 지점만, 짧고 정확하게',
    lead: '전 범위를 훑는 강의가 아니라, 지금 막힌 개념·유형을 겨냥한 강좌. 진단에서 드러난 약점과 연결해 무엇을 들을지까지 안내합니다.',
    features: [
      { icon: '◧', title: '지점 강의', desc: '개념·유형 단위로 쪼갠 강의 — 필요한 곳만 골라 듣기.' },
      { icon: '◱', title: '진단 연계', desc: '실력진단·격차 리포트가 가리키는 약점과 강좌를 연결.' },
      { icon: '▷', title: '검증 강사', desc: '검증 배지 강사의 강의 — 후기·채택 실적으로 투명 공개.' },
    ],
    ctas: [
      { label: '강좌 둘러보기 →', to: '/services/lecture', toAuth: '/student/lectures', gold: true },
    ],
  },
  consult: {
    eyebrow: '1:1 상담 · IANUS',
    title: '데이터를 사람이 읽어드립니다',
    lead: '배치표·진단이 만든 근거를 놓고, 전문 상담자와 직접 이야기합니다. 화상·채팅으로 예약하고, 상담 기록은 다음 단계로 이어집니다.',
    features: [
      { icon: '◔', title: '간편 예약', desc: '원하는 시간에 화상/채팅 상담을 예약 — 빈 슬롯을 바로 확인.' },
      { icon: '◱', title: '근거 기반', desc: '내 성적·격차·배치표를 함께 놓고 구체적으로 상담.' },
      { icon: '❐', title: '상담 기록', desc: '오간 내용이 기록으로 남아 커리큘럼·재상담으로 연결.' },
    ],
    ctas: [
      { label: '1:1 상담 신청 →', to: '/consulting/apply', gold: true },
    ],
  },
  services: {
    eyebrow: '서비스 전체 · IANUS',
    title: '진단에서 통과까지, 하나의 관문',
    lead: '실력진단·배치표·질문답변·강좌·상담·클리닉이 따로 놀지 않고 한 흐름으로 이어집니다. 지금 어디에 있든, 다음 한 걸음을 야누스가 안내합니다.',
    features: [
      { icon: '◱', title: '진단·배치', desc: '실력진단 → 배치표 → 격차 리포트로 위치와 목표를 정렬.' },
      { icon: '◎', title: '실행', desc: '질문답변·강좌·1:1 상담·클리닉으로 약점을 실제로 메움.' },
      { icon: '⧉', title: '연결', desc: '각 단계 결과가 다음 단계 입력이 되는 끊김 없는 흐름.' },
    ],
    ctas: [
      { label: '서비스 전체 보기 →', to: '/services', gold: true },
      { label: '내 관문으로', to: '/login', toAuth: '/student', memberOnly: true },
    ],
  },
};

export function LandingIntro({ sec, user }: { sec: IntroKey; user: Me | null }) {
  const s = SECTIONS[sec];
  if (!s) return null;
  return (
    <div>
      {/* 소개 히어로 — 다크 밴드(브랜드 일관) */}
      <section style={{ background: 'radial-gradient(90% 130% at 50% 0%, #16283f 0%, #0d1626 70%)', color: '#fff' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '54px 20px 48px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 12, letterSpacing: '.16em', color: '#8fb8de', marginBottom: 14 }}>{s.eyebrow}</div>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.2 }}>{s.title}</h1>
          <p style={{ margin: '16px auto 26px', fontSize: 16.5, lineHeight: 1.7, color: '#c3d2e6', maxWidth: 620 }}>{s.lead}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {s.ctas
              .filter((c) => !c.memberOnly || user)
              .map((c) => (
                <Link key={c.to} to={user && c.toAuth ? c.toAuth : c.to}
                  className={c.gold ? 'btn gold' : 'btn'}
                  style={{ textDecoration: 'none', padding: '13px 28px', fontSize: 15, ...(c.gold ? {} : { background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.2)' }) }}>
                  {c.label}
                </Link>
              ))}
          </div>
          {s.note && <p style={{ margin: '16px 0 0', fontSize: 12.5, color: '#8fb8de' }}>{s.note}</p>}
        </div>
      </section>

      {/* 특징 카드 */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 20px 12px', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          {s.features.map((f) => (
            <div key={f.title} className="card" style={{ padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--j-blue-soft)', color: 'var(--j-blue)', fontSize: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{f.icon}</span>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 하단 안내 — 홈으로 돌아가는 결 */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '18px 20px 40px', textAlign: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          더 둘러보려면 상단 메뉴를, 처음 화면은 <b style={{ color: 'var(--ink-body)' }}>로고</b>를 눌러주세요.
        </span>
      </div>
    </div>
  );
}
