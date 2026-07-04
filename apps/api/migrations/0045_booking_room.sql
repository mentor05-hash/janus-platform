-- 예약 ↔ 실시간 룸 매핑(룸 서비스 이관 브리지). 플래그(REALTIME_ROOMS_ENABLED) 시에만 사용.
-- 기존 realtime 동작에는 영향 없음(추가 테이블).
CREATE TABLE IF NOT EXISTS booking_room (
  booking_id             uuid PRIMARY KEY REFERENCES booking(id) ON DELETE CASCADE,
  room_id                uuid NOT NULL,
  student_participant_id uuid NOT NULL,
  teacher_participant_id uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);
