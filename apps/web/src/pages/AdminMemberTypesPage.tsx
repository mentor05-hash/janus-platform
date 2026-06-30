import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';

type MemberType = { id: string; kind: 'teacher' | 'student'; code: string; label: string; sort_order: number; active: boolean };
type Teacher = { id: string; name: string };
type Student = { id: string; login_id: string; name: string };

/**
 * 회원 분류 — 선생님·학생 유형(확장 가능) 관리 + 배정.
 * 분류 체계 추가/비활성은 본사 이상(@MinPerm L2). 배정은 센터관리자·HR.
 */
export function AdminMemberTypesPage() {
  const { user } = useAuth();
  const canManage = isHq(user); // 본사 이상만 분류 추가/비활성
  const [tTypes, setTTypes] = useState<MemberType[]>([]);
  const [sTypes, setSTypes] = useState<MemberType[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [nt, setNt] = useState<{ kind: 'teacher' | 'student'; code: string; label: string }>({ kind: 'teacher', code: '', label: '' });
  const [as, setAs] = useState<{ kind: 'teacher' | 'student'; memberId: string; typeCode: string }>({ kind: 'teacher', memberId: '', typeCode: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setTTypes(await api.get<MemberType[]>('/admin/member-types?kind=teacher'));
      setSTypes(await api.get<MemberType[]>('/admin/member-types?kind=student'));
      const tRes = await api.get<{ data: Teacher[] }>('/teachers');
      setTeachers(tRes.data ?? []);
      setStudents(await api.get<Student[]>('/hr/students'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, []);
  useEffect(() => void load(), [load]);

  const addType = async () => {
    setMsg('');
    setError('');
    try {
      await api.post('/admin/member-types', { kind: nt.kind, code: nt.code, label: nt.label });
      setNt({ kind: nt.kind, code: '', label: '' });
      setMsg('분류 추가됨');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '분류 추가 실패');
    }
  };
  const deactivate = async (id: string) => {
    try {
      await api.del(`/admin/member-types/${id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '비활성 실패');
    }
  };
  const assign = async () => {
    setMsg('');
    setError('');
    try {
      const path = as.kind === 'teacher' ? `/admin/teachers/${as.memberId}/type` : `/admin/students/${as.memberId}/type`;
      const r = await api.patch<{ label: string }>(path, { typeCode: as.typeCode });
      setMsg(`배정됨 — ${r.label}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '배정 실패');
    }
  };

  const TypeList = ({ rows }: { rows: MemberType[] }) => (
    <ul style={{ display: 'grid', gap: 4, listStyle: 'none', padding: 0, fontSize: 14 }}>
      {rows.map((t) => (
        <li key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong>{t.label}</strong>
          <code style={{ color: 'var(--muted)', fontSize: 12 }}>{t.code}</code>
          <span style={{ flex: 1 }} />
          {canManage && (
            <button className="btn ghost sm" onClick={() => deactivate(t.id)}>
              비활성
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  const asTypes = as.kind === 'teacher' ? tTypes : sTypes;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ margin: 0 }}>회원 분류</h2>
      {msg && <div style={{ color: 'var(--teal)', fontSize: 14 }}>{msg}</div>}
      {error && <div style={{ color: '#c0392b', fontSize: 14 }}>{error}</div>}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>선생님 유형</h3>
          <TypeList rows={tTypes} />
        </section>
        <section className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>학생 유형</h3>
          <TypeList rows={sTypes} />
        </section>
      </div>

      {canManage && (
        <section className="card" style={{ display: 'flex', gap: 8, padding: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>분류 추가</strong>
          <select className="input" value={nt.kind} onChange={(e) => setNt({ ...nt, kind: e.target.value as 'teacher' | 'student' })}>
            <option value="teacher">선생님</option>
            <option value="student">학생</option>
          </select>
          <input className="input" style={{ width: 130 }} placeholder="코드(영문)" value={nt.code} onChange={(e) => setNt({ ...nt, code: e.target.value })} />
          <input className="input" style={{ width: 130 }} placeholder="표시 이름" value={nt.label} onChange={(e) => setNt({ ...nt, label: e.target.value })} />
          <button className="btn" disabled={!nt.code.trim() || !nt.label.trim()} onClick={addType}>
            추가
          </button>
        </section>
      )}

      <section className="card" style={{ display: 'flex', gap: 8, padding: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>분류 배정</strong>
        <select className="input" value={as.kind} onChange={(e) => setAs({ kind: e.target.value as 'teacher' | 'student', memberId: '', typeCode: '' })}>
          <option value="teacher">선생님</option>
          <option value="student">학생</option>
        </select>
        <select className="input" value={as.memberId} onChange={(e) => setAs({ ...as, memberId: e.target.value })}>
          <option value="">대상 선택</option>
          {as.kind === 'teacher'
            ? teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            : students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.login_id})
                </option>
              ))}
        </select>
        <select className="input" value={as.typeCode} onChange={(e) => setAs({ ...as, typeCode: e.target.value })}>
          <option value="">유형 선택</option>
          {asTypes.map((t) => (
            <option key={t.id} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
        <button className="btn" disabled={!as.memberId || !as.typeCode} onClick={assign}>
          배정
        </button>
      </section>
    </div>
  );
}
