#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""가채점 환산 회귀 테스트 (N4-P2).

합성 픽스처만 쓴다(저작권 데이터 0바이트). pytest 의존 없음 —
`python3 ops/placement/tests/test_gachaejeom_convert.py`.

## 이 테스트가 지키는 것

핵심 성질은 **역검증**이다: 올해 등급컷이 작년과 같으면 산출은 기저와 **완전히 같아야** 한다.
보정이 항등일 때 값이 흔들린다면 보간·앵커 어딘가가 틀린 것이고, 그 오차는 등급컷이
움직이는 실제 상황에서 더 크게 벌어진다. 그래서 항등이 첫 번째 시험이다.

두 번째는 **방향**이다. 올해가 어려우면(등급컷이 낮아지면) 같은 원점수의 표준점수는
**올라가야** 한다. 부호가 뒤집힌 보정은 그럴듯한 숫자를 내면서 배치를 통째로 망친다 —
수능 당일에는 아무도 눈치채지 못한다.

세 번째는 **조용한 실패 금지**다. 뒤집힌 환산표·어긋난 등급컷·범위 밖 값은 예외로 죽어야 한다.
19:30 에 "이상하지만 통과"는 가장 비싼 실패다.
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OPS = os.path.dirname(HERE)
sys.path.insert(0, OPS)
import gachaejeom_convert as gc  # noqa: E402

MIN_CHECKS = 34  # 실측 단언 수 하한. 이 아래면 '공허한 통과'로 보고 실패시킨다(O211).
PASS, FAIL = [], []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print('  %s %s%s' % ('✅' if cond else '❌', name, (' — ' + detail) if detail else ''))


def raises(name, fn, frag=''):
    try:
        fn()
    except gc.ConvertError as e:
        ok = frag in str(e)
        check(name, ok, ('메시지=%s' % e) if not ok else '')
        return
    except Exception as e:  # noqa: BLE001
        check(name, False, '다른 예외: %r' % e)
        return
    check(name, False, '예외가 안 났다')


# ── 합성 픽스처 ─────────────────────────────────────────────────────────────
def base_fixture():
    """전년도 환산표(가공의 수치). 국어=상대평가, 영어=절대평가."""
    pts = []
    for raw in range(0, 101, 10):
        std = 60 + raw * 0.9          # 60 → 150
        pct = min(100.0, raw * 1.0)   # 0 → 100
        pts.append([raw, round(std, 1), round(pct, 1)])
    return {
        'year': 2026,
        'subjects': {
            'korean': {
                'type': 'relative', 'max_raw': 100, 'points': pts,
                'grade_cuts': {'1': 90, '2': 80, '3': 70},
            },
            'english': {
                'type': 'absolute', 'max_raw': 100,
                'grade_cuts': {'1': 90, '2': 80, '3': 70},
            },
        },
    }


def diff_fixture(korean_cuts=None, source='테스트'):
    d = {'source': source, 'subjects': {}}
    if korean_cuts:
        d['subjects']['korean'] = {'grade_cuts': korean_cuts}
    return d


