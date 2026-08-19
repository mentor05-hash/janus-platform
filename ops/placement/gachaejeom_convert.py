#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""가채점 환산 (N4-P2) — 당해년 원점수 → 추정 표준점수·백분위.

수능 당일 19:00 에 손에 있는 것은 **업체 추정 등급컷**뿐이다. 실채점 표준점수 분포는
12/11 에야 나온다. 그래서 이 모듈은 없는 분포를 지어내지 않고, **있는 것 두 개를 잇는다**:

  ① 전년도 실측 환산표 (원점수 → 표준점수 · 백분위)   ← 기저(base)
  ② 당해년 추정 등급컷 (원점수)                        ← 보정(difficulty)

②의 각 등급컷은 ①의 같은 등급컷과 **같은 실력 지점**이다. 두 원점수를 짝지어
구간선형 사상(piecewise-linear remap)을 만들면 "올해 원점수 R 은 작년 척도로 몇 점인가"가
나오고, 거기서 ①의 표준점수·백분위를 읽는다. 등급컷 사이는 선형 보간이다 —
가진 정보가 그 이상을 허락하지 않으므로 그 이상을 주장하지 않는다.

**이 모듈은 추정이라고 말한다.** 산출물의 `disclaimer` 는 선택 필드가 아니며
배치표·리포트에 그대로 실려야 한다(지시서 §2-2 P2).

설계 제약:
  · 순수 함수 — 외부 패키지 0, 네트워크 0, 전역 상태 0.
  · **저작권 데이터는 인자로만 들어온다.** base/difficulty 는 JANUS_DATA_DIR 의 로컬 경로이며
    repo 에 반입하지 않는다(핸드오프 C6). 테스트는 합성 픽스처만 쓴다.
  · 조용한 실패 금지 — 입력이 단조가 아니거나 등급컷이 어긋나면 예외를 던진다.
    수능 당일 19:30 에 "이상하지만 통과"는 가장 비싼 실패다.

사용:
  python3 ops/placement/gachaejeom_convert.py \
      --base <전년도_환산표.json> --difficulty <당해년_등급컷.json> \
      --target-year 2027 --out <가채점_환산표.json>

  보정 파일 대신 ENV 도 받는다: JANUS_DIFFICULTY_ADJUST=<경로>
