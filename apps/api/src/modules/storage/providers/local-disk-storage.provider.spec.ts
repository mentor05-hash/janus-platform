import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalDiskStorageProvider } from './local-disk-storage.provider';

describe('LocalDiskStorageProvider (§10)', () => {
  const base = path.join(os.tmpdir(), `itall-storage-test-${process.pid}`);
  const sut = new LocalDiskStorageProvider(base);

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it('put → get 라운드트립(바이트 동일)', async () => {
    const data = Buffer.from('멘토링 플랫폼 첨부 테스트 🎓', 'utf8');
    await sut.put({ key: 'uploads/abc.txt', data, contentType: 'text/plain' });
    const read = await sut.get('uploads/abc.txt');
    expect(read.equals(data)).toBe(true);
  });

  it('delete 후 get 은 실패', async () => {
    const data = Buffer.from('x');
    await sut.put({
      key: 'uploads/del.bin',
      data,
      contentType: 'application/octet-stream',
    });
    await sut.delete('uploads/del.bin');
    await expect(sut.get('uploads/del.bin')).rejects.toThrow();
  });

  it('경로 탈출 키는 거부', async () => {
    await expect(
      sut.put({
        key: '../escape.txt',
        data: Buffer.from('no'),
        contentType: 'text/plain',
      }),
    ).rejects.toThrow(/경로 탈출/);
  });
});
