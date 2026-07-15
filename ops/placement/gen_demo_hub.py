#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
합성 데모 허브 생성기 — 저작권 데이터 없이 배치표 허브를 실동작(available:true)시키기 위한
**합성(가짜) 데이터**를 JANUS_DATA_DIR/placement-hub/ 에 생성한다.

원칙(C6): 실제 배치표/컷은 repo·이 스크립트 어디에도 없다. 전부 합성값이며 각 산출물에
"⚠ 데모(합성) 데이터" 배너를 박아 실데이터와 혼동을 막는다. 실데이터가 도착하면 같은 파일명으로
덮어쓰면 되고(이 스크립트는 DEMO 마커가 없는 파일=실데이터로 간주해 절대 덮어쓰지 않음).

사용:
  python3 ops/placement/gen_demo_hub.py [DATA_DIR]
    DATA_DIR 기본값 = $JANUS_DATA_DIR 또는 ~/janus/20_data
  --force 로 실파일까지 강제 재생성(주의).
"""
import json
import os
import sys

DEMO_MARK = "JANUS-DEMO-SYNTHETIC"  # 이 문자열이 파일에 있으면 '합성'으로 간주(덮어쓰기 안전)

BANDS = [
    ("안정", "#1f9d55", "떨어질 이유를 찾기 어려운 구간"),
    ("적정", "#2563eb", "가장 합리적인 주력 카드"),
    ("소신", "#d97706", "붙으면 이득, 계산된 도전"),
    ("상향", "#dc2626", "판을 흔드는 한 장"),
]
DEMO_UNIVS = [
    ("한빛대", "산업공학", 88), ("가온대", "소프트웨어", 86), ("나래대", "데이터과학", 85),
    ("아름대", "인공지능", 82), ("다솜대", "컴퓨터공학", 80), ("벼리대", "전자공학", 74),
    ("슬기대", "정보보안", 72), ("여울대", "산업디자인", 63),
]


def synthetic_html(title: str, kind: str) -> str:
    rows = "".join(
        f'<tr><td>{u}</td><td>{d}</td><td style="text-align:right">{s}</td>'
        f'<td><span style="color:{BANDS[i % 4][1]};font-weight:700">{BANDS[i % 4][0]}</span></td></tr>'
        for i, (u, d, s) in enumerate(DEMO_UNIVS)
    )
    col = "백분위(누백)" if kind in ("jeongsi", "gap") else "환산컷"
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="{DEMO_MARK}" content="1">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} (데모)</title>
<style>
 body{{font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;margin:0;background:#f6f7f9;color:#1f2430}}
 .wrap{{max-width:760px;margin:0 auto;padding:24px 18px}}
 .banner{{background:#fff7ed;border:1px solid #fdba74;color:#9a3412;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:16px}}
 h1{{font-size:20px;margin:6px 0 2px}} .sub{{color:#6b7280;font-size:13px;margin-bottom:18px}}
 table{{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}}
 th,td{{padding:10px 12px;font-size:14px;border-bottom:1px solid #eef1f4;text-align:left}}
 th{{background:#f0f3f7;color:#374151;font-weight:600}}
 tr:last-child td{{border-bottom:none}}
</style></head><body><div class="wrap">
<div class="banner">⚠ <b>데모(합성) 데이터</b> — 실제 배치표가 아닙니다. 저작권 원천 데이터 확보 시 같은 파일로 교체됩니다({DEMO_MARK}).</div>
<h1>{title}</h1><div class="sub">합성 예시 · 대학명·점수 모두 가상값</div>
<table><thead><tr><th>대학(가상)</th><th>학과</th><th style="text-align:right">{col}</th><th>구간</th></tr></thead>
<tbody>{rows}</tbody></table>
</div></body></html>"""


def synthetic_targets() -> dict:
    jeongsi = [
        {"univ": u, "dept": d, "track": "가", "mode": "jeongsi", "cutNb": s}
        for (u, d, s) in DEMO_UNIVS
    ]
    susi = [
        {"univ": u, "dept": d, "mode": "susi", "cutGrade": g}
        for (u, d), g in zip(
            [("한빛대", "산업공학"), ("가온대", "소프트웨어"), ("나래대", "데이터과학"),
             ("아름대", "인공지능"), ("다솜대", "컴퓨터공학"), ("벼리대", "전자공학")],
            [1.3, 1.7, 2.0, 2.3, 2.6, 3.1],
        )
    ]
    return {"_demo": DEMO_MARK, "targets": jeongsi + susi}


def is_demo_or_missing(path: str) -> bool:
    if not os.path.exists(path):
        return True
    try:
        with open(path, encoding="utf-8") as f:
            return DEMO_MARK in f.read(4096)
    except Exception:
        return False


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv[1:]
    data_dir = (args[0] if args else None) or os.environ.get("JANUS_DATA_DIR") \
        or os.path.expanduser("~/janus/20_data")
    hub = os.path.join(data_dir, "placement-hub")
    if not os.path.isdir(hub):
        print(f"✗ placement-hub 폴더 없음: {hub}\n  (20_data 위치 확인 또는 mkdir -p 후 재실행)")
        return 1

    man_path = os.path.join(hub, "manifest.json")
    try:
        manifest = json.load(open(man_path, encoding="utf-8"))
        tables = manifest.get("tables", [])
        # 시안 리스킨: 지원 포트폴리오(◫) 탭이 없으면 데모 항목 추가(실데이터=엔진 HTML로 교체).
        if not any((t.get("kind") == "portfolio") for t in tables):
            tables.append({"slug": "portfolio", "title": "지원 포트폴리오(데모)", "short": "지원 포트폴리오",
                           "icon": "◫", "kind": "portfolio", "tier": "paid", "file": "portfolio-demo.html"})
            manifest["tables"] = tables
            json.dump(manifest, open(man_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
            print("  · manifest에 데모 포트폴리오 탭 추가")
    except Exception:
        print(f"· manifest.json 없음/파손 — 데모 manifest 생성: {man_path}")
        tables = [
            {"slug": "gap-report", "title": "야누스 격차 리포트 v2", "short": "격차 리포트",
             "icon": "◱", "kind": "gap", "tier": "free", "file": "gap-report-v2.html"},
            {"slug": "jeongsi-demo", "title": "정시 정밀배치표(데모)", "short": "정밀배치표",
             "icon": "▦", "kind": "jeongsi", "tier": "member", "file": "jeongsi-demo.html"},
        ]
        json.dump({"tables": tables}, open(man_path, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)

    wrote = []
    skipped = []
    for t in tables:
        fname = t.get("file")
        if not fname:
            continue
        fpath = os.path.join(hub, fname)
        if not force and not is_demo_or_missing(fpath):
            skipped.append(fname + " (실파일 보존)")
            continue
        html = synthetic_html(t.get("title", fname), t.get("kind", "gap"))
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(html)
        wrote.append(fname)

    tpath = os.path.join(hub, "targets.json")
    if force or is_demo_or_missing(tpath):
        json.dump(synthetic_targets(), open(tpath, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        wrote.append("targets.json")
    else:
        skipped.append("targets.json (실파일 보존)")

    print(f"✓ 합성 허브 생성: {hub}")
    print(f"  생성/갱신 {len(wrote)}개: {', '.join(wrote) or '(없음)'}")
    if skipped:
        print(f"  보존/건너뜀: {', '.join(skipped)}")
    print("  → api 재기동 후: curl -s localhost:3000/api/v1/placement-hub/list")
    return 0


if __name__ == "__main__":
    sys.exit(main())
