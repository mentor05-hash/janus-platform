/**
 * 무료판 고지·워터마크 조각 (백로그 B012 · 점검표 §2·§3·§4).
 *
 * 배치표 생성기(`gen_jeongmil.cjs`)가 빌드 시 require 해서 산출 HTML 에 삽입한다.
 * 생성기가 아직 repo 에 없어도 이 조각은 독립적으로 완성·검증 가능하도록 문자열만 반환한다
 * — 반입되면 붙이기만 하면 되고, `ops/publish-gate.sh` 가 삽입 여부를 기계 검사한다.
 *
 * 사용(생성기 쪽):
 *   const D = require('../../packages/free-tier/disclosure.cjs');
 *   html = html
 *     .replace('</head>', D.headCss() + '</head>')
 *     .replace('<body>', '<body>' + D.watermarkHtml())
 *     .replace('</body>', D.footerHtml({ basedOn: '2026학년도 기준' }) + D.accessLogScript() + '</body>');
 *
 * ⚠ 한글이 포함된 파일이다 — 수정은 python 문자열 replace 또는 heredoc 으로만(정규식 치환 금지, CLAUDE.md §5).
 */

/**
 * 확정 면책 문구. 점검표 §2-2 가 요구하는 3요소를 모두 포함한다:
 *   ① 통계적 추정이며 합격을 보장하지 않음 ② 기준 시점 ③ 최종 판단은 이용자 책임.
 * 문구를 고칠 때는 3요소가 유지되는지 확인하고, 점검표 §2-2 판정을 다시 기록한다.
 */
const DISCLAIMER_CORE =
  '이 결과는 공개된 입시 통계를 바탕으로 한 <strong>통계적 추정</strong>이며 합격을 보장하지 않습니다. ' +
  '실제 결과는 해당 연도의 지원자 분포·전형 변경에 따라 달라질 수 있으며, ' +
  '<strong>최종 지원 판단과 그 결과에 대한 책임은 이용자 본인에게 있습니다.</strong>';

const REDISTRIBUTION_NOTICE = '예시 자료 · 무단 전재 및 재배포 금지';

/**
 * 워터마크 + 고지 스타일.
 * 설계 판단:
 *  - `position: fixed` 반복 타일이 아니라 **본문 뒤 레이어**(z-index 0, 콘텐츠는 1)로 깔았다.
 *    fixed 오버레이는 스크린샷에 한 장만 찍히고 인쇄에서 사라지는 경우가 많다.
 *  - `@media print` 에서도 유지 — 화면만 있으면 PDF 저장·인쇄본 재배포를 막지 못한다(점검표 §3-1).
 *  - 고지는 결과 카드 **바로 아래**에 두도록 footerHtml 을 배치한다. 푸터 최하단 회색 8px 은 미통과(§2-3).
 */
function headCss(opts) {
  const o = opts || {};
  const label = o.label || '야누스 무료판';
  const opacity = o.opacity == null ? 0.07 : o.opacity;
  return `
<style>
  /* 무료판 워터마크 — 콘텐츠 뒤 레이어(캡처·인쇄 모두 포함) */
  .janus-wm {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
    overflow: hidden; user-select: none;
  }
  .janus-wm span {
    position: absolute; white-space: nowrap;
    font-size: 20px; font-weight: 800; letter-spacing: 2px;
    color: #24405f; opacity: ${opacity};
    transform: rotate(-24deg);
  }
  body > *:not(.janus-wm) { position: relative; z-index: 1; }

  /* 예측 면책 고지 — 결과 바로 아래, 본문과 같은 크기로 읽히게 */
  .janus-disclaimer {
    margin: 16px 0; padding: 12px 14px;
    border: 1px solid #c7ccd2; border-left: 4px solid #cf9a3a; border-radius: 8px;
    background: #fbfaf7; color: #24405f;
    font-size: 14px; line-height: 1.7; word-break: keep-all;
  }
  .janus-disclaimer .t { font-weight: 800; display: block; margin-bottom: 4px; }
  .janus-disclaimer .meta { color: #52656d; font-size: 13px; margin-top: 6px; }
  .janus-redist { font-weight: 700; color: #b86c04; }

  @media (max-width: 420px) {
    .janus-disclaimer { font-size: 13px; }
    .janus-wm span { font-size: 15px; }
  }
  /* 인쇄·PDF 저장에서도 워터마크와 고지를 남긴다 */
  @media print {
    .janus-wm { display: block !important; }
    .janus-wm span { opacity: ${Math.min(0.18, opacity + 0.06)}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .janus-disclaimer { border-color: #999; background: transparent; }
  }
</style>`;
}

