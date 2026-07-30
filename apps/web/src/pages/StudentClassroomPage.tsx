import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, Spinner, EmptyState, ErrorText } from '../components/ui';

/**
 * 학생 실시간 수업 — 모바일 `ClassroomScreen` 파리티(O197).
 *
 * O186 감사에서 마지막까지 남아 있던 결손이다. 선생님은 웹에서 수업을 열고(`/app/classes`)
 * 학생을 등록하는데, **등록된 학생이 웹에서 그 수업에 들어갈 문이 없었다** — 폰을 꺼내야만
 * 입장이 됐다. 판서를 보는 화면인데 큰 화면 쪽이 막혀 있던 셈이라, 방향이 거꾸로였다.
 *
 * 개설·시작/종료·명단은 여기 없다(서버가 `@Roles('teacher','admin','hr')` 로 막는다).
 * 확정 403은 호출 자체를 막는다 — 이 화면은 **목록과 입장**만 한다.
 *
 * 입장은 선생님 화면과 같은 방식이다: `POST /classes/:id/join` 으로 룸 토큰을 받고,
 * 음성(SFU)이 설정돼 있으면 `media-token` 을 덧붙여 `/room` 을 새 창으로 연다.
 * 학생 토큰은 서버에서 `subscriber` 로 발급되므로 `publish=0` 이다.
 */

type ClassRow = { id: string; title: string; status: string; roomId: string | null };
type JoinResp = { url: string; token: string; role: string; roomId: string };

type Chip = 'new' | 'confirmed' | 'done' | 'cancelled';
const STATUS: Record<string, { label: string; kind: Chip }> = {
  scheduled: { label: '예정', kind: 'new' },
  live: { label: '진행 중', kind: 'confirmed' },
  ended: { label: '종료', kind: 'done' },
  canceled: { label: '취소', kind: 'cancelled' },
};

export function StudentClassroomPage() {
  const [rows, setRows] = useState<ClassRow[] | null>(null);
  const [err, setErr] = useState('');
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<ClassRow[]>('/classes')
      .then((r) => { setRows(Array.isArray(r) ? r : []); setErr(''); })
      .catch((e) => { setErr(e instanceof ApiError ? e.message : '강의 목록을 불러오지 못했습니다.'); setRows([]); });
  }, []);
  useEffect(load, [load]);

  async function enter(row: ClassRow) {
    setErr(''); setJoining(row.id);
    try {
      const j = await api.post<JoinResp>(`/classes/${row.id}/join`, {});
      let media = '';
      try {
        const m = await api.get<{ provider: string; url: string | null; token: string | null }>(`/classes/${row.id}/media-token`);
        if (m.provider === 'livekit' && m.url && m.token) {
          media = `&mediaUrl=${encodeURIComponent(m.url)}&mediaToken=${encodeURIComponent(m.token)}&publish=0`;
        }
      } catch { /* 음성 미설정 — 판서만으로 들어간다 */ }
      window.open(
        `/room?url=${encodeURIComponent(j.url)}&token=${encodeURIComponent(j.token)}&kind=whiteboard&title=${encodeURIComponent(row.title)}${media}`,
        '_blank',
        'noopener',
      );
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '입장하지 못했습니다.');
    } finally { setJoining(null); }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader
        title="실시간 수업"
        sub="선생님이 등록한 온라인 강의입니다. 수업이 시작되면 입장해 판서를 함께 봅니다."
      />
      <ErrorText>{err}</ErrorText>

      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState>
          등록된 강의가 없어요. 선생님이 강의에 등록하면 여기에 표시됩니다.
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, kind: 'done' as const };
            // 시작 전·종료된 강의는 룸이 없거나 닫혀 있다 — 눌러도 실패할 버튼은 잠가 둔다.
            const canEnter = r.status === 'live' && !!r.roomId;
            return (
              <Card key={r.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{r.title}</div>
                    <div style={{ marginTop: 4 }}><Badge kind={st.kind}>{st.label}</Badge></div>
                  </div>
                  <Button
                    size="sm"
                    variant={canEnter ? 'primary' : 'ghost'}
                    disabled={!canEnter}
                    loading={joining === r.id}
                    onClick={() => enter(r)}
                  >
                    {r.status === 'live' ? '입장' : r.status === 'scheduled' ? '시작 전' : '종료됨'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