def main():
    base = base_fixture()

    # ── 1) 보간 자체 ────────────────────────────────────────────────────────
    print('[1) 보간 — 구간선형·clamp]')
    pts = [(0, 0), (10, 100)]
    check('중간값 선형', gc.interp(pts, 5) == 50.0, str(gc.interp(pts, 5)))
    check('하한 clamp', gc.interp(pts, -5) == 0.0)
    check('상한 clamp', gc.interp(pts, 999) == 100.0)
    check('격자점 정확', gc.interp(pts, 10) == 100.0)
    raises('빈 점 → 예외', lambda: gc.interp([], 1), '보간할 점이 없다')

    # ── 2) 역검증 — 올해 컷 = 작년 컷 ───────────────────────────────────────
    print('\n[2) 역검증 — 등급컷이 같으면 기저와 완전히 같아야 한다]')
    same = gc.convert(base, diff_fixture({'1': 90, '2': 80, '3': 70}), 2027)
    ks = same['subjects']['korean']
    exact = all(
        abs(gc.interp([(p[0], p[1]) for p in base['subjects']['korean']['points']], raw) - std) < 0.05
        for raw, std in ks['raw_to_std']
    )
    check('표준점수가 기저와 일치(항등 보정)', exact)
    exact_pct = all(
        abs(gc.interp([(p[0], p[2]) for p in base['subjects']['korean']['points']], raw) - pct) < 0.05
        for raw, pct in ks['raw_to_pct']
    )
    check('백분위가 기저와 일치(항등 보정)', exact_pct)
    check('corrected=True', ks['corrected'] is True)
    check('앵커 기록됨', len(ks.get('anchors', [])) >= 5, str(len(ks.get('anchors', []))))

    # ── 3) 방향 — 어려워진 해 / 쉬워진 해 ───────────────────────────────────
    print('\n[3) 난이도 방향 — 부호가 뒤집히면 배치가 통째로 망가진다]')
    hard = gc.convert(base, diff_fixture({'1': 84, '2': 74, '3': 64}), 2027)
    easy = gc.convert(base, diff_fixture({'1': 95, '2': 86, '3': 77}), 2027)
    h = dict(hard['subjects']['korean']['raw_to_std'])
    e = dict(easy['subjects']['korean']['raw_to_std'])
    s = dict(ks['raw_to_std'])
    check('어려운 해: 같은 원점수 84 의 표준점수가 더 높다', h[84] > s[84], 'hard=%s same=%s' % (h[84], s[84]))
    check('쉬운 해: 같은 원점수 84 의 표준점수가 더 낮다', e[84] < s[84], 'easy=%s same=%s' % (e[84], s[84]))
    check('어려운 해 1등급컷(84)이 작년 1등급컷 표준점수와 같다',
          abs(h[84] - s[90]) < 0.15, 'hard[84]=%s same[90]=%s' % (h[84], s[90]))
    check('쉬운 해 1등급컷(95)이 작년 1등급컷 표준점수와 같다',
          abs(e[95] - s[90]) < 0.15, 'easy[95]=%s same[90]=%s' % (e[95], s[90]))
    hp = dict(hard['subjects']['korean']['raw_to_pct'])
    check('백분위도 같은 방향', hp[84] > dict(ks['raw_to_pct'])[84])

    # ── 4) 단조성·경계 ──────────────────────────────────────────────────────
    print('\n[4) 단조성·경계 — 산출이 뒤집히면 배치표가 거짓말을 한다]')
    for label, res in (('항등', same), ('어려움', hard), ('쉬움', easy)):
        std = [v for _, v in res['subjects']['korean']['raw_to_std']]
        pct = [v for _, v in res['subjects']['korean']['raw_to_pct']]
        check('%s: 표준점수 비감소' % label, all(std[i] >= std[i - 1] for i in range(1, len(std))))
        check('%s: 백분위 비감소' % label, all(pct[i] >= pct[i - 1] for i in range(1, len(pct))))
    check('0점·만점이 양끝 고정', h[0] == s[0] and abs(h[100] - s[100]) < 1e-9,
          'h0=%s s0=%s h100=%s s100=%s' % (h[0], s[0], h[100], s[100]))
    check('표 길이 = 원점수 전 구간', len(hard['subjects']['korean']['raw_to_std']) == 101)

    # ── 5) 보정 없음 — 없는 것을 지어내지 않는다 ────────────────────────────
    print('\n[5) 보정 미제공 — 무보정임을 말한다]')
    none = gc.convert(base, None, 2027)
    kn = none['subjects']['korean']
    check('corrected=False', kn['corrected'] is False)
    check('caveat 명시', '난이도 보정 없음' in kn.get('caveat', ''))
    check('corrected_subjects 에서 제외', 'korean' not in none['corrected_subjects'])
    check('값은 기저와 동일', dict(kn['raw_to_std'])[84] == s[84])

    # ── 6) 절대평가 ─────────────────────────────────────────────────────────
    print('\n[6) 절대평가 — 등급컷 그대로]')
    en = same['subjects']['english']
    g = dict(en['raw_to_grade'])
    check('90 → 1등급', g[90] == 1)
    check('89 → 2등급', g[89] == 2)
    check('80 → 2등급', g[80] == 2)
    check('69 → 최하등급(4)', g[69] == 4, str(g[69]))
    check('만점 → 1등급', g[100] == 1)
    shifted = gc.convert(base, {'source': 't', 'subjects': {'english': {'grade_cuts': {'1': 95, '2': 85}}}}, 2027)
    ge = dict(shifted['subjects']['english']['raw_to_grade'])
    check('올해 컷이 오면 그것을 쓴다(94→2등급)', ge[94] == 2, str(ge[94]))

    # ── 7) 조용한 실패 금지 ─────────────────────────────────────────────────
    print('\n[7) 검증 — 이상한 입력은 죽는다]')
    flipped = base_fixture()
    flipped['subjects']['korean']['points'][5][1] = 0  # 표준점수가 중간에 뚝 떨어짐
    raises('뒤집힌 기저 환산표 → 예외', lambda: gc.convert(flipped, None, 2027), '값이 감소한다')

    raises('등급컷 순서 어긋남 → 예외',
           lambda: gc.convert(base, diff_fixture({'1': 70, '2': 80, '3': 90}), 2027), '등급컷')
    raises('등급컷 범위 밖 → 예외',
           lambda: gc.convert(base, diff_fixture({'1': 140}), 2027), '범위')
    raises('기저에 없는 과목 → 예외',
           lambda: gc.convert(base, {'subjects': {'math': {'grade_cuts': {'1': 80}}}}, 2027), '보정에만 있는 과목')

    noyear = base_fixture(); del noyear['year']
    raises('기저에 year 없음 → 예외', lambda: gc.convert(noyear, None, 2027), 'year')
    raises('대상 연도가 기저 이하 → 예외', lambda: gc.convert(base, None, 2026), '기저 연도')

    badtype = base_fixture(); badtype['subjects']['korean']['type'] = 'weird'
    raises('알 수 없는 type → 예외', lambda: gc.convert(badtype, None, 2027), '알 수 없는 type')

    nocuts = base_fixture(); del nocuts['subjects']['korean']['grade_cuts']
    raises('올해 컷은 있는데 기저 컷이 없음 → 예외',
           lambda: gc.convert(nocuts, diff_fixture({'1': 88}), 2027), '짝지을 수 없다')

    # ── 8) 계약 필드 ────────────────────────────────────────────────────────
    print('\n[8) 산출 계약 — 면책은 선택 필드가 아니다]')
    check('disclaimer 존재', same['disclaimer'] == gc.DISCLAIMER)
    check('추정임을 말한다', '추정치' in same['disclaimer'] and '실채점' in same['disclaimer'])
    check('mode·연도 기록', same['mode'] == 'gachaejeom' and same['base_year'] == 2026 and same['target_year'] == 2027)
    check('difficulty_source 기록', same['difficulty_source'] == '테스트')
    check('보정 미제공 시 source=manual', none['difficulty_source'] == 'manual')

    # ── 9) CLI ──────────────────────────────────────────────────────────────
    print('\n[9) CLI — 파일 입출력 왕복]')
    with tempfile.TemporaryDirectory() as d:
        bp = os.path.join(d, 'base.json')
        dp = os.path.join(d, 'diff.json')
        op = os.path.join(d, 'out', 'table.json')
        json.dump(base, open(bp, 'w', encoding='utf-8'), ensure_ascii=False)
        json.dump(diff_fixture({'1': 84, '2': 74, '3': 64}, source='업체X'),
                  open(dp, 'w', encoding='utf-8'), ensure_ascii=False)
        r = subprocess.run([sys.executable, os.path.join(OPS, 'gachaejeom_convert.py'),
                            '--base', bp, '--difficulty', dp, '--target-year', '2027', '--out', op],
                           capture_output=True, text=True)
        check('CLI exit 0', r.returncode == 0, r.stderr.strip()[:120])
        check('출력 파일 생성(디렉토리 자동)', os.path.isfile(op))
        if os.path.isfile(op):
            got = json.load(open(op, encoding='utf-8'))
            check('CLI 산출이 모듈 산출과 같다', dict(got['subjects']['korean']['raw_to_std'])['84'
                  if '84' in dict(got['subjects']['korean']['raw_to_std']) else 84] == h[84])
            check('CLI 가 source 를 전달', got['difficulty_source'] == '업체X')
        check('CLI 가 면책을 출력', '추정치' in r.stdout)

        r2 = subprocess.run([sys.executable, os.path.join(OPS, 'gachaejeom_convert.py'),
                             '--base', os.path.join(d, 'nope.json'), '--target-year', '2027', '--out', op],
                            capture_output=True, text=True)
        check('없는 기저 파일 → 비-0 + 사람이 읽는 사유', r2.returncode != 0 and '파일이 없다' in r2.stderr)

        env = dict(os.environ, JANUS_DIFFICULTY_ADJUST=dp)
        r3 = subprocess.run([sys.executable, os.path.join(OPS, 'gachaejeom_convert.py'),
                             '--base', bp, '--target-year', '2027', '--out', op],
                            capture_output=True, text=True, env=env)
        check('ENV JANUS_DIFFICULTY_ADJUST 경로도 받는다', r3.returncode == 0 and '업체X' in r3.stdout)

    # ── 10) 공허한 통과 방지 ────────────────────────────────────────────────
    print('\n[10) 공허한 통과 방지]')
    ran = len(PASS) + len(FAIL) + 1
    check('단언 %d건 실행(최소 %d)' % (ran, MIN_CHECKS), ran >= MIN_CHECKS, '%d건' % ran)

    print('\n─────────────────────────────')
    print('통과 %d · 실패 %d' % (len(PASS), len(FAIL)))
    if FAIL:
        for n in FAIL:
            print('  실패:', n)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
