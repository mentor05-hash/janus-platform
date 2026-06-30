import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Center, RankingRow, WeightPolicy } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import {
  PageHeader,
  Button,
  Badge,
  Spinner,
  ErrorText,
  Meter,
  Table,
  Modal,
  ConfirmFooter,
  SelectField,
  TextField,
} from '../components/ui';
import type { Column } from '../components/ui';
import { SectionCard } from '../components/dashboard/widgets';

const WEIGHT_FIELDS: { key: keyof WeightPolicy; label: string; reverse?: boolean }[] = [
  { key: 'w_total', label: '누적 상담' },
  { key: 'w_completion', label: '완료율' },
  { key: 'w_rerequest', label: '재요청률' },
  { key: 'w_reject', label: '거부율', reverse: true },
  { key: 'w_noshow', label: '노쇼율', reverse: true },
  { key: 'w_response', label: '평균 응답', reverse: true },
  { key: 'w_satisfaction', label: '만족도' },
];
const PERIODS = [
  { value: 'all', label: '전체' },
  { value: '1w', label: '최근 1주' },
  { value: '2w', label: '최근 2주' },
  { value: '1m', label: '최근 1달' },
];

export function AdminEvaluationPage() {
  const { user } = useAuth();
  const hq = isHq(user);
  const isAdmin = user?.role === 'admin';
  const canEdit = user?.permLevel === 'L1' || user?.permLevel === 'L2'; // 본사급만 설정(가중치·원장)

  const [rows, setRows] = useState<RankingRow[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [period, setPeriod] = useState('all');
  const [director, setDirector] = useState('');
  const [centerId, setCenterId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [weights, setWeights] = useState<WeightPolicy | null>(null);
  const [showWeights, setShowWeights] = useState(false);

  // 모달: 직무/시수 편집 대상
  const [dirEdit, setDirEdit] = useState<RankingRow | null>(null);
  const [dirVal, setDirVal] = useState('');
  const [hourEdit, setHourEdit] = useState<RankingRow | null>(null);
  const [hourVal, setHourVal] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ period });
      if (director) qs.set('director', director);
      if (hq && centerId) qs.set('centerId', centerId);
      setRows(await api.get<RankingRow[]>(`/admin/evaluation/ranking?${qs}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [period, director, centerId, hq]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (hq) api.get<Center[]>('/centers').then(setCenters).catch(() => undefined);
  }, [hq]);

  const weightSum = useMemo(
    () => (weights ? WEIGHT_FIELDS.reduce((s, f) => s + Number(weights[f.key] || 0), 0) : 0),
    [weights],
  );

  async function openWeights() {
    if (!showWeights && !weights) {
      const q = hq && centerId ? `?centerId=${centerId}` : '';
      setWeights(await api.get<WeightPolicy>(`/admin/evaluation/weights${q}`));
    }
    setShowWeights((v) => !v);
  }

  async function saveWeights() {
    if (!weights || weightSum !== 100) return;
    try {
      const body: Record<string, unknown> = { centerId: hq && centerId ? centerId : null };
      WEIGHT_FIELDS.forEach((f) => (body[f.key] = Number(weights[f.key])));
      await api.put('/admin/evaluation/weights', body);
      setShowWeights(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  }

  function openDir(t: RankingRow) {
    setDirEdit(t);
    setDirVal(t.directorRole ?? '');
  }
  async function saveDir() {
    if (!dirEdit) return;
    try {
      await api.put(`/admin/teachers/${dirEdit.teacherId}/director`, {
        directorRole: dirVal || null,
      });
      setDirEdit(null);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '지정 실패');
    }
  }

  function openHour(t: RankingRow) {
    setHourEdit(t);
    setHourVal(String(t.hours ?? ''));
  }
  async function saveHour() {
    if (!hourEdit) return;
    const hours = Number(hourVal);
    if (!Number.isFinite(hours) || hours < 0) return;
    try {
      await api.put(`/admin/teachers/${hourEdit.teacherId}/monthly-hours`, {
        yearMonth: new Date().toISOString().slice(0, 7),
        hours,
      });
      setHourEdit(null);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '입력 실패');
    }
  }

  const columns: Column<RankingRow>[] = [
    { key: 'rank', header: '#', render: (r) => <strong>{r.rank}</strong> },
    {
      key: 'name',
      header: '선생님',
      render: (r) => (
        <>
          {r.name ?? r.teacherId.slice(0, 8)}
          {r.directorRole && (
            <span style={{ marginLeft: 6 }}>
              <Badge kind="confirmed">{r.directorRole}</Badge>
            </span>
          )}
        </>
      ),
    },
    { key: 'center', header: '센터', render: (r) => r.center ?? '-' },
    {
      key: 'score',
      header: '종합점수',
      render: (r) => (
        <span>
          <strong style={{ color: 'var(--teal)' }}>{r.score}</strong>{' '}
          <Meter value={r.score} />
        </span>
      ),
    },
    {
      key: 'metrics',
      header: '완료/거부/노쇼',
      render: (r) => `${r.metrics.completion}% / ${r.metrics.reject}% / ${r.metrics.noshow}%`,
    },
    { key: 'satisfaction', header: '만족도', render: (r) => r.metrics.satisfaction },
    { key: 'perHour', header: '시간당', render: (r) => r.perHour ?? '–' },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: '관리',
            align: 'right' as const,
            render: (r: RankingRow) => (
              <span style={{ whiteSpace: 'nowrap' }}>
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => openDir(r)}>
                    직무
                  </Button>
                )}{' '}
                <Button size="sm" variant="ghost" onClick={() => openHour(r)}>
                  시수
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="선생님 평가·순위"
        sub={`가중 종합점수(0~100) 기준 · ${hq ? '전체 센터' : '자기 센터'}`}
        actions={
          canEdit ? (
            <Button variant="ghost" onClick={openWeights}>
              가중치 {showWeights ? '닫기' : '설정'}
            </Button>
          ) : undefined
        }
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="input" style={{ width: 130 }} value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <select className="input" style={{ width: 130 }} value={director} onChange={(e) => setDirector(e.target.value)}>
          <option value="">직무 전체</option>
          <option value="원장">원장</option>
          <option value="부원장">부원장</option>
        </select>
        {hq && (
          <select className="input" style={{ width: 160 }} value={centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="">전체 센터</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {showWeights && weights && (
        <SectionCard
          title={`평가 가중치 ${hq && centerId ? '(선택 센터)' : '(전사 기본)'}`}
          desc="합계 100 이어야 저장됩니다. ↓ 표시는 낮을수록 좋은 역지표."
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {WEIGHT_FIELDS.map((f) => (
              <label key={f.key} style={{ fontSize: 13 }}>
                {f.label}{f.reverse ? ' ↓' : ''}
                <br />
                <input
                  className="input"
                  type="number"
                  style={{ width: 76 }}
                  value={weights[f.key] as number}
                  onChange={(e) => setWeights({ ...weights, [f.key]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: weightSum === 100 ? 'var(--teal)' : 'var(--chip-danger)', fontWeight: 700 }}>
              합계 {weightSum} / 100
            </span>
            <Button disabled={weightSum !== 100} onClick={saveWeights}>저장</Button>
          </div>
        </SectionCard>
      )}

      <ErrorText>{error}</ErrorText>
      {loading ? <Spinner /> : <Table columns={columns} rows={rows} rowKey={(r) => r.teacherId} empty="표시할 선생님이 없습니다." />}

      {/* 직무 지정 모달 */}
      <Modal
        title="원장/부원장 지정"
        open={!!dirEdit}
        onClose={() => setDirEdit(null)}
        footer={<ConfirmFooter onCancel={() => setDirEdit(null)} onConfirm={saveDir} confirmLabel="저장" />}
      >
        <p style={{ marginTop: 0 }}>{dirEdit?.name}</p>
        <SelectField
          label="직무"
          value={dirVal}
          onChange={(e) => setDirVal(e.target.value)}
          options={[
            { value: '', label: '— 해제 —' },
            { value: '원장', label: '원장' },
            { value: '부원장', label: '부원장' },
          ]}
        />
      </Modal>

      {/* 시수 입력 모달 */}
      <Modal
        title="월별 근무시수"
        open={!!hourEdit}
        onClose={() => setHourEdit(null)}
        footer={<ConfirmFooter onCancel={() => setHourEdit(null)} onConfirm={saveHour} confirmLabel="저장" />}
      >
        <p style={{ marginTop: 0 }}>
          {hourEdit?.name} · {new Date().toISOString().slice(0, 7)}
        </p>
        <TextField
          label="근무시수(시간)"
          type="number"
          value={hourVal}
          onChange={(e) => setHourVal(e.target.value)}
          placeholder="80"
        />
      </Modal>
    </div>
  );
}
