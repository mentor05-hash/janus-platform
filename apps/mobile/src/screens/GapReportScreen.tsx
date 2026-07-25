import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI } from '../theme';
import { type Trend } from './ScoreTrendView';
import { GapReportView, type Rx } from './GapReportView';
import { computeGapModel, modelFromPayload, type GapModel, type GapPayload } from '../lib/gap';

/**
 * 격차 리포트(학생 본인) — 마이 탭 하위.
 * 서버 표준 산출물(/me/reports/gap, janus_report kind=gap)을 우선 소비(서버 이력 저장 포함).
 * 없으면 /me/scores/trend 로 클라 계산 폴백(동일 산식). 처방 CTA는 상위 탭으로 이동(goTab).
 * ⚠ 현재 트렁크에는 /me/reports/gap 미구현 — O102 에서 janus_report 이력 영속을 실수요(상담·학부모주간)
 *   확인 후로 보류했다. 따라서 지금은 폴백(클라 계산)이 정상 경로이고, 이력 엔드포인트가 생기면 자동 승격된다.
 */
export function GapReportScreen({ onBack, showPlacement, goTab }: { onBack: () => void; showPlacement: boolean; goTab?: (t: string) => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const [trend, setTrend] = useState<Trend | null | undefined>(undefined); // undefined=로딩, null=실패(정책 OFF·오류)
  const [report, setReport] = useState<GapPayload | null | undefined>(undefined); // undefined=로딩, null=폴백
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Trend>('/me/scores/trend').then(setTrend).catch((e) => { setError(e instanceof ApiError ? e.message : '조회 실패'); setTrend(null); });
    api.get<{ report: GapPayload }>('/me/reports/gap').then((r) => setReport(r.report)).catch(() => setReport(null));
  }, []);

  // 서버 payload → 모델(추세 최신점은 차트·배치 표시용으로 trend 에서 보완). 없으면 undefined → 뷰가 trend 로 폴백.
  const model = useMemo<GapModel | undefined>(() => {
    if (report && report.period) return modelFromPayload(report, trend?.points[trend.points.length - 1]);
    return undefined;
  }, [report, trend]);

  const prescriptions = useMemo<Rx[]>(() => {
    // 서버 처방 우선 — service 를 모바일 탭으로 매핑.
    if (report && report.prescriptions.length) {
      const toTab = (svc: string): (() => void) | undefined =>
        svc === 'tutoring' || svc === 'consult' ? () => goTab?.('a') : svc === 'qna' ? () => goTab?.('c') : onBack;
      return report.prescriptions.map((p) => ({ title: p.title, desc: p.description, cta: p.ctaLabel, gold: !!p.primary, onPress: toTab(p.service) }));
    }
    // 폴백: 규칙 기반
    const m = model ?? computeGapModel(trend ?? null);
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
  }, [report, model, trend, goTab, onBack]);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: C.teal, fontWeight: '700', marginBottom: 8 }}>‹ 마이</Text></TouchableOpacity>
      <Text style={ui.h}>격차 리포트</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>지금 위치에서 목표까지, 얼마나 남았고 무엇부터 좁힐지 한눈에 봐요.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {trend === undefined ? <Text style={ui.sub}>불러오는 중…</Text> : trend ? (
        <GapReportView trend={trend} showPlacement={showPlacement} prescriptions={prescriptions} model={model} />
      ) : (
        /* ⚠ 이전엔 여기서 **아무것도 렌더하지 않았다** — 성적이 없으면 화면이 통째로 비어 막다른 길이었다.
           모바일에는 아직 성적 입력 화면이 없어(웹 전용) 이 상태에 갇히기 쉬우므로 다음 행동을 알려준다. */
        <View style={ui.card}>
          <Text style={ui.sub}>
            아직 성적이 없어서 격차를 계산할 수 없어요. 성적 입력은 지금 웹에서만 지원돼요 —
            웹(:8080)의 [성적진단]에서 한 번 입력하면 이 화면과 과목별 격차·할 일이 모두 채워져요.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
