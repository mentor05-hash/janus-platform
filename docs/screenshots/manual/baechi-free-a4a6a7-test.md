야누스 무료 티어 빌드 — A4·A6·A7 검증 로그
실행: 2026-08-07 22:51 KST · 브랜치 claude/connection-status-check-tm8we0 · 1706a6d
마스터: ops/placement/fixtures/master_sample.html (합성 픽스처 — 저작권 데이터 없음)

════════ 1) 무료판 빌드 (커밋 설정 그대로) ════════
티어 빌드: ops/placement/fixtures/master_sample.html → /Users/mentor05daum.net/janus/10_platform/janus-platform/dist-tier
  [free      ] /Users/mentor05daum.net/janus/10_platform/janus-platform/dist-tier/free/master_sample.html  (영역 제거 2 · 페이로드 제거 2 · 10.2KB)
             A4 build-id 9e1fed0a845c · A6 허용호스트 1개 · A7 일정 9건·잠정 9
완료. 무료판 배포 전 반드시: python3 ops/placement/tier_verify.py /Users/mentor05daum.net/janus/10_platform/janus-platform/dist-tier/free

════════ 2) 티어 검증 (tier_verify.py) ════════
· 검증: dist-tier/free/master_sample.html
  ✅ 부재 확인: "cut70"
  ✅ 부재 확인: "cut50"
  ✅ 부재 확인: "70%컷 1.2"
  ✅ 부재 확인: "회원 전용"
  ✅ 부재 확인: "유료 전용"
  ✅ 부재 확인: "컨설턴트 전용"
  ✅ 부재 확인: "고속_어디가"
  ✅ 부재 확인: "esteacher"
  ✅ 부재 확인: "adiga_정시"
  ✅ 부재 확인: "_INTERNAL"
  ✅ 부재 확인: "보정_calib"
  ✅ 필수 표식 존재: "data-janus-watermark"
  ✅ 필수 표식 존재: "__JANUS_TIER"
  ✅ 필수 표식 존재: "[야누스 A4]"
  ✅ 필수 표식 존재: "[야누스 A6]"
  ✅ 필수 표식 존재: "[야누스 A7]"

결과: ✅ 통과 — 공개 배포 가능(저작권·상위티어 부재)
exit=0

════════ 3) A6 미러 감지 시뮬 (비허용 호스트) ════════
A6 미러 감지 시뮬 테스트
  허용 호스트(ENV 주입): janus.example, www.janus.example
  원본(ENV 주입): https://janus.example

  ✅ 허용 목록이 평문으로 남지 않음(해시만 주입)

[허용 호스트]
  ✅ janus.example → 통과 — 안내 false · 이동 null
  ✅ www.janus.example → 통과 — 안내 false · 이동 null
  ✅ JANUS.EXAMPLE → 통과 — 안내 false · 이동 null

[비허용 호스트 — 미러 시뮬]
  ✅ janus-mirror.example → 안내 + 원본 이동 — 이동=https://janus.example · 경고="[janus/mirror] 비허용 호스트: janus-mirror.example -> https://janus.example"
       카운트다운: 5초 후 원본으로 이동합니다. / 4초 후 원본으로 이동합니다. / 3초 후 원본으로 이동합니다. / 2초 후 원본으로 이동합니다. / 1초 후 원본으로 이동합니다. / 0초 후 원본으로 이동합니다.
  ✅ baechi.cheap-clone.io → 안내 + 원본 이동 — 이동=https://janus.example · 경고="[janus/mirror] 비허용 호스트: baechi.cheap-clone.io -> https://janus.example"
       카운트다운: 5초 후 원본으로 이동합니다. / 4초 후 원본으로 이동합니다. / 3초 후 원본으로 이동합니다. / 2초 후 원본으로 이동합니다. / 1초 후 원본으로 이동합니다. / 0초 후 원본으로 이동합니다.
  ✅ evil.pages.dev → 안내 + 원본 이동 — 이동=https://janus.example · 경고="[janus/mirror] 비허용 호스트: evil.pages.dev -> https://janus.example"
       카운트다운: 5초 후 원본으로 이동합니다. / 4초 후 원본으로 이동합니다. / 3초 후 원본으로 이동합니다. / 2초 후 원본으로 이동합니다. / 1초 후 원본으로 이동합니다. / 0초 후 원본으로 이동합니다.
  ✅ 127.0.0.1 → 안내 + 원본 이동 — 이동=https://janus.example · 경고="[janus/mirror] 비허용 호스트: 127.0.0.1 -> https://janus.example"
       카운트다운: 5초 후 원본으로 이동합니다. / 4초 후 원본으로 이동합니다. / 3초 후 원본으로 이동합니다. / 2초 후 원본으로 이동합니다. / 1초 후 원본으로 이동합니다. / 0초 후 원본으로 이동합니다.

[판정 불가 — 통과시켜야 하는 경우]
  ✅ 빈 hostname(file:// 등) → 무반응

[원본 주소 미설정 — 도메인 미결 상태]
  ✅ 원본 미설정 빌드엔 평문 호스트가 하나도 없음
  ✅ 비허용 호스트 → 안내만, 리다이렉트 없음 — 경고="[janus/mirror] 비허용 호스트: janus-mirror.example -> (원본 주소 미설정 — 안내만)"

[허용 목록 미설정 — 무해 no-op]
  ✅ 어떤 호스트에서도 무반응

[djb2 해시 파이썬 ↔ JS 일치]
  ✅ 5개 호스트 해시 일치 — py=1521265952,2835156889,1417155086,3210828456,3160810023 js=1521265952,2835156889,1417155086,3210828456,3160810023

결과: ✅ 전체 통과
exit=0

════════ 4) A4 배포 감지 + 오류 링버퍼 시뮬 ════════
A4 배포 감지 프로브 + 오류 링버퍼 시뮬 테스트
  빌드 build-id: 9e1fed0a845c · 사이드카: janus-build.json

[build-id 주입]
  ✅ meta[name=janus-build-id] 가 사이드카와 같은 값 — 9e1fed0a845c

[배포 감지]
  ✅ 같은 build-id → 배너 없음
  ✅ 다른 build-id → 배너 생성
  ✅ 배너 문구에 "새 버전이 있습니다"
  ✅ 새로고침 버튼 존재
  ✅ 콘솔에 감지 로그 — [janus/build] 새 배포 감지: 9e1fed0a845c -> newbuild9999
  ✅ auto_reload_sec=0 → 자동 리로드 없음(버튼으로만)
  ✅ 새로고침 버튼 클릭 → location.reload()
  ✅ 배너는 한 번만(중복 생성 없음) — 1개

[오류 링버퍼]
  ✅ 전송 훅 기본값은 스텁(null · 미전송)
  ✅ 링버퍼 상한 30 유지 — 30건(38건 투입)
  ✅ 오래된 것부터 폐기(가장 오래된 = flood 5) — flood 5
  ✅ 가장 최근 = flood 34 — flood 34
  ✅ 전송 훅에는 38건 모두 전달(버퍼와 별개) — 38건
  ✅ 세 종류 모두 수집(error·rejection·resource) — error,rejection,resource
  ✅ 자산 로드 실패는 src 기록
  ✅ 스택은 500자로 절단
  ✅ __janusErrors() 는 복사본 반환(외부 변조 불가)

결과: ✅ 전체 통과
exit=0
