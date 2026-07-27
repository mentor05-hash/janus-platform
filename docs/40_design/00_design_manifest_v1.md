# 00 · 디자인 반입 매니페스트 v1 (색인 + 큐레이션)

> **상태: 판정 합의 대기 (STEP 1).** 이 표는 *색인*입니다 — 아직 어떤 파일도 이동하지 않았습니다.
> 기준 문서: `janus_screen_catalog_design_brief_v1`(§2 코드 카탈로그·§7 수령절차), `janus_ui_redesign_brief`(§6 제약), 디자인통합 지시서 절충 원칙 ②(**번들 직접 이식 금지**).
> 절차: **(1) 이 표 → 판정 합의 → (2) 합의된 `confirmed`만 토큰·스펙 시트로 반입.**

---

## ✅ §2 정본 반영 (2026-07-08 합의)

정본: `docs/40_design/janus_screen_catalog_design_brief_v1_2026-07-08.md`.
코드 실측 규모: **웹 64라우트 · 모바일 ~47화면 (≈111)** — 이전 "100+"는 이 값으로 정정.

### 역할 코드 A~F (§2 정본)
| 코드 | 역할(대상) | §2 요지 |
|---|---|---|
| **A** | 공개 | 관문 홈(랜딩)【개편·P0-2】 / 서비스 허브+상세7종【리스킨】 / 로그인·가입·비번【리스킨, 역할선택 강요 금지】 / 컨설팅 신청폼 / 약관·개인정보 / 무료 배치표【개편·독립트랙】 |
| **B** | 학생(웹13+모바일7탭) | 나의 관문 대시보드【신규·P1】 / 선생님 검색·프로필【개편】 / 예약【리스킨】 / Q&A【개편·P0-3】 / 커뮤니티 / 성적 추이【리스킨, 격차리포트 진입점】 / 격차 리포트【신규·P0-4】 / 멤버십·크레딧 / 세션3종(채팅·화이트보드·화상) / 자료실·알림·자동배정·수준진단【신규】 |
| **C** | 학부모(모바일5탭) | 홈(주간 통합 리포트 카드 W8)·상담·멤버십·결제·충전. 웹=학생 프레임 2변형 |
| **D** | 선생님(웹16+모바일5탭) | 인박스【P2】 / 답변 큐(Q&A)【개편】 / 오늘·스케줄 / 대시보드【P2】 / 평가·급여·프로필·기록·자료실·역제안·강의실 |
| **E** | 관리자·HR(웹23) | 일괄 리스킨(AdminLayout 공통 셸) + 신규2: 전환 퍼널 통계(`/admin/analytics`) · SSO 서비스 레지스트리(epoch 회전 경고 모달) |
| **F** | 리그·게시판(W7~8 신규) | 3부 공개 게시판·리그 배지·승급 알림·2부 크레딧 질문·미답변 필터 |

> 매니페스트 census의 역할 코드는 UI 그룹핑용(진단/Q&A/처방 등)이며, 위 §2 A~F(대상·트랙 기준)와 병기 참조. 상충 시 §2 정본 우선.

### §1 공통 컴포넌트 계약 (P0 스펙시트가 코드 필드 1:1로 반드시 따를 것)
- **GatewayCard** `{title, description, service, href, ctaLabel}` — **관문홈·격차리포트·학부모리포트 3곳 공용**
- 출처 배지 `source: 'llm' | 'rules'` · 성적연동 배지 · 신뢰도 `relTier: A | B | C`
- AI 답변 라벨 3종 `ai / ai_assisted / human`
- 티어게이트 `free < member < paid < consultant`
- 상담방식 아이콘 5종 · 신호등 4구간 · CTA `data-janus-cta`
- → P0 중 **home·gap_report가 GatewayCard 공용** — 스펙시트에 필드 표 필수.

### 역할 코드
| 코드 | 역할 | 라우트 |
|---|---|---|
| **X** | 파운데이션·문서(라우트 아님) | 토큰·스펙 원천 |
| **Z** | 정책·약관 | `/policy/*` |

