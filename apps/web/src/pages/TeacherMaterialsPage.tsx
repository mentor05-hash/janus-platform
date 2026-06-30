import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, tokens } from '../api/client';
import type { Material } from '../api/types';
import {
  PageHeader,
  Button,
  Badge,
  Spinner,
  ErrorText,
  Table,
  Tabs,
  Modal,
  ConfirmFooter,
  TextField,
  TextareaField,
  SelectField,
} from '../components/ui';
import type { Column } from '../components/ui';

const VIS_LABEL: Record<string, string> = { public: '전사 공개', center: '센터 공개', private: '비공개' };
const VIS_KIND: Record<string, 'done' | 'confirmed' | 'cancelled'> = {
  public: 'done',
  center: 'confirmed',
  private: 'cancelled',
};

export function TeacherMaterialsPage() {
  const [rows, setRows] = useState<Material[]>([]);
  const [tab, setTab] = useState('mine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('center');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = tab === 'mine' ? '?mine=true' : '';
      setRows(await api.get<Material[]>(`/materials${q}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!title.trim()) return alert('제목을 입력하세요');
    setSaving(true);
    try {
      const form = new FormData();
      form.append('title', title);
      if (subject) form.append('subject', subject);
      if (description) form.append('description', description);
      form.append('visibility', visibility);
      const f = fileRef.current?.files?.[0];
      if (f) form.append('file', f);
      await api.upload('/materials', form);
      setOpen(false);
      setTitle('');
      setSubject('');
      setDescription('');
      setVisibility('center');
      if (fileRef.current) fileRef.current.value = '';
      setTab('mine');
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '게시 실패');
    } finally {
      setSaving(false);
    }
  }

  async function download(m: Material) {
    // 인증 헤더가 필요하므로 fetch 후 blob 다운로드
    try {
      const res = await fetch(`/api/v1${m.downloadUrl}`, {
        headers: { Authorization: `Bearer ${tokens.access}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = m.filename ?? 'material';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('다운로드 실패');
    }
  }

  async function remove(m: Material) {
    if (!window.confirm(`"${m.title}" 자료를 삭제할까요?`)) return;
    try {
      await api.del(`/materials/${m.id}`);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '삭제 실패');
    }
  }

  const columns: Column<Material>[] = [
    {
      key: 'title',
      header: '제목',
      render: (m) => (
        <>
          <strong>{m.title}</strong>
          {m.subject && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>· {m.subject}</span>}
          {m.description && (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{m.description}</div>
          )}
        </>
      ),
    },
    {
      key: 'visibility',
      header: '공개',
      render: (m) => <Badge kind={VIS_KIND[m.visibility]}>{VIS_LABEL[m.visibility]}</Badge>,
    },
    { key: 'teacherName', header: '게시자', render: (m) => m.teacherName ?? '-' },
    {
      key: 'file',
      header: '파일',
      render: (m) =>
        m.downloadUrl ? (
          <Button size="sm" variant="ghost" onClick={() => download(m)}>
            {m.filename ?? '다운로드'}
          </Button>
        ) : (
          <span style={{ color: 'var(--muted)' }}>없음</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) =>
        tab === 'mine' ? (
          <Button size="sm" variant="danger" onClick={() => remove(m)}>
            삭제
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="자료실"
        sub="수업 자료를 게시하고 공개범위를 설정합니다."
        actions={<Button onClick={() => setOpen(true)}>자료 게시</Button>}
      />
      <Tabs
        items={[
          { value: 'mine', label: '내 게시물' },
          { value: 'all', label: '열람 가능 전체' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <ErrorText>{error}</ErrorText>
      {loading ? (
        <Spinner />
      ) : (
        <Table columns={columns} rows={rows} rowKey={(m) => m.id} empty="자료가 없습니다." />
      )}

      <Modal
        title="자료 게시"
        open={open}
        onClose={() => setOpen(false)}
        footer={<ConfirmFooter onCancel={() => setOpen(false)} onConfirm={submit} confirmLabel="게시" loading={saving} />}
      >
        <TextField label="제목" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 수능 영어 모의고사 해설" />
        <TextField label="분류(과목 등)" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="영어" />
        <TextareaField label="설명" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <SelectField
          label="공개범위"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          options={[
            { value: 'center', label: '센터 공개(자기 센터 학생)' },
            { value: 'public', label: '전사 공개(모든 학생)' },
            { value: 'private', label: '비공개(본인·관리자만)' },
          ]}
        />
        <label className="label">첨부 파일</label>
        <input ref={fileRef} type="file" />
      </Modal>
    </div>
  );
}
