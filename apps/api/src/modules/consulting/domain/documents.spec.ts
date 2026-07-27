import {
  validateDocument,
  isAllowedDocMime,
  MAX_DOC_SIZE_BYTES,
} from './documents';

const PDF = 'application/pdf';
const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('컨설팅 자료 형식 검증(PDF·Word만)', () => {
  it('PDF·doc·docx mime 허용', () => {
    expect(isAllowedDocMime(PDF)).toBe(true);
    expect(isAllowedDocMime('application/msword')).toBe(true);
    expect(isAllowedDocMime(DOCX)).toBe(true);
  });

  it('그 외 형식은 거부(이미지·zip 등)', () => {
    expect(isAllowedDocMime('image/png')).toBe(false);
    expect(isAllowedDocMime('application/zip')).toBe(false);
  });

  it('mime 이 어긋나도 확장자로 통과(브라우저 편차 대비)', () => {
    const r = validateDocument({
      originalname: '생기부.pdf',
      mimetype: 'application/octet-stream',
      size: 1000,
    });
    expect(r.ok).toBe(true);
  });

  it('허용 형식 + 정상 크기 → 통과', () => {
    expect(
      validateDocument({ originalname: 'a.pdf', mimetype: PDF, size: 1024 }).ok,
    ).toBe(true);
    expect(
      validateDocument({ originalname: 'b.docx', mimetype: DOCX, size: 1024 })
        .ok,
    ).toBe(true);
  });

  it('허용되지 않는 형식 → 거부 + 사유', () => {
    const r = validateDocument({
      originalname: 'photo.png',
      mimetype: 'image/png',
      size: 1024,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('PDF');
  });

  it('빈 파일 거부', () => {
    expect(
      validateDocument({ originalname: 'a.pdf', mimetype: PDF, size: 0 }).ok,
    ).toBe(false);
  });

  it('크기 초과(20MB+1) 거부', () => {
    const r = validateDocument({
      originalname: 'big.pdf',
      mimetype: PDF,
      size: MAX_DOC_SIZE_BYTES + 1,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('20MB');
  });
});
