import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { R, useTheme, useUI, type Palette } from '../theme';

export type Placement = { tier?: string; line?: string; universities?: string[]; departments?: string[]; source?: string } | null;
export type TrendPoint = { period: string; examType: string | null; avg: number | null; placement: Placement };
export type Trend = { student: { name?: string; loginId?: string }; points: TrendPoint[] };

const TIER_COLOR = (C: Palette, tier?: string) =>
  tier === '최상위' || tier === '상위' ? C.done : tier === '중상위' ? C.confirmed : tier === '중위' ? C.newC : C.muted;

/** 성적 추이(막대) + 배치(대학·학과 라인) 변화. showPlacement=false 면 배치 숨김. */
export function ScoreTrendView({ trend, showPlacement = true }: { trend: Trend; showPlacement?: boolean }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const pts = trend.points;
  if (!pts.length) return <Text style={ui.sub}>성적 기록이 없어요.</Text>;

  return (
    <View>
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
