/* 자동 생성물 — 직접 수정 금지. 원본: src/events.json
 * 재생성: npm run gen:calendar   (검사: npm run gen:calendar -- --check)
 */
import type { ExamCalendar } from './index';

export const CALENDAR: ExamCalendar = {
  "schema": 1,
  "cycle": "2027학년도 (2026~27 입시)",
  "timezone": "Asia/Seoul",
  "verified_against": null,
  "verified_at": null,
  "events": [
    {
      "id": "edu-03",
      "kind": "edu_mock",
      "title": "3월 전국연합학력평가",
      "short": "3월 학평",
      "start": "2026-03-26",
      "end": null,
      "status": "provisional",
      "source": "관례(3월 말 목요일) — 시도교육청 공고 미확인"
    },
    {
      "id": "kice-06",
      "kind": "kice_mock",
      "title": "6월 모의평가",
      "short": "6월 모평",
      "start": "2026-06-04",
      "end": null,
      "status": "provisional",
      "source": "관례(6월 첫째 주 목요일) — 평가원 공고 미확인"
    },
    {
      "id": "kice-09",
      "kind": "kice_mock",
      "title": "9월 모의평가",
      "short": "9월 모평",
      "start": "2026-09-02",
      "end": null,
      "status": "provisional",
      "source": "관례(9월 첫째 주 수요일) — 평가원 공고 미확인"
    },
    {
      "id": "susi-apply",
      "kind": "apply",
      "title": "수시 원서접수",
      "short": "수시 원서",
      "start": "2026-09-08",
      "end": "2026-09-10",
      "status": "provisional",
      "source": "관례(9월 둘째 주 3일간) — 대교협 기본계획 미확인"
    },
    {
      "id": "edu-10",
      "kind": "edu_mock",
      "title": "10월 전국연합학력평가",
      "short": "10월 학평",
      "start": "2026-10-13",
      "end": null,
      "status": "provisional",
      "source": "관례(10월 중순) — 시도교육청 공고 미확인"
    },
    {
      "id": "suneung",
      "kind": "suneung",
      "title": "2027학년도 대학수학능력시험",
      "short": "수능",
      "start": "2026-11-19",
      "end": null,
      "status": "provisional",
      "source": "관례(11월 셋째 주 목요일) — 평가원 시행공고 미확인"
    },
    {
      "id": "suneung-result",
      "kind": "result",
      "title": "수능 성적통지",
      "short": "성적통지",
      "start": "2026-12-11",
      "end": null,
      "status": "provisional",
      "source": "관례(수능 +3주 금요일) — 평가원 공고 미확인"
    },
    {
      "id": "jeongsi-apply",
      "kind": "apply",
      "title": "정시 원서접수",
      "short": "정시 원서",
      "start": "2026-12-29",
      "end": "2026-12-31",
      "status": "provisional",
      "source": "관례(12월 말 3일간) — 대교협 기본계획 미확인"
    },
    {
      "id": "jeongsi-result",
      "kind": "result",
      "title": "정시 합격자 발표(가·나·다군 시한)",
      "short": "정시 발표",
      "start": "2027-02-05",
      "end": null,
      "status": "provisional",
      "source": "관례(2월 초 발표 시한) — 대교협 기본계획 미확인"
    }
  ]
};