### 대상 위치 규칙
- **40_design 반입** = `confirmed`만. 단, **무거운 번들 HTML은 넣지 않음** → 스펙 시트(.md) + 경량 썸네일 PNG로 대체.
- **40_workbench 잔류** = `experimental`/`backlog`/보류 → 무거운 원본 HTML은 여기 유지, 매니페스트가 경로 링크.
- **drop** = 순수 중복/파생 export.
- **O44 트랙 소유** = 무료 배치표(배치표 독립 트랙) → 본 반입 **제외**, A절 계약만.

---

## census 표 (전수 118종)

범례 · 판정: ✅confirmed · 🧪experimental · ♻️duplicate · 📥backlog · 위치: 반입 / 잔류 / drop / 제외

### X · 파운데이션 · 문서
| 화면 | 코드 매핑(역할·라우트) | 판정 | 대상 위치 | 비고 |
|---|---|---|---|---|
| janus_design_system_v1 | X · 토큰 원천 | ✅ **P0** | 반입(토큰 소스) | 단일 토큰 원천 → tokens.json/.css 추출 |
| 야누스 브랜드 가이드 | X · 브랜드 규범 | ✅ | 반입(토큰 소스) | 로고·팔레트·잉크·AI 라벨 → tokens |
| janus_empty_states_v1 | X · 상태 부속 | ✅ | 반입(스펙 부속) | 빈 상태 세트 |
| janus_system_states_v1 | X · 상태 부속 | ✅ | 반입(스펙 부속) | 로딩·오류·오프라인·점검 |
| janus_flow_v1 | X · 문서 | ✅(문서) | 잔류 | 여정 지도, 매니페스트에서 링크 |
| janus_packs_v1 | X · 문서 | 🧪 | 잔류 | 팩 레지스트리 다이어그램 |
| janus_p1_components_v1 | X · 컴포넌트 데모 | ♻️→design_system | 잔류 | design_system과 중복 |
| janus_catalog_v1 | X · 내부 도구 | ✅(도구) | 잔류 | 색인 도구 자체(반입 대상 아님) |

### A · 진입 · 마케팅 · 인증
| 화면 | 코드 매핑 | 판정 | 대상 위치 | 비고 |
|---|---|---|---|---|
| janus_home_v1 | A · `/` | ✅ **P0** | 반입 | 관문 홈 **정본** |
| janus_home_v2 | A · `/` | ♻️→home_v1 | drop | **판정: 대시보드 아님.** home_v1과 동일 관문홈(브라우저 크롬+스펙 변형). §2-B 나의 관문 대시보드는 janus_dashboard_v1 |
| janus_web_v1 | A · `/landing` | 🧪 | 잔류 | 데스크톱 랜딩 후보 |
| 야누스 랜딩 시안 | A · 히어로 옵션 보드 | 🧪(출처) | 잔류 | **[DEC] 2안 출처** — 2a스카이·2b옐로우·2c여명라인·2d딥포탈. home 스펙시트가 2c/2d 인용 |
| 야누스 랜딩 시안 (번들용) | A · export | ♻️ | drop | 번들 파생본(원칙 ②) |
| 야누스 랜딩 시안.html | A · export | ♻️ | drop | 컴파일 산출물 |
| janus_login_v1 | A · `/login` | ✅ | 반입 | 3초 가입·게스트 우회 |
| janus_signup_v1 | A · `/signup` | ✅ | 반입 | 계정 생성·약관 |
| janus_push_permission_v1 | A/E · `/permission` | ✅ | 반입 | 알림 허용 시트 |
| janus_walkthrough_v1 | A · `/onboarding/tour` | 🧪 | 잔류 | 첫 사용 오버레이 |
| janus_tutorial_v1 | A · `/onboarding/tour` | ♻️→walkthrough | 잔류 | walkthrough와 중복 |
| janus_group_join_v1 | A · `/join` | 🧪 | 잔류 | 초대코드 합류 |
| janus_onboarding_v1 | A/B · `/onboarding` | 📥 **backlog · 근시일(W6 전)** | 잔류 | "성적 없이 예시로 둘러보기" — 소프트런칭 전 소형 태스크 |

