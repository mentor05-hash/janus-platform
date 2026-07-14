# -*- coding: utf-8 -*-
"""티어 빌드 파이프라인 — 배치표 마스터(HTML) → dist-tier/{tier} (접합계약 C4/C6).

무엇을 하나:
  1) 티어 게이트 영역 마스킹: 마스터가 `<!--JANUS-TIER:member-->…<!--/JANUS-TIER-->` 로 감싼
     상위-티어 전용 데이터/UI 를, 빌드 티어보다 상위면 **물리적으로 제거**(하위 티어 파일에 원본 부재).
  2) 지정 데이터 페이로드 제거: config.tiers[t].strip_assignments 의 `const NAME=…;` 를 빈 값으로 대체
     (센티넬이 없는 기존 마스터용 폴백 — 무료판에서 대형 저작권 배열을 떨궈낸다).
  3) FLAGS 주입: window.__JANUS_TIER / window.__JANUS_FLAGS — 마스터 JS 가 UI(전체표·필터·고급)를 게이팅.
  4) 워터마크 + 예측 면책 배너(전 화면) 주입 — 재배포 금지·면책 상시 고지.
  5) (무료판) 간이 접속 로그 비콘 — page id `baechi`(C3) 로 조회 1건 전송(navigator.sendBeacon).

원칙(C6): 저작권 마스터/데이터는 repo 밖(JANUS_DATA_DIR). 이 스크립트는 코드만 repo 에 있고,
실제 마스터는 `--src` 로 로컬에서 물린다. 테스트는 합성 픽스처(fixtures/master_sample.html)로.

사용:
  python3 ops/placement/tier_build.py --src <마스터.html> --tier free
  python3 ops/placement/tier_build.py --src <마스터.html> --all           # 4종 모두
  (--out 기본 dist-tier, --config 기본 ops/placement/tiers.config.json)
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load_config(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def level_index(levels, name):
    return levels.index(name) if name in levels else 0


# ── 1) 센티넬 티어 영역 마스킹 ─────────────────────────────────────────────
SENTINEL = re.compile(r'<!--\s*JANUS-TIER:(free|member|paid|consultant)\s*-->(.*?)<!--\s*/JANUS-TIER\s*-->', re.DOTALL)


def mask_regions(html, levels, tier):
    keep_upto = level_index(levels, tier)
    removed = [0]

    def repl(m):
        region_level = level_index(levels, m.group(1))
        if region_level <= keep_upto:
            return m.group(2)  # 통과: 센티넬만 벗기고 내용 유지
        removed[0] += 1
        return '<!--[야누스 상위 티어 전용 — 이 판에는 포함되지 않습니다]-->'

    return SENTINEL.sub(repl, html), removed[0]


# ── 2) 지정 데이터 페이로드 제거(폴백) ────────────────────────────────────
def strip_assignment(html, name):
    """`const NAME = <리터럴> ;` 를 빈 값으로 대체. 괄호·문자열 균형 스캐너로 종료 세미콜론까지 안전 절단."""
    pat = re.compile(r'\b(?:const|let|var)\s+' + re.escape(name) + r'\s*=\s*')
    m = pat.search(html)
    if not m:
        return html, False
    i = m.end()
    n = len(html)
    # 첫 비공백 문자로 빈 대체값 결정
    j = i
    while j < n and html[j] in ' \t\r\n':
        j += 1
    empty = '[]' if j < n and html[j] == '[' else '{}' if j < n and html[j] == '{' else 'null'
    depth = 0
    in_str = None
    esc = False
    k = i
    while k < n:
        c = html[k]
        if in_str:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == in_str:
                in_str = None
        else:
            if c in '"\'`':
                in_str = c
            elif c in '[{(':
                depth += 1
            elif c in ')}]':
                depth -= 1
            elif c == ';' and depth == 0:
                break
        k += 1
    if k >= n:
        return html, False  # 균형 실패 — 손대지 않음(안전)
    replaced = html[:m.start()] + 'const ' + name + '=' + empty + '; /*[야누스] 상위 티어 데이터 제거*/' + html[k + 1:]
    return replaced, True


# ── 3~5) 주입(FLAGS·워터마크·접속로그) ────────────────────────────────────
def flags_script(tier, flags):
    return ('<script>window.__JANUS_TIER=' + json.dumps(tier) +
            ';window.__JANUS_FLAGS=' + json.dumps(flags, ensure_ascii=False) + ';</script>')


def watermark_html(text, label):
    safe = text.replace('<', '&lt;').replace('>', '&gt;')
    return (
        '<div data-janus-watermark="1" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;'
        'background:rgba(30,53,80,.92);color:#e8eef7;font:12px/1.5 -apple-system,\'Malgun Gothic\',sans-serif;'
        'padding:7px 14px;text-align:center;pointer-events:none">'
        '<b style="color:#cf9a3a">' + label + '</b> · ' + safe + '</div>'
    )


def access_log_script(endpoint):
    # page id 'baechi'(C3) 조회 1건 — sendBeacon(가능 시), 실패 무해.
    return (
        '<script>try{var b={page:"baechi",event:"view",tier:window.__JANUS_TIER,'
        'sid:(localStorage.getItem("janus_sid")||(function(){var s="s"+Date.now().toString(36);'
        'localStorage.setItem("janus_sid",s);return s;})())};'
        'if(navigator.sendBeacon)navigator.sendBeacon(' + json.dumps(endpoint) +
        ',new Blob([JSON.stringify(b)],{type:"application/json"}));}catch(e){}</script>'
    )


def inject(html, snippet, where='body_start'):
    if where == 'body_start':
        idx = html.lower().find('<body')
        if idx != -1:
            gt = html.find('>', idx)
            if gt != -1:
                return html[:gt + 1] + snippet + html[gt + 1:]
    # 폴백: head 뒤 또는 맨 앞
    if '</head>' in html:
        return html.replace('</head>', snippet + '</head>', 1)
    return snippet + html


def inject_before_body_end(html, snippet):
    if '</body>' in html:
        return html.replace('</body>', snippet + '</body>', 1)
    return html + snippet


def build(src, tier, cfg, out_dir):
    levels = cfg['levels']
    tconf = cfg['tiers'][tier]
    with open(src, encoding='utf-8') as f:
        html = f.read()

    html, n_regions = mask_regions(html, levels, tier)
    n_assign = 0
    for name in tconf.get('strip_assignments', []):
        html, ok = strip_assignment(html, name)
        n_assign += 1 if ok else 0

    html = inject(html, flags_script(tier, tconf['flags']), 'body_start')
    html = inject_before_body_end(html, watermark_html(cfg['watermark'], tconf['label']))
    if tconf.get('access_log'):
        html = inject_before_body_end(html, access_log_script(cfg['access_log_endpoint']))

    dst_dir = os.path.join(out_dir, tier)
    os.makedirs(dst_dir, exist_ok=True)
    base = os.path.basename(src)
    dst = os.path.join(dst_dir, base)
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(html)
    print('  [%-10s] %s  (영역 제거 %d · 페이로드 제거 %d · %.1fKB)' %
          (tier, dst, n_regions, n_assign, len(html) / 1024))
    return dst


def main():
    ap = argparse.ArgumentParser(description='야누스 배치표 티어 빌드')
    ap.add_argument('--src', required=True, help='마스터 HTML 경로(저작권 마스터는 JANUS_DATA_DIR 로컬 경로)')
    ap.add_argument('--tier', help='free|member|paid|consultant')
    ap.add_argument('--all', action='store_true', help='4종 모두 빌드')
    ap.add_argument('--out', default=os.path.join(os.getcwd(), 'dist-tier'), help='산출 루트(기본 ./dist-tier)')
    ap.add_argument('--config', default=os.path.join(HERE, 'tiers.config.json'))
    a = ap.parse_args()
    cfg = load_config(a.config)
    if not os.path.exists(a.src):
        print('!! 마스터 없음:', a.src, file=sys.stderr)
        sys.exit(2)
    tiers = cfg['levels'] if a.all else ([a.tier] if a.tier else None)
    if not tiers:
        print('!! --tier 또는 --all 필요', file=sys.stderr)
        sys.exit(2)
    print('티어 빌드:', a.src, '→', a.out)
    for t in tiers:
        if t not in cfg['tiers']:
            print('!! 알 수 없는 티어:', t, file=sys.stderr)
            sys.exit(2)
        build(a.src, t, cfg, a.out)
    print('완료. 무료판 배포 전 반드시: python3 ops/placement/tier_verify.py', os.path.join(a.out, 'free'))


if __name__ == '__main__':
    main()
