import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';

type Doc = { title: string; version: string; updatedAt: string; sections: { h: string; b: string }[] };

/** 이용약관·개인정보처리방침 공개 페이지(로그인 불필요). */
export function LegalDocPage({ which }: { which: 'terms' | 'privacy' }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setDoc(null);
    api.get<Doc>(`/legal/${which}`).then(setDoc).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [which]);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px' }}>
      <Link to="/login" style={{ fontSize: 13, color: 'var(--teal)', textDecoration: 'none' }}>‹ 로그인으로</Link>
      {error && <p className="error">{error}</p>}
      {doc && (
        <>
          <h1 style={{ fontSize: 24, margin: '10px 0 4px', color: 'var(--ink)' }}>{doc.title}</h1>
          <p style={{ fontSize: 12, color: 'var(--caption)', marginBottom: 20 }}>버전 {doc.version} · 개정 {doc.updatedAt}</p>
          {doc.sections.map((s, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, color: 'var(--ink)', margin: '0 0 4px' }}>{s.h}</h3>
              <p style={{ fontSize: 14, color: 'var(--ink-body)', lineHeight: 1.7, margin: 0 }}>{s.b}</p>
            </div>
          ))}
          <div style={{ marginTop: 24, display: 'flex', gap: 14 }}>
            <Link to="/terms" style={{ fontSize: 13, color: 'var(--teal)' }}>이용약관</Link>
            <Link to="/privacy" style={{ fontSize: 13, color: 'var(--teal)' }}>개인정보처리방침</Link>
          </div>
        </>
      )}
    </div>
  );
}