### B · 진단 · 리포트
| 화면 | 코드 매핑 | 판정 | 대상 위치 | 비고 |
|---|---|---|---|---|
| 야누스 배치표 | B · `/placement` | — | **제외(O44)** | 배치표 독립 트랙 소유, A절 계약만 |
| janus_gap_report_v1 | B · `/report/gap` | ✅ **P0** | 반입 | 격차 리포트 **정본** |
| janus_grade_trend_v1 | B · `/report/trend` | ✅ | 반입 | 3개년 추이 차트 |
| janus_mock_exam_v1 | B · `/report/mock` | ✅ | 반입 | 회차별 분석 |
| janus_ocr_input_v1 | B · `/grade/ocr` | ✅ | 반입 | ✦AI 성적 인식 |
| janus_weekly_report_v1 | B · `/report/weekly` | ✅ | 반입 | 주간 요약 |
| janus_parent_report_v1 | B/E · `/report/parent` | ✅ | 반입 | 학부모 리포트(17px) |
| janus_univ_detail_v1 | B/D · `/univ/:id` | ✅ | 반입 | 학과·전형·컷 |
| janus_portfolio_v1 | B · `/portfolio` | 📥 **backlog** | 잔류 | 신규기능(스텝4) |

### C · Q&A · AI 답변 · 검수
| 화면 | 코드 매핑 | 판정 | 대상 위치 | 비고 |
|---|---|---|---|---|
| janus_qna_flow_v1 | C · `/qna/ask` | ✅ **P0** | 반입 | 질문 플로우 **정본** |
| janus_qna_inbox_v1 | C · `/qna` | ✅ | 반입 | 질문함 |
| janus_direct_question_v1 | C · `/qna/direct` | ✅ | 반입 | 지목 질문 |
| janus_answer_credit_v1 | C/E · `/qna/credit` | ✅ | 반입 | 재답변·크레딧 |
| janus_answer_queue_v1 | C/F · `/answer/queue` | ✅ | 반입 | SLA 큐(공급자) |
| janus_answer_editor_v1 | C/F · `/answer/edit` | ✅ | 반입 | ✦✎ AI 초안 보완 |
| janus_review_console_v1 | C/F · `/review` | ✅ | 반입 | AI 초안 검수 |
| janus_ai_tutor_chat_v1 | C · `/ai-tutor` | 🧪 | 잔류 | AI 대화 도우미 |
| janus_review_notes_v1 | C/F · `/review/notes` | 🧪 | 잔류 | 반려 사유 |
| janus_reviewer_stats_v1 | C/F · `/review/stats` | 🧪 | 잔류 | 검수 통계 |
| janus_moderation_v1 | C/F · `/moderation` | 🧪 | 잔류 | 신고 처리 |

### D · 처방 · 상담 · 과외 · 강의
| 화면 | 코드 매핑 | 판정 | 대상 위치 | 비고 |
|---|---|---|---|---|
| janus_teachers_v1 | D · `/teachers` | ✅ | 반입 | 선생님 둘러보기 |
| janus_teacher_profile_v1 | D · `/teachers/:id` | ✅ | 반입 | 프로필 |
| janus_teacher_profile_edit_v1 | D/F · `/teachers/:id/edit` | ✅ | 반입 | 공급자 프로필 편집 |
| janus_teacher_reviews_v1 | D · `/teachers/:id/reviews` | ✅ | 반입 | 후기 |
| janus_automatch_v1 | D · `/match` | ✅ | 반입 | 자동 매칭 |
| janus_booking_v1 | D · `/booking` | ✅ | 반입 | 상담 예약 |
| janus_session_intake_v1 | D · `/session/intake` | ✅ | 반입 | 사전 문진 |
| janus_tutoring_room_v1 | D · `/room` | ✅ | 반입 | 과외방 **정본**(채팅+보드) |
| janus_session_embed_v1 | D · `/room/embed` | ✅ | 반입 | 채팅/보드/화상 단독 URL |
| janus_video_call_v1 | D · `/room/call` | ✅ | 반입 | 화상 상담 |
| janus_session_summary_v1 | D/C · `/session/summary` | ✅ | 반입 | ✦요약→✓확인 |
| janus_session_review_v1 | D · `/session/review` | ✅ | 반입 | 상담 후기 |
| janus_courses_v1 | D · `/courses` | ✅ | 반입 | VOD 목록 |
| janus_pack_detail_v1 | D · `/courses/:id` | ✅ | 반입 | 강좌 상세 |
| janus_vod_player_v1 | D · `/vod/:id` | ✅ | 반입 | 플레이어 |
| janus_timeslot_v1 | D · `/booking/slot` | ♻️→booking | 잔류 | booking 하위와 중복 |
| janus_classroom_v1 | D · `/room` | ♻️→tutoring_room | 잔류 | room 정본과 중복 |
| janus_study_room_v1 | D · `/room/study` | 🧪 | 잔류 | 집중 학습 변형 |

