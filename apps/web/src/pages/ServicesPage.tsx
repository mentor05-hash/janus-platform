/* /services 야누스 서비스 체계 — 구 연계서비스(iframe 7종·레거시) rebuild.
 * 여정 프레임(시안·기획): 진단 → 처방 → 실행(Q&A·상담·과외·클리닉·강의) → 통과.
 * 도메인 아이콘 색 = 축1, CTA 위계 = 축2(골드 채움 화면당 1개). 구 slug는 근접 서비스로 리다이렉트.
 * 구버전 iframe은 /legacy/services 병행(패리티 전 삭제 금지). */
import { Link, Navigate, useParams } from 'react-router-dom';
import { JanusLogo } from '../components/JanusLogo';

type Svc = {
  slug: string; icon: string; color: string; soft: string;
  stage: '진단' | '처방' | '실행';
  name: string; tagline: string;
  desc: string;
  steps: { t: string; d: string }[];
  evidence: string[];
  cta: { label: string; to: string };
  status?: '준비 중';
};

export const SERVICES: Svc[] = [
  {
    slug: 'diagnosis', icon: '◱', color: 'var(--j-blue)', soft: 'var(--j-blue-soft)', stage: '진단',
    name: '배치표·수준진단', tagline: '지금 위치를 실측 데이터로',
    desc: '성적표 사진 한 장(OCR) 또는 직접 입력으로 시작합니다. 안정·적정·소신·상향 4구간 배치표와 과목별 격차 리포트가 즉시 열립니다.',
    steps: [
      { t: '성적 입력', d: '사진 OCR 또는 표점·백분위·등급 직접 입력' },
      { t: '4구간 배치', d: '실측 70%컷·다년 추세·변동성·신뢰도 등급 기반' },
      { t: '격차 리포트', d: '목표까지 부족분과 다음 행동을 근거와 함께' },
    ],
    evidence: ['실측 70%컷', '3개년 추세', '신뢰도 등급'],
    cta: { label: '예시로 둘러보기 →', to: '/placement' },
  },
  {
    slug: 'curriculum', icon: '◈', color: 'var(--j-gold-ink)', soft: 'var(--j-gold-soft)', stage: '처방',
    name: '커리큘럼 처방', tagline: '격차가 곧 커리큘럼이 됩니다',
    desc: '진단 결과가 모든 처방의 입력입니다. 격차가 큰 과목부터 커리큘럼 카드로 배열되고, 각 카드는 다음 문(질문·상담·과외·강의)으로 이어집니다.',
    steps: [
      { t: '격차 분석', d: '진단 결과에서 과목·단원별 부족분 추출' },
      { t: '카드 배열', d: '우선순위 커리큘럼 카드 자동 구성' },
      { t: '다음 문 연결', d: '카드마다 실행 서비스로 골드 CTA 1개' },
    ],
    evidence: ['진단 연동', 'AI 투명성 라벨'],
    cta: { label: '진단부터 시작 →', to: '/placement' },
  },
  {
    slug: 'qna', icon: '✦', color: 'var(--j-ai)', soft: 'var(--j-ai-soft)', stage: '실행',
    name: '질문·답변 (Q&A)', tagline: '사진 한 장이면 AI 초안 즉시',
    desc: '모르는 문제를 사진으로 올리면 AI 초안이 즉시 달리고, 이어서 선생님이 검토해 답합니다. 모든 답변에는 AI 투명성 라벨(✦ 초안 / ✦✎ 보완 / ✓ 선생님)이 붙습니다.',
    steps: [
      { t: '사진 업로드', d: '문제 사진 또는 텍스트 질문' },
      { t: '✦ AI 초안', d: '즉시 풀이 초안 — 평균 12분 내 응답' },
      { t: '✓ 선생님 검토', d: '검수 큐를 거친 최종 답변 게시' },
    ],
    evidence: ['평균 답변 12분', 'AI 투명성 라벨'],
    cta: { label: '질문 올리기 →', to: '/student/qna' },
  },
  {
    slug: 'consulting', icon: '◇', color: 'var(--j-gold-ink)', soft: 'var(--j-gold-soft)', stage: '실행',
    name: '상담·컨설팅', tagline: '진단 근거 위에서 하는 전략 상담',
    desc: '배치표·격차 리포트를 근거로 1:1 입시 전략 상담을 진행합니다. 지원선 설계, 전형 선택, 시기별 우선순위를 데이터와 함께 정리합니다.',
    steps: [
      { t: '신청', d: '목표·현재 상황 입력(실폼 접수)' },
      { t: '배정', d: '풀별 응답시간·만족도 기반 컨설턴트 매칭' },
      { t: '상담·기록', d: '상담 노트와 다음 행동이 계정에 남음' },
    ],
    evidence: ['★ 4.9 만족도', '상담 기록 보존'],
    cta: { label: '상담 신청하기 →', to: '/consulting/apply' },
  },
  {
    slug: 'tutoring', icon: '◉', color: 'var(--j-blue)', soft: 'var(--j-blue-soft)', stage: '실행',
    name: '1:1 과외', tagline: '내 격차에 맞는 선생님 매칭',
    desc: '격차 리포트 기반으로 과목·단원에 맞는 선생님을 찾고, 예약부터 화상 수업·자료·기록까지 한곳에서 진행합니다.',
    steps: [
      { t: '선생님 찾기', d: '풀별 응답시간·만족도·전문 과목으로 선택' },
      { t: '예약·수업', d: '일정 예약 → 실시간 화상 룸 수업' },
      { t: '기록·환류', d: '수업 기록이 다음 진단의 입력으로' },
    ],
    evidence: ['1:1 매칭', '실시간 룸'],
    cta: { label: '선생님 둘러보기 →', to: '/student/search' },
  },
  {
    slug: 'clinic', icon: '✚', color: 'var(--j-dom-mental)', soft: 'var(--j-aug-soft)', stage: '실행',
    name: '클리닉', tagline: '약점 단원 단기 집중 보완',
    desc: '격차가 확인된 단원을 소수 정원으로 짧고 집중력 있게 보완합니다. 정원·개설 일정은 시즌별로 공지됩니다.',
    steps: [
      { t: '약점 확인', d: '진단·격차 리포트에서 대상 단원 선정' },
      { t: '클리닉 참여', d: '소수 정원 단기 집중 과정' },
      { t: '재진단', d: '보완 후 재진단으로 이행 확인' },
    ],
    evidence: ['소수 정원', '진단 연동'],
    cta: { label: '개설 알림 받기 →', to: '/signup' },
    status: '준비 중',
  },
  {
    slug: 'lecture', icon: '▶', color: 'var(--j-blue)', soft: 'var(--j-blue-soft)', stage: '실행',
    name: '강의 (VOD)', tagline: '커리큘럼 카드에서 바로 이어지는 강의',
    desc: '처방된 커리큘럼 카드에서 필요한 강의로 바로 이어집니다. 수강 기록은 플래너·대시보드 지표로 환류됩니다.',
    steps: [
      { t: '카드에서 진입', d: '커리큘럼 카드의 강의 CTA로 이동' },
      { t: '수강', d: 'VOD 플레이어 — 배속·이어보기' },
      { t: '지표 환류', d: '수강 이행이 대시보드 "지금 위치"에 반영' },
    ],
    evidence: ['커리큘럼 연동'],
    cta: { label: '시작하기 →', to: '/signup' },
    status: '준비 중',
  },
];

