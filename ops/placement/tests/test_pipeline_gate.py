#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""파이프라인 선검사 회귀 (N4-P1) — 드라이런이 통과했다고 당일이 통과하지 않는다.

합성 데이터만 쓴다. pytest 의존 없음 — `python3 ops/placement/tests/test_pipeline_gate.py`.

## 왜 이 테스트가 필요한가

지시서의 완료 기준은 "드라이런 30분 이내 완주"였다. 그런데 드라이런은 **픽스처**를 쓰고,
픽스처에는 `JANUS-TIER` 센티넬이 있다. 실마스터에는 **0건**이다(2026-08-08 실측).
그래서 드라이런은 초록인데 11/19 19:55 에 4단계에서 죽는 상황이 성립한다 —
그 시점에는 남은 시간이 없다.

이 테스트가 못박는 것:
  ① 센티넬 없는 마스터는 **빌드 전에**(0단계) 죽는다. 4단계까지 가지 않는다.
  ② 죽을 때 사람이 19:30 에 읽고 고칠 수 있는 사유를 말한다.
  ③ 센티넬 있는 마스터는 통과한다(양성 대조 — 게이트가 항상 죽는 것이 아님을 증명).
  ④ 마스터가 환산표보다 오래되면 죽는다 — "오늘 만든 환산표를 마스터에 안 넣었다"가
     당일 가장 흔한 실수다.
"""
import json
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OPS = os.path.dirname(HERE)
PIPELINE = os.path.join(OPS, 'pipeline_run.sh')
GEN = os.path.join(OPS, 'fixtures', 'gen_bulk_master.py')

MIN_CHECKS = 14
PASS, FAIL = [], []


def check(name, cond, detail=''):
    (PASS if cond else FAIL).append(name)
    print('  %s %s%s' % ('✅' if cond else '❌', name, (' — ' + detail) if detail else ''))


def run_pipeline(args, timeout=900):
    r = subprocess.run(['bash', PIPELINE] + args, capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout + r.stderr


def gen_master(out, mb=0.4, sentinel=0):
    r = subprocess.run([sys.executable, GEN, '--out', out, '--mb', str(mb), '--sentinel', str(sentinel)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit('픽스처 생성 실패: %s' % r.stderr)
    return out


def base_table_fixture(path):
    pts = [[raw, round(60 + raw * 0.9, 1), float(raw)] for raw in range(0, 101, 10)]
    json.dump({'year': 2026, 'subjects': {'korean': {
        'type': 'relative', 'max_raw': 100, 'points': pts,
        'grade_cuts': {'1': 90, '2': 80}}}},
        open(path, 'w', encoding='utf-8'), ensure_ascii=False)
    return path


def main():
    with tempfile.TemporaryDirectory() as d:
        # ── 1) 음성 대조 — 센티넬 없는 마스터 ────────────────────────────────
        print('[1) 센티넬 0건 마스터 — 빌드 전에 죽어야 한다]')
        bare = gen_master(os.path.join(d, 'bare.html'), sentinel=0)
        occ = open(bare, encoding='utf-8').read().count('JANUS-TIER')
        check('픽스처가 실제로 센티넬 0건', occ == 0, '%d건' % occ)

        code, out = run_pipeline(['--mode', 'dry-run', '--master', bare])
        check('비-0 종료', code != 0, 'exit=%d' % code)
        check('사유에 센티넬을 지목', 'JANUS-TIER 센티넬이 0건' in out)
        check('무엇을 해야 하는지 말한다', '마스터 생성기' in out and '독립 트랙' in out)
        check('확인 명령을 준다', "grep -o 'JANUS-TIER'" in out)
        check('0단계에서 죽는다(빌드 전)', '[4] 티어 빌드' not in out,
              '빌드 단계까지 갔다' if '[4] 티어 빌드' in out else '')
        check('선검사 단계로 표시', '중단(단계 1)' in out)

        # ── 2) 양성 대조 — 게이트가 항상 죽지는 않는다 ───────────────────────
        print('\n[2) 센티넬 있는 마스터 — 통과해야 한다]')
        tagged = gen_master(os.path.join(d, 'tagged.html'), sentinel=3)
        occ2 = open(tagged, encoding='utf-8').read().count('JANUS-TIER')
        check('픽스처가 센티넬을 갖는다', occ2 >= 6, '%d건' % occ2)  # 여는 태그 3 + 닫는 태그 3
        code, out = run_pipeline(['--mode', 'dry-run', '--master', tagged])
        check('exit 0', code == 0, out.strip().splitlines()[-1][:100] if code else '')
        check('완주 표시', '✅ 완주' in out)
        check('삭감이 실제로 일어났다', '영역 3' in out)
        check('4티어 전부 검증 통과', out.count('· ✅ ') >= 4)

        # ── 3) 환산표보다 오래된 마스터 ──────────────────────────────────────
        print('\n[3) 마스터가 환산표보다 오래됨 — 당일 최다 실수]')
        base = base_table_fixture(os.path.join(d, 'base.json'))
        # 마스터를 과거 시각으로 되돌린다(환산표는 파이프라인이 지금 만든다).
        old = time.time() - 3600
        os.utime(tagged, (old, old))
        code, out = run_pipeline(['--mode', 'dry-run', '--master', tagged,
                                  '--base', base, '--target-year', '2027'])
        check('비-0 종료', code != 0, 'exit=%d' % code)
        check('사유가 최신성을 지목', '마스터가 환산표보다 오래됐다' in out)
        check('두 시각을 함께 보여준다', '마스터:' in out and '환산표:' in out)

        # ── 4) 공허한 통과 방지 ──────────────────────────────────────────────
        print('\n[4) 공허한 통과 방지]')
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