### E · 나의 관문 · 결제 · 설정 · 알림 · 일정
| 화면 | 코드 매핑 | 판정 | 대상 위치 | 비고 |
|---|---|---|---|---|
| janus_dashboard_v1 | E · `/dashboard` | ✅ | 반입 | 역할 적응형 3단 |
| janus_app_v1 | E · `/app` | ✅ | 반입 | 모바일 앱 셸 |
| janus_notifications_v1 | E · `/notifications` | ✅ | 반입 | 알림 센터 |
| janus_notice_v1 | E · `/notice` | ✅ | 반입 | 공지 |
| janus_search_results_v1 | E · `/search` | ✅ | 반입 | 통합 검색 |
| janus_goal_settings_v1 | E · `/goals` | ✅ | 반입 | 목표 설정 |
| janus_family_link_v1 | E · `/family` | ✅ | 반입 | 가족 연결 |
| janus_help_center_v1 | E · `/help` | ✅ | 반입 | 도움말 |
| janus_settings_v1 | E · `/settings` | ✅ | 반입 | 설정 |
| janus_calendar_v1 | E · `/calendar` | ✅ | 반입 | 개인 일정 |
| janus_planner_v1 | E · `/planner` | ✅ | 반입 | 플래너 |
| janus_admission_calendar_v1 | E/B · `/calendar/admission` | ✅ | 반입 | 입시 캘린더 |
| janus_exam_dday_v1 | E · `/dday` | ✅ | 반입 | 시험 D-day |
| janus_calendar_month_v1 | E · `/calendar` | ♻️→calendar | 잔류 | 월 뷰 변형, 중복 |
| janus_community_v1 | E · `/community` | 🧪 | 잔류 | 커뮤니티 |
| janus_referral_v1 | E · `/referral` | 🧪 | 잔류 | 친구 추천 |
| janus_parent_mobile_v1 | C · 학부모 모바일 5탭 | ✅ | 반입 | **§2-C 실화면 매핑 확정** — 역방향 갭 해소, 색인 등재 |

### E · 결제 · 구독
| 화면 | 코드 매핑 | 판정 | 대상 위치 | 비고 |
|---|---|---|---|---|
| janus_payment_v1 | E · `/payment` | ✅ | 반입 | 단건·팩 결제 |
| janus_membership_v1 | E · `/membership` | ✅ | 반입 | 티어 3단 |
| janus_payment_history_v1 | E · `/payment/history` | ✅ | 반입 | 거래 이력 |
| janus_payment_fail_v1 | E · `/payment/fail` | ✅ | 반입 | 실패·재시도 |
| janus_credit_ledger_v1 | E · `/credit` | ✅ | 반입 | 크레딧 원장 |
| janus_coupon_v1 | E · `/coupon` | ✅ | 반입 | 쿠폰 |
| janus_refund_request_v1 | E · `/refund` | ✅ | 반입 | 환불 요청 |
| janus_refund_done_v1 | E · `/refund/done` | ✅ | 반입 | 환불 완료 |
| janus_subscription_resume_v1 | E · `/subscription/resume` | 🧪 | 잔류 | 구독 재개 |
| janus_pause_manage_v1 | E · `/subscription/pause` | 🧪 | 잔류 | 일시정지 관리 |
| janus_waitlist_alert_v1 | E · `/waitlist` | 🧪 | 잔류 | 대기 알림 |

