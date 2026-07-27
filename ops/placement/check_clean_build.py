#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
청정 빌드 게이트(O77) — 외부 공개(audience != 'internal') 배치표에 고속 유래 흔적 0건 검사.
재통합 3단 게이트(핸드오프 §3-A)의 데이터 원천 검사 항목. 위반 1건이라도 있으면 비-0 종료 = 반출 불가.

사용:
  python3 ops/placement/check_clean_build.py <JANUS_DATA_DIR>/placement-hub
검사 대상:
  ① manifest.json 에서 audience != 'internal' 인 표의 HTML 파일
  ② slices/*.json 전부 (slice 는 항상 외부 공개 경로)
검사 내용: 금지 토큰(고속 유래 마커) 출현 0건. 과탐지(예: '고속'이 일반 문장에 등장)는
안전한 방향의 실패이므로 사람이 확인 후 필요 시 토큰을 조정한다 — 게이트는 fail-closed.
"""
import json
import os
import sys

# 고속 유래 마커 — 데이터트랙 계보 매트릭스(data-lineage-matrix.md) 확정 시 필드명 추가.
FORBIDDEN = [
    "고속성장",
    "고속_어디가",
    "고속_표점",
    "gosok",
    "GOSOK",
    "__GOSOK__",
]

def scan(path: str) -> list:
    try:
        with open(path, "rb") as f:
            raw = f.read().decode("utf-8", errors="ignore")
    except OSError as e:
        return [f"읽기 실패: {e}"]
    return [tok for tok in FORBIDDEN if tok in raw]

def main() -> int:
    if len(sys.argv) < 2:
        print("사용: check_clean_build.py <placement-hub 디렉토리>")
        return 2
    hub = sys.argv[1]
    man_path = os.path.join(hub, "manifest.json")
    try:
        manifest = json.load(open(man_path, encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"✗ manifest.json 로드 실패: {e}")
        return 2

    failures = []
    checked = 0
    for t in manifest.get("tables", []):
        if t.get("audience") == "internal":
            print(f"· 건너뜀(내부용): {t.get('slug')}")
            continue
        fname = t.get("file")
        if not fname:
            continue
        p = os.path.join(hub, fname)
        if not os.path.isfile(p):
            print(f"· 파일 없음(검사 불가·경고): {fname}")
            continue
        hits = scan(p)
        checked += 1
        if hits:
            failures.append((fname, hits))
        else:
            print(f"✓ 청정: {fname}")

    slices_dir = os.path.join(hub, "slices")
    if os.path.isdir(slices_dir):
        for fn in sorted(os.listdir(slices_dir)):
            if not fn.endswith(".json"):
                continue
            p = os.path.join(slices_dir, fn)
            hits = scan(p)
            checked += 1
            if hits:
                failures.append((f"slices/{fn}", hits))
            else:
                print(f"✓ 청정: slices/{fn}")

    if failures:
        print("\n✗ 청정 빌드 실패 — 외부 공개본에서 고속 유래 마커 검출:")
        for fname, hits in failures:
            print(f"  - {fname}: {', '.join(hits)}")
        print("→ 해당 표를 audience:'internal' 로 옮기거나(V1·V2), V3 청정 재빌드로 교체해야 반출 가능.")
        return 1
    print(f"\n✓ 청정 빌드 통과 — 외부 공개 대상 {checked}건 모두 마커 0건.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