/* 레거시 slug → 야누스 서비스 매핑(URL 호환) */
const LEGACY_SLUG: Record<string, string> = {
  baechi: 'diagnosis', mock: 'diagnosis', ipgyeol: 'diagnosis',
  jaso: 'consulting', ganggi: 'lecture', planner: 'curriculum',
};

const STAGES: Array<Svc['stage']> = ['진단', '처방', '실행'];

function ServicesHeader() {
  return (
    <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 20 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', height: 66, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <JanusLogo size={30} />
          <span style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>야누스</span>
        </Link>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--j-blue)', background: 'var(--j-blue-soft)', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap' }}>서비스</span>
        <span style={{ flex: 1 }} />
        <Link to="/login" className="btn sm" style={{ textDecoration: 'none' }}>로그인</Link>
      </div>
    </header>
  );
}

export function ServicesPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <ServicesHeader />
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 20px 60px' }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>진단 → 처방 → 실행, 하나의 루프</h1>
        <p style={{ margin: '10px 0 28px', fontSize: 15.5, lineHeight: 1.7, color: 'var(--ink-body)', maxWidth: 720 }}>
          모든 서비스는 따로 팔리는 상품이 아니라 <b style={{ color: 'var(--ink)' }}>하나의 여정</b>입니다.
          진단이 모든 처방의 입력이 되고, 실행 기록은 다시 다음 진단으로 돌아옵니다.
        </p>

        {STAGES.map((stage) => (
          <section key={stage} style={{ marginBottom: 26 }}>
            <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase', paddingBottom: 9, borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
              {stage === '진단' ? '01 — 진단' : stage === '처방' ? '02 — 처방' : '03 — 실행'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {SERVICES.filter((s) => s.stage === stage).map((s) => (
                <Link key={s.slug} to={`/services/${s.slug}`} className="card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 9, padding: 20, borderLeft: '3px solid', borderLeftColor: s.color }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: s.color, background: s.soft }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7 }}>
                        {s.name}
                        {s.status && <span className="chip cancelled" style={{ fontSize: 10, padding: '3px 8px' }}>{s.status}</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 1 }}>{s.tagline}</div>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-body)', flex: 1 }}>{s.desc}</p>
                  <span style={{ fontSize: 13, fontWeight: 800, color: s.color }}>자세히 →</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

export function ServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  if (slug && LEGACY_SLUG[slug]) return <Navigate to={`/services/${LEGACY_SLUG[slug]}`} replace />;
  const svc = SERVICES.find((s) => s.slug === slug);
  if (!svc) return <Navigate to="/services" replace />;

  const related = SERVICES.filter((s) => s.slug !== svc.slug).slice(0, 3);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <ServicesHeader />

      {/* 도메인색 히어로 */}
      <section style={{ background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '38px 20px' }}>
          <Link to="/services" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', textDecoration: 'none' }}>← 전체 서비스</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
            <span style={{ width: 54, height: 54, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: svc.color, background: svc.soft }}>{svc.icon}</span>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.02em' }}>{svc.name}</h1>
                <span style={{ fontSize: 11, fontWeight: 700, color: svc.color, background: svc.soft, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>{svc.stage}</span>
                {svc.status && <span className="chip cancelled" style={{ fontSize: 10.5 }}>{svc.status}</span>}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--ink-body)' }}>{svc.tagline}</p>
            </div>
            {/* 골드 채움 — 화면당 1개 */}
            <Link to={svc.cta.to} className="btn gold" style={{ textDecoration: 'none', padding: '13px 26px', fontSize: 15 }}>{svc.cta.label}</Link>
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 20px 60px' }}>
        <p style={{ margin: '0 0 26px', fontSize: 15.5, lineHeight: 1.75, color: 'var(--ink-body)', maxWidth: 760 }}>{svc.desc}</p>

        <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase', paddingBottom: 9, borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
          어떻게 진행되나요
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
          {svc.steps.map((st, i) => (
            <div key={st.t} className="card" style={{ padding: 16 }}>
              <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 11, color: svc.color, fontWeight: 600, marginBottom: 6 }}>STEP {i + 1}</div>
              <b style={{ fontSize: 14.5, color: 'var(--ink)' }}>{st.t}</b>
              <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--ink-body)' }}>{st.d}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 34 }}>
          {svc.evidence.map((e) => (
            <span key={e} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', background: 'var(--j-ghost-bg)', border: '1px solid var(--j-ghost-border)', borderRadius: 999, padding: '5px 12px', whiteSpace: 'nowrap' }}>{e}</span>
          ))}
        </div>

        <div style={{ fontFamily: 'var(--j-font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase', paddingBottom: 9, borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
          이어지는 서비스
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {related.map((r) => (
            <Link key={r.slug} to={`/services/${r.slug}`} className="card" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: 14 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: r.color, background: r.soft }}>{r.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{r.name}</b>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.tagline}</div>
              </div>
              <span style={{ color: 'var(--j-arrow-muted)', fontWeight: 700 }}>›</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
