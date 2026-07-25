-- =====================================================================
-- 목표 후보 — 기준 목표 1개(student_profile.goal_*) 외에 비교용 후보 N개(학생 본인만 조회).
-- 학생이 직접 등록한 후보만 저장한다. 시스템 자동 제안은 별건(실배치표 컷 데이터·정시 cut 의미 확정 선행).
-- cut 단위는 mode 에 따름: jeongsi=전국누백(%), susi=내신 평균등급. gap-report 도메인과 동일 규약(C5/C6).
-- cut 은 배치표 데이터 조회값 또는 학생 수동 입력만 — 플랫폼이 컷·지원선을 산출하지 않는다(O65). cut_source 로 감사.
-- 용어 주의: '플랜'(학습 플랜·planner·student_task.category='plan' D1·subscription_plan)과
--   '포트폴리오/조합'(N28 미결·착수금지, /portfolio 예약)은 쓰지 않는다 → '후보(candidate)'.
-- 범위 제약: 후보별 밴드 나열까지만. 조합 추천·종합 합격확률은 N28 안건이라 여기서 하지 않는다.
-- =====================================================================
CREATE TABLE IF NOT EXISTS student_goal_candidate (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL,
  mode        text NOT NULL,                 -- jeongsi | susi
  univ        text NOT NULL,
  dept        text NOT NULL,
  track       text,                          -- 정시 군(가/나/다) 등 — 선택
  cut         numeric(6,2) NOT NULL,         -- 목표 컷(모드 단위). 배치표 데이터/수동 입력값을 그대로 보관(O65 — 플랫폼은 환산하지 않음)
  cut_source  text NOT NULL DEFAULT 'manual', -- targets_file | manual — 컷 출처 감사(O65 경계 추적)
  note        text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 이미 테이블이 만들어진 환경(CREATE IF NOT EXISTS 로 스킵되는 경우)에도 컬럼이 보장되도록 별도 ALTER.
ALTER TABLE student_goal_candidate ADD COLUMN IF NOT EXISTS cut_source text NOT NULL DEFAULT 'manual';

ALTER TABLE student_goal_candidate DROP CONSTRAINT IF EXISTS student_goal_candidate_mode_chk;
ALTER TABLE student_goal_candidate ADD CONSTRAINT student_goal_candidate_mode_chk
  CHECK (mode IN ('jeongsi', 'susi'));

ALTER TABLE student_goal_candidate DROP CONSTRAINT IF EXISTS student_goal_candidate_cut_source_chk;
ALTER TABLE student_goal_candidate ADD CONSTRAINT student_goal_candidate_cut_source_chk
  CHECK (cut_source IN ('targets_file', 'manual'));

-- 같은 모드에서 동일 대학·학과 중복 등록 방지.
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_goal_candidate
  ON student_goal_candidate(student_id, mode, univ, dept);
CREATE INDEX IF NOT EXISTS idx_student_goal_candidate_student
  ON student_goal_candidate(student_id, mode);
