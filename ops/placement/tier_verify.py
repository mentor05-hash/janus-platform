# -*- coding: utf-8 -*-
"""티어별 산출 검증 — **질량 예산**이 배포 가부를 판정한다(접합계약 C4/C6).

## 2026-08-12 이전의 이 파일은 위음성이었다

예전 판정은 `forbidden` 문자열 목록의 부재만 봤다. 그 11개 토큰이 전부 합성 픽스처용 리터럴이라
실마스터에는 한 건도 없었고, 그래서 **저작권 데이터 8MB 를 통째로 담은 산출물이 "✅ 통과"로 나왔다.**
금지목록은 목록에 없는 것을 조용히 통과시킨다 — 대응은 토큰 추가가 아니라 판정 근거의 교체다.

## 지금의 판정

  1) **질량 예산(차단)** — tiers.{t}.publish 의 file·set 상한. 빌드의 자기보고를 믿지 않고
     산출물에서 **재계산**한다. 확장자 무관·재귀라 사이드카(.json)·분할 적재도 합산된다.
  2) **구조(차단)** — 삭감되지 않은 대입 리터럴, base64/lzma 밀수 흔적.
  3) `required` 표식(차단) — 워터마크·티어 플래그·A4/A6/A7.
  4) `forbidden`(**보조 게이트 — 차단**) — 알려진 토큰의 검출. 단 성공 시 패턴별 "✅ 부재 확인"을 찍지 않는다
     — 그 11줄이 "다 검사했다"는 착시를 줬고, 실제로는 실마스터에 한 건도 안 걸리는 목록이었다.
     **이 목록만 믿지 않는다**: 차단의 주력은 (1) 질량 예산이다.

publishable 미선언·publish 예산 부재·HARD 초과는 전부 **exit 2** — 설정 누락은 '검사 없음'이 아니라 '통과 불가'.

사용: python3 ops/placement/tier_verify.py <디렉토리|파일> [--tier free] [--config ...]
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import measure


def main():
    ap = argparse.ArgumentParser(description='티어 산출물 검증(질량 예산 + 구조 + 필수 표식)')
    ap.add_argument('target', help='검증할 퍼블리시 디렉토리(예: dist-tier/free) 또는 단일 파일')
    ap.add_argument('--tier', default='free')
    ap.add_argument('--config', default=os.path.join(HERE, 'tiers.config.json'))
    a = ap.parse_args()
    with open(a.config, encoding='utf-8') as f:
        cfg = json.load(f)

    try:
        budget = measure.load_budget(cfg, a.tier)
    except ValueError as e:
        print('!! 예산 설정 오류:', e, file=sys.stderr)
        sys.exit(2)

    vt = ((cfg.get('verify') or {}).get('tiers') or {}).get(a.tier) or {}
    forbidden, required = vt.get('forbidden', []), vt.get('required', [])

    if not os.path.exists(a.target):
        print('!! 대상 없음:', a.target, file=sys.stderr)
        sys.exit(2)
    if budget and os.path.isfile(a.target):
        # 공개 티어는 '세트' 단위로만 판정한다 — 파일 하나만 보면 사이드카·분할 적재를 못 본다.
        print('!! 공개 티어(%s)는 디렉토리로 검증해야 한다(세트 질량 판정 불가):' % a.tier, a.target, file=sys.stderr)
        sys.exit(2)

    s = measure.measure_set(a.target) if os.path.isdir(a.target) else None
    if s is not None and s['files'] == 0:
        print('!! 검증 대상 파일 없음:', a.target, file=sys.stderr)
        sys.exit(2)

    blocking, lint = [], []

    # ── 1·2) 파일별 질량·구조 ────────────────────────────────────────────────
    if budget and s:
        for m in s['per_file']:
            blocking += measure.enforce_file(m, budget)
        blocking += measure.enforce_set(s, budget)

    # ── 3·4) 텍스트 표식 ─────────────────────────────────────────────────────
    targets = [m['path'] for m in s['per_file']] if s else [a.target]
    html_targets = [p for p in targets if p.lower().endswith(('.html', '.htm', '.xhtml'))]
    for path in html_targets:
        with open(path, encoding='utf-8', errors='replace') as f:
            html = f.read()
        rel = os.path.relpath(path, a.target) if s else path
        for pat in forbidden:
            if pat in html:
                # 차단한다. 다만 성공 시 "✅ 부재 확인" 을 패턴마다 찍지는 않는다 —
                # 그 11줄이 "다 검사했다"는 착시를 줬고, 실제로는 실마스터에 한 건도 안 걸리는 목록이었다.
                blocking.append('금지 패턴 검출: "%s" ×%d (%s)' % (pat, html.count(pat), rel))
        for req in required:
            if req not in html:
                blocking.append('필수 표식 누락: "%s" (%s)' % (req, rel))

    # ── 출력 ────────────────────────────────────────────────────────────────
    print('· 대상:', a.target, '· 티어:', a.tier)
    if budget and s:
        print(measure.format_set_report(s, budget))
    elif not budget:
        print('  (publishable=false — 질량 예산 없음. 이 티어는 공개 배포 대상이 아니다.)')
    for w in lint:
        print('  ⚠ ' + w)
    for b in blocking:
        print('  ❌ ' + b)

    if blocking:
        print('\n결과: ❌ 실패 — 배포 금지')
        sys.exit(1)
    print('\n결과: ✅ 통과 —', '공개 배포 가능(질량 예산·구조·표식)' if budget else '%s 판 정합' % a.tier)
    if lint:
        print('       (린트 경고 %d건 — 차단 사유는 아니다)' % len(lint))
    sys.exit(0)


if __name__ == '__main__':
    main()
