import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Report } from '../api/types';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Spinner,
  ErrorText,
  EmptyState,
  Modal,
  ConfirmFooter,
  TextareaField,
} from '../components/ui';

const STATUS_KIND: Record<string, 'new' | 'confirmed' | 'done' | 'cancelled'> = {
  received: 'new',
  reviewing: 'confirmed',
  resolved: 'done',
  dismissed: 'cancelled',
};
const STATUS_LABEL: Record<string, string> = {
  received: '접수',
  reviewing: '검토중',
  resolved: '조치완료',
  dismissed: '기각',
};

export function AdminReportsPage() {
  const [rows, setRows] = useState<Report[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // 처리 모달
  const [edit, setEdit] = useState<{ id: string; status: string } | null>(null);
  const [action, setAction] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<Report[]>('/reports'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  function openHandle(id: string, status: string) {
    setEdit({ id, status });
    setAction('');
  }
  async function confirm() {
    if (!edit) return;
    try {
      await api.patch(`/reports/${edit.id}`, { status: edit.status, action: action || undefined });
      setEdit(null);
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '처리 실패');
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="신고 처리" sub="접수된 신고 검토·조치" />
      <ErrorText>{error}</ErrorText>
      {rows.length === 0 ? (
        <EmptyState>신고가 없습니다.</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => (
            <Card key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{r.target_type}</strong>{' '}
                  <Badge kind={STATUS_KIND[r.status ?? 'received'] ?? 'new'}>
                    {STATUS_LABEL[r.status ?? ''] ?? r.status}
                  </Badge>
                  {r.ai_review?.flagged && (
                    <span style={{ marginLeft: 6 }}>
                      <Badge kind={r.ai_review.severity === 'high' ? 'danger' : 'confirmed'}>
                        {r.ai_review.severity === 'high'
                          ? `AI 심각${r.ai_review.category ? `·${r.ai_review.category}` : ''}`
                          : 'AI 경미'}
                      </Badge>
                    </span>
                  )}
                </div>
                {(r.status === 'received' || r.status === 'reviewing') && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {r.status === 'received' && (
                      <Button size="sm" variant="ghost" onClick={() => openHandle(r.id, 'reviewing')}>
                        검토
                      </Button>
                    )}
                    <Button size="sm" onClick={() => openHandle(r.id, 'resolved')}>조치완료</Button>
                    <Button size="sm" variant="ghost" onClick={() => openHandle(r.id, 'dismissed')}>기각</Button>
                  </div>
                )}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
                사유: {r.reason} {r.ai_review?.summary && <span>· AI: {r.ai_review.summary}</span>}
                {r.action && <span> · 조치: {r.action}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        title={`신고 처리 — ${edit ? STATUS_LABEL[edit.status] : ''}`}
        open={!!edit}
        onClose={() => setEdit(null)}
        footer={<ConfirmFooter onCancel={() => setEdit(null)} onConfirm={confirm} confirmLabel="확정" />}
      >
        <TextareaField
          label="처리 메모(선택)"
          rows={3}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="조치 내용·근거"
        />
      </Modal>
    </div>
  );
}
