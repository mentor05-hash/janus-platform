import { Navigate, useParams } from 'react-router-dom';

// 마케팅(랜딩·연계 서비스) 실라우트 — apps/web/public/site 의 정적 페이지를 전체 화면으로 이식.
//   원본 아티팩트 디자인(캔버스·스크롤 리빌·폼)을 그대로 보존하고, 내부 앱 링크(/login 등)는
//   정적 HTML 의 target="_top" 로 최상위 창(SPA)으로 이어집니다.
const SLUGS = ['consulting', 'baechi', 'ganggi', 'mock', 'ipgyeol', 'jaso', 'planner'] as const;
const SLUG_NAME: Record<string, string> = {
  consulting: '대입 컨설팅', baechi: '대학 배치표', ganggi: '인터넷 강의',
  mock: '모의고사·성적', ipgyeol: '입결·경쟁률', jaso: '자소서·면접', planner: '학습 플래너',
};

function Frame({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      src={src}
      title={title}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }}
    />
  );
}

export function SiteLandingPage() {
  return <Frame src="/site/landing.html" title="야누스 — 미래를 여는 문 (구버전)" />;
}

export function SiteServicesPage() {
  return <Frame src="/site/services.html" title="연계 서비스 — 상세 소개 (구버전)" />;
}

export function SiteServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug || !SLUGS.includes(slug as (typeof SLUGS)[number])) return <Navigate to="/services" replace />;
  return <Frame src={`/site/svc-${slug}.html`} title={`${SLUG_NAME[slug] ?? '연계 서비스'} — 야누스`} />;
}
