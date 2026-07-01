-- 배치표 서비스 결과(성적→가능 대학·학과 라인)가 들어갈 자리. 성적표(회차)별 저장.
-- placement 예: {"tier":"중상위","line":"인서울 중위권","universities":["국민대","숭실대"],
--                "departments":["컴퓨터공학","경영"],"source":"batch|demo|manual","memo":"..."}
ALTER TABLE score_report ADD COLUMN IF NOT EXISTS placement jsonb;
