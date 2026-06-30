import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Center } from '../api/types';

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
      setMsg('센터 생성됨');
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
      setMsg(`관리자 생성됨 — ${r.tier}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '관리자 생성 실패');
    }
  };

  const centerName = (id: string | null) => centers.find((c) => c.id === id)?.name ?? '전사';

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ margin: 0 }}>조직 관리</h2>
      {msg && <div style={{ color: 'var(--teal)', fontSize: 14 }}>{msg}</div>}
      {error && <div style={{ color: '#c0392b', fontSize: 14 }}>{error}</div>}

      <section className="card" style={{ display: 'grid', gap: 10, padding: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>센터</h3>
        <ul style={{ display: 'grid', gap: 4, listStyle: 'none', padding: 0, fontSize: 14 }}>
          {centers.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong> <span style={{ color: 'var(--muted)' }}>{c.region}</span>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 200 }} placeholder="센터명" value={center.name} onChange={(e) => setCenter({ ...center, name: e.target.value })} />
          <input className="input" style={{ width: 120 }} placeholder="지역" value={center.region} onChange={(e) => setCenter({ ...center, region: e.target.value })} />
          <button className="btn" disabled={!center.name.trim()} onClick={createCenter}>
            센터 생성
          </button>
        </div>
      </section>

      <section className="card" style={{ display: 'grid', gap: 10, padding: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>관리자 계정 생성</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" style={{ width: 130 }} placeholder="로그인ID" value={staff.loginId} onChange={(e) => setStaff({ ...staff, loginId: e.target.value })} />
          <input className="input" style={{ width: 150 }} type="password" placeholder="비밀번호" value={staff.password} onChange={(e) => setStaff({ ...staff, password: e.target.value })} />
          <input className="input" style={{ width: 110 }} placeholder="이름" value={staff.name} onChange={(e) => setStaff({ ...staff, name: e.target.value })} />
          <select className="input" value={staff.permLevel} onChange={(e) => setStaff({ ...staff, permLevel: e.target.value as 'L2' | 'L3' })}>
            <option value="L3">센터관리자(L3)</option>
            <option value="L2" disabled={!isMaster}>
              본사관리자(L2){!isMaster ? ' — 마스터만' : ''}
            </option>
          </select>
          {staff.permLevel === 'L3' && (
            <select className="input" value={staff.centerId} onChange={(e) => setStaff({ ...staff, centerId: e.target.value })}>
              <option value="">센터 선택</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            className="btn"
            disabled={!staff.loginId.trim() || !staff.password || !staff.name.trim() || (staff.permLevel === 'L3' && !staff.centerId)}
            onClick={createStaff}
          >
            계정 생성
          </button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
          비밀번호 정책: 8자+ · 영문+숫자 포함. L2 생성은 마스터(L1)만 가능합니다.
        </p>
      </section>

      <p style={{ color: 'var(--muted)', fontSize: 12 }}>현재 로그인: {centerName(user?.center_id ?? null)} · {user?.adminTier ?? user?.role}</p>
    </div>
  );
}