### D · 버티컬 팩 (신규 버티컬)
| 화면 | 코드 매핑 | 판정 | 대상 위치 | 비고 |
|---|---|---|---|---|
| janus_mental_v1 | D-vert · `/v/mental` | 🧪 | 잔류 | 멘탈 코칭 허브 |
| janus_mental_challenge_v1 | D-vert · `/v/mental/challenge` | 🧪 | 잔류 | 마음 챌린지 |
| janus_career_v1 | D-vert · `/v/career` | 🧪 | 잔류 | 커리어 |
| janus_habits_v1 | D-vert · `/v/habits` | 🧪 | 잔류 | 습관 |
| janus_sleep_v1 | D-vert · `/v/sleep` | 🧪 | 잔류 | 수면 |
| janus_fitness_v1 | D-vert · `/v/fitness` | 🧪 | 잔류 | 체력 |

### F · 공급자 · 운영 · B2B · 어드민
| 화면 | 코드 매핑 | 판정 | 대상 위치 | 비고 |
|---|---|---|---|---|
| janus_teacher_home_v1 | F · `/teacher` | ✅ | 반입 | 선생님 홈 |
| janus_teacher_onboarding_v1 | F · `/teacher/onboarding` | ✅ | 반입 | 공급자 가입 |
| janus_teacher_schedule_v1 | F · `/teacher/schedule` | ✅ | 반입 | 스케줄 |
| janus_teacher_students_v1 | F · `/teacher/students` | ✅ | 반입 | 담당 학생 |
| janus_teacher_worktime_v1 | F · `/teacher/worktime` | ✅ | 반입 | 근무 시간 |
| janus_teacher_earnings_v1 | F · `/teacher/earnings` | ✅ | 반입 | 정산 |
| janus_vacancy_manage_v1 | F · `/ops/vacancy` | 🧪 | 잔류 | 공석 관리 |
| janus_reassign_alert_v1 | F · `/ops/reassign` | 🧪 | 잔류 | 재배정 알림 |
| janus_center_ops_v1 | F · `/ops/center` | 🧪 | 잔류 | 센터 운영 |
| janus_data_console_v1 | F · `/ops/data` | 🧪 | 잔류 | 데이터 콘솔 |
| janus_b2b_console_v1 | F · `/b2b/console` | 🧪 | 잔류 | 기관 관리 |
| janus_b2b_v1 | F · `/b2b` | 🧪 | 잔류 | B2B 랜딩 |
| janus_admin_cms_v1 | F · `/admin/cms` | 🧪 | 잔류 | 어드민 CMS |
| janus_admin_users_v1 | F · `/admin/users` | 🧪 | 잔류 | 계정·권한 |
| janus_notification_templates_v1 | F · `/admin/templates` | 🧪 | 잔류 | 알림 템플릿 |
| janus_consultant_console_v1 | F · `/consultant` | 📥 **backlog** | 잔류 | 신규기능(스텝4) |
| janus_usertest_plan_v1 | F · 내부도구 | 🧪(내부) | 잔류 | 유저테스트 계획 |
| janus_usertest_record_v1 | F · 내부도구 | 🧪(내부) | 잔류 | 유저테스트 기록 |

### Z · 정책 · 약관 · 계정
| 화면 | 코드 매핑 | 판정 | 대상 위치 | 비고 |
|---|---|---|---|---|
| janus_policy_ai_v1 | Z · `/policy/ai` | ✅ | 반입 | AI 투명성 |
| janus_policy_lesson_v1 | Z · `/policy/lesson` | ✅ | 반입 | 수업 약관 |
| janus_policy_privacy_v1 | Z · `/policy/privacy` | ✅ | 반입 | 개인정보 |
| janus_policy_refund_v1 | Z · `/policy/refund` | ✅ | 반입 | 환불 규정 |
| janus_policy_terms_v1 | Z · `/policy/terms` | ✅ | 반입 | 이용약관 |
| janus_policy_youth_v1 | Z · `/policy/youth` | ✅ | 반입 | 청소년 보호 |
| janus_terms_policy_v1 | Z · `/policy` | ♻️→policy_terms | 잔류 | 약관 허브, 중복 |
| janus_delete_account_v1 | E/Z · `/account/delete` | ✅ | 반입 | 탈퇴·삭제 |

