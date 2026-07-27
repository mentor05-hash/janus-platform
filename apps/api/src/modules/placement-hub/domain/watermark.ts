/**
 * per-user 워터마크(순수) — 유료 배치표 HTML 서빙 시 서버가 열람자 신원을 주입(O76).
 * 목적: 유출 억지 + 사후 추적(누가·언제). 클라이언트 조작으로 제거 가능함을 전제로 한
 * "억지력+귀속" 장치이지 완전 방어가 아니다 — 대량 유출 원천차단은 thin-slice(§slice) 몫.
 * 구성: ①가시 오버레이(대각 반복 타일, pointer-events 없음) ②비가시 지문 주석(복수 위치).
 */

/** 지문 토큰 — loginId|accountId|발급시각(ms) base64url. 유출본에서 계정·시각 역추적. */
export function fingerprint(
  loginId: string,
  accountId: string,
  nowMs: number,
): string {
  return Buffer.from(`${loginId}|${accountId}|${nowMs}`).toString('base64url');
}

/** 가시 워터마크 타일(SVG data-uri) — 한글 안전(percent-encoding). */
function tileSvg(label: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="280">` +
    `<text x="10" y="150" font-size="15" fill="#5b6472" fill-opacity="0.13" ` +
    `font-family="sans-serif" transform="rotate(-24 210 140)">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 워터마크 스니펫(오버레이 + 지문 주석). </body> 직전 주입용. */
export function watermarkSnippet(opts: {
  name: string;
  loginId: string;
  accountId: string;
  nowMs: number;
}): string {
  const kst = new Date(opts.nowMs + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ');
  const label = `야누스 · ${opts.name}(${opts.loginId}) · ${kst} KST · 열람자 표식`;
  const fp = fingerprint(opts.loginId, opts.accountId, opts.nowMs);
  return (
    `\n<!--jns-fp:${fp}-->` +
    `<div id="jns-wm" data-fp="${fp}" style="position:fixed;inset:0;z-index:2147483646;pointer-events:none;` +
    `background-image:url('${tileSvg(label)}');background-repeat:repeat;"></div>` +
    `<!--jns-fp:${fp}-->\n`
  );
}

/** HTML에 스니펫 주입 — 마지막 </body> 직전(대소문자 무관), 없으면 말미. 원문 그 외 무변경(한글 안전). */
export function injectWatermark(html: string, snippet: string): string {
  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx < 0) return html + snippet;
  return html.slice(0, idx) + snippet + html.slice(idx);
}
