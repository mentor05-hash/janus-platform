import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 간이 전환 계측(W3) — 자체 로그 테이블 funnel_event.
 * 핵심 지표: 배치표(page=baechi) → 상담 CTA(cta=consult-reserve) 전환율(C3).
 * 외부 애널리틱스 도입 여부는 추후 [DEC] — 그 전까지 이 테이블이 유일 소스.
 */
@Injectable()
export class FunnelService {
  constructor(private readonly prisma: PrismaService) {}

  async record(dto: { page: string; event: 'view' | 'cta'; cta?: string; sessionId?: string; meta?: Record<string, unknown> }) {
    await this.prisma.funnel_event.create({
      data: {
        page: dto.page,
        event: dto.event,
        cta: dto.cta ?? null,
        session_id: dto.sessionId ?? null,
        meta: (dto.meta ?? undefined) as object | undefined,
      },
    });
    return { ok: true };
  }

  async summary(days: number) {
    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 90) * 86400_000);
    const rows = await this.prisma.funnel_event.groupBy({
      by: ['page', 'event', 'cta'],
      where: { created_at: { gte: since } },
      _count: { _all: true },
    });
    const count = (page: string, event: string, cta?: string) =>
      rows.find((r) => r.page === page && r.event === event && (cta ? r.cta === cta : true))?._count._all ?? 0;
    // 세션 기준 전환율(중복 클릭 보정): baechi view 세션 수 대비 consult-reserve 클릭 세션 수
    const [viewSessions, ctaSessions] = await Promise.all([
      this.prisma.funnel_event.findMany({ where: { created_at: { gte: since }, page: 'baechi', event: 'view', session_id: { not: null } }, distinct: ['session_id'], select: { session_id: true } }),
      this.prisma.funnel_event.findMany({ where: { created_at: { gte: since }, page: 'baechi', event: 'cta', cta: 'consult-reserve', session_id: { not: null } }, distinct: ['session_id'], select: { session_id: true } }),
    ]);
    const conversion = viewSessions.length ? Math.round((ctaSessions.length / viewSessions.length) * 1000) / 10 : null;

    // 학원찾기 검색→리드 전환(세션6 접합) — page='academy' view 세션 대비 cta='lead' 세션.
    const [acadViewSessions, acadLeadSessions] = await Promise.all([
      this.prisma.funnel_event.findMany({ where: { created_at: { gte: since }, page: 'academy', event: 'view', session_id: { not: null } }, distinct: ['session_id'], select: { session_id: true } }),
      this.prisma.funnel_event.findMany({ where: { created_at: { gte: since }, page: 'academy', event: 'cta', cta: 'lead', session_id: { not: null } }, distinct: ['session_id'], select: { session_id: true } }),
    ]);
    const acadConversion = acadViewSessions.length ? Math.round((acadLeadSessions.length / acadViewSessions.length) * 1000) / 10 : null;

    return {
      since: since.toISOString(),
      rows: rows.map((r) => ({ page: r.page, event: r.event, cta: r.cta, count: r._count._all })),
      baechi: {
        views: count('baechi', 'view'),
        consultClicks: count('baechi', 'cta', 'consult-reserve'),
        viewSessions: viewSessions.length,
        ctaSessions: ctaSessions.length,
        conversionPct: conversion, // 세션 기준 %
      },
      academy: {
        searches: count('academy', 'view'),
        leadClicks: count('academy', 'cta', 'lead'),
        viewSessions: acadViewSessions.length,
        leadSessions: acadLeadSessions.length,
        conversionPct: acadConversion, // 검색→리드 전환 %(세션 기준)
      },
    };
  }
}