---

## ♻️ 중복(같은 화면 여러 버전) — 합의 필요
| 정본(확정) | 중복/변형 | 처리(확정) |
|---|---|---|
| **home_v1** (관문홈 /, P0-2) | janus_home_v2 | v2 = 동일 화면 변형 → **drop** (대시보드 아님) |
| **야누스 랜딩 시안** (히어로 2안 보드 · 잔류) | 〃(번들용) · 〃.html | 파생 2개 **drop**(원칙②) |
| **janus_walkthrough_v1** | janus_tutorial_v1 | walkthrough 정본, tutorial 잔류 |
| **janus_tutoring_room_v1** (세션 채팅+보드) | janus_classroom_v1 · janus_study_room_v1 | 정본 + session_embed(3종 단독) + video_call(화상). 나머지 잔류 |
| **janus_booking_v1** (`/booking`) | janus_timeslot_v1 | booking 정본, timeslot 하위 흡수 |
| **janus_calendar_v1** (`/calendar`) | janus_calendar_month_v1 | calendar 정본, month 뷰 흡수 |
| **janus_policy_terms_v1** (`/policy/terms`) | janus_terms_policy_v1 | policy_terms 정본, 허브 잔류 |
| **janus_design_system_v1** | janus_p1_components_v1 | design_system 정본, 컴포넌트 데모 흡수 |

> 회신 (2): 위 6쌍(walkthrough·room·booking·calendar·policy·design_system) 정본 확정. home·랜딩 2쌍은 결정 1에서 해소.

## ⚠ 누락 후보(코드엔 있을 수 있으나 목업 없음) — §2 원문 대조 필요
- **배치맵**(placement map, 신규기능) — §2에 없음 → **백로그 확정**
- **janus_parent_mobile_v1** — §2-C 학부모 모바일 5탭이 코드에 실재 → **confirmed 등재**, 색인 반영

---

## 반입 웨이브 (STEP 3)
- **Wave A (P0, 우선):** design_system · home_v1 · qna_flow · gap_report → 스펙 시트 4장 먼저
- **Wave B:** 진단·Q&A 나머지 confirmed (report·answer 계열) — 완료
- **Wave C:** 처방·상담·과외·강의 D 계열 — 완료 (WC-1~15)
- **Wave D:** E(결제·설정·일정)·Z(정책) 계열 — 완료 (WD-1~29)
- `confirmed`는 전부 매니페스트 등재, 스펙 시트는 웨이브 순차.

## 경량 반입 3종 (STEP 2 — 합의 후)
1. `00_design_manifest_v1.md` (본 문서)
2. `janus_design_tokens_v1.json` + `.css` — 단일 토큰 원천(색·타이포·여백·라운드·BP) + 로고 아치문 SVG 라이트/다크 → `packages/brand/logo/`
3. 확정 화면별 **스펙 시트(.md) + 썸네일 PNG(경량)** — 타이포·BP·`data-janus-cta` id·배지 3종·AI 라벨 3종 위치. (3MB 번들 대신 이걸로 코드 트랙 구현)

## 화면별 self-check 7종 (스펙 시트마다)
① 375px 가독 · ② AI 라벨 3종(✦초안/✦✎보완/✓답변) 구별 · ③ 배지 3종 · ④ CTA id 주석(`data-janus-cta`) · ⑤ "잇올" grep 0 · ⑥ 영문 파일명 · ⑦ 다크모드

---

## STEP 2 반입 구조표 (커밋 대기 — 조건 3가드 반영)

