# marketing/legacy — 구버전 정적 마케팅 (배포 대상 아님)

2026-07-06 생성분(`gen:marketing` 초판). **브랜드만 야누스로 갈아끼운 잇올 포지셔닝**이다 —
"입시의 모든 길을 잇다 / 멘토링을 중심으로"라는 서사에 연계 서비스(배치표·인강·모의고사·입결·자소서·플래너)가
대부분 *연동 예정 · 준비 중 · 파트너 모집* 상태로 나열돼 있다. 7/14 커밋(`5824d49`)이 잇올·itall 문자열은
지웠지만 **제품 서사는 그대로**였다.

정본은 **웹앱의 `/`·`/services`** 다 — 진단→처방→실행 7종(diagnosis·curriculum·qna·consulting·tutoring·
clinic·lecture). 디자인통합 감사가 이미 `/services*` 를 "잇올 연계서비스 → 야누스 서비스 체계"로 **rebuild**
판정했고(`docs/design-integration/00_감사_중복매트릭스.md`), 앱 쪽은 2026-07-13 **O48 로 rebuild 완료**했다.
이 정적 사이트만 그 rebuild 를 못 받고 남아 있었다.

`marketing/src/` 의 새 index.html·services.html 이 그 자리를 대신한다(2026-08-12).

## 왜 지우지 않고 남겼나

새 랜딩이 **아직 배포되지 않았다** — apex·www 개통은 보류 중이다(O182).
"패리티 통과 전 구버전 삭제 금지"(CLAUDE.md §6 절충 원칙 ③)에 따라 개통·확인 후에 지운다.

`gen:marketing` 은 `marketing/src/*.html` 만 읽으므로 이 폴더는 **빌드·배포에 포함되지 않는다**.
