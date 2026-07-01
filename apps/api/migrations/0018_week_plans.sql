-- 주별 근무 계획(2주~2달 미리 설정). 없으면 recurring_template(기본) 적용.
--   [{ "weekStart": "YYYY-MM-DD(월요일)", "template": { "1":[{start,end}], ... } }]
ALTER TABLE work_schedule ADD COLUMN IF NOT EXISTS week_plans jsonb NOT NULL DEFAULT '[]';
