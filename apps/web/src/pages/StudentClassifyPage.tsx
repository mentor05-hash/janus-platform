import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, Spinner, EmptyState, ErrorText } from '../components/ui';

/**
 * 선생님 분류(찜·비선호) — 모바일 `ClassifyScreen` 파리티(O195).
 *
 * **웹에도 `/me/teacher-lists` 를 쓰는 곳은 있었다** — '선생님 찾기'의 찜 토글이다.
 * 그런데 **담은 뒤 목록으로 보고 정리하는 화면**이 없었다: 찜은 넣을 수만 있고 뺄 수는
 * 검색 결과에서 그 선생님을 다시 찾아야만 가능했다. 넣는 곳만 있고 빼는 곳이 없으면
 * 목록은 시간이 지날수록 쓸모가 줄어든다.
 *
 * 위치는 **실행 › 상담 잡기**다(모바일도 같은 곳으로 옮겼다). '내정보'가 아닌 이유:
 * 이 목록은 계정 설정이 아니라 **다음 상담을 고를 때 꺼내 쓰는 재료**다.
 */

type Lists = { fit: string[]; unfit: string[] };
type Teacher = { id: string; name: string; subjects?: string[]; grade?: string };

export function StudentClassifyPage() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [teachers, setTeachers] = useState<Record<string, Teacher>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get<Lists>('/me/teacher-lists')
      .then((r) => setLists({ fit: r.fit ?? [], unfit: r.unfit ?? [] }))
      .catch((e) => { setError(e instanceof ApiError ? e.message : '조회 실패'); setLists({ fit: [], unfit: [] }); });
    api.get<{ data?: Teacher[] } | Teacher[]>('/teachers')
      .then((r) => {
        const list = Array.isArray(r) ? r : (r.data ?? []);
        setTeachers(Object.fromEntries(list.map((t) => [t.id, t])));
      })
      .catch(() => { /* 이름은 부가 정보 */ });
  }, []);
  useEffect(load, [load]);

  async function remove(teacherId: string) {
    setBusy(teacherId); setError('');
    try { await api.del(`/me/teacher-lists/${teacherId}`); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '제거 실패'); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <PageHeader
        title="선생님 분류"
        sub="나와 맞는 선생님과 맞지 않는 선생님을 정리해요. 상담을 고를 때 이 목록이 먼저 보입니다."
      />
      <ErrorText>{error}</ErrorText>

      {lists === null ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 18 }}>
          <Group
            title="💚 나와 맞는 선생님"
            hint="선생님 찾기에서 찜하면 여기 쌓여요."
            ids={lists.fit}
            teachers={teachers}
            busy={busy}
            onRemove={remove}
          />
          <Group
            title="🚫 맞지 않는 선생님"
            hint="추천·자동 매칭에서 우선순위가 내려가요."
            ids={lists.unfit}
            teachers={teachers}
            busy={busy}
            onRemove={remove}
          />
        </div>
      )}
    </div>
  );
}

function Group({
  title, hint, ids, teachers, busy, onRemove,
}: {
  title: string;
  hint: string;
  ids: string[];
  teachers: Record<string, Teacher>;
  busy: string | null;
  onRemove: (id: string) => void;
}) {
  return (
    <section>
      <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>{title} <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 400 }}>{ids.length}명</span></h3>
      <div style={{ fontSize: 12.5, color: 'var(--caption)', marginBottom: 8 }}>{hint}</div>
      {ids.length === 0 ? (
        <EmptyState>
          아직 없어요. <Link to="/student/search" style={{ color: 'var(--brand)' }}>선생님 찾기</Link>에서 담아보세요.
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {ids.map((id) => {
            const t = teachers[id];
            return (
              <Card key={id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      width: 36, height: 36, borderRadius: 999, background: 'var(--j-blue-soft, #eef4fb)',
                      color: 'var(--brand)', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {(t?.name ?? '선').slice(0, 1)}
                  </span>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{t?.name ?? '선생님'}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                      {t ? (
                        <>
                          <span>{t.subjects?.join('·') || '-'}</span>
                          {t.grade && <Badge kind="soft">{t.grade}급</Badge>}
                        </>
                      ) : '정보 없음'}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onRemove(id)} loading={busy === id}>제거</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
