import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { UploadedFileLike } from '../storage/storage.types';
import { ScoresService } from './scores.service';

class ScoreItemDto {
  @IsString() subject!: string;
  @IsOptional() @IsNumber() score?: number | null;
  @IsOptional() @IsNumber() maxScore?: number | null;
  @IsOptional() @IsString() grade?: string | null;
}
class ManualScoreDto {
  @IsOptional() @IsString() studentId?: string;
  @IsOptional() @IsString() studentLoginId?: string;
  @IsString() period!: string;
  @IsOptional() @IsString() examType?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() reportFileId?: string;
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ScoreItemDto)
  items!: ScoreItemDto[];
}
class MyScoreItemDto {
  @IsString() subject!: string;
  @IsOptional() @IsNumber() score?: number | null;
  @IsOptional() @IsNumber() maxScore?: number | null;
  @IsOptional() @IsString() grade?: string | null;
  @IsOptional() @IsString() @MaxLength(30) subSubject?: string | null;
}
class MyScoreDto {
  @IsString() @MaxLength(40) period!: string;
  @IsOptional() @IsString() @MaxLength(20) examType?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  /** 'raw' = 가채점 원점수(O226) — 서버가 환산표로 추정 표준점수를 만든다. */
  @IsIn(['std', 'nb', 'raw']) mode!: 'std' | 'nb' | 'raw';
  @IsOptional() @IsIn(['문과', '이과']) gye?: '문과' | '이과' | null;
  @IsOptional() @IsNumber() @Min(0.01) @Max(99.99) nb?: number | null;
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MyScoreItemDto)
  items!: MyScoreItemDto[];
}
class OcrDto {
  @IsString() fileId!: string;
}
class GapReportDto {
  @IsOptional() @IsIn(['jeongsi', 'susi']) mode?: 'jeongsi' | 'susi'; // 기본 jeongsi
  @IsString() @MaxLength(60) univ!: string;
  @IsString() @MaxLength(60) dept!: string;
  @IsNumber() @Min(0.01) @Max(99.99) cutNb!: number; // 목표 컷 — 정시=전국누백, 수시=내신등급
  @IsOptional() @IsNumber() @Min(1) @Max(9) myGrade?: number; // 수시: 내신 평균등급
  @IsOptional() @IsString() @MaxLength(20) track?: string;
  @IsOptional() @IsString() studentId?: string; // 학부모용
}
class GoalDto {
  @IsString() studentLoginId!: string;
  @IsOptional() @IsString() tier?: string | null;
  @IsOptional() @IsNumber() avg?: number | null;
}
/** 목표 후보 등록 — cut 단위는 mode 에 따름(정시=전국누백% / 수시=내신등급). */
class GoalCandidateDto {
  @IsIn(['jeongsi', 'susi']) mode!: 'jeongsi' | 'susi';
  @IsString() @MaxLength(60) univ!: string;
  @IsString() @MaxLength(60) dept!: string;
  @IsNumber() @Min(0.01) @Max(99.99) cut!: number;
  @IsOptional() @IsString() @MaxLength(20) track?: string | null;
  @IsOptional() @IsString() @MaxLength(200) note?: string | null;
  // 컷 출처 감사(O65) — 배치표 조회값인지 학생 수동 입력인지. 클라이언트 힌트이며 기본은 manual.
  @IsOptional() @IsIn(['targets_file', 'manual']) cutSource?:
    'targets_file' | 'manual';
}

/** 자가목표(janus_goal) — PUT 전체 교체: 미지정 필드는 null 로 초기화된다. */
class MyGoalDto {
  // 목표 라인 어휘는 웹 TIER_OPTIONS·모바일 TIERS 와 동일 6종(정본 밖 문자열이 저장되면 목표 매칭이 무력화된다).
  @IsOptional()
  @IsIn(['최상위', '상위', '중상위', '중위', '중하위', '기초'])
  tier?: string | null;
  // goal_avg 는 Int 컬럼 — 소수를 조용히 절삭하지 않고 400 으로 거부한다.
  @IsOptional() @IsInt() @Min(0) @Max(100) avg?: number | null;
  @IsOptional() @IsString() @MaxLength(60) university?: string | null;
  @IsOptional() @IsString() @MaxLength(60) department?: string | null;
}
class PlacementDto {
  @IsOptional() @IsString() tier?: string;
  @IsOptional() @IsString() line?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) universities?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) departments?: string[];
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsString() source?: string;
}
class ScorePolicyDto {
  @IsOptional() @IsBoolean() student?: boolean;
  @IsOptional() @IsBoolean() guardian?: boolean;
  @IsOptional() @IsBoolean() placement?: boolean;
}

