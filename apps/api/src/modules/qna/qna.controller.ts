import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccountRole } from '../../config/enums';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { QnaService } from './qna.service';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qna.dto';

class QnaFeedbackDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsBoolean() continuePref?: boolean;
}
class QnaBlockDto {
  @IsUUID() teacherId!: string;
  @IsBoolean() blocked!: boolean;
}
class QnaReanswerDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
class CommunityQuestionDto {
  @IsOptional() @IsString() @MaxLength(60) subject?: string;
  @IsOptional() @IsString() @MaxLength(20) difficulty?: string;
  @IsString() @MaxLength(4000) body!: string;
}
class CommunityAnswerDto {
  @IsString() @MaxLength(4000) body!: string;
}
// N33 축 A(신뢰) — 자기신고 자격.
class AnswererCredentialDto {
  @IsString() @MaxLength(40) subject!: string;
  @IsOptional() @IsString() @MaxLength(60) claimedGrade?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
// N33 축 B(능력) — 답변 재평가(축별 1~5).
class AnswerRatingItemDto {
  @IsIn(['accuracy', 'kindness', 'logic', 'speed', 'level']) axis!: string;
  @IsInt() @Min(1) @Max(5) score!: number;
}
class RateAnswerDto {
  @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => AnswerRatingItemDto) ratings!: AnswerRatingItemDto[];
}
class QnaReportDto {
  @IsString() targetType!: 'post' | 'answer';
  @IsUUID() targetId!: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
class TierRuleDto {
  @IsInt() @Min(0) minAuthored!: number;
  @IsInt() @Min(0) minAccepted!: number;
  @IsInt() @Min(0) @Max(100) minRate!: number;
}
class LeaguePolicyDto {
  @ValidateNested() @Type(() => TierRuleDto) promote2!: TierRuleDto;
  @ValidateNested() @Type(() => TierRuleDto) promote1!: TierRuleDto;
}

@Controller('qna')
export class QnaController {
  constructor(private readonly qna: QnaService) {}

  /** POST /qna/posts — 질문 등록(학생, 건당 과금). */
  @Post('posts')
  @Roles('student')
  create(@Body() dto: CreateQuestionDto, @CurrentUser() user: AuthUser) {
    return this.qna.createQuestion(user, dto);
  }

  /** POST /qna/posts/:id/request-teacher — P2: AI 1층 → 선생님 답변 요청(이 시점 과금·노출). */
  @Post('posts/:id/request-teacher')
  @Roles('student')
  requestTeacher(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.qna.escalateToHuman(user, id);
  }

  /** POST /qna/posts/:id/resolve-ai — P2: AI 답으로 충분(해결 종료, 과금 없음). */
  @Post('posts/:id/resolve-ai')
  @Roles('student')
  resolveAi(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.qna.resolveWithAi(user, id);
  }

  /** POST /qna/similar — P3: 작성 중 질문과 유사한 해결 질문 상위 3건. */
  @Post('similar')
  @Roles('student')
  similar(@Body() dto: { subject?: string | null; body: string }, @CurrentUser() user: AuthUser) {
    return this.qna.findSimilar(user, { subject: dto?.subject ?? null, body: String(dto?.body ?? '') });
  }

  /** GET /qna/similar/:id — P3: 유사 질문 익명 열람(해결 건·첨부 제외). */
  @Get('similar/:id')
  @Roles('student')
  similarDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.qna.similarDetail(user, id);
  }

  /** GET /qna/posts — 역할별 목록. */
  /** GET /qna/pricing — 질문 건당 요금(문항/일반) 안내(학생). 난이도별 답변블록 시간은 /bookings/question-duration/policy. */
  @Get('pricing')
  @Roles('student')
  pricing(@CurrentUser() user: AuthUser) {
    return this.qna.pricingInfo(user.centerId ?? null, user.role === AccountRole.STUDENT ? user.id : undefined);
  }

  /** GET /qna/attention — 선생님 대기 배지(공개 큐 미클레임 + 내가 맡은 미답변). */
  @Get('attention')
  @Roles('teacher')
  attention(@CurrentUser() user: AuthUser) {
    return this.qna.qnaAttention(user);
  }

  /** GET /qna/tickets — B1 보유 질문권 잔여 + 판매 묶음(학생). */
  @Get('tickets')
  @Roles('student')
  tickets(@CurrentUser() user: AuthUser) {
    return this.qna.ticketInfo(user);
  }

  /** POST /qna/tickets/purchase — B1 묶음 구매(크레딧 차감, 부족 시 402). */
  @Post('tickets/purchase')
  @Roles('student')
  purchaseTickets(@Body() dto: { count: number }, @CurrentUser() user: AuthUser) {
    return this.qna.purchaseTickets(user, Number(dto?.count ?? 0));
  }

  @Get('posts')
  list(@CurrentUser() user: AuthUser) {
    return this.qna.listPosts(user);
  }

