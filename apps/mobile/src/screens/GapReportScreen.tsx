import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI } from '../theme';
import { type Trend } from './ScoreTrendView';
import { GapReportView, type Rx } from './GapReportView';
import { computeGapModel, summarizeReport, REL_TIER_LABEL, BAND_COLOR, type JanusReportRow } from '../lib/gap';

/**
 * 격차 리포트(학생 본인) — 진단 탭 하위.
 *
 * 두 층을 함께 보여준다(단위가 달라 합칠 수 없다 — `lib/gap.ts` 타입 주석 참조):
 *   · 전략층 — 서버 산출물 `GET /me/reports?kind=gap&limit=1`(목표 학과 컷 대비 누백·등급, C5 근거)
 *   · 실행층 — `/me/scores/trend` 로 계산한 과목별 격차 바
 *
 * ⚠ 2026-07-30 이전에는 `GET /me/reports/gap` 을 불렀다 — **트렁크에 없는 경로**였고 실패가
 * 조용히 삼켜져 전략층이 한 번도 뜨지 않았다. 서버 산출물은 웹 '목표 대학 격차'에서
 * `POST /scores/gap-report` 로 만들어져 이력에 쌓인다. 이력이 비어 있으면(아직 만든 적 없음)
 * 전략층 카드는 생략하고 실행층만 보여준다 — 그건 정상이지 실패가 아니다.
 */
export function GapReportScreen({ onBack, showPlacement, goTab, backLabel = '‹ 진단' }: { onBack: () => void; showPlacement: boolean; goTab?: (t: string) => void; backLabel?: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const [trend, setTrend] = useState<Trend | null | undefined>(undefined); // undefined=로딩, null=실패(정책 OFF·오류)
  const [report, setReport] = useState<JanusReportRow | null | undefined>(undefined); // undefined=로딩, null=이력 없음
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Trend>('/me/scores/trend').then(setTrend).catch((e) => { setError(e instanceof ApiError ? e.message : '조회 실패'); setTrend(null); });
    api.get<JanusReportRow[]>('/me/reports?kind=gap&limit=1')
      .then((rows) => setReport(Array.isArray(rows) && rows[0]?.payload ? rows[0] : null))
      .catch(() => setReport(null));
  }, []);

  const summary = useMemo(() => (report ? summarizeReport(report.payload) : null), [report]);

  const prescriptions = useMemo<Rx[]>(() => {
    /* 서버 처방(`prescription.actions`)은 쓰지 않는다 — `to` 가 웹 공개 라우트(`/services`·`/placement`·
       `/consulting/apply`)라 모바일에 대응 화면이 없다. 억지로 비슷한 탭에 연결하면 이번에 고친 검색
       오연결과 같은 실수가 된다. 헤드라인만 위 카드에 싣고, 이동은 앱에 실제로 있는 화면으로만 건다. */
    const m = computeGapModel(trend ?? null);
    const cards: Rx[] = [];
    if (m?.weakest) {
      cards.push({ title: '이 격차, 이렇게 좁혀요', desc: `${m.weakest.subject} 격차 ${m.weakest.gap}점 — 이 과목 전문 선생님과 1:1로 좁혀요.`, cta: '선생님 매칭 보기', gold: true, onPress: () => goTab?.('a') });
    } else if (m && m.overallGap != null && m.overallGap > 0) {
      cards.push({ title: '이 격차, 이렇게 좁혀요', desc: `목표까지 평균 ${m.overallGap}점 — 진단 상담으로 전략을 잡아요.`, cta: '선생님 찾기', gold: true, onPress: () => goTab?.('a') });
    } else {
      cards.push({ title: '목표를 정하고 격차를 확인해요', desc: '목표 대학·평균을 설정하면 과목별 격차가 보여요. 상담으로 목표를 잡아요.', cta: '선생님 찾기', gold: true, onPress: () => goTab?.('a') });
    }
    cards.push({ title: '막히는 문제부터', desc: '지금 안 풀리는 문제를 올리면 선생님이 풀이로 답해요.', cta: '질문 올리기', onPress: () => goTab?.('c') });
    return cards;
  }, [trend, goTab]);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: C.teal, fontWeight: '700', marginBottom: 8 }}>{backLabel}</Text></TouchableOpacity>
      <Text style={ui.h}>격차 리포트</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>지금 위치에서 목표까지, 얼마나 남았고 무엇부터 좁힐지 한눈에 봐요.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {/* 전략층 — 서버 산출물이 있을 때만. 없으면 카드 자체를 생략한다(빈 카드는 오류로 읽힌다). */}
      {summary && report && (
        <View style={[ui.card, { marginBottom: SP.md }]}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, marginBottom: 6 }}>목표 대학 격차 · 서버 산출</Text>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: C.ink }}>🎯 {summary.goal}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {summary.band && (
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff', backgroundColor: BAND_COLOR[summary.band], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>
                {summary.band}
              </Text>
            )}
            <Text style={ui.sub}>
              {summary.unit.label} {summary.myValue}{summary.unit.suffix} · 목표 컷 {summary.cut}{summary.unit.suffix}
            </Text>
          </View>
          <Text style={[ui.sub, { marginTop: 8 }]}>{summary.message}</Text>
          {summary.volatility ? <Text style={[ui.sub, { marginTop: 6 }]}>※ {summary.volatility}</Text> : null}
          {/* C5 — 근거는 신뢰도(실측·다년·추정)와 함께가 아니면 싣지 않는다. */}
          {summary.evidence.slice(0, 3).map((e) => (
            <Text key={e.claim} style={[ui.sub, { marginTop: 6, fontSize: 12 }]}>
              · {e.claim} <Text style={{ color: C.muted }}>({REL_TIER_LABEL[e.relTier] ?? e.relTier} · {e.source})</Text>
            </Text>
          ))}
          <Text style={[ui.sub, { marginTop: 8, fontSize: 12 }]}>
            {new Date(report.created_at).toLocaleDateString('ko-KR')} 산출 · 새로 만들려면 웹의 [목표 대학 격차]에서 목표를 다시 적용하세요.
          </Text>
        </View>
      )}

      {trend === undefined ? <Text style={ui.sub}>불러오는 중…</Text> : trend ? (
        <GapReportView trend={trend} showPlacement={showPlacement} prescriptions={prescriptions} />
      ) : (
        /* ⚠ 이전엔 여기서 **아무것도 렌더하지 않았다** — 성적이 없으면 화면이 통째로 비어 막다른 길이었다. */
        <View style={ui.card}>
          <Text style={ui.sub}>
            아직 성적이 없어서 격차를 계산할 수 없어요. [진단] 탭의 [성적진단]에서 한 번 입력하면
            이 화면과 과목별 격차·할 일이 모두 채워져요.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