```
docs/40_design/
├─ 00_design_manifest_v1.md                      ✅ (본 문서)
├─ janus_screen_catalog_design_brief_v1_2026-07-08.md   ← §2 정본(코드 트랙 제공, 링크)
├─ tokens/
│  ├─ janus_design_tokens_v1.json                단일 토큰 원천
│  └─ janus_design_tokens_v1.css                 동일 값 CSS 변수
└─ specs/                                         P0 4장 — 전부 [draft] 딱지
   ├─ P0-1_design_system_v1.md      + thumb/P0-1.png
   ├─ P0-2_home_v1.md               + thumb/P0-2_deepportal.png · P0-2_dawnline.png  ← 2안 병기
   ├─ P0-3_qna_flow_v1.md           + thumb/P0-3.png   ← 0051 Q1 계약 인용
   └─ P0-4_gap_report_v1.md         + thumb/P0-4.png   ← GatewayCard §1 필드표

# ⚠ 로고는 STEP 2 범위상 docs/40_design/brand/ 에 둠 (packages/brand/ wiring은 P0 확정 후 코드 트랙 STEP 1)
docs/40_design/brand/
   ├─ janus_arch_light.svg
   └─ janus_arch_dark.svg
```

### 가드 반영
- **가드①** P0 4장 상단에 `> [draft] 토큰·정본 확정 시 개정` 딱지 고정.
- **가드②** `P0-3_qna_flow`에 **0051 Q1 계약** 인용 섹션: `scope 3종` · `rating 1~5` · `keepTeacher` · 재답변 한도 `qa.reanswerLimit`(기본 3) · 알림 `qna_answered`/`qna_accepted` → §1 컴포넌트 계약과 대조표.
- **가드③** `P0-2_home`은 히어로 **2안 병기**(딥 네이비 포탈=랜딩 시안 2d / 여명 라인=2c). **단일 확정 금지**, [DEC] 태그.
- **§1 계약**: P0-2·P0-4에 GatewayCard `{title,description,service,href,ctaLabel}` 필드표 + `source`/`relTier`/AI라벨 3종/티어게이트/상담아이콘 5종/신호등 4구간/`data-janus-cta` 매핑 필수.
- **로고 경로(합의 수정)**: STEP 2 커밋 대상은 전부 `docs/40_design/` 안으로 닫음. 로고도 `docs/40_design/brand/`(디자인 아티팩트). `packages/brand/`로의 배치·wiring은 §7.3(확정 전 코드 반영 금지)에 따라 **P0 확정 후 코드 트랙 STEP 1**에서 수행.

### 반입 웨이브 (STEP 3)
- **Wave A (P0):** design_system · home_v1 · qna_flow · gap_report (STEP 2 완료)
- **Wave B:** 진단·Q&A 나머지 confirmed(report·answer 계열) — **완료** (specs/WB-1~12 + thumb, 전부 [draft])
  - 진단: WB-1 grade_trend · WB-2 mock_exam · WB-3 ocr_input · WB-4 weekly_report · WB-5 parent_report · WB-6 univ_detail
  - Q&A: WB-7 qna_inbox · WB-8 direct_question · WB-9 answer_credit · WB-10 answer_queue · WB-11 answer_editor · WB-12 review_console
- **Wave C:** 처방·상담·과외·강의 D 계열 — **완료** (specs/WC-1~15 + thumb, 전부 [draft])
  - 처방/매칭: WC-1 teachers · WC-2 teacher_profile · WC-3 teacher_reviews · WC-4 automatch · WC-5 teacher_profile_edit
  - 상담/세션: WC-6 booking · WC-7 session_intake · WC-8 tutoring_room · WC-9 session_embed · WC-10 video_call · WC-11 session_summary · WC-12 session_review
  - 강의: WC-13 courses · WC-14 pack_detail · WC-15 vod_player
- **Wave D:** E(가문·결제·설정·일정)·Z(정책) 계열 — **완료** (specs/WD-1~29 + thumb, 전부 [draft])
  - 관문/셀: WD-1 dashboard · WD-2 app · WD-3 parent_mobile
  - 알림/공지/검색/도움말: WD-4 notifications · WD-5 notice · WD-6 search_results · WD-7 help_center
  - 설정/목표/가족: WD-8 settings · WD-9 goal_settings · WD-10 family_link
  - 일정: WD-11 calendar · WD-12 planner · WD-13 admission_calendar · WD-14 exam_dday
  - 결제/구독: WD-15 payment · WD-16 membership · WD-17 payment_history · WD-18 payment_fail · WD-19 credit_ledger · WD-20 coupon · WD-21 refund_request · WD-22 refund_done
  - 정책 Z: WD-23 policy_ai · WD-24 policy_lesson · WD-25 policy_privacy · WD-26 policy_refund · WD-27 policy_terms · WD-28 policy_youth · WD-29 delete_account
  - **누락분 반입 (2026-07-08, 감사 후):** WD-30 signup · WD-31 push_permission · WD-32 empty_states · WD-33 system_states · WD-34 teacher_onboarding · WD-35 teacher_schedule · WD-36 teacher_students · WD-37 teacher_worktime · WD-38 teacher_earnings
  - (login·teacher_home은 목업 코드 트랙 소유 — 중복 반입 안 함)

