#!/usr/bin/env python3
"""티어 게이트 회귀 테스트 — 2026-08-12 위음성을 재현해 실패시킨다.

합성 데이터만 쓴다(저작권 데이터 0바이트). 전부 임시 디렉토리 안에서만 실행한다.
pytest 의존 없음 — `python3 ops/placement/tests/test_tier_gate.py`.

## 이 테스트가 지키는 것

당시 사고 조건은 셋이었다:
  ① 마스터에 `<!--JANUS-TIER:…-->` 센티넬 0건        → 영역 마스킹 no-op
  ② `strip_assignments` 의 이름이 마스터에 0건        → 페이로드 제거 no-op
  ③ `forbidden` 11개 토큰이 마스터에 0건              → 검증 "✅ 통과"
합성 픽스처(gen_bulk_master.py)는 이 세 조건을 **그대로 재현**한다. 따라서 판정이 이름에 의존하는 한
이 테스트는 통과해 버린다 — 질량으로 판정할 때만 잡힌다.

핵심 성질: 픽스처에 어떤 변수명을 쓰든 결과가 바뀌지 않아야 한다. "테스트를 통과시키려고
픽스처를 금지목록에 맞춰 손보는" 일(이번 위음성의 구조적 원인)이 성립하지 않는다.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OPS = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(OPS))
CONFIG = os.path.join(OPS, 'tiers.config.json')
GEN = os.path.join(OPS, 'fixtures', 'gen_bulk_master.py')
BUILD = os.path.join(OPS, 'tier_build.py')
VERIFY = os.path.join(OPS, 'tier_verify.py')

sys.path.insert(0, OPS)
import measure  # noqa: E402

PASS, FAIL = [], []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print(('  ✅ ' if cond else '  ❌ ') + name + (('  — ' + detail) if detail and not cond else ''))


def run(args):
    p = subprocess.run([sys.executable] + args, capture_output=True, text=True)
    return p.returncode, (p.stdout or '') + (p.stderr or '')


def gen(tmp, form, mb=2.0):
    out = os.path.join(tmp, 'master-%s.html' % form)
    rc, log = run([GEN, '--out', out, '--form', form, '--mb', str(mb)])
    assert rc == 0, log
    return out


def build_free(tmp, src, config=CONFIG, tag='out'):
    out = os.path.join(tmp, tag)
    rc, log = run([BUILD, '--src', src, '--tier', 'free', '--out', out, '--config', config])
    return rc, log, os.path.join(out, 'free')


def files_in(d):
    return [os.path.join(r, f) for r, _x, fs in os.walk(d) for f in fs] if os.path.isdir(d) else []


def main():
    print('티어 게이트 회귀 테스트')

    # 픽스처가 사고 조건 ①②③ 를 실제로 재현하는지 먼저 확인한다 —
    # 이게 깨지면 아래 테스트들이 '쉬운 입력'을 통과시키는 것에 불과해진다.
    print('\n[0] 픽스처가 2026-08-12 사고 조건을 재현하는가')
    with tempfile.TemporaryDirectory() as tmp:
        src = gen(tmp, 'assign', mb=0.5)
        t = open(src, encoding='utf-8').read()
        cfg = json.load(open(CONFIG, encoding='utf-8'))
        forb = cfg['verify']['tiers']['free']['forbidden']
        check('센티넬 0건 (조건①)', t.count('JANUS-TIER') == 0)
        check('구 strip 이름 0건 (조건②)',
              t.count('__JANUS_RAWDATA__') == 0 and t.count('__JANUS_CUTS__') == 0)
        hits = {p: t.count(p) for p in forb if p in t}
        check('forbidden 11개 토큰 0건 (조건③)', not hits, str(hits))

    # ── 1) 정상 경로: 대입형 페이로드는 이름 지식 없이 삭감되고 예산 안에 들어온다 ──
    print('\n[1] 정상 경로 — 크기 기반 삭감이 이름 없이 동작한다')
    for form in ('assign', 'window'):
        with tempfile.TemporaryDirectory() as tmp:
            src = gen(tmp, form)
            rc, log, d = build_free(tmp, src)
            check('%s: 빌드 성공' % form, rc == 0, log[-400:])
            outs = [f for f in files_in(d) if f.endswith('.html')]
            if outs:
                size = os.path.getsize(outs[0])
                check('%s: 산출물이 예산 안 (%.1fKB < 160KB)' % (form, size / 1024), size < 163840)
            rc2, log2 = run([VERIFY, d, '--tier', 'free', '--config', CONFIG])
            check('%s: 검증 통과' % form, rc2 == 0, log2[-400:])

    # ── 1-b) 밀수 형태라도 대입에 담기면 크기 기반 삭감이 먼저 잡는다 ──
    print('\n[1-b] 압축 밀수(lzma+base64) — 대입에 담기면 삭감이 제거한다')
    with tempfile.TemporaryDirectory() as tmp:
        src = gen(tmp, 'b64chunk')
        rc, log, d = build_free(tmp, src)
        check('b64chunk: 빌드 성공', rc == 0, log[-400:])
        outs = [f for f in files_in(d) if f.endswith('.html')]
        if outs:
            t = open(outs[0], encoding='utf-8').read()
            check('b64chunk: 페이로드가 삭감됨', '티어 삭감' in t and len(t.encode()) < 163840,
                  '%.1fKB' % (len(t.encode()) / 1024))

    # ── 2) 핵심 회귀: 삭감기가 못 자르는 형태 → 질량 게이트가 유일한 방어선 ──
    print('\n[2] 핵심 회귀 — 삭감이 no-op 이면 빌드가 죽고 파일을 쓰지 않는다')
    for form in ('json', 'b64json'):
        with tempfile.TemporaryDirectory() as tmp:
            src = gen(tmp, form)
            rc, log, d = build_free(tmp, src)
            check('%s: 빌드가 비-0 으로 실패' % form, rc != 0, 'rc=%d' % rc)
            leaked = [f for f in files_in(d) if f.endswith(('.html', '.htm'))]
            check('%s: 산출물 미기록(유출본 없음)' % form, not leaked, str(leaked))

    # ── 3) 검증기 독립성: 다른 경로로 만들어진 유출본도 검증에서 걸린다 ──
    print('\n[3] 검증기 독립 — 빌드를 우회해 만든 유출본을 잡는다')
    with tempfile.TemporaryDirectory() as tmp:
        src = gen(tmp, 'assign')
        d = os.path.join(tmp, 'free')
        os.makedirs(d)
        shutil.copy(src, os.path.join(d, 'leak.html'))   # 빌드를 거치지 않고 원본을 그대로 배치
        rc, log = run([VERIFY, d, '--tier', 'free', '--config', CONFIG])
        check('유출본 디렉토리 검증 실패', rc != 0, 'rc=%d' % rc)
        check('사유가 질량/구조로 보고됨', ('예산' in log or '크기' in log or '리터럴' in log or 'gzip' in log), log[-300:])

    # ── 4) 분할 적재: 파일을 쪼개도 세트 합계로 잡힌다 ──
    print('\n[4] 분할 적재 — 세트 합계·파일 수로 잡는다')
    with tempfile.TemporaryDirectory() as tmp:
        src = gen(tmp, 'assign', mb=2.0)
        raw = open(src, encoding='utf-8').read()
        d = os.path.join(tmp, 'free')
        os.makedirs(d)
        n = 8
        step = len(raw) // n
        for i in range(n):  # 각 조각은 파일 상한 아래일 수 있으나 합계가 세트 상한을 넘는다
            open(os.path.join(d, 'part%d.html' % i), 'w', encoding='utf-8').write(raw[i * step:(i + 1) * step])
        rc, log = run([VERIFY, d, '--tier', 'free', '--config', CONFIG])
        check('분할 적재 검증 실패', rc != 0, 'rc=%d' % rc)

    # ── 5) 확장자 회피: .json 사이드카에 숨겨도 세트에 합산된다 ──
    print('\n[5] 확장자 회피 — 세트는 확장자 무관·재귀로 센다')
    with tempfile.TemporaryDirectory() as tmp:
        src = gen(tmp, 'assign', mb=2.0)
        d = os.path.join(tmp, 'free')
        os.makedirs(os.path.join(d, 'assets'))
        open(os.path.join(d, 'ok.html'), 'w', encoding='utf-8').write('<html>작은 정상 파일</html>')
        shutil.copy(src, os.path.join(d, 'assets', 'data.json'))
        rc, log = run([VERIFY, d, '--tier', 'free', '--config', CONFIG])
        check('사이드카 은닉 검증 실패', rc != 0, 'rc=%d' % rc)

    # ── 6) 설정 fail-closed: 예산 미선언·HARD 초과는 통과 불가 ──
    print('\n[6] 설정 fail-closed — 누락·완화는 통과가 아니라 실패')
    with tempfile.TemporaryDirectory() as tmp:
        cfg = json.load(open(CONFIG, encoding='utf-8'))
        del cfg['tiers']['free']['publish']
        c1 = os.path.join(tmp, 'nopublish.json')
        json.dump(cfg, open(c1, 'w', encoding='utf-8'), ensure_ascii=False)
        d = os.path.join(tmp, 'free')
        os.makedirs(d)
        open(os.path.join(d, 'x.html'), 'w', encoding='utf-8').write('<html>x</html>')
        rc, _ = run([VERIFY, d, '--tier', 'free', '--config', c1])
        check('publish 예산 부재 → exit 2', rc == 2, 'rc=%d' % rc)

        cfg2 = json.load(open(CONFIG, encoding='utf-8'))
        cfg2['tiers']['free']['publish']['file']['max_bytes'] = measure.HARD['file_bytes'] + 1
        c2 = os.path.join(tmp, 'toobig.json')
        json.dump(cfg2, open(c2, 'w', encoding='utf-8'), ensure_ascii=False)
        rc, _ = run([VERIFY, d, '--tier', 'free', '--config', c2])
        check('HARD 초과 완화 → exit 2', rc == 2, 'rc=%d' % rc)

        cfg3 = json.load(open(CONFIG, encoding='utf-8'))
        del cfg3['tiers']['free']['publishable']
        c3 = os.path.join(tmp, 'nopub.json')
        json.dump(cfg3, open(c3, 'w', encoding='utf-8'), ensure_ascii=False)
        rc, _ = run([VERIFY, d, '--tier', 'free', '--config', c3])
        check('publishable 미선언 → exit 2', rc == 2, 'rc=%d' % rc)

    # ── 7) 해석 불가 = 실패 (조용한 통과 금지) ──
    print('\n[7] 균형 스캔 실패 → 예외(조용한 통과 없음)')
    broken = '<script>const T=[' + ('"x",' * 4000)   # 닫히지 않은 거대 리터럴
    try:
        measure.literal_spans(broken, 8192)
        check('Unparseable 발생', False, '예외가 안 났다')
    except measure.Unparseable:
        check('Unparseable 발생', True)

    print('\n─────────────────────────────')
    print('통과 %d · 실패 %d' % (len(PASS), len(FAIL)))
    if FAIL:
        for n in FAIL:
            print('  실패:', n)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