"""
import argparse
import json
import os
import sys

DISCLAIMER = '가채점 기반 추정치입니다. 실채점 결과와 차이가 있을 수 있습니다.'

# 상대평가(표준점수·백분위) / 절대평가(등급만) — 영어·한국사는 후자다.
RELATIVE = 'relative'
ABSOLUTE = 'absolute'


class ConvertError(ValueError):
    """입력이 신뢰할 수 없을 때. 메시지는 사람이 19:30 에 읽고 고칠 수 있어야 한다."""


# ── 보간 ────────────────────────────────────────────────────────────────────
def interp(points, x):
    """구간선형 보간. points = [(x, y), ...] x 오름차순. 범위 밖은 양끝 값으로 고정(clamp).

    clamp 하는 이유: 원점수는 [0, max] 로 닫힌 구간이라 외삽할 자리가 없다.
    외삽하면 만점 위에 표준점수를 만들어내게 된다.
    """
    if not points:
        raise ConvertError('보간할 점이 없다')
    if x <= points[0][0]:
        return float(points[0][1])
    if x >= points[-1][0]:
        return float(points[-1][1])
    lo, hi = 0, len(points) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if points[mid][0] <= x:
            lo = mid
        else:
            hi = mid
    x0, y0 = points[lo]
    x1, y1 = points[hi]
    if x1 == x0:
        return float(y0)
    return float(y0) + (float(y1) - float(y0)) * (float(x) - float(x0)) / (float(x1) - float(x0))


def check_sorted(points, label):
    """x 는 순증가, y 는 비감소여야 한다. 환산표가 뒤집혀 있으면 여기서 죽는다."""
    for i in range(1, len(points)):
        if points[i][0] <= points[i - 1][0]:
            raise ConvertError('%s: 원점수가 순증가가 아니다 — %s 다음에 %s'
                               % (label, points[i - 1][0], points[i][0]))
        if points[i][1] < points[i - 1][1]:
            raise ConvertError('%s: 값이 감소한다(원점수 %s→%s, 값 %s→%s). 환산표가 뒤집혔는지 확인'
                               % (label, points[i - 1][0], points[i][0], points[i - 1][1], points[i][1]))


# ── 난이도 보정: 등급컷 짝 → 원점수 사상 ────────────────────────────────────
def anchor_pairs(base_cuts, this_cuts, max_raw, label):
    """등급컷 두 벌에서 (올해 원점수, 작년 원점수) 앵커를 만든다.

    같은 등급의 컷은 **같은 실력 지점**이라는 것이 유일한 가정이다. 등급은 상대적
    위치(누적 비율)로 정의되므로, 표준점수 분포를 몰라도 이 짝은 성립한다.

    양끝 (0,0)·(max,max) 를 고정점으로 넣는다 — 0 점은 0 점이고 만점은 만점이다.
    """
    common = sorted(set(base_cuts) & set(this_cuts), key=lambda g: int(g))
    pairs = []
    for g in common:
        b, t = float(base_cuts[g]), float(this_cuts[g])
        if not (0 <= b <= max_raw) or not (0 <= t <= max_raw):
            raise ConvertError('%s: %s등급컷이 원점수 범위[0,%s] 밖 — base=%s this=%s'
                               % (label, g, max_raw, b, t))
        pairs.append((t, b))
    pairs.sort()
    # 등급이 올라갈수록 컷이 낮아지므로 정렬 후엔 두 축 모두 순증가여야 한다.
    for i in range(1, len(pairs)):
        if pairs[i][0] == pairs[i - 1][0]:
            raise ConvertError('%s: 올해 등급컷이 겹친다(원점수 %s 중복)' % (label, pairs[i][0]))
        if pairs[i][1] <= pairs[i - 1][1]:
            raise ConvertError('%s: 등급컷 순서가 어긋난다 — 올해 %s→%s 인데 작년 %s→%s'
                               % (label, pairs[i - 1][0], pairs[i][0], pairs[i - 1][1], pairs[i][1]))
    fixed = [(0.0, 0.0)] + pairs + [(float(max_raw), float(max_raw))]
    # 고정점과 앵커가 부딪히면(예: 1등급컷이 만점) 중복 제거 — 앵커를 우선한다.
    dedup = []
    for x, y in fixed:
        if dedup and abs(dedup[-1][0] - x) < 1e-9:
            dedup[-1] = (x, y)
        else:
            dedup.append((x, y))
    check_sorted(dedup, '%s 앵커' % label)
    return dedup


def remap_raw(anchors, raw):
    """올해 원점수 → 작년 척도의 원점수."""
    return interp(anchors, raw)


# ── 과목 변환 ───────────────────────────────────────────────────────────────
def convert_relative(name, base_sub, this_sub, step=1):
    """상대평가 과목: 올해 원점수 전 구간에 대해 추정 표준점수·백분위 표를 만든다."""
    max_raw = int(base_sub.get('max_raw', 100))
    pts = [(float(p[0]), float(p[1]), float(p[2])) for p in base_sub.get('points', [])]
    if len(pts) < 2:
        raise ConvertError('%s: 기저 환산표 점이 2개 미만' % name)
    raw_std = [(p[0], p[1]) for p in pts]
    raw_pct = [(p[0], p[2]) for p in pts]
    check_sorted(raw_std, '%s 기저 표준점수' % name)
    check_sorted(raw_pct, '%s 기저 백분위' % name)

    base_cuts = base_sub.get('grade_cuts') or {}
    this_cuts = (this_sub or {}).get('grade_cuts') or {}
    if this_cuts and not base_cuts:
        raise ConvertError('%s: 올해 등급컷은 있는데 기저 등급컷이 없다 — 짝지을 수 없다' % name)
    if this_cuts:
        anchors = anchor_pairs(base_cuts, this_cuts, max_raw, name)
        corrected = True
    else:
        # 보정 정보가 없으면 **보정하지 않는다**(항등 사상). 없는 것을 지어내지 않는다.
        anchors = [(0.0, 0.0), (float(max_raw), float(max_raw))]
        corrected = False

    to_std, to_pct = [], []
    for raw in range(0, max_raw + 1, step):
        b = remap_raw(anchors, raw)
        to_std.append([raw, round(interp(raw_std, b), 1)])
        to_pct.append([raw, round(interp(raw_pct, b), 1)])
    check_sorted(to_std, '%s 산출 표준점수' % name)
    check_sorted(to_pct, '%s 산출 백분위' % name)
    out = {
        'type': RELATIVE,
        'max_raw': max_raw,
        'corrected': corrected,
        'raw_to_std': to_std,
        'raw_to_pct': to_pct,
    }
    if corrected:
        out['anchors'] = [[a, b] for a, b in anchors]
    else:
        out['caveat'] = '난이도 보정 없음(올해 등급컷 미제공) — 전년도 환산을 그대로 쓴 값이다.'
    return out


def convert_absolute(name, base_sub, this_sub):
    """절대평가 과목(영어·한국사): 고정 등급컷. 올해 컷이 오면 그것을, 없으면 기저를 쓴다."""
    max_raw = int(base_sub.get('max_raw', 100))
    cuts = ((this_sub or {}).get('grade_cuts')) or base_sub.get('grade_cuts') or {}
    if not cuts:
        raise ConvertError('%s: 절대평가 과목인데 등급컷이 없다' % name)
    ordered = sorted(((int(g), float(c)) for g, c in cuts.items()), key=lambda gc: gc[0])
    for i in range(1, len(ordered)):
        if ordered[i][1] >= ordered[i - 1][1]:
            raise ConvertError('%s: 등급이 올라가는데 컷이 낮아지지 않는다 — %s등급 %s, %s등급 %s'
                               % (name, ordered[i - 1][0], ordered[i - 1][1], ordered[i][0], ordered[i][1]))
    to_grade = []
    worst = ordered[-1][0] + 1
    for raw in range(0, max_raw + 1):
        g = worst
        for grade, cut in ordered:
            if raw >= cut:
                g = grade
                break
        to_grade.append([raw, g])
    return {'type': ABSOLUTE, 'max_raw': max_raw, 'raw_to_grade': to_grade,
            'grade_cuts': {str(g): c for g, c in ordered}}


# ── 전체 변환 ───────────────────────────────────────────────────────────────
def convert(base, difficulty, target_year, mode='gachaejeom'):
    """기저 + 보정 → 당해년 환산표. 입력 dict 를 변형하지 않는다."""
    if not isinstance(base, dict) or 'subjects' not in base:
        raise ConvertError('기저 파일에 subjects 가 없다')
    base_year = base.get('year')
    if base_year is None:
        raise ConvertError('기저 파일에 year 가 없다 — 어느 해 환산표인지 모르면 쓸 수 없다')
    if int(target_year) <= int(base_year):
        raise ConvertError('대상 연도(%s)가 기저 연도(%s)보다 뒤가 아니다' % (target_year, base_year))

    dsubs = (difficulty or {}).get('subjects') or {}
    unknown = sorted(set(dsubs) - set(base['subjects']))
    if unknown:
        raise ConvertError('보정에만 있는 과목: %s — 기저에 없는 과목은 환산할 수 없다' % ', '.join(unknown))

    out_subs = {}
    for name, bs in sorted(base['subjects'].items()):
        kind = bs.get('type', RELATIVE)
        ts = dsubs.get(name)
        if kind == ABSOLUTE:
            out_subs[name] = convert_absolute(name, bs, ts)
        elif kind == RELATIVE:
            out_subs[name] = convert_relative(name, bs, ts)
        else:
            raise ConvertError('%s: 알 수 없는 type=%r (relative|absolute)' % (name, kind))

    return {
        'schema': 1,
        'mode': mode,
        'base_year': int(base_year),
        'target_year': int(target_year),
        'difficulty_source': (difficulty or {}).get('source') or 'manual',
        'corrected_subjects': sorted(n for n, s in out_subs.items() if s.get('corrected')),
        'subjects': out_subs,
        'disclaimer': DISCLAIMER,
    }


def load_json(path, label):
    if not os.path.isfile(path):
        raise ConvertError('%s 파일이 없다: %s' % (label, path))
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except ValueError as e:
        raise ConvertError('%s 파일이 JSON 이 아니다(%s): %s' % (label, path, e))


def main(argv=None):
    ap = argparse.ArgumentParser(description='가채점 환산표 생성 (N4-P2)')
    ap.add_argument('--base', required=True, help='전년도 실측 환산표 JSON (JANUS_DATA_DIR 로컬 경로)')
    ap.add_argument('--difficulty', help='당해년 추정 등급컷 JSON. 미지정 시 ENV JANUS_DIFFICULTY_ADJUST')
    ap.add_argument('--target-year', type=int, required=True)
    ap.add_argument('--mode', default='gachaejeom', choices=['gachaejeom', 'silchaejeom'])
    ap.add_argument('--out', required=True)
    a = ap.parse_args(argv)

    dpath = a.difficulty or os.environ.get('JANUS_DIFFICULTY_ADJUST', '').strip()
    try:
        base = load_json(a.base, '기저 환산표')
        diff = load_json(dpath, '난이도 보정') if dpath else None
        result = convert(base, diff, a.target_year, a.mode)
    except ConvertError as e:
        print('✗ 환산 실패: %s' % e, file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or '.', exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write('\n')

    n = len(result['subjects'])
    c = len(result['corrected_subjects'])
    print('✓ 환산표 생성: %s' % a.out)
    print('  %s → %s · 과목 %d개(보정 적용 %d개%s) · source=%s'
          % (result['base_year'], result['target_year'], n, c,
             '' if c == n else ' · 나머지는 무보정',
             result['difficulty_source']))
    if c < n:
        for name, s in sorted(result['subjects'].items()):
            if s.get('type') == RELATIVE and not s.get('corrected'):
                print('  ⚠ %s: %s' % (name, s.get('caveat')))
    print('  ' + DISCLAIMER)
    return 0


if __name__ == '__main__':
    sys.exit(main())
