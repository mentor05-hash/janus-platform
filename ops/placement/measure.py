#!/usr/bin/env python3
"""측정·예산 판정의 단일 구현 — 티어 빌드/검증/테스트가 전부 이 모듈만 쓴다.

## 왜 이 모듈이 생겼나 (2026-08-12)

무료판 산출물이 저작권 데이터를 전량 담고도 빌드·검증이 모두 성공하는 위음성이 있었다.
원인은 두 게이트가 **같은 방향으로 눈이 멀어 있었다**는 것이다 —

  · tier_build 는 `<!--JANUS-TIER:…-->` 센티넬과 `strip_assignments` 의 **이름**으로만 삭감했는데,
    실마스터에는 그 센티넬도 그 변수명도 0건이라 "영역 제거 0 · 페이로드 제거 0"을 찍고 **정상 종료**했다.
  · tier_verify 의 `forbidden` 11개는 전부 합성 픽스처용 리터럴이라 실마스터에 0건 → "✅ 통과".

둘 다 **금지목록(denylist)** 이었고, 목록에 없는 것은 조용히 통과했다. 이름을 더 추가하는 것은
같은 함정의 반복이다. 그래서 판정 근거를 **이름에서 결과의 질량으로** 옮긴다.

## 설계 원칙

1. **이름을 보지 않는다.** 길이·괄호 균형·바이트 수만 본다. 마스터가 `D` 든 `DATA2028` 이든 값이 같다.
2. **질량의 단위는 gzip 바이트.** 원시로 싣든 base64/lzma 로 밀수하든 청크로 쪼개든 정보량은 비슷하게 나온다.
3. **해석 불가 = 실패.** 균형 스캔이 끝을 못 찾으면 통과가 아니라 예외다(현행은 조용히 통과였다).
4. **기본값은 '지운다'.** 임계 초과 리터럴은 이름과 무관하게 제거하고, 예외를 두지 않는다.
   실수 방향이 안전하다 — 과삭감은 UI 가 눈에 띄게 깨져 즉시 발각되고, 과소삭감은 조용히 유출된다.
5. **설정이 코드 상수를 넘을 수 없다.** HARD 를 완화하려면 diff 에 남는다.

임계값 재측정: `python3 ops/placement/measure.py --report <파일|디렉토리>…`
"""
import gzip
import json
import os
import re
import sys

# gzip 크기를 판정에 쓰므로 압축 레벨을 고정한다 — 파이썬 버전이 달라도 값이 재현돼야 한다.
GZ_LEVEL = 6

# 설정(tiers.config.json)이 넘을 수 없는 코드 상수. 설정 실수·악의적 완화의 최종 방어선.
HARD = {
    'file_bytes': 524_288,
    'file_gzip': 98_304,
    'set_bytes': 1_048_576,
    'set_gzip': 262_144,
    'literal': 65_536,
}

# 대입 리터럴 시작 패턴 — 이름은 캡처만 하고 판정에 쓰지 않는다(기록·리포트용).
ASSIGN = re.compile(
    r'(?:\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*='
    r'|\b(?:window|globalThis|self)\.([A-Za-z_$][\w$]*)\s*='
    r'|(?:^|[;{}\n])\s*([A-Za-z_$][\w$]*)\s*=)\s*'
)

OPAQUE = re.compile(r'[A-Za-z0-9+/=_-]{64,}')

# 리터럴 측정 바닥값. 게이트 임계(strip_literal_over_bytes)보다 낮기만 하면 판정에 영향이 없다.
MEASURE_FLOOR = 1024


class Unparseable(Exception):
    """균형 스캔이 리터럴의 끝을 찾지 못했다. 통과시키지 않는다 — 크기를 알 수 없으면 안전을 보장할 수 없다."""


def _scan_literal_end(text, i):
    """text[i:] 가 리터럴이라고 보고 문장 종료(depth 0 의 ';')까지 스캔. 끝 인덱스(';' 위치) 또는 None."""
    n = len(text)
    depth = 0
    in_str = None
    esc = False
    k = i
    while k < n:
        c = text[k]
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
                return k
            elif c == '\n' and depth == 0:
                return k  # 세미콜론 생략(ASI) 대응 — depth 0 의 개행도 문장 끝으로 본다
        k += 1
    return None


def literal_spans(text, min_bytes):
    """min_bytes 이상인 대입 리터럴을 **이름과 무관하게** 전부 찾는다 → [(name, start, end_exclusive, size)].

    끝을 못 찾은 후보가 min_bytes 이상 남아 있으면 Unparseable — 크기를 모르는 채 통과시키지 않는다.
    """
    spans = []
    pos = 0
    n = len(text)
    while pos < n:
        m = ASSIGN.search(text, pos)
        if not m:
            break
        name = m.group(1) or m.group(2) or m.group(3) or '(익명)'
        val_start = m.end()
        end = _scan_literal_end(text, val_start)
        if end is None:
            # 끝을 못 찾았다. 남은 길이가 임계 이상이면 거대 페이로드일 수 있다 → 실패.
            if n - val_start >= min_bytes:
                raise Unparseable(
                    '리터럴 종료를 찾지 못함: %s (offset %d, 남은 %d바이트)' % (name, m.start(), n - val_start))
            break
        size = end - val_start
        if size >= min_bytes:
            spans.append((name, m.start(), end + 1, size))
            pos = end + 1
        else:
            # 작은 리터럴은 건너뛴다. 그 내부에서 다시 찾지 않도록 끝 뒤로 이동.
            pos = max(end + 1, m.end())
    return spans


