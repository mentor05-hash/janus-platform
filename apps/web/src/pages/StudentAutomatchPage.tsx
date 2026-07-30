import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner } from '../components/ui';

/**
 * 30분 자동 매칭 — 모바일 `AutomatchScreen` 파리티(O195).
 *
 * **왜 웹에 없었나**: 이 기능은 모바일에만 있었다. `/match/auto` 호출부가 웹에 **0곳**이라
 * O186 감사에서 '반대 방향 결손'으로 잡혔다 — 같은 제품의 두 화면 중 하나만 있는 상태는
 * 어느 쪽이 정답인지 아무도 모르게 만든다.
 *
 * 계약은 모바일과 같다: `POST /match/auto` 로 **후보를 찾고**(예약은 아직 아니다),
 * 사용자가 확인하면 `POST /bookings` 로 **실제 예약**한다. 두 단계인 이유 —
 * 자동 매칭은 시간을 대신 골라 주는 것이라, 확인 없이 잡으면 "내가 안 잡은 예약"이 생긴다.
 */

type Result = {
  matched: boolean;
  teacherId: string;
  date: string;
  slotStart: number;
  slotEnd: number;
  minutes: number;
  mode: string;
  consultType: string;
  subType: string | null;
};
type Teacher = { id: string; name: string };
type Slot = { index: number; time: string; status: string };

const CTYPES = ['담임', '교과', '입시', '심리'];
const SUBJECTS = ['국어', '수학', '영어', '탐구'];
const MODES: [string, string][] = [['online', '온라인'], ['offline', '오프라인'], ['any', '상관없음']];
const KST = (d: string) =>
  new Date(`${d}T00:00:00+09:00`).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' });

export function StudentAutomatchPage() {
  const nav = useNavigate();
  const [consultType, setConsultType] = useState('교과');
  const [subject, setSubject] = useState('수학');
  const [mode, setMode] = useState('any');
  const [phase, setPhase] = useState<'form' | 'loading' | 'result'>('form');
  const [res, setRes] = useState<Result | null>(null);
  const [teacherName, setTeacherName] = useState('선생님');
  const [startTime, setStartTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const subType = consultType === '교과' ? subject : undefined;

  async function go() {
    setPhase('loading'); setError('');
    try {
      const r = await api.post<Result>('/match/auto', { consultType, subType, mode });
      setRes(r);
      // 이름·시작 시각은 표시용 — 실패해도 결과 카드는 뜬다(매칭 자체는 이미 성공했다).
      api.get<{ data?: Teacher[] } | Teacher[]>('/teachers')
        .then((t) => {
          const list = Array.isArray(t) ? t : (t.data ?? []);
          setTeacherName(list.find((x) => x.id === r.teacherId)?.name ?? '선생님');
        })
        .catch(() => { /* 무시 */ });
      api.get<Slot[]>(`/teachers/${r.teacherId}/slots?date=${r.date}`)
        .then((slots) => setStartTime(slots.find((s) => s.index === r.slotStart)?.time ?? ''))
        .catch(() => { /* 무시 */ });
      setPhase('result');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.status === 409
            ? '7일 내 이용 가능한 자리를 찾지 못했어요. 조건을 바꿔보세요.'
            : e.message
          : '매칭 실패',
      );
      setPhase('form');
    }
  }

  async function confirm() {
    if (!res) return;
    setBusy(true); setError('');
    try {
      await api.post('/bookings', {
        teacherId: res.teacherId,
        date: res.date,
        consultType: res.consultType,
        subType: res.subType ?? undefined,
        mode: res.mode,
        slotStart: res.slotStart,
        slotEnd: res.slotEnd,
        content: '자동 매칭으로 신청한 30분 상담입니다.',
      });
      nav('/student/bookings');
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 402 ? '크레딧이 부족합니다.' : e.message) : '예약 실패');
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) => ({
    padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
    border: `1.5px solid ${on ? 'var(--brand)' : 'var(--line)'}`,
    background: on ? 'var(--j-blue-soft, #eef4fb)' : 'var(--surface)',
    color: on ? 'var(--brand)' : 'var(--ink)',
  });

  return (
    <div>
      <PageHeader title="30분 자동 매칭 ⚡" sub="유형·방식만 고르면 7일 내 가장 빠른 30분을 찾아드려요." />
      <ErrorText>{error}</ErrorText>

      {phase === 'loading' && (
        <Card>
          <div style={{ textAlign: 'center', padding: '28px 0' }}>
            <Spinner />
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 12 }}>적당한 시간을 찾는 중…</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              {consultType}{subType ? ` · ${subType}` : ''} · {MODES.find((m) => m[0] === mode)?.[1]}
            </div>
          </div>
        </Card>
      )}

      {phase === 'result' && res && (
        <>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--chip-done, #2A8A5F)' }}>✓ 자리를 찾았어요</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 12px' }}>7일 내 가장 빠른 30분</div>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{KST(res.date)} {startTime}</span>
              <Badge kind="new">{res.mode === 'offline' ? '오프라인' : '줌'}</Badge>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 8 }}>
              {teacherName} 선생님 · {res.consultType}{res.subType ? ` · ${res.subType}` : ''} · {res.minutes}분
            </div>
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--j-ghost-bg, #f4f7fb)', fontSize: 12.5, color: 'var(--muted)' }}>
              ⚡ 앞뒤 10분 상담정리 버퍼까지 확보된 시간이에요.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <Button onClick={confirm} loading={busy}>이 시간으로 예약</Button>
              <Button variant="ghost" onClick={() => { setPhase('form'); setRes(null); setError(''); }}>다른 조건으로 다시</Button>
            </div>
          </Card>
        </>
      )}

      {phase === 'form' && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>상담 유형</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {CTYPES.map((t) => (
              <button key={t} type="button" style={chip(consultType === t)} onClick={() => setConsultType(t)}>{t}</button>
            ))}
          </div>

          {consultType === '교과' && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>과목</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {SUBJECTS.map((sub) => (
                  <button key={sub} type="button" style={chip(subject === sub)} onClick={() => setSubject(sub)}>{sub}</button>
                ))}
              </div>
            </>
          )}

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>진행 방식</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {MODES.map(([k, label]) => (
              <button key={k} type="button" style={chip(mode === k)} onClick={() => setMode(k)}>{label}</button>
            ))}
          </div>

          <Button onClick={go}>⚡ 가장 빠른 30분 찾기</Button>
          <div style={{ fontSize: 12, color: 'var(--caption)', marginTop: 10 }}>
            찾은 시간은 **확인 후에만** 예약됩니다. 시간을 직접 고르고 싶다면 <b>선생님 찾기</b>를 쓰세요.
          </div>
        </Card>
      )}
    </div>
  );
}
