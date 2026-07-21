import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AcademyService } from './academy.service';
import { PublicSyncService } from './public-sync.service';
import { AcademySearchDto } from './dto/academy-search.dto';

/** 학원찾기 조회 API(/api/v1 관례) — 로그인 전원. 세션 1: 검색·상세. */
@Controller('academies')
export class AcademyController {
  constructor(private readonly academies: AcademyService) {}

  /** GET /academies — 검색(카드 리스트·페이지네이션·provenance). */
  @Get()
  search(@Query() dto: AcademySearchDto) {
    return this.academies.search(dto);
  }

  /** GET /academies/:id — 상세(반·버스·재원생 통계·출처 라벨). */
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.academies.detail(id);
  }
}

/** 운영: 공공데이터 적재·샘플 시드(관리자 전용). 스케줄 잡은 세션 후속. */
@Controller('admin/academies')
export class AcademyAdminController {
  constructor(private readonly sync: PublicSyncService) {}

  /** POST /admin/academies/sync — JANUS_DATA_DIR 공공데이터 적재(idempotent). */
  @Post('sync')
  @Roles('admin')
  syncPublic() {
    return this.sync.syncFromDataDir();
  }

  /** POST /admin/academies/seed-sample — 합성 샘플 시드(완료기준 실측·데모용). */
  @Post('seed-sample')
  @Roles('admin')
  seed() {
    return this.sync.seedSample();
  }
}
