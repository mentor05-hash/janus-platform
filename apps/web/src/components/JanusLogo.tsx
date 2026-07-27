/* 야누스 아치문 마크 — packages/brand/logo/janus-arch-stroke.svg 인라인 컴포넌트.
 * 규정: 비율 왜곡·임의 색·회전·효과 금지. 좌 블루/우 골드 50% 분할 그라데이션 고정. */
let uid = 0;

export function JanusLogo({ size = 30 }: { size?: number }) {
  // 같은 화면에 여러 개 렌더돼도 gradient id가 충돌하지 않도록 인스턴스별 id
  const id = `ja${++uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" role="img" aria-label="야누스">
      <defs>
        <linearGradient id={`${id}T`} gradientUnits="userSpaceOnUse" x1="18" y1="0" x2="78" y2="0">
          <stop offset="50%" stopColor="#2F6FB3" />
          <stop offset="50%" stopColor="#BC8A28" />
        </linearGradient>
        <linearGradient id={`${id}B`} gradientUnits="userSpaceOnUse" x1="14" y1="0" x2="82" y2="0">
          <stop offset="50%" stopColor="#2F6FB3" />
          <stop offset="50%" stopColor="#BC8A28" />
        </linearGradient>
      </defs>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10">
        <path d="M18 74V43C18 27.5 30.2 15 48 15C65.8 15 78 27.5 78 43V52" stroke={`url(#${id}T)`} />
        <path d="M14 79H82" stroke={`url(#${id}B)`} />
      </g>
    </svg>
  );
}