def strip_large_literals(text, min_bytes):
    """min_bytes 이상 리터럴을 전부 빈 값으로 치환 → (새 텍스트, [(name, size)]). 뒤에서부터 잘라 오프셋 밀림을 막는다."""
    spans = literal_spans(text, min_bytes)
    stripped = []
    for name, start, end, size in reversed(spans):
        head = text[start:end]
        eq = head.find('=')
        after = head[eq + 1:].lstrip() if eq >= 0 else ''
        empty = '[]' if after[:1] == '[' else '{}' if after[:1] == '{' else 'null'
        decl = head[:eq + 1] if eq >= 0 else (name + '=')
        text = text[:start] + decl + empty + '; /*[야누스] 티어 삭감 — %dB 제거*/' % size + text[end:]
        stripped.append((name, size))
    return text, list(reversed(stripped))


# 인코딩된 페이로드로 보려면 알파벳이 실제로 다양해야 한다. base64 는 보통 60+ 종을 쓴다.
# 이 조건이 없으면 'x'*900 같은 무해한 반복 문자열이 밀수로 오인된다(실측 오탐 — 2026-08-12).
OPAQUE_MIN_DISTINCT = 16


def max_opaque_run(text):
    """base64/hex 처럼 보이는 **다양한 알파벳**의 최장 연속 길이. 압축·인코딩 밀수의 흔적 지표.

    반복 문자(`aaaa…`)는 길어도 무시한다 — 정보량이 없어 밀수 수단이 못 된다(그리고 gzip 게이트가 잡는다).
    """
    best = 0
    for m in OPAQUE.finditer(text):
        run = m.group(0)
        if len(set(run)) >= OPAQUE_MIN_DISTINCT:
            best = max(best, len(run))
    return best


def measure_bytes(b):
    lines = b.split(b'\n')
    return {
        'bytes': len(b),
        'gzip_bytes': len(gzip.compress(b, GZ_LEVEL)),
        'max_line_bytes': max((len(x) for x in lines), default=0),
    }


def _text_of(b):
    try:
        return b.decode('utf-8')
    except UnicodeDecodeError:
        return None


def measure_file(path):
    with open(path, 'rb') as f:
        b = f.read()
    m = measure_bytes(b)
    m['path'] = path
    t = _text_of(b)
    if t is None:
        m['max_literal_bytes'] = 0
        m['max_opaque_run'] = 0
        m['binary'] = True
        return m
    m['binary'] = False
    # 측정 단계에서는 Unparseable 을 삼키지 않는다 — 호출부가 실패로 다루게 위로 던진다.
    # 바닥값 1KB: 게이트 비교 대상(strip_literal_over_bytes, 8KB)보다 낮으면 판정에 영향이 없고,
    # 수십만 개의 자잘한 대입을 기록하지 않아 13MB 마스터에서도 빠르다.
    spans = literal_spans(t, MEASURE_FLOOR)
    m['max_literal_bytes'] = max((s[3] for s in spans), default=0)
    m['max_opaque_run'] = max_opaque_run(t)
    return m


def measure_set(dirpath):
    """퍼블리시 세트 전체 — **확장자 무관·재귀**. 사이드카(.json)·확장자 회피를 닫는 지점."""
    per = []
    total_b = 0
    total_g = 0
    for root, _dirs, files in os.walk(dirpath):
        for fn in sorted(files):
            p = os.path.join(root, fn)
            m = measure_file(p)
            m['rel'] = os.path.relpath(p, dirpath)
            per.append(m)
            total_b += m['bytes']
            total_g += m['gzip_bytes']
    return {
        'dir': dirpath,
        'files': len(per),
        'bytes': total_b,
        'gzip_bytes': total_g,
        'per_file': per,
    }


