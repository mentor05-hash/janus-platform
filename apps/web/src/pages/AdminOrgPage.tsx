import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Center } from '../api/types';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  ErrorText,
  Table,
  TextField,
  SelectField,
} from '../components/ui';
import type { Column } from '../components/ui';

/**
 * 조직 관리(본사 이상) — 센터 생성·목록 + 관리자 계정 생성(권한레벨별).
 * L2(본사관리자) 생성은 마스터(L1)만. L3(센터관리자)는 센터 지정 필수.
 */
export function AdminOrgPage() {
  const { user } = useAuth();
  const isMaster = user?.permLevel === 'L1';
  const [centers, setCenters] = useState<Center[]>([]);
  const [center, setCenter] = useState({ name: '', region: '' });
  const [staff, setStaff] = useState<{ loginId: string; password: string; name: string; permLevel: 'L2' | 'L3'; centerId: string }>({
    loginId: '',
    password: '',
    name: '',
    permLevel: 'L3',
    centerId: '',
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setCenters(await api.get<Center[]>('/centers'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, []);
  useEffect(() => void load(), [load]);

  const createCenter = async () => {
    setMsg('');
    setError('');
    try {
      await api.post('/centers', { name: center.name, region: center.region || undefined });
      setCenter({ name: '', region: '' });
      setMsg('센터가 생성되었습니다.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '센터 생성 실패');
    }
  };

  const createStaff = async () => {
    setMsg('');
    setError('');
    try {
      const dto: Record<string, unknown> = {
        loginId: staff.loginId,
        password: staff.password,
        name: staff.name,
        permLevel: staff.permLevel,
      };
      if (staff.permLevel === 'L3') dto.centerId = staff.centerId;
      const r = await api.post<{ tier: string }>('/admin/staff', dto);
      setStaff({ loginId: '', password: '', name: '', permLevel: 'L3', centerId: '' });
      setMsg(`관리자 계정 생성됨 — ${r.tier}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '관리자 생성 실패');
    }
  };

  const centerName = (id: string | null) => centers.find((c) => c.id === id)?.name ?? '전사';

  const centerCols: Column<Center>[] = [
    { key: 'name', header: '센터', render: (c) => <strong>{c.name}</strong> },
    { key: 'region', header: '지역', render: (c) => c.region ?? '-' },
  ];

  const staffValid =
    staff.loginId.trim() && staff.password && staff.name.trim() && (staff.permLevel !== 'L3' || staff.centerId);

  return (
    <div>
      <PageHeader
        title="조직 관리"
        sub={`로그인: ${centerName(user?.center_id ?? null)} · ${user?.adminTier ?? user?.role}`}
      />
      {msg && <p style={{ color: 'var(--teal)', fontSize: 14 }}>{msg}</p>}
      <ErrorText>{error}</ErrorText>

      <Card title="센터" style={{ marginBottom: 16 }}>
        <Table columns={centerCols} rows={centers} rowKey={(c) => c.id} empty="센터가 없습니다." />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
          <div style={{ width: 200 }}>
            <TextField label="센터명" value={center.name} onChange={(e) => setCenter({ ...center, name: e.target.value })} />
          </div>
          <div style={{ width: 130 }}>
            <TextField label="지역" value={center.region} onChange={(e) => setCenter({ ...center, region: e.target.value })} />
          </div>
          <Button disabled={!center.name.trim()} onClick={createCenter} style={{ marginBottom: 12 }}>
            센터 생성
          </Button>
        </div>
      </Card>

      <Card title="관리자 계정 생성">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ width: 130 }}>
            <TextField label="로그인 ID" value={staff.loginId} onChange={(e) => setStaff({ ...staff, loginId: e.target.value })} />
          </div>
          <div style={{ width: 150 }}>
            <TextField label="비밀번호" type="password" value={staff.password} onChange={(e) => setStaff({ ...staff, password: e.target.value })} />
          </div>
          <div style={{ width: 110 }}>
            <TextField label="이름" value={staff.name} onChange={(e) => setStaff({ ...staff, name: e.target.value })} />
          </div>
          <div style={{ width: 180 }}>
            <SelectField
              label="권한레벨"
              value={staff.permLevel}
              onChange={(e) => setStaff({ ...staff, permLevel: e.target.value as 'L2' | 'L3' })}
            >
              <option value="L3">센터관리자(L3)</option>
              <option value="L2" disabled={!isMaster}>
                본사관리자(L2){!isMaster ? ' — 마스터만' : ''}
              </option>
            </SelectField>
          </div>
          {staff.permLevel === 'L3' && (
            <div style={{ width: 160 }}>
              <SelectField
                label="센터"
                value={staff.centerId}
                onChange={(e) => setStaff({ ...staff, centerId: e.target.value })}
                options={[{ value: '', label: '센터 선택' }, ...centers.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </div>
          )}
          <Button disabled={!staffValid} onClick={createStaff} style={{ marginBottom: 12 }}>
            계정 생성
          </Button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
          <Badge kind="soft">정책</Badge> 비밀번호 8자+ · 영문+숫자 포함. L2 생성은 마스터(L1)만.
        </p>
      </Card>
    </div>
  );
}
