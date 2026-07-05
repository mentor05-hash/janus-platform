import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Button, ErrorText, TextField, TextareaField, SelectField } from '../components/ui';

// 대입 컨설팅 상담 신청 폼 — POST /consulting/applications 연결(설계안 랜딩 폼 실동작).
const GRADES = [
  { value: '고1', label: '고1' },
  { value: '고2', label: '고2' },
  { value: '고3', label: '고3' },
  { value: 'N수', label: 'N수' },
  { value: '기타', label: '기타' },
];
const INTERESTS = [
  { value: 'both', label: '수시·정시 종합' },
  { value: 'susi', label: '수시' },
  { value: 'jeongsi', label: '정시' },
  { value: 'essay', label: '자소서·면접' },
];
const PACKAGES = [
  { value: 'single', label: '단건 진단 (15만원)' },
  { value: 'season', label: '시즌 정기권 (월 48만원)' },
  { value: 'full', label: '종합 전담 (맞춤 견적)' },
];

interface CreatedApplication {
  id: string;
  package: string;
  priceWon: number | null;
  status: string;
}

export function ConsultingApplyPage() {
  const [f, setF] = useState({
    applicantName: '',
    applicantPhone: '',
    studentGrade: '고3',
    interestType: 'both',
    package: 'season',
    message: '',
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CreatedApplication | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!f.applicantName.trim() || !f.applicantPhone.trim()) {
      setError('이름과 연락처를 입력해 주세요.');
      return;
    }
    if (!agree) {
      setError('개인정보 수집·이용에 동의해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const app = await api.post<CreatedApplication>('/consulting/applications', { ...f, agree });
      setDone(app);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '신청 접수에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '30px 0' }}>
        <div className="card" style={{ width: 400, textAlign: 'center' }}>
          <h2 style={{ marginTop: 0, color: 'var(--teal)' }}>상담 신청 완료</h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            신청이 접수되었습니다. 전담 멘토가 1영업일 내 연락드립니다.
          </p>
          <div style={{ fontSize: 13, color: 'var(--ink)', background: 'var(--line-2, #eef3f4)', borderRadius: 10, padding: '12px 14px', margin: '14px 0', textAlign: 'left' }}>
            <div>접수번호: <b>{done.id.slice(0, 8)}</b></div>
            <div>상품: <b>{done.package}</b>{done.priceWon != null && <> · {done.priceWon.toLocaleString()}원</>}</div>
            <div>상태: <b>{done.status}</b></div>
          </div>
          <Link to="/login"><Button block>확인</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '30px 0' }}>
      <form className="card" style={{ width: 400 }} onSubmit={onSubmit}>
        <h2 style={{ marginTop: 0, color: 'var(--teal)' }}>대입 컨설팅 상담 신청</h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
          학생부·성적을 종합해 수시·정시 전 과정을 설계하는 1:1 프리미엄 컨설팅입니다.
        </p>
        <TextField label="이름" value={f.applicantName} onChange={(e) => set('applicantName', e.target.value)} placeholder="학생 또는 학부모 성함" />
        <TextField label="연락처" value={f.applicantPhone} onChange={(e) => set('applicantPhone', e.target.value)} placeholder="010-0000-0000" />
        <SelectField label="학년" value={f.studentGrade} onChange={(e) => set('studentGrade', e.target.value)} options={GRADES} />
        <SelectField label="관심 유형" value={f.interestType} onChange={(e) => set('interestType', e.target.value)} options={INTERESTS} />
        <SelectField label="상품" value={f.package} onChange={(e) => set('package', e.target.value)} options={PACKAGES} />
        <TextareaField label="문의 내용 (선택)" value={f.message} onChange={(e) => set('message', e.target.value)} placeholder="현재 성적, 목표 대학, 궁금한 점 등을 자유롭게 적어주세요." />
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--muted)', margin: '4px 0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 2 }} />
          <span>상담을 위한 개인정보 수집·이용에 동의합니다. (필수)</span>
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" block disabled={busy}>{busy ? '접수 중…' : '상담 신청하기'}</Button>
      </form>
    </div>
  );
}
