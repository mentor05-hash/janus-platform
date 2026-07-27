-- P4(큐브 벤치마크): 답변 첨부 — 화이트보드 풀이 PNG 등을 답변에 첨부([{id,name,type}]).
ALTER TABLE qna_answer ADD COLUMN IF NOT EXISTS attachments jsonb;
