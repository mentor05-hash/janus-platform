-- =====================================================================
-- 학부모 계획 트랙(O106) — 학부모가 **자기 공간에서** 자녀 계획을 세우고 관리한다.
-- 학생 계획(student_task)과 **별도 트랙**이며, 학부모가 '제안'하면 학생 인박스로 전달돼
-- 학생이 수락/거절한다(학생 자율성 보존 + 학부모 관리 욕구 충족).
--
-- ⚠ 제안은 **수락될 때까지 student_task 행이 되지 않는다.** 이유: ⑤-2 의 자동 재동기화 루프가
--   category='gap' AND created_by='auto' AND status='todo' 를 현재 목표와 맞추며 삭제/갱신하고,
--   dismissed 는 '사용자 의사' 톰스톤으로 보존한다. 제안을 미리 task 로 만들면 이 로직과 얽힌다.
--   수락 시에만 student_task(created_by='guardian') 를 만들고 student_task_id 로 연결한다.
--
-- 연령 권한(O105 정합): 미성년=보호자 전권(제안 자유) / 성인=학생 공유 동의가 있을 때만 제안 가능.
--   (자기 트랙 항목 생성·관리 자체는 학생 데이터가 아니므로 승인된 연결만 있으면 허용)
-- =====================================================================
CREATE TABLE IF NOT EXISTS guardian_plan_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id     uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  title           text NOT NULL,
  subject         text,
  due_date        date,
  note            text,
  -- draft(내 트랙만) → proposed(학생에게 전달) → accepted(학생 수락·task 생성) | declined(학생 거절)
  status          text NOT NULL DEFAULT 'draft',
  student_task_id uuid REFERENCES student_task(id) ON DELETE SET NULL,
  proposed_at     timestamptz,
  responded_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE guardian_plan_item DROP CONSTRAINT IF EXISTS guardian_plan_item_status_chk;
ALTER TABLE guardian_plan_item ADD CONSTRAINT guardian_plan_item_status_chk
  CHECK (status IN ('draft', 'proposed', 'accepted', 'declined'));

CREATE INDEX IF NOT EXISTS idx_guardian_plan_item_guardian ON guardian_plan_item(guardian_id, student_id, status);
-- 학생 인박스 조회용(대기 중인 제안).
CREATE INDEX IF NOT EXISTS idx_guardian_plan_item_student ON guardian_plan_item(student_id, status, proposed_at DESC);
