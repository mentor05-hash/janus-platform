import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

const STORAGE_DIR = path.join(os.tmpdir(), `itall-files-e2e-${process.pid}`);
process.env.STORAGE_PROVIDER = 'local';
process.env.STORAGE_LOCAL_DIR = STORAGE_DIR;

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { FilesService } from '../src/modules/storage/files.service';

/**
 * a1 §10 StorageProvider: 업로드(stored_file 기록) + 다운로드 소유권 게이트.
 */
const OWNER: any = {
  id: '00000000-0000-4000-8000-0000000000a1',
  role: 'student',
  centerId: null,
  loginId: 's',
};
const OTHER: any = {
  id: '00000000-0000-4000-8000-0000000000a2',
  role: 'teacher',
  centerId: null,
  loginId: 't',
};
const ADMIN: any = {
  id: '00000000-0000-4000-8000-0000000000a3',
  role: 'admin',
  centerId: null,
  loginId: 'a',
};

const fakeFile = (text: string) => {
  const buffer = Buffer.from(text, 'utf8');
  return {
    buffer,
    originalname: '첨부.txt',
    mimetype: 'text/plain',
    size: buffer.length,
  };
};

describe('a1 파일 저장/다운로드(§10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let files: FilesService;
  let uploadedId = '';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    files = mod.get(FilesService);
  });

  afterAll(async () => {
    await prisma.stored_file.deleteMany({ where: { owner_id: OWNER.id } });
    await fs.rm(STORAGE_DIR, { recursive: true, force: true });
    await app.close();
  });

  it('업로드 → stored_file 기록 + 메타 반환', async () => {
    const res = await files.upload(OWNER.id, fakeFile('숙제 제출본'));
    expect(res.id).toBeTruthy();
    expect(res.size).toBe(Buffer.from('숙제 제출본', 'utf8').length);
    expect(res.url).toBe(`/files/${res.id}`);
    uploadedId = res.id;
  });

  it('소유자 다운로드 → 바이트 동일', async () => {
    const { data, filename } = await files.download(uploadedId, OWNER);
    expect(data.toString('utf8')).toBe('숙제 제출본');
    expect(filename).toBe('첨부.txt');
  });

  it('관리자 다운로드 허용', async () => {
    const { data } = await files.download(uploadedId, ADMIN);
    expect(data.toString('utf8')).toBe('숙제 제출본');
  });

  it('타인 다운로드 → 403', async () => {
    await expect(files.download(uploadedId, OTHER)).rejects.toThrow(/권한/);
  });

  it('없는 파일 → 404', async () => {
    await expect(
      files.download('00000000-0000-4000-8000-0000000000ff', OWNER),
    ).rejects.toThrow(/찾을 수 없/);
  });
});