/** 워터마크 레이어. 타일 수는 페이지 길이를 모르므로 넉넉히 깐다(빈 화면에서도 어색하지 않은 밀도). */
function watermarkHtml(opts) {
  const o = opts || {};
  const label = o.label || '야누스 무료판 · 재배포 금지';
  const rows = o.rows == null ? 14 : o.rows;
  const cols = o.cols == null ? 3 : o.cols;
  const spans = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const top = r * 220 + (c % 2) * 60;
      const left = c * 40 + 4;
      spans.push(`<span style="top:${top}px;left:${left}%">${label}</span>`);
    }
  }
  // aria-hidden: 스크린리더가 워터마크를 본문으로 읽지 않게(접근성)
  return `<div class="janus-wm" aria-hidden="true">${spans.join('')}</div>`;
}

/**
 * 면책 + 재배포 금지 + 출처·기준시점 표기. 결과 카드 바로 아래에 삽입한다.
 * @param {{basedOn?: string, sourceNote?: string, generatedAt?: string}} opts
 */
function footerHtml(opts) {
  const o = opts || {};
  const basedOn = o.basedOn || '기준 시점 미표기';
  const sourceNote = o.sourceNote || '공개된 입시 결과 통계';
  const generatedAt = o.generatedAt || '';
  return `
<div class="janus-disclaimer" role="note">
  <span class="t">예측 면책 고지</span>
  ${DISCLAIMER_CORE}
  <div class="meta">
    근거 자료: ${sourceNote} · ${basedOn}${generatedAt ? ` · 생성 ${generatedAt}` : ''}<br>
    <span class="janus-redist">${REDISTRIBUTION_NOTICE}</span> · 워터마크가 포함된 자료입니다.
  </div>
</div>`;
}

/**
 * 간이 접속로그 비콘.
 * 설계 판단:
 *  - **실패해도 페이지에 영향이 없어야 한다**(무료판은 맥이 꺼져 있을 때도 서빙된다 → 수집 실패가 정상 상황).
 *  - PII 를 수집하지 않는다: 경로·유입경로·화면폭·타임스탬프만. IP 는 클라이언트가 보내지 않는다.
 *  - 엔드포인트가 없으면 아무것도 하지 않는다 — **수신처(보관기간 정책 포함)가 정해지기 전에 수집을 시작하지 않는다**(백로그 B015).
 */
function accessLogScript(endpoint) {
  if (!endpoint) {
    return '\n<!-- 접속로그: 수신 엔드포인트 미설정 — 보관기간 정책(B015) 확정 후 활성화 -->';
  }
  const url = JSON.stringify(endpoint);
  return `
<script>
(function () {
  try {
    var b = {
      p: location.pathname,
      r: document.referrer ? new URL(document.referrer).host : '',
      w: window.innerWidth,
      t: Date.now()
    };
    var body = JSON.stringify(b);
    if (navigator.sendBeacon) navigator.sendBeacon(${url}, new Blob([body], { type: 'application/json' }));
    else fetch(${url}, { method: 'POST', body: body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(function () {});
  } catch (e) { /* 수집 실패는 무시 — 페이지 동작에 영향 없음 */ }
})();
</script>`;
}

/** 생성기에서 한 번에 쓰기 위한 조립 헬퍼. */
function injectAll(html, opts) {
  const o = opts || {};
  return html
    .replace('</head>', headCss(o) + '\n</head>')
    .replace(/<body([^>]*)>/, (m, attrs) => `<body${attrs}>` + watermarkHtml(o))
    .replace('</body>', footerHtml(o) + accessLogScript(o.logEndpoint) + '\n</body>');
}

module.exports = {
  DISCLAIMER_CORE,
  REDISTRIBUTION_NOTICE,
  headCss,
  watermarkHtml,
  footerHtml,
  accessLogScript,
  injectAll,
};
