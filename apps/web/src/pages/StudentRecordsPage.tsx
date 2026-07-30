import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Spinner, EmptyState, ErrorText } from '../components/ui';

/**
 * 내 상담 기록 — 모바일 `RecordsScreen` 파리티(O195).
 *
 * **'상담 리포트'와 다른 것이다.** 리포트(`/media/reports`)는 녹음 동의 상담의 **검수된 산출물**이고,
 * 여기(`/me/notes`)는 선생님이 남긴 노트 중 **공개로 표시한 부분**이다(핵심요약·숙제·향후방향).
 * 두 이름이 헷갈리기 쉬워 O190 에서 용어를 정리했고, 이 화면은 그 정리된 이름을 쓴다.
 *
 * 웹에 `/me/notes` 호출부가 **0곳**이라 O186 감사에서 '반대 방향 결손'으로 잡혔다 —
 * 학생이 폰에서는 지난 상담을 되짚을 수 있는데 웹에서는 없었다.
 */

type Note = {
  bookingId: string;
  teacherId: string;
  consultType: string | null;
  coreSummary: string | null;
  homework: string | null;
  futureDir: string | null;
  createdAt: string;
};
type Teacher = { id: string; name: string };

const KST = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' });

export function StudentRecordsPage() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Note[]>('/me/notes')
      .then((r) => setNotes(Array.isArray(r) ? r : []))
      .catch((e) => { setError(e instanceof ApiError ? e.message : '조회 실패'); setNotes([]); });
    api.get<{ data?: Teacher[] } | Teacher[]>('/teachers')
      .then((r) => {
        const list = Array.isArray(r) ? r : (r.data ?? []);
        setNames(Object.fromEntries(list.map((t) => [t.id, t.name])));
      })
      .catch(() => { /* 이름은 부가 정보 — 없으면 유형만 보여준다 */ });
  }, []);

  return (
    <div>
      <PageHeader
        title="내 상담 기록"
        sub="선생님이 공개한 핵심 요약·숙제·향후 방향만 보여요. (내부 메모는 비공개, 완료된 상담만 열람)"
      />
      <ErrorText>{error}</ErrorText>

      {notes === null ? <Spinner /> : notes.length === 0 ? (
        <EmptyState>아직 공개된 상담 기록이 없어요.</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 0 }}>
          {notes.map((n) => (
            <div
              key={n.bookingId}
              style={{ borderLeft: '2px solid var(--line)', marginLeft: 6, paddingLeft: 18, paddingBottom: 18, position: 'relative' }}
            >
              <span style={{ position: 'absolute', left: -6, top: 4, width: 10, height: 10, borderRadius: 5, background: 'var(--brand)' }} />
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--caption)' }}>
                {KST(n.createdAt)} · {n.consultType ?? '상담'}
                {names[n.teacherId] ? ` · ${names[n.teacherId]} 선생님` : ''}
              </div>
              <Card style={{ marginTop: 6 }}>
                {n.coreSummary && <Section title="핵심 요약" body={n.coreSummary} />}
                {n.homework && <Section title="숙제" body={n.homework} />}
                {n.futureDir && <Section title="향후 방향" body={n.futureDir} />}
                {!n.coreSummary && !n.homework && !n.futureDir && (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>기록 내용이 없어요.</div>
                )}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand)', letterSpacing: '.03em' }}>{title}</div>
      <div style={{ fontSize: 13.5, color: 'var(--ink)', marginTop: 3, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{body}</div>
    </div>
  );
}
