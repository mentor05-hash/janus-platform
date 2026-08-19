#!/usr/bin/env python3
"""테스트용 **합성** 대용량 마스터 생성기 — 저작권 데이터 0바이트.

기존 픽스처(master_sample.html, 2.5KB)로는 어떤 질량 상한도 건드릴 수 없다.
"테스트는 초록인데 아무것도 검증하지 않는" 상태를 막으려면 상한을 실제로 넘는 입력이 필요하다.
6MB 를 git 에 넣지 않기 위해 **테스트 시점에 생성**한다(시드 고정 → 재현 가능).

실마스터의 *형태*만 재현한다:
  · 지배적 리터럴 1개가 전체의 대부분
  · `<!--JANUS-TIER:…-->` 센티넬 0건        ← 2026-08-12 위음성의 조건 ①
  · `__JANUS_RAWDATA__`·`__JANUS_CUTS__` 0건 ← 조건 ②
  · tiers.config.json 의 forbidden 11개 토큰 0건 ← 조건 ③ (그래서 예전 검증이 ✅를 냈다)

--form 으로 페이로드 적재 방식을 바꾼다 — 레드팀이 제시한 우회 수법 재현용:
  assign   : const T=[…]            (일반 대입 — 크기 기반 삭감이 잡아야 한다)
  window   : window.T=[…]           (개명·전역 대입 회피 시도)
  json     : <script type="application/json">  (대입이 아니라 삭감기가 못 자른다 → 질량 게이트가 잡아야 한다)
  b64chunk : lzma+base64 를 4KB 청크로 분할 **대입에 담아** (삭감기가 잡아야 한다)
  b64json  : 같은 밀수를 대입이 아닌 json 블록에 (삭감기 사각 + 밀수 → opaque/질량이 유일한 방어선)
"""
import argparse
import base64
import lzma
import os
import random

HEAD = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>합성 배치표 픽스처 — 테스트 전용</title></head><body>
<h1>합성 배치표(테스트 픽스처)</h1>
<p>이 파일은 티어 게이트 회귀 테스트용 합성 데이터입니다. 실제 입시 데이터가 아닙니다.</p>
<div id="table"></div>
"""
TAIL = "\n<script>document.getElementById('table').textContent='render';</script>\n</body></html>\n"


def make_rows(target_bytes, rnd):
    """합성 '대학·학과·점수' 행. 실데이터와 무관한 난수."""
    rows = []
    size = 0
    i = 0
    while size < target_bytes:
        i += 1
        row = '["합성대%04d","합성학과%03d",%d,%.2f,%.2f,%d]' % (
            i % 400, i % 120, rnd.randint(200, 400), rnd.uniform(60, 99), rnd.uniform(1, 9), rnd.randint(1, 60))
        rows.append(row)
        size += len(row) + 1
    return '[' + ','.join(rows) + ']'


def build(form, mb, seed):
    rnd = random.Random(seed)
    payload = make_rows(int(mb * 1024 * 1024), rnd)
    small = '{"a":%d,"b":"%s"}' % (rnd.randint(1, 99), 'x' * 900)   # 1KB 미만 — 삭감 대상 아님
    mid = '[' + ','.join('%d' % rnd.randint(0, 9999) for _ in range(9000)) + ']'  # 40KB급

    if form == 'assign':
        body = '<script>const T=%s;const Q=%s;const S=%s;</script>' % (payload, mid, small)
    elif form == 'window':
        body = '<script>window.T=%s;globalThis.Q=%s;</script>' % (payload, mid)
    elif form == 'json':
        # 대입이 아니라서 크기 기반 삭감기가 자를 대상이 없다 — 질량 게이트만이 유일한 방어선.
        body = '<script type="application/json" id="d">%s</script>' % payload
    elif form == 'b64chunk':
        blob = base64.b64encode(lzma.compress(payload.encode('utf-8'))).decode('ascii')
        chunks = [blob[i:i + 4096] for i in range(0, len(blob), 4096)]
        body = '<script>const P=[%s].join("");</script>' % ','.join('"%s"' % c for c in chunks)
    elif form == 'b64json':
        blob = base64.b64encode(lzma.compress(payload.encode('utf-8'))).decode('ascii')
        body = '<script type="application/json" id="p">{"z":"%s"}</script>' % blob
    else:
        raise SystemExit('알 수 없는 --form: %s' % form)
    return HEAD + body + TAIL


def main():
    ap = argparse.ArgumentParser(description='합성 대용량 마스터 생성(테스트 전용)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--form', default='assign', choices=['assign', 'window', 'json', 'b64chunk', 'b64json'])
    ap.add_argument('--mb', type=float, default=2.0)
    ap.add_argument('--seed', type=int, default=20260812)
    a = ap.parse_args()
    html = build(a.form, a.mb, a.seed)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('생성: %s (%s · %.1fKB)' % (a.out, a.form, len(html.encode('utf-8')) / 1024))


if __name__ == '__main__':
    main()