  /** POST /qna/posts/{id}/claim — 공개질문 가져오기(교사, 선착순 배정). */
  @Post('posts/:id/claim')
  @Roles('teacher')
  claim(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.qna.claim(id, user);
  }

  /** POST /qna/posts/{id}/answers — 답변(교사, §5-9 게이트). */
  @Post('posts/:id/answers')
  @Roles('teacher')
  answer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAnswerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.qna.answer(id, dto, user);
  }

  /** PATCH /qna/answers/{id}/accept — 답변 채택(질문 학생). */
  @Patch('answers/:id/accept')
  @Roles('student')
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.qna.acceptAnswer(id, user);
  }

  /** POST /qna/posts/{id}/feedback — 해결 만족도+계속 여부(학생·Q1). continue=false 면 소프트 블록. */
  @Post('posts/:id/feedback')
  @Roles('student')
  feedback(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QnaFeedbackDto, @CurrentUser() user: AuthUser) {
    return this.qna.feedback(user, id, dto);
  }

  /** POST /qna/posts/{id}/reanswer — 재답변 요청(학생·불만족). 이전 답변자 제외 후 재공개. */
  @Post('posts/:id/reanswer')
  @Roles('student')
  reanswer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: QnaReanswerDto, @CurrentUser() user: AuthUser) {
    return this.qna.requestReanswer(user, id, dto.reason);
  }

  /** POST /qna/posts/{id}/escalate — 상담 승격(학생). 답변 선생님과 상담 예약 생성(컨텍스트 이관). */
  /** body 없이 호출 = 후보 시간대 제시, {dateStr, slotStart} 포함 = 그 시간으로 예약 확정. */
  @Post('posts/:id/escalate')
  @Roles('student')
  escalate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() body?: { dateStr?: string; slotStart?: number }) {
    const pick = body?.dateStr && typeof body?.slotStart === 'number' ? { dateStr: body.dateStr, slotStart: body.slotStart } : undefined;
    return this.qna.escalate(user, id, pick);
  }

  /** POST /qna/blocks — 선생님 소프트 블록 설정/해제(학생·Q1). */
  @Post('blocks')
  @Roles('student')
  setBlock(@Body() dto: QnaBlockDto, @CurrentUser() user: AuthUser) {
    return this.qna.setBlock(user, dto.teacherId, dto.blocked);
  }

  /** GET /qna/blocks — 내 소프트 블록 목록(학생). */
  @Get('blocks')
  @Roles('student')
  myBlocks(@CurrentUser() user: AuthUser) {
    return this.qna.myBlocks(user);
  }

  /** POST /qna/answers/{id}/followups — 후속 문답(이어 묻기/이어 답하기·C2). */
  @Post('answers/:id/followups')
  followup(@Param('id', ParseUUIDPipe) id: string, @Body() dto: { body: string }, @CurrentUser() user: AuthUser) {
    return this.qna.addFollowup(user, id, dto.body ?? '');
  }

  /** POST /qna/favorites — F2 찜 토글(리스트 상단 고정·"계속 받을게요" 자동 찜과 동일 원장). */
  @Post('favorites')
  @Roles('student')
  favorite(@Body() dto: { teacherId: string; favored: boolean }, @CurrentUser() user: AuthUser) {
    return this.qna.setFavorite(user, String(dto?.teacherId ?? ''), !!dto?.favored);
  }

  /** GET /qna/teachers — 지정 질문용 선생님 디렉터리 + 공개 SLA 배지(학생·P5). */
  @Get('teachers')
  teachers(@CurrentUser() user: AuthUser) {
    return this.qna.teacherDirectory(user);
  }

  /** GET /qna/my-open — 진행 중인 내 질문 요약(학생 홈 위젯·P5). */
  @Get('my-open')
  myOpen(@CurrentUser() user: AuthUser) {
    return this.qna.myOpenQuestions(user);
  }

  /** GET /qna/sla — 풀별 SLA 집계(admin/hr·Q1). */
  @Get('sla')
  @Roles('admin', 'hr')
  sla(@CurrentUser() user: AuthUser) {
    return this.qna.sla(user);
  }

  /** POST /qna/assign/sweep — 강제배정 스윕 수동 트리거(admin). 방치 클레임 재개방 + 공개질문 강제배정. */
  @Post('assign/sweep')
  @Roles('admin', 'hr')
  sweep() {
    return this.qna.sweep();
  }

  // ── Q3 커뮤니티(3부 공개 게시판) ───────────────────────────────────────
  /** POST /qna/community — 커뮤니티 질문 등록(학생·무료·일 3건). */
  @Post('community')
  @Roles('student')
  communityCreate(@Body() dto: CommunityQuestionDto, @CurrentUser() user: AuthUser) {
    return this.qna.createCommunityQuestion(user, dto);
  }

  /** GET /qna/community — 커뮤니티 목록(로그인 전원). ?filter=unanswered·?subject=·?q= */
  @Get('community')
  communityList(@CurrentUser() user: AuthUser, @Query('filter') filter?: string, @Query('subject') subject?: string, @Query('q') q?: string) {
    return this.qna.listCommunity(user, { filter: filter === 'unanswered' ? 'unanswered' : undefined, subject: subject || undefined, q: q || undefined });
  }

  /** GET /qna/community/stats — 내 커뮤니티 실적(답변·채택·채택률). */
  @Get('community/stats')
  communityStats(@CurrentUser() user: AuthUser) {
    return this.qna.communityStats(user);
  }

  /** GET /qna/community/subject-stats — 내 과목별 실적(N33 과목 오각형 원천). */
  @Get('community/subject-stats')
  subjectStats(@CurrentUser() user: AuthUser) {
    return this.qna.answererSubjectStats(user);
  }

  /** PUT /qna/community/my-credentials — 내 자기신고 자격 upsert(N33 축 A). */
  @Put('community/my-credentials')
  upsertCredential(@Body() dto: AnswererCredentialDto, @CurrentUser() user: AuthUser) {
    return this.qna.upsertMyCredential(user, dto);
  }

  /** GET /qna/community/credentials/me — 내 자격 목록(배지 포함). */
  @Get('community/credentials/me')
  myCredentials(@CurrentUser() user: AuthUser) {
    return this.qna.listCredentials(user);
  }

  /** DELETE /qna/community/my-credentials?subject= — 내 자격 삭제(과목). */
  @Delete('community/my-credentials')
  deleteCredential(@Query('subject') subject: string, @CurrentUser() user: AuthUser) {
    return this.qna.deleteMyCredential(user, subject ?? '');
  }

  /** GET /qna/community/axis-stats — 내 설명방식 오각형(N33 축 B, 표본 게이트). */
  @Get('community/axis-stats')
  axisStats(@CurrentUser() user: AuthUser) {
    return this.qna.answererAxisStats(user);
  }

  /** POST /qna/community/answers/{id}/rate — 답변 재평가(질문자, 축별 1~5). */
  @Post('community/answers/:id/rate')
  rateAnswer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RateAnswerDto, @CurrentUser() user: AuthUser) {
    return this.qna.rateAnswer(user, id, dto.ratings);
  }

  /** GET /qna/community/{id} — 커뮤니티 상세(질문·AI 초안·답변). */
  @Get('community/:id')
  communityGet(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.qna.getCommunity(user, id);
  }

  /** POST /qna/community/{id}/answers — 커뮤니티 답변(로그인 전원·무정산). */
  @Post('community/:id/answers')
  communityAnswer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CommunityAnswerDto, @CurrentUser() user: AuthUser) {
    return this.qna.answerCommunity(user, id, dto.body);
  }

  /** PATCH /qna/community/answers/{id}/accept — 커뮤니티 답변 채택(질문 학생·단일). */
  @Patch('community/answers/:id/accept')
  @Roles('student')
  communityAccept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.qna.acceptCommunityAnswer(user, id);
  }

  /** PATCH /qna/community/answers/{id} — 내 커뮤니티 답변 수정(채택·마감 전). */
  @Patch('community/answers/:id')
  communityEditAnswer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CommunityAnswerDto, @CurrentUser() user: AuthUser) {
    return this.qna.editCommunityAnswer(user, id, dto.body);
  }

  /** POST /qna/report — 신고(로그인 전원·대상별 1회·누적 3건 숨김). */
  @Post('report')
  report(@Body() dto: QnaReportDto, @CurrentUser() user: AuthUser) {
    return this.qna.reportContent(user, dto);
  }

  // ── Q3 리그(3부→2부→1부) ─────────────────────────────────────────────
  /** GET /qna/league/me — 내 리그 등급·진행도(로그인 전원). */
  @Get('league/me')
  leagueMe(@CurrentUser() user: AuthUser) {
    return this.qna.myLeague(user);
  }

  /** GET /qna/league/leaderboard — 상위 리그 리더보드(로그인 전원). */
  @Get('league/leaderboard')
  leaderboard() {
    return this.qna.leaderboard();
  }

  /** GET /qna/league/rules — 전체 티어 승급 요건(규칙 안내 페이지, 로그인 전원). */
  @Get('league/rules')
  leagueRules() {
    return this.qna.leagueRules();
  }

  /** GET /qna/league/policy — 승급 정책값(admin/hr). */
  @Get('league/policy')
  @Roles('admin', 'hr')
  leaguePolicy() {
    return this.qna.getLeaguePolicy();
  }

  /** PUT /qna/league/policy — 승급 정책 설정(admin/hr·N27 조정). */
  @Put('league/policy')
  @Roles('admin', 'hr')
  setLeaguePolicy(@Body() dto: LeaguePolicyDto) {
    return this.qna.setLeaguePolicy(dto);
  }
}