@Controller('admin/scores')
// 화면(`ADMIN_ROUTES` 의 `scores`)이 관리자 전용이다 — 성적은 민감정보이고
// 이 컨트롤러는 목록·추이·목표·정책·export·excel·OCR 을 전부 포함한다(14경로).
// 클래스 레벨이라 HR 이 화면 없이 API 로 전량 조회·내려받기가 가능했다(N37).
@Roles('admin')
export class ScoresController {
  constructor(private readonly scores: ScoresService) {}

  /** GET /admin/scores?period=&studentId= — 성적표 목록. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.scores.list(user, period, studentId);
  }

  /** GET /admin/scores/periods — 기간 목록(필터). */
  @Get('periods')
  periods(@CurrentUser() user: AuthUser) {
    return this.scores.periods(user);
  }

  /** GET /admin/scores/missing?period= — 미업로드 학생. */
  @Get('missing')
  missing(@CurrentUser() user: AuthUser, @Query('period') period: string) {
    return this.scores.missing(user, period);
  }

  /** GET /admin/scores/stats?period= — 성적 통계(대시보드). */
  @Get('stats')
  stats(@CurrentUser() user: AuthUser, @Query('period') period?: string) {
    return this.scores.statistics(user, period);
  }

  /** GET /admin/scores/trend?studentLoginId= — 성적 추이 + 배치 라인 변화. */
  @Get('trend')
  trend(
    @CurrentUser() user: AuthUser,
    @Query('studentLoginId') studentLoginId: string,
  ) {
    return this.scores.trend(user, studentLoginId);
  }

  /** POST /admin/scores/estimate-placements — 데모 배치 추정(기간 일괄). */
  @Post('estimate-placements')
  estimate(@CurrentUser() user: AuthUser, @Body('period') period: string) {
    return this.scores.estimatePlacements(user, period);
  }

