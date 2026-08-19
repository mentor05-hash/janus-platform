/* 자동 생성물 — 직접 수정 금지. 원본: src/events.json
 * 재생성: npm run gen:calendar   (검사: npm run gen:calendar -- --check)
 */
import type { ExamCalendar } from './index';

export const CALENDAR: ExamCalendar = {
  "schema": 1,
  "cycle": "2027학년도 (2026~27 입시)",
  "timezone": "Asia/Seoul",
  "verified_against": "교육부·한국교육과정평가원 「2027학년도 대학수학능력시험 시행기본계획」(2026-03-31 발표) + 한국대학교육협의회 「2027학년도 대학입학전형기본사항」 (전국연합학력평가 2건은 시도교육청 공고 원문 미대조 — provisional 유지)",
  "verified_at": "2026-08-19",
  "events": [
    {
      "id": "edu-03",
      "kind": "edu_mock",
      "title": "3월 전국연합학력평가",
      "short": "3월 학평",
      "start": "2026-03-24",
      "end": null,
      "status": "provisional",
      "source": "서울시교육청 주관 전국연합학력평가 — 교육청 공고 원문 미대조"
    },
    {
      "id": "kice-06",
      "kind": "kice_mock",
      "title": "6월 모의평가",
      "short": "6월 모평",
      "start": "2026-06-04",
      "end": null,
      "status": "confirmed",
      "source": "평가원 「2027학년도 수능 시행기본계획」(2026-03-31)"
    },
    {
      "id": "kice-09",
      "kind": "kice_mock",
      "title": "9월 모의평가",
      "short": "9월 모평",
      "start": "2026-09-02",
      "end": null,
      "status": "confirmed",
      "source": "평가원 「2027학년도 수능 시행기본계획」(2026-03-31)"
    },
    {
      "id": "susi-apply",
      "kind": "apply",
      "title": "수시 원서접수",
      "short": "수시 원서",
      "start": "2026-09-07",
      "end": "2026-09-11",
      "status": "confirmed",
      "source": "대교협 「2027학년도 대학입학전형기본사항」"
    },
    {
      "id": "edu-10",
      "kind": "edu_mock",
      "title": "10월 전국연합학력평가",
      "short": "10월 학평",
      "start": "2026-10-27",
      "end": null,
      "status": "provisional",
      "source": "서울시교육청 주관 전국연합학력평가 — 교육청 공고 원문 미대조"
    },
    {
      "id": "suneung",
      "kind": "suneung",
      "title": "2027학년도 대학수학능력시험",
      "short": "수능",
      "start": "2026-11-19",
      "end": null,
      "status": "confirmed",
      "source": "평가원 「2027학년도 수능 시행기본계획」(2026-03-31)"
    },
    {
      "id": "suneung-result",
      "kind": "result",
      "title": "수능 성적통지",
      "short": "성적통지",
      "start": "2026-12-11",
      "end": null,
      "status": "confirmed",
      "source": "평가원 「2027학년도 수능 시행기본계획」(2026-03-31)"
    },
    {
      "id": "jeongsi-apply",
      "kind": "apply",
      "title": "정시 원서접수",
      "short": "정시 원서",
      "start": "2027-01-04",
      "end": "2027-01-07",
      "status": "confirmed",
      "source": "대교협 「2027학년도 대학입학전형기본사항」"
    },
    {
      "id": "jeongsi-result",
      "kind": "result",
      "title": "정시 합격자 발표(가·나·다군 시한)",
      "short": "정시 발표",
      "start": "2027-02-05",
      "end": null,
      "status": "confirmed",
      "source": "대교협 「2027학년도 대학입학전형기본사항」"
    }
  ]
};
