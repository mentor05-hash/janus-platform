# -*- coding: utf-8 -*-
"""무료판 배포 전 검증 — 저작권 원천·컷 수치가 물리적으로 부재함을 grep 으로 증빙(접합계약 C4/C6, 실행계획서 W2 D1 ✅기준).

검사:
  1) config.verify.forbidden 패턴이 하나라도 있으면 실패(저작권 페이로드·컷·내부표식 노출).
  2) config.verify.required_free 표식(워터마크·티어 플래그)이 모두 있어야 통과(면책·게이트 고지).
하나라도 실패하면 비-0 종료 → 배포 파이프라인/CI 에서 자동 차단.

사용: python3 ops/placement/tier_verify.py <파일 또는 디렉토리> [--tier free] [--config ...]
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def iter_html(target):
    if os.path.isfile(target):
        yield target
    elif os.path.isdir(target):
        for root, _dirs, files in os.walk(target):
            for fn in files:
                if fn.lower().endswith('.html'):
                    yield os.path.join(root, fn)


def main():
    ap = argparse.ArgumentParser(description='무료판 저작권 부재 검증')
    ap.add_argument('target', help='검증할 무료판 HTML 파일 또는 디렉토리(예: dist-tier/free)')
    ap.add_argument('--tier', default='free')
    ap.add_argument('--config', default=os.path.join(HERE, 'tiers.config.json'))
    a = ap.parse_args()
    with open(a.config, encoding='utf-8') as f:
        cfg = json.load(f)
    vcfg = cfg['verify']
    forbidden = vcfg['forbidden']
    required = vcfg.get('required_free', []) if a.tier == 'free' else []

    files = list(iter_html(a.target))
    if not files:
        print('!! 검증 대상 HTML 없음:', a.target, file=sys.stderr)
        sys.exit(2)

    ok = True
    for path in files:
        with open(path, encoding='utf-8', errors='replace') as f:
            html = f.read()
        print('· 검증:', path)
        for pat in forbidden:
            if pat in html:
                cnt = html.count(pat)
                print('  ❌ 금지 패턴 검출: "%s" ×%d' % (pat, cnt))
                ok = False
            else:
                print('  ✅ 부재 확인: "%s"' % pat)
        for req in required:
            if req in html:
                print('  ✅ 필수 표식 존재: "%s"' % req)
            else:
                print('  ❌ 필수 표식 누락: "%s"' % req)
                ok = False

    print('\n결과:', '✅ 통과 — 배포 가능(저작권 부재·면책 고지 확인)' if ok else '❌ 실패 — 배포 금지')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