  /** POST /admin/scores/:id/placement — 배치 라인 저장(외부 배치표 서비스/관리자). */
  @Post(':id/placement')
  placement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: PlacementDto,
  ) {
    return this.scores.setPlacement(user, id, { ...dto });
  }

  /** POST /admin/scores/goal — 학생 목표(대학 라인/평균) 설정. */
  @Post('goal')
  goal(@CurrentUser() user: AuthUser, @Body() dto: GoalDto) {
    return this.scores.setGoal(
      user,
      dto.studentLoginId,
      dto.tier ?? null,
      dto.avg ?? null,
    );
  }

  /** GET /admin/scores/export?period= — 성적 CSV 내보내기. */
  @Get('export')
  async exportCsv(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('period') period?: string,
  ) {
    const csv = await this.scores.exportCsv(user, period);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    // 파일명은 ASCII(헤더 제약), 한글 기간은 RFC5987 filename* 로 전달
    const fn = encodeURIComponent(`scores-${period ?? 'all'}.csv`);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="scores.csv"; filename*=UTF-8''${fn}`,
    );
    res.send(csv);
  }

  /** GET /admin/scores/template — 업로드용 엑셀 템플릿 다운로드. */
  @Get('template')
  template(@Res() res: Response) {
    const buf = this.scores.template();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="score-template.xlsx"',
    );
    res.send(buf);
  }

  /** POST /admin/scores/manual — 수동 입력. */
  @Post('manual')
  manual(@CurrentUser() user: AuthUser, @Body() dto: ManualScoreDto) {
    return this.scores.createManual(user, dto);
  }

  /** POST /admin/scores/excel — 엑셀 일괄 업로드. */
  @Post('excel')
  @UseInterceptors(FileInterceptor('file'))
  excel(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedFileLike) {
    return this.scores.bulkExcel(user, file.buffer);
  }

  /** POST /admin/scores/ocr — 성적표 이미지 OCR(프리필). */
  @Post('ocr')
  ocr(@CurrentUser() user: AuthUser, @Body() dto: OcrDto) {
    return this.scores.ocr(user, dto.fileId);
  }

  /** GET /admin/scores/policy — 노출 정책 조회(관리자/HR). */
  @Get('policy')
  getPolicy() {
    return this.scores.getScorePolicy();
  }

  /** PUT /admin/scores/policy — 노출 정책 변경(본사 마스터만, 서비스에서 가드). */
  @Put('policy')
  setPolicy(@CurrentUser() user: AuthUser, @Body() dto: ScorePolicyDto) {
    return this.scores.setScorePolicy(user, dto);
  }
}

/** 학생·학부모용 성적 조회(정책 게이트). */
@Controller()
export class ScoresMeController {
  constructor(private readonly scores: ScoresService) {}

  /** GET /me/scores/access — 성적 탭 노출 여부(학생·학부모). */
  @Get('me/scores/access')
  @Roles('student', 'guardian')
  access(@CurrentUser() user: AuthUser) {
    return this.scores.access(user);
  }

  /** GET /me/scores/trend — 학생 본인 성적·배치 추이. */
  @Get('me/scores/trend')
  @Roles('student')
  selfTrend(@CurrentUser() user: AuthUser) {
    return this.scores.selfTrend(user);
  }

  /** GET /scores/me — 내 수능 성적 자가 입력 프리필(학생). */
  @Get('scores/me')
  @Roles('student')
  myScore(@CurrentUser() user: AuthUser) {
    return this.scores.myScore(user);
  }

  /** POST /scores/me — 내 수능 성적 자가 입력·저장(학생) → 배치표·격차 자동 반영(C1 단일소스). */
  @Post('scores/me')
  @Roles('student')
  saveMyScore(@CurrentUser() user: AuthUser, @Body() dto: MyScoreDto) {
    return this.scores.saveMyScore(user, {
      period: dto.period,
      examType: dto.examType,
      note: dto.note,
      mode: dto.mode,
      gye: dto.gye ?? null,
      nb: dto.nb ?? null,
      items: dto.items,
    });
  }

  /** GET /me/goal — 학생 본인 목표(janus_goal) 조회. */
  @Get('me/goal')
  @Roles('student')
  myGoal(@CurrentUser() user: AuthUser) {
    return this.scores.getMyGoal(user);
  }

  /** PUT /me/goal — 학생 본인 목표 설정(대학·학과·라인·평균). 자가목표 → 격차 리포트·할 일 자동제안 반영. */
  @Put('me/goal')
  @Roles('student')
  setMyGoal(@CurrentUser() user: AuthUser, @Body() dto: MyGoalDto) {
    return this.scores.setMyGoal(user, {
      tier: dto.tier ?? null,
      avg: dto.avg ?? null,
      university: dto.university ?? null,
      department: dto.department ?? null,
    });
  }

  /**
   * GET /me/reports — 내 산출물 이력(janus_report, 최신순). 기본 kind=gap.
   * '무엇을 언제 산출해 보여줬나'의 재현용 — 학생 본인만(학부모·선생님 열람은 별도 게이트 설계 후).
   */
  @Get('me/reports')
  @Roles('student')
  myReports(
    @CurrentUser() user: AuthUser,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit != null && limit !== '' ? Number(limit) : 20;
    return this.scores.listMyReports(
      user,
      kind === 'diagnosis' || kind === 'weekly' ? kind : 'gap',
      Number.isFinite(n) ? n : 20,
    );
  }

  /** GET /me/goal/candidates — 목표 후보 목록. ?mode= 로 정시/수시 필터. */
  @Get('me/goal/candidates')
  @Roles('student')
  goalCandidates(
    @CurrentUser() user: AuthUser,
    @Query('mode') mode?: 'jeongsi' | 'susi',
  ) {
    return this.scores.listGoalCandidates(
      user,
      mode === 'susi' || mode === 'jeongsi' ? mode : undefined,
    );
  }

  /**
   * GET /me/goal/candidates/report — 후보별 밴드·격차 비교(같은 내 성적 기준) + 회차 변동 폭.
   * 수시는 ?myGrade= 필요(내신 평균등급). 정시는 janus_score.nb 사용.
   */
  @Get('me/goal/candidates/report')
  @Roles('student')
  goalCandidateReport(
    @CurrentUser() user: AuthUser,
    @Query('mode') mode?: string,
    @Query('myGrade') myGrade?: string,
  ) {
    const m = mode === 'susi' ? 'susi' : 'jeongsi';
    const g = myGrade != null && myGrade !== '' ? Number(myGrade) : undefined;
    // 쿼리 파라미터는 DTO 검증을 타지 않는다 — GapReportDto(@Min(1) @Max(9))와 같은 범위를 여기서 직접 막는다.
    // 범위를 안 막으면 등급 0·50 이 그대로 밴드 판정에 들어가 격차·뒤집힘이 무의미한 값으로 나온다.
    if (g !== undefined && (!Number.isFinite(g) || g < 1 || g > 9)) {
      throw new BadRequestException({
        code: 'BAD_GRADE',
        message: '내신 평균등급은 1~9 사이여야 합니다.',
      });
    }
    return this.scores.goalCandidateReport(user, m, g);
  }

  /** POST /me/goal/candidates — 목표 후보 추가(학생 직접 등록). */
  @Post('me/goal/candidates')
  @Roles('student')
  addGoalCandidate(
    @CurrentUser() user: AuthUser,
    @Body() dto: GoalCandidateDto,
  ) {
    return this.scores.addGoalCandidate(user, dto);
  }

  /** DELETE /me/goal/candidates/{id} — 목표 후보 삭제. */
  @Delete('me/goal/candidates/:id')
  @Roles('student')
  removeGoalCandidate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.scores.removeGoalCandidate(user, id);
  }

  /** GET /scores/janus-score — 배치표 자동연동 export(O43·접합계약 C1). guardian 은 ?studentId=. */
  @Get('scores/janus-score')
  @Roles('student', 'guardian')
  janusScore(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId?: string,
  ) {
    return this.scores.janusScore(user, studentId);
  }

  /** POST /scores/gap-report — 격차 리포트(janus_report v1·C5). 내 성적(nb)+목표 컷 → 격차·근거·처방. */
  @Post('scores/gap-report')
  @Roles('student', 'guardian')
  gapReport(@CurrentUser() user: AuthUser, @Body() dto: GapReportDto) {
    return this.scores.gapReport(user, {
      mode: dto.mode ?? 'jeongsi',
      univ: dto.univ,
      dept: dto.dept,
      cut: dto.cutNb,
      track: dto.track,
      myGrade: dto.myGrade,
      studentId: dto.studentId,
    });
  }

  /**
   * GET /guardian/reports?studentId=&kind=&limit= — 자녀 산출물 이력(보호자).
   * 연령별 동의 게이트(O105): 미성년=보호자 본인확인+전달동의 / 성인=학생 본인의 공유 동의. 미충족 403.
   */
  @Get('guardian/reports')
  @Roles('guardian')
  childReports(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId?: string,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
  ) {
    if (!studentId) throw new BadRequestException('studentId 가 필요합니다.');
    const n = limit != null && limit !== '' ? Number(limit) : 20;
    return this.scores.listChildReports(
      user,
      studentId,
      kind === 'diagnosis' || kind === 'weekly' ? kind : 'gap',
      Number.isFinite(n) ? n : 20,
    );
  }

  /** GET /guardian/scores/trend?studentId= — 학부모 자녀 성적·배치 추이. */
  @Get('guardian/scores/trend')
  @Roles('guardian')
  guardianTrend(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId: string,
  ) {
    return this.scores.guardianTrend(user, studentId);
  }

  /**
   * GET /teacher/reports?studentId=&kind=&limit= — 학생 산출물 이력(선생님).
   * 관계 게이트(O107): 담임이거나 상담 이력이 있는 학생만. 미충족 403(NO_TEACHING_RELATION).
   */
  @Get('teacher/reports')
  @Roles('teacher')
  teacherReports(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId?: string,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
  ) {
    if (!studentId) throw new BadRequestException('studentId 가 필요합니다.');
    const n = limit != null && limit !== '' ? Number(limit) : 20;
    return this.scores.listStudentReportsForTeacher(
      user,
      studentId,
      kind === 'diagnosis' || kind === 'weekly' ? kind : 'gap',
      Number.isFinite(n) ? n : 20,
    );
  }

  /** GET /teacher/scores/trend?studentId= — 선생님 학생 추이(관계 게이트 O107 + 배치는 전사 정책). */
  @Get('teacher/scores/trend')
  @Roles('teacher')
  teacherTrend(
    @CurrentUser() user: AuthUser,
    @Query('studentId') studentId: string,
  ) {
    return this.scores.teacherTrend(user, studentId);
  }
}
