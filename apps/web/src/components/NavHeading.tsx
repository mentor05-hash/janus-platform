/**
 * 사이드바 제목 두 층 — 대항목(모바일 탭과 1:1) · 소그룹(대항목이 무거울 때만).
 *
 * 세 레이아웃(학생·선생님·학부모)이 같은 위계를 써야 "같은 축"이라는 말이 성립하므로
 * 마크업을 한 곳에 둔다. 복제하면 한쪽만 바뀌어 위계가 갈라진다.
 */

/** 대항목 — 위 구분선으로 묶음을 끊는다. 첫 대항목은 선을 생략한다(위가 로고·검색이라 중복). */
export function NavGroupHeading({ label, first }: { label: string; first?: boolean }) {
  return (
    <div
      className="nav-group"
      style={{
        fontSize: 11.5,
        fontWeight: 800,
        letterSpacing: '.06em',
        color: 'var(--ink)',
        padding: '16px 16px 6px',
        borderTop: first ? 'none' : '1px solid var(--line, rgba(255,255,255,.10))',
        marginTop: first ? 0 : 6,
      }}
    >
      {label}
    </div>
  );
}

/** 소그룹 — 대항목보다 확실히 약하게. 여기서 굵어지면 대항목이 5개로 안 읽힌다. */
export function NavSubHeading({ label }: { label: string }) {
  return (
    <div
      className="nav-sub"
      style={{
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '.04em',
        color: 'var(--caption)',
        padding: '9px 16px 2px',
        opacity: 0.85,
      }}
    >
      {label}
    </div>
  );
}
