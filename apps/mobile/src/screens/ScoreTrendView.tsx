import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { R, useTheme, useUI, type Palette } from '../theme';

export type Placement = { tier?: string; line?: string; universities?: string[]; departments?: string[]; source?: string } | null;
export type TrendPoint = { period: string; examType: string | null; avg: number | null; subjects?: { subject: string; score: number | null }[]; placement: Placement };
// goal = janus_goal 규약(백엔드 buildTrend). 대학·학과는 격차 리포트의 목표 라벨이 소비.
export type Trend = { student: { name?: string; loginId?: string }; points: TrendPoint[]; goal?: { tier?: string | null; avg?: number | null; university?: string | null; department?: string | null } };

const TIER_COLOR = (C: Palette, tier?: string) =>
  tier === '최상위' || tier === '상위' ? C.done : tier === '중상위' ? C.confirmed : tier === '중위' ? C.newC : C.muted;

/** 성적 추이(막대) + 배치(대학·학과 라인) 변화. showPlacement=false 면 배치 숨김. */
export function ScoreTrendView({ trend, showPlacement = true }: { trend: Trend; showPlacement?: boolean }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const pts = trend.points;
  if (!pts.length) return <Text style={ui.sub}>성적 기록이 없어요.</Text>;
  const goalAvg = trend.goal?.avg ?? null;
  const lastAvg = pts[pts.length - 1]?.avg ?? null;
  const subjects = Array.from(new Set(pts.flatMap((p) => (p.subjects ?? []).map((s) => s.subject))));
  const scoreAt = (pt: TrendPoint, subj: string) => (pt.subjects ?? []).find((s) => s.subject === subj)?.score ?? null;

  return (
    <View>
      {(goalAvg != null || trend.goal?.tier) && (
        <Text style={styles.goal}>🎯 목표 {trend.goal?.tier ?? ''}{goalAvg != null ? ` · 평균 ${goalAvg}` : ''}
          {goalAvg != null && lastAvg != null ? (lastAvg >= goalAvg ? ' · 목표 달성' : ` · 목표까지 +${Math.round((goalAvg - lastAvg) * 10) / 10}`) : ''}</Text>
      )}
      {/* 막대 차트 (평균, 40~100 스케일) */}
      <View style={styles.chart}>
        {pts.map((p, i) => {
          const v = p.avg ?? 40;
          const h = Math.max(6, ((v - 40) / 60) * 120);
          return (
            <View key={i} style={styles.col}>
              <Text style={styles.avg}>{p.avg ?? '-'}</Text>
              <View style={[styles.bar, { height: h }]} />
              <Text style={styles.xlabel}>{p.examType ?? p.period.slice(-4)}</Text>
            </View>
          );
        })}
      </View>

      {/* 과목별 추이 */}
      {subjects.length > 0 && (
        <View style={styles.subjTable}>
          <View style={styles.subjHead}>
            <Text style={[styles.subjCell, styles.subjName, styles.subjHeadT]}>과목</Text>
            {pts.map((p, i) => <Text key={i} style={[styles.subjCell, styles.subjHeadT]}>{p.examType ?? p.period.slice(-4)}</Text>)}
          </View>
          {subjects.map((subj) => (
            <View key={subj} style={styles.subjRow}>
              <Text style={[styles.subjCell, styles.subjName]}>{subj}</Text>
              {pts.map((p, i) => <Text key={i} style={styles.subjCell}>{scoreAt(p, subj) ?? '-'}</Text>)}
            </View>
          ))}
        </View>
      )}

      {showPlacement && (
        <View style={{ gap: 8, marginTop: 8 }}>
          {pts.map((p, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.period}>{p.period}</Text>
              {p.placement ? (
                <>
                  <View style={styles.tagRow}>
                    <View style={[styles.tier, { backgroundColor: TIER_COLOR(C, p.placement.tier) }]}><Text style={styles.tierT}>{p.placement.tier ?? '-'}</Text></View>
                    <Text style={styles.line}>{p.placement.line}</Text>
                  </View>
                  <Text style={styles.univ}>{(p.placement.universities ?? []).join(' · ')}</Text>
                  <Text style={styles.dept}>{(p.placement.departments ?? []).join(' · ')}</Text>
                  {p.placement.source === 'demo' && <Text style={styles.demo}>※ 데모 추정</Text>}
                </>
              ) : <Text style={styles.dept}>배치 결과 없음</Text>}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, paddingVertical: 8, minHeight: 160 },
  col: { alignItems: 'center', flex: 1 },
  avg: { fontSize: 13, fontWeight: '800', color: C.ink, marginBottom: 4 },
  bar: { width: 30, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: C.teal },
  xlabel: { fontSize: 11, color: C.muted, marginTop: 6 },
  goal: { fontSize: 13, color: C.muted, marginBottom: 6, fontWeight: '600' },
  subjTable: { marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: R.md, overflow: 'hidden' },
  subjHead: { flexDirection: 'row', backgroundColor: C.fill },
  subjRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.lineSoft },
  subjCell: { flex: 1, textAlign: 'center', fontSize: 12, color: C.ink, paddingVertical: 7 },
  subjName: { flex: 1.2, textAlign: 'left', paddingLeft: 10, fontWeight: '600' },
  subjHeadT: { color: C.muted, fontWeight: '700', fontSize: 11 },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: 12, backgroundColor: C.white },
  period: { fontSize: 12, color: C.muted, marginBottom: 4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tier: { borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tierT: { color: '#fff', fontSize: 11, fontWeight: '800' },
  line: { fontSize: 13, fontWeight: '700', color: C.ink },
  univ: { fontSize: 12, color: C.muted, marginTop: 4 },
  dept: { fontSize: 12, color: C.caption },
  demo: { fontSize: 10, color: C.caption, marginTop: 4 },
});
