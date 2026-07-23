# 병합 대기 — `recovered-n33-pentagon` → `claude/connection-status-check-tm8we0`

> 2026-07-23 · 다른 세션의 미커밋 작업을 stash 복구해 브랜치로 보존(삭제 직전 회수).
> **다음 세션에서 집중 병합.** 서두르지 말 것 — 스키마 introspection 정리 + 마이그레이션 리넘버가 얽힘.

## 무엇인가
- 브랜치 `recovered-n33-pentagon` (커밋 `74fdf10`, 베이스 **534c09d** = B군 O98 이후).
- 다른 세션이 내 N33·생기부 가드 위에 이어 만든 **미커밋 작업 26파일·~1410줄**을 복구한 것.
- 주요 내용:
  - **N33 오각형 노출 게이트** — `qna-answer-rating.ts`에 `isPentagonVisible` 추가, `answererAxisStats`가 `visible` 반환.
  - **생기부 가드 확장(스텝2·3 일부)** — 관리자 콘솔·이의신청·정책 서비스·이벤트: `school-record-admin.controller/types/dto`, `school-record-appeal.controller/service`, `school-record-guard-policy.service`, `school-record-event.service`, `school-record-consulting-disabled.exception`.
  - **과목 정규화** — `qna-subject-canonical.ts`(+spec).
  - consulting·scores·storage 부수 변경.
  - 마이그레이션 `0090_school_record_guard_admin.sql` → 테이블 `school_record_block_event`, `school_record_appeal`.

## 병합 시 반드시 처리 (3건)
1. **마이그레이션 0090 충돌** — 통합 브랜치엔 이미 `0090_community_answer_edit.sql`(적용 완료)이 있음. 복구본의 `0090_school_record_guard_admin.sql`을 **`0091_`로 리넘버**(내 0090은 DB 원장에 이미 기록). 리넘버 후 `migrate:check`로 순번 정합 확인.
2. **schema.prisma 오염** — 복구본의 schema.prisma는 `prisma db pull`(introspection)로 **전체 재포맷**됨(정렬 공백 폭증). **정본(현 claude 브랜치) 유지** + 복구본이 추가한 **신규 모델만 이식**(school_record_block_event·school_record_appeal + isPentagonVisible 관련 없음). introspection bloat는 폐기.
3. **qna.service.ts 충돌** — 내 커뮤니티 답변 수정(`editCommunityAnswer`·중복 가드)과 복구본의 pentagon(`isPentagonVisible` import·`answererAxisStats` visible)을 **둘 다 보존**.

## 나머지 파일
- `qna-answer-rating.ts`·`qna-subject-stat.ts` 등은 **복구본만 수정**(내 938edb8은 미변경) → 클린 병합.
- 신규 가드/도메인 파일 24개는 충돌 없음.

## 병합 후 검증
- `migrate:check`(순번 정합) · api·web tsc 0 · 도메인 하니스(ts-node) · 가능하면 가드/pentagon 스펙.
- Decision-Register: 복구본도 편집했으니 병합 시 O/N 번호 중복 재확인(현 최신 O98·N34).

## 재발 방지
- 이 사고(같은 코드베이스를 여러 세션이 각기 다른 브랜치로 만짐)의 3번째 사례. **한 번에 한 브랜치**, 세션 시작 시 `git branch --show-current` 확인 습관화.