## 하지 말 것 (재확인)
- 무거운 번들 HTML을 40_design에 넣지 않기(100×3MB 비대화) — 원본은 40_workbench 잔류·링크만
- 무료 배치표 = O44 독립 트랙 소유(본 반입 제외)
- 신규 기능(포트폴리오·배치맵·온보딩·컨설턴트 콘솔) = backlog
- **회원 이상 데이터 임베드 HTML repo 금지** — 썸네일도 비식별 처리
- 코드 반영은 확정 후 스텝 1부터

---

## 완성분 동기화 4건 (2026-07-08 · 감사 회신)

confirmed 73종 중 60 반입 완료 → **누락 9종 추가 반입 + 동기화 3건** 처리. 코드 트랙 요청 대응.

### [1] 누락 스펙 9종 (+썸네일) — WD-30~38 반입 완료
- 인증: WD-30 signup · WD-31 push_permission
- 상태 부속: WD-32 empty_states · WD-33 system_states
- 공급자: WD-34 teacher_onboarding · WD-35 teacher_schedule · WD-36 teacher_students · WD-37 teacher_worktime · WD-38 teacher_earnings
- → **스펙시트 총 69종**(P0 4 + WB 12 + WC 15 + WD 38). login·teacher_home은 코드 트랙 소유라 중복 반입 안 함.

### [2] 목업 원본 전량 동기화 — 완료
- 전체 목업 소스 **116 .dc.html + support.js + doc-page.js**를 `40_workbench/mockups/`로 복사(경량 소스, 번들 아님). `40_workbench/mockups/README.md`에 실행법·규칙 명시.
- 스펙 "원본 목업" 링크 경로 = `40_workbench/mockups/janus_X_v1.dc.html`로 해소.

### [3] 토큰 실값 확정 — [draft] 해제 완료
- `tokens/janus_design_tokens_v1.json`·`.css` status = **confirmed (v1)**. 개정 시 v2.
- **신호등 4구간**: 안정 #2a8a5f · 적정 #57a86a · 소신 #cf9f2f · 상향 #d06b52 (차분한 채도).
- **AI 라벨 3색**: ✦ ai 라이트 #6d5dd3 / 다크 #9a8be8 · ✦✎ ai_assisted #1f8a8a · ✓ human #2f6fb3.
- 주의: 토큰값은 확정이나, **개별 스펙시트 [draft] 딱지는 §정본(홈 히어로 [DEC]) 확정 시 일괄 해제** — P0-2가 2안 병기라 그때까지 유지.

### [4] [DEC] 관문 홈 히어로 방향 — 확정 절차 제안
- 현재 **2안 병기**(딥 포탈 2d / 여명 라인 2c) 유지 중, 단일 확정 금지 상태.
- **확정 시점 제안: 소프트런칭(W6) 직전 P0 확정 게이트.** 사유: 히어로는 홈(P0-2) 정본 잠금의 마지막 변수이고, 토큰([3])은 이미 확정돼 나머지 P0는 준비됨.
- **확정 방법 제안**: (a) 두 안 실측 시안을 375/1180 양 폭으로 나란히 → 헤드라인 대비(WCAG AA)·브랜드 적합성 2축 평가, (b) 필요 시 사용자테스트 T10(가입 플로우)에 히어로 A/B 1문항 추가. → 코드 트랙에서 게이트 일정만 주면 그에 맞춰 최종 시안 1안으로 좁혀 [draft] 일괄 해제.
- **미확정 시 리스크**: home·landing 스펙 [draft] 잔존 → 코드 구현이 2안 분기 유지 비용. 그래서 W6 전 단일 확정 권장.
