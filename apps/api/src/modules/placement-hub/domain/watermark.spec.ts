import { fingerprint, injectWatermark, watermarkSnippet } from './watermark';

describe('placement-hub watermark (O76)', () => {
  const NOW = 1752700000000;

  it('fingerprint 는 loginId|accountId|ts 로 역추적 가능(base64url 왕복)', () => {
    const fp = fingerprint('paid01', 'uuid-1', NOW);
    expect(Buffer.from(fp, 'base64url').toString()).toBe(
      `paid01|uuid-1|${NOW}`,
    );
  });

  it('snippet: 지문 주석 2회 + data-fp + 오버레이(포인터 무시·최상위 z) + 한글 라벨 인코딩', () => {
    const snip = watermarkSnippet({
      name: '유료회원',
      loginId: 'paid01',
      accountId: 'u1',
      nowMs: NOW,
    });
    expect(snip.match(/<!--jns-fp:/g)).toHaveLength(2);
    expect(snip).toContain(`data-fp="${fingerprint('paid01', 'u1', NOW)}"`);
    expect(snip).toContain('jns-wm');
    expect(snip).toContain('pointer-events:none');
    expect(snip).toContain('2147483646');
    expect(snip).toContain(encodeURIComponent('유료회원'));
  });

  it('inject: 마지막 </body> 직전 주입(대소문자 무관)·원문 무손상·body 없으면 말미', () => {
    const html = '<html><body>한글본문 </body>x</BODY></html>';
    const out = injectWatermark(html, '[WM]');
    expect(out.indexOf('[WM]')).toBe(html.toLowerCase().lastIndexOf('</body>'));
    expect(out).toContain('한글본문');
    expect(injectWatermark('no-body-한글', '[WM]').endsWith('[WM]')).toBe(true);
  });
});
