import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import { PageHeader, Card, Button, Badge, ErrorText, TextField, SelectField } from '../components/ui';

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
      setMsg('분류가 추가되었습니다.');
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
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 13 }}>유형이 없습니다.</span>}
      {rows.map((t) => (
        <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong>{t.label}</strong>
          <Badge kind="soft">{t.code}</Badge>
          <span style={{ flex: 1 }} />
          {canManage && (
            <Button size="sm" variant="ghost" onClick={() => deactivate(t.id)}>
              비활성
            </Button>
          )}
        </div>
      ))}
    </div>
  );

  const asTypes = as.kind === 'teacher' ? tTypes : sTypes;

  return (
    <div>
      <PageHeader title="회원 분류" sub="선생님·학생 유형(확장 가능) 관리 및 배정" />
      {msg && <p style={{ color: 'var(--teal)', fontSize: 14 }}>{msg}</p>}
      <ErrorText>{error}</ErrorText>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <Card title="선생님 유형">
          <TypeList rows={tTypes} />
        </Card>
        <Card title="학생 유형">
          <TypeList rows={sTypes} />
        </Card>
      </div>

      {canManage && (
        <Card title="분류 추가" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ width: 120 }}>
              <SelectField
                label="대상"
                value={nt.kind}
                onChange={(e) => setNt({ ...nt, kind: e.target.value as 'teacher' | 'student' })}
                options={[
                  { value: 'teacher', label: '선생님' },
                  { value: 'student', label: '학생' },
                ]}
              />
            </div>
            <div style={{ width: 130 }}>
              <TextField label="코드(영문)" value={nt.code} onChange={(e) => setNt({ ...nt, code: e.target.value })} />
            </div>
            <div style={{ width: 130 }}>
              <TextField label="표시 이름" value={nt.label} onChange={(e) => setNt({ ...nt, label: e.target.value })} />
            </div>
            <Button disabled={!nt.code.trim() || !nt.label.trim()} onClick={addType} style={{ marginBottom: 12 }}>
              추가
            </Button>
          </div>
        </Card>
      )}

      <Card title="분류 배정">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ width: 120 }}>
            <SelectField
              label="대상"
              value={as.kind}
              onChange={(e) => setAs({ kind: e.target.value as 'teacher' | 'student', memberId: '', typeCode: '' })}
              options={[
                { value: 'teacher', label: '선생님' },
                { value: 'student', label: '학생' },
              ]}
            />
          </div>
          <div style={{ width: 200 }}>
            <SelectField label="대상 회원" value={as.memberId} onChange={(e) => setAs({ ...as, memberId: e.target.value })}>
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
            </SelectField>
          </div>
          <div style={{ width: 150 }}>
            <SelectField label="유형" value={as.typeCode} onChange={(e) => setAs({ ...as, typeCode: e.target.value })}>
              <option value="">유형 선택</option>
              {asTypes.map((t) => (
                <option key={t.id} value={t.code}>
                  {t.label}
                </option>
              ))}
            </SelectField>
          </div>
          <Button disabled={!as.memberId || !as.typeCode} onClick={assign} style={{ marginBottom: 12 }}>
            배정
          </Button>
        </div>
      </Card>
    </div>
  );
}