def load_budget(cfg, tier):
    """publishable 티어의 예산을 꺼낸다. 선언이 없거나 HARD 를 넘으면 예외 — 설정 누락은 '검사 없음'이 아니라 '통과 불가'."""
    tconf = (cfg.get('tiers') or {}).get(tier)
    if tconf is None:
        raise ValueError("알 수 없는 티어: %s" % tier)
    if 'publishable' not in tconf:
        raise ValueError("tiers.%s.publishable 이 선언되지 않았다 — 공개 가능 여부를 추측하지 않는다." % tier)
    if not tconf['publishable']:
        return None
    pub = tconf.get('publish')
    if not pub:
        raise ValueError("tiers.%s 는 publishable=true 인데 publish 예산이 없다." % tier)
    f, s, st = pub.get('file') or {}, pub.get('set') or {}, pub.get('structure') or {}
    for key, val, hard in (
        ('file.max_bytes', f.get('max_bytes'), HARD['file_bytes']),
        ('file.max_gzip_bytes', f.get('max_gzip_bytes'), HARD['file_gzip']),
        ('set.max_bytes', s.get('max_bytes'), HARD['set_bytes']),
        ('set.max_gzip_bytes', s.get('max_gzip_bytes'), HARD['set_gzip']),
        ('structure.strip_literal_over_bytes', st.get('strip_literal_over_bytes'), HARD['literal']),
    ):
        if val is None:
            raise ValueError("tiers.%s.publish.%s 미선언" % (tier, key))
        if val > hard:
            raise ValueError("tiers.%s.publish.%s=%d 가 코드 상수 %d 를 초과 — 설정으로 완화할 수 없다."
                             % (tier, key, val, hard))
    if not s.get('max_files'):
        raise ValueError("tiers.%s.publish.set.max_files 미선언" % tier)
    return pub


def enforce_file(m, budget):
    f = budget['file']
    st = budget.get('structure') or {}
    out = []
    if m['bytes'] > f['max_bytes']:
        out.append('파일 크기 %s > 상한 %s (%s)' % (_kb(m['bytes']), _kb(f['max_bytes']), m.get('rel') or m.get('path')))
    if m['gzip_bytes'] > f['max_gzip_bytes']:
        out.append('파일 gzip %s > 상한 %s (%s)' % (_kb(m['gzip_bytes']), _kb(f['max_gzip_bytes']), m.get('rel') or m.get('path')))
    lit = st.get('strip_literal_over_bytes')
    if lit and m.get('max_literal_bytes', 0) >= lit:
        out.append('삭감되지 않은 대입 리터럴 %s ≥ %s (%s)' % (_kb(m['max_literal_bytes']), _kb(lit), m.get('rel') or m.get('path')))
    opq = st.get('max_opaque_run')
    if opq and m.get('max_opaque_run', 0) > opq:
        out.append('연속 인코딩 문자열 %d자 > %d (압축 밀수 의심 · %s)' % (m['max_opaque_run'], opq, m.get('rel') or m.get('path')))
    return out


def enforce_set(s, budget):
    b = budget['set']
    out = []
    if s['bytes'] > b['max_bytes']:
        out.append('세트 합계 %s > 상한 %s' % (_kb(s['bytes']), _kb(b['max_bytes'])))
    if s['gzip_bytes'] > b['max_gzip_bytes']:
        out.append('세트 gzip 합계 %s > 상한 %s' % (_kb(s['gzip_bytes']), _kb(b['max_gzip_bytes'])))
    if s['files'] > b['max_files']:
        out.append('세트 파일 수 %d > 상한 %d' % (s['files'], b['max_files']))
    return out


def _kb(n):
    return '%.1fKB' % (n / 1024.0)


def _pct(cur, cap):
    return '%s / %s (%d%%)' % (_kb(cur), _kb(cap), round(100.0 * cur / cap) if cap else 0)


def format_set_report(s, budget):
    b = budget['set']
    lines = ['  세트  파일 %d/%d · 원시 %s · gzip %s'
             % (s['files'], b['max_files'], _pct(s['bytes'], b['max_bytes']), _pct(s['gzip_bytes'], b['max_gzip_bytes']))]
    for m in s['per_file']:
        lines.append('    · %-28s %8s  gzip %8s  최대리터럴 %s'
                     % (m['rel'], _kb(m['bytes']), _kb(m['gzip_bytes']), _kb(m.get('max_literal_bytes', 0))))
    return '\n'.join(lines)


def main(argv):
    if len(argv) < 2 or argv[1] != '--report':
        print(__doc__)
        return 0
    for target in argv[2:]:
        print('══', target)
        if os.path.isdir(target):
            s = measure_set(target)
            print('  파일 %d · 원시 %s · gzip %s' % (s['files'], _kb(s['bytes']), _kb(s['gzip_bytes'])))
            for m in s['per_file']:
                print('    · %-30s %10s  gzip %9s  최대리터럴 %10s  opaque %d'
                      % (m['rel'], _kb(m['bytes']), _kb(m['gzip_bytes']), _kb(m.get('max_literal_bytes', 0)), m.get('max_opaque_run', 0)))
        else:
            try:
                m = measure_file(target)
            except Unparseable as e:
                print('  ❌ 해석 불가 —', e)
                continue
            print('  원시 %s · gzip %s · 최장라인 %s · 최대리터럴 %s · opaque %d'
                  % (_kb(m['bytes']), _kb(m['gzip_bytes']), _kb(m['max_line_bytes']),
                     _kb(m.get('max_literal_bytes', 0)), m.get('max_opaque_run', 0)))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
