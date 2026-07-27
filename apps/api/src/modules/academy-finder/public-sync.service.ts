import { Injectable, Logger } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 공공데이터 적재 — 스펙 세션 1. 교육청 학원·교습소 공개데이터를 academy(source=public)로 upsert.
 *
 * ⚠ 저작권/공공 원천 데이터는 repo 에 넣지 않는다(CLAUDE.md §4). 파일 경로는 JANUS_DATA_DIR ENV 로만 참조.
 *   기대 경로: ${JANUS_DATA_DIR}/academies/*.json  (레코드 배열)
 *   [DEC⑮] 약관·수록 범위 게이트 통과분만 배치.
 * 데이터가 없어도 seedSample() 로 합성 샘플(가짜)만으로 API 완료기준을 실측할 수 있다.
 */
@Injectable()
export class PublicSyncService {
  private readonly logger = new Logger(PublicSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  private dataDir(): string | null {
    const root = process.env.JANUS_DATA_DIR;
    return root ? join(root, 'academies') : null;
  }

  /** 사업자등록번호 마스킹(원본 비저장). 123-45-67890 → 123-45-***** */
  private maskBizReg(v?: string | null): string | null {
    if (!v) return null;
    const digits = String(v).replace(/[^0-9]/g, '');
    if (digits.length < 5) return null;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-*****`;
  }

  private toRecord(raw: Record<string, unknown>) {
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const val = raw[k];
        if (val !== undefined && val !== null && val !== '') return val;
      }
      return undefined;
    };
    const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
    const extKey = pick('ext_key', 'id', 'ACA_ASNUM', 'academyCode');
    const name = pick('name', 'ACA_NM', 'academyName');
    if (!extKey || !name) return null;
    return {
      ext_key: String(extKey),
      name: String(name),
      addr: (pick('addr', 'FA_RDNMA', 'address') as string) ?? null,
      dong_code: (pick('dong_code', 'ADMST_ZONE_NM', 'dongCode') as string) ?? null,
      lat: num(pick('lat', 'latitude')),
      lng: num(pick('lng', 'longitude')),
      phone: (pick('phone', 'FA_TELNO', 'tel') as string) ?? null,
      biz_reg_masked: this.maskBizReg(pick('biz_reg', 'bizReg') as string),
    };
  }

  /** JANUS_DATA_DIR 의 공공 학원 JSON 을 파싱→upsert(ext_key 기준 idempotent). */
  async syncFromDataDir(): Promise<{ scanned: number; upserted: number; skipped: number; source: string }> {
    const dir = this.dataDir();
    if (!dir) {
      this.logger.warn('JANUS_DATA_DIR 미설정 — 공공데이터 적재 건너뜀. seedSample() 로 샘플만 확인 가능.');
      return { scanned: 0, upserted: 0, skipped: 0, source: 'none' };
    }
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      this.logger.warn(`공공데이터 디렉터리 없음: ${dir}`);
      return { scanned: 0, upserted: 0, skipped: 0, source: dir };
    }
    let scanned = 0;
    let upserted = 0;
    let skipped = 0;
    for (const f of files) {
      let arr: Record<string, unknown>[] = [];
      try {
        const parsed = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        arr = Array.isArray(parsed) ? parsed : (parsed.data ?? parsed.rows ?? []);
      } catch (e) {
        this.logger.error(`파싱 실패 ${f}: ${(e as Error).message}`);
        continue;
      }
      for (const raw of arr) {
        scanned += 1;
        const rec = this.toRecord(raw);
        if (!rec) {
          skipped += 1;
          continue;
        }
        await this.prisma.academy.upsert({
          where: { ext_key: rec.ext_key },
          create: { ...rec, source: 'public' },
          update: { ...rec, updated_at: new Date() },
        });
        upserted += 1;
      }
    }
    this.logger.log(`공공데이터 적재: scanned=${scanned} upserted=${upserted} skipped=${skipped}`);
    return { scanned, upserted, skipped, source: dir };
  }

  /**
   * 합성 샘플 시드(가짜 데이터) — 완료기준 실측용. 실제 교육청 데이터 아님, repo 안전.
   * 샘플 1개 시군구(대치동, dong_code '1168010600') 학원 3곳 + 반·버스·cohort(claimed/verified).
   */
  async seedSample(): Promise<{ academies: number }> {
    const DONG = '1168010600'; // 서울 강남구 대치동(예시)
    const NEIGHBOR = '1168010700'; // 인접동(버스 경유 데모)
    const samples = [
      {
        ext_key: 'SEED-A-001',
        name: '샘플 수학전문 학원',
        addr: '서울 강남구 대치동 (샘플)',
        phone: '02-000-0001',
        classes: [
          { subject: '수학', target_grades: ['고1', '고2'], level: 'regular', tuition_krw: 350000, schedule: [{ dow: '월', start: '18:00', end: '20:00' }] },
          { subject: '수학', target_grades: ['고3', 'N수'], level: 'prep', tuition_krw: 450000, schedule: [{ dow: '화', start: '19:00', end: '22:00' }] },
        ],
        bus: { name: '1호차', days: ['월', '수', '금'], stops: [{ seq: 1, name: '대치역', dong_code: DONG }, { seq: 2, name: '은마사거리', dong_code: NEIGHBOR }] },
        cohorts: [
          { kind: 'grade_band', period: '2026H1', source: 'claimed', n_total: 0, payload: { 내신: { '1-2': 40, '3-4': 35, '5-6': 20, '7-9': 5 } } },
          { kind: 'grade_band', period: '2026H1', source: 'verified', n_total: 8, payload: { 모평: { '1-2': 50, '3-4': 30, '5-6': 15, '7-9': 5 } } },
        ],
      },
      {
        ext_key: 'SEED-A-002',
        name: '샘플 영어독해 학원',
        addr: '서울 강남구 대치동 (샘플)',
        phone: '02-000-0002',
        classes: [{ subject: '영어', target_grades: ['중2', '중3'], level: 'advanced', tuition_krw: 300000, schedule: [{ dow: '목', start: '17:00', end: '19:00' }] }],
        bus: null,
        cohorts: [{ kind: 'school_dist', period: '2026H1', source: 'verified', n_total: 6, payload: [{ school: '○○중', n: 3 }, { school: '△△중', n: 3 }] }],
      },
      {
        ext_key: 'SEED-A-003',
        name: '샘플 국어논술 교습소',
        addr: '서울 강남구 대치동 (샘플)',
        phone: '02-000-0003',
        classes: [{ subject: '국어', target_grades: ['고1', '고2', '고3'], level: 'basic', tuition_krw: 250000, schedule: [{ dow: '금', start: '18:30', end: '20:30' }] }],
        bus: { name: '가선', days: ['화', '목'], stops: [{ seq: 1, name: '대치사거리', dong_code: DONG }] },
        cohorts: [],
      },
    ];

    for (const s of samples) {
      const a = await this.prisma.academy.upsert({
        where: { ext_key: s.ext_key },
        create: { ext_key: s.ext_key, name: s.name, addr: s.addr, dong_code: DONG, phone: s.phone, source: 'public', nearest_station: { name: '대치', line: '분당', walk_min: 5 } },
        update: { name: s.name, updated_at: new Date() },
      });
      // 반: 기존 샘플 반 제거 후 재삽입(idempotent)
      await this.prisma.academy_class.deleteMany({ where: { academy_id: a.id } });
      for (const c of s.classes) {
        await this.prisma.academy_class.create({
          data: { academy_id: a.id, subject: c.subject, target_grades: c.target_grades, level: c.level, tuition_krw: c.tuition_krw, tuition_source: 'declared', schedule: c.schedule },
        });
      }
      // 버스
      await this.prisma.bus_route.deleteMany({ where: { academy_id: a.id } });
      if (s.bus) {
        const r = await this.prisma.bus_route.create({ data: { academy_id: a.id, name: s.bus.name, days: s.bus.days, direction: 'pickup' } });
        for (const st of s.bus.stops) {
          await this.prisma.bus_stop.create({ data: { route_id: r.id, seq: st.seq, name: st.name, dong_code: st.dong_code } });
        }
      }
      // cohort — claimed/verified 라벨 데모(§3). verified 는 n_total>=5.
      for (const cs of s.cohorts) {
        await this.prisma.cohort_stat.upsert({
          where: { academy_id_kind_period_source: { academy_id: a.id, kind: cs.kind, period: cs.period, source: cs.source } },
          create: { academy_id: a.id, kind: cs.kind, period: cs.period, source: cs.source, n_total: cs.n_total, payload_json: cs.payload },
          update: { n_total: cs.n_total, payload_json: cs.payload, updated_at: new Date() },
        });
      }
    }
    this.logger.log(`샘플 시드 완료: ${samples.length}개 학원`);
    return { academies: samples.length };
  }
}
