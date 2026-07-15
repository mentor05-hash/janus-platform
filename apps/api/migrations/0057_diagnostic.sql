-- 수준진단 v1 — 문항 풀이 → 채점 → 유형별 약점 → 처방. 문제은행/시도/응답.
-- 실문항(kice-originals)은 로컬 파싱으로 후속 주입(C6). 아래 데모 문항은 합성(저작권 무관).

CREATE TABLE IF NOT EXISTS diagnostic_question (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     text NOT NULL,                 -- 국어·수학·영어…
  unit        text NOT NULL,                 -- 유형(독서·미적분·독해…)
  difficulty  text,                          -- 하·중·상
  stem        text NOT NULL,                 -- 문항
  choices     jsonb NOT NULL,                -- ["보기1","보기2",...]
  answer      smallint NOT NULL,             -- 정답 인덱스(0-base)
  explanation text,
  source      text NOT NULL DEFAULT 'demo',  -- demo(합성) | kice(후속)
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diag_q_subject ON diagnostic_question (subject, unit) WHERE active;

CREATE TABLE IF NOT EXISTS diagnostic_attempt (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL,
  subject      text,                         -- null=전과목
  total        integer NOT NULL DEFAULT 0,
  correct      integer NOT NULL DEFAULT 0,
  score        integer NOT NULL DEFAULT 0,   -- 정답률(%)
  started_at   timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_diag_attempt_student ON diagnostic_attempt (student_id, started_at DESC);

CREATE TABLE IF NOT EXISTS diagnostic_response (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  uuid NOT NULL REFERENCES diagnostic_attempt(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  chosen      smallint,
  is_correct  boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_diag_resp_attempt ON diagnostic_response (attempt_id);

-- ── 데모(합성) 문제은행 — 저작권 무관·실문항 후속 교체 ──────────────────────
INSERT INTO diagnostic_question (id, subject, unit, difficulty, stem, choices, answer, explanation, source) VALUES
 ('a0000000-0000-4000-8000-000000000001','국어','독서','중','다음 글의 중심 내용으로 가장 적절한 것은? (합성 예시)', '["정보의 나열","글쓴이의 주장과 근거","등장인물의 갈등","시간의 흐름"]', 1, '설명문의 핵심은 주장과 근거 파악.', 'demo'),
 ('a0000000-0000-4000-8000-000000000002','국어','문학','중','시에서 화자의 정서로 알맞은 것은? (합성 예시)', '["기쁨","그리움","분노","무관심"]', 1, '시어의 정서 파악 유형.', 'demo'),
 ('a0000000-0000-4000-8000-000000000003','국어','화법과작문','하','토론에서 반론의 요건으로 옳은 것은? (합성 예시)', '["상대 인신공격","근거 기반 반박","주제 회피","감정 호소"]', 1, '반론은 근거 기반이어야 함.', 'demo'),
 ('a0000000-0000-4000-8000-000000000011','수학','대수','중','2x+3=11 일 때 x 는? (합성 예시)', '["2","3","4","5"]', 2, '2x=8 → x=4.', 'demo'),
 ('a0000000-0000-4000-8000-000000000012','수학','미적분','상','f(x)=x^2 의 x=1 에서의 순간변화율은? (합성 예시)', '["1","2","3","4"]', 1, 'f''(x)=2x → f''(1)=2.', 'demo'),
 ('a0000000-0000-4000-8000-000000000013','수학','확률과통계','중','동전 2개를 던져 둘 다 앞면일 확률은? (합성 예시)', '["1/2","1/3","1/4","1/8"]', 2, '1/2×1/2=1/4.', 'demo'),
 ('a0000000-0000-4000-8000-000000000021','영어','독해','중','What is the main idea? (합성 예시)', '["A detail","The topic sentence''s point","An example","A quote"]', 1, '주제문 파악 유형.', 'demo'),
 ('a0000000-0000-4000-8000-000000000022','영어','어휘','하','Choose the closest meaning of "rapid". (합성 예시)', '["slow","fast","heavy","quiet"]', 1, 'rapid=fast.', 'demo')
ON CONFLICT (id) DO NOTHING;
