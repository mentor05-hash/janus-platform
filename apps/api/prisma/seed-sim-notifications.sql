-- =====================================================================
-- 앱알림 발송 시드 — 각 대상(역할)별 앱알림 10건. 정식 발송과 동일 형태:
--   type='announcement', channels={app}, payload={title,body,from} → 목록에서 renderNotification 렌더.
--   전 역할(student/teacher/guardian/admin/hr) 승인 계정에 10건씩. read_at NULL(미읽음).
--   payload.seed='sim-notif' 마커로 멱등(재실행 시 교체).
-- =====================================================================
DO $do$
DECLARE
  titles TEXT[] := ARRAY[
    '[점검] 시스템 정기 점검 안내','[업데이트] 새 기능이 추가되었어요','[리마인더] 이번 주 상담 일정 확인',
    '[안내] 크레딧 운영 정책 변경','[요청] 만족도 조사에 참여해 주세요','[이벤트] 여름 상담 프로모션',
    '[보안] 앱 보안 업데이트 권장','[팁] 상담 예약을 더 편리하게','[공지] 운영시간 변경 안내','[공유] 이번 달 운영 리포트'];
  bodies TEXT[] := ARRAY[
    '더 안정적인 서비스를 위해 정기 점검을 진행합니다. 이용에 참고해 주세요.',
    '자주 쓰는 기능을 개선했어요. 앱에서 확인해 보세요.',
    '예정된 상담 일정을 다시 한번 확인해 주세요.',
    '크레딧 부여·소멸 관련 정책이 일부 조정되었습니다.',
    '서비스 개선을 위해 짧은 설문에 참여해 주세요.',
    '기간 한정 상담 혜택을 준비했어요. 놓치지 마세요.',
    '계정 보호를 위해 최신 버전으로 업데이트해 주세요.',
    '원하는 시간대를 더 빠르게 찾는 방법을 안내드려요.',
    '다음 주부터 운영시간이 일부 변경됩니다.',
    '이번 달 활동 요약을 공유드립니다.'];
  cnt INT;
BEGIN
  DELETE FROM notification WHERE payload->>'seed'='sim-notif';

  INSERT INTO notification(recipient_id, type, channels, payload, delivery, attempts, last_attempt_at, created_at)
  SELECT a.id, 'announcement', ARRAY['app'],
         jsonb_build_object('title', titles[n], 'body', bodies[n], 'from','본사 공지', 'seed','sim-notif'),
         '{"app":"sent"}'::jsonb, 1, now(), now() - (n || ' minutes')::interval
  FROM account a CROSS JOIN generate_series(1,10) AS n
  WHERE a.status='approved'
    AND a.role IN ('student','teacher','guardian','admin','hr');

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '발송 알림 건수: %', cnt;
END $do$;

SELECT a.role, count(*) AS notif_10x, count(DISTINCT n.recipient_id) AS recipients
FROM notification n JOIN account a ON a.id=n.recipient_id
WHERE n.payload->>'seed'='sim-notif'
GROUP BY a.role ORDER BY a.role;
