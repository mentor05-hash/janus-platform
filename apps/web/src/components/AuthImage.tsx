import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';

/** 인증 파일을 blob 으로 받아 표시하는 썸네일. 클릭 시 확대(라이트박스). */
export function AuthImage({ fileId, alt, size = 84, zoomable = true }: { fileId: string; alt?: string; size?: number; zoomable?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    let made: string | null = null;
    api.fileBlobUrl(fileId).then((u) => { if (live) { made = u; setUrl(u); } }).catch(() => setErr(true));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [fileId]);

  const box: React.CSSProperties = {
    width: size, height: size, borderRadius: 8, objectFit: 'cover',
    border: '1px solid var(--line)', background: 'var(--surface-2,#f6f8fa)',
    cursor: zoomable ? 'zoom-in' : 'default', display: 'block',
  };
  if (err) return <div style={{ ...box, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--caption)' }}>이미지</div>;
  if (!url) return <div style={{ ...box, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--caption)' }}>…</div>;

  return (
    <>
      <img src={url} alt={alt ?? ''} style={box} onClick={() => zoomable && setZoom(true)} />
      {zoom && createPortal(
        <div onClick={() => setZoom(false)} style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8,16,20,0.86)',
          display: 'grid', placeItems: 'center', cursor: 'zoom-out', padding: 24,
        }}>
          <img src={url} alt={alt ?? ''} style={{ maxWidth: '96vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,.5)' }} />
          <div style={{ position: 'fixed', top: 16, right: 20, color: '#fff', fontSize: 26, fontWeight: 700 }}>✕</div>
        </div>,
        document.body,
      )}
    </>
  );
}
