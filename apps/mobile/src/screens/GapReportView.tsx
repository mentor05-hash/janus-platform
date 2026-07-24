import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { R, useTheme, useUI, type Palette } from '../theme';
import { ScoreTrendView, type Trend } from './ScoreTrendView';
import { bandOf, computeGapModel, type Band, type GapModel } from '../lib/gap';

/**
 * 격차 리포트 뷰 (§2-B P0-4) — 현재 위치 → 목표까지의 격차 → 처방 CTA.
 * 학생(본인)·학부모(자녀) 공용. 순수 로직(bandOf·computeGapModel)은 lib/gap 에서 import.
 * 신호등 색은 브랜드 고정값(웹 tokens.css 정렬 — 라이트/다크 공통).
 */
// 하위호환: 기존 import { computeGapModel } from './GapReportView' 유지
export { bandOf, computeGapModel };
export type { Band, GapModel };

const BAND_LABEL: Record<Band, string> = { stable: '목표 도달', fit: '근접', reach: '도전 구간', high: '큰 격차' };
const SIGNAL: Record<Band, string> = { stable: '#2a8a5f', fit: '#57a86a', reach: '#cf9f2f', high: '#d06b52' };
const SIGNAL_SOFT: Record<Band, string> = { stable: 'rgba(42,138,95,.13)', fit: 'rgba(87,168,106,.15)', reach: 'rgba(207,159,47,.16)', high: 'rgba(208,107,82,.15)' };

export type Rx = { title: string; desc: string; cta: string; gold?: boolean; onPress?: () => void };

/** 근거 신뢰도 배지(§1 relTier). */
function RelBadge({ tier, label }: { tier: 'a' | 'b' | 'c'; label: string }) {
  const { C } = useTheme();
  const color = tier === 'a' ? SIGNAL.stable : tier === 'b' ? '#a97d24' : C.muted;
  const bg = tier === 'a' ? SIGNAL_SOFT.stable : tier === 'b' ? 'rgba(207,154,58,.16)' : C.lineSoft;
  return <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color, fontSize: 10, fontWeight: '800' }}>{label}</Text></View>;
}

function SignalChip({ band, text }: { band: Band; text: string }) {
  return <View style={{ backgroundColor: SIGNAL_SOFT[band], borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><Text style={{ color: SIGNAL[band], fontSize: 11, fontWeight: '800' }}>{text}</Text></View>;
}

export function GapReportView({ trend, showPlacement, prescriptions, whoLabel, model }: { trend: Trend; showPlacement: boolean; prescriptions: Rx[]; whoLabel?: string; model?: GapModel | null }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  // 서버 표준 payload(model)가 있으면 우선, 없으면 trend 로 클라 계산(폴백).
  const m = useMemo(() => model ?? computeGapModel(trend), [model, trend]);
  const goalLabel = m ? [m.tier, m.university, m.department].filter(Boolean).join(' · ') : '';

  if (!m || !m.last) return <Text style={ui.sub}>아직 진단 결과가 없어요. 상담으로 현재 위치를 진단하면 격차가 보여요.</Text>;

  return (
    <View style={{ gap: 14 }}>
      {/* 현재 위치 */}
      <View style={ui.card}>
        <Text style={s.cardT}>{whoLabel ? `${whoLabel} 지금 위치` : '지금 내 위치'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <Text style={s.big}>{m.lastAvg ?? '-'}</Text>
          <Text style={ui.sub}>현재 평균 · {m.last.examType ?? m.last.period}</Text>
          <View style={s.scoreBadge}><Text style={s.scoreBadgeT}>✓ 성적 연동</Text></View>
        </View>
        {m.goalAvg != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Text style={s.goalT}>🎯 목표 {goalLabel} 평균 {m.goalAvg}</Text>
            {m.overallBand && <SignalChip band={m.overallBand} text={m.overallGap != null && m.overallGap > 0 ? `목표까지 +${m.overallGap}` : BAND_LABEL[m.overallBand]} />}
            <RelBadge tier="c" label="목표 REL·C" />
          </View>
        ) : (
          <Text style={[ui.sub, { marginTop: 10 }]}>목표가 아직 없어요. 상담에서 목표 대학·평균을 정하면 과목별 격차가 보여요.</Text>
        )}
        {showPlacement && m.last.placement && (
          <View style={s.placeBox}>
            <Text style={ui.sub}>예상 배치 라인</Text>
            <Text style={s.placeLine}>{m.last.placement.tier ?? '-'} · {m.last.placement.line ?? '-'}</Text>
            <View style={{ marginTop: 4, alignSelf: 'flex-start' }}>
              <RelBadge tier={m.last.placement.source === 'demo' ? 'b' : 'a'} label={m.last.placement.source === 'demo' ? '추정 REL·B' : '실측 REL·A'} />
            </View>
          </View>
        )}
      </View>

      {/* 과목별 격차 */}
      <View style={ui.card}>
        <Text style={s.cardT}>과목별 격차</Text>
        {m.goalAvg == null ? (
          <Text style={ui.sub}>목표 평균을 설정하면 과목별 격차 바가 표시돼요.</Text>
        ) : m.subjects.length === 0 ? (
          <Text style={ui.sub}>최신 회차 과목 점수가 없어요.</Text>
        ) : (
          <View style={{ gap: 13 }}>
            {m.subjects.map((sub) => (
              <View key={sub.subject}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <Text style={s.subjName}>{sub.subject}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    {sub.band && <SignalChip band={sub.band} text={sub.gap != null && sub.gap > 0 ? `+${sub.gap}` : BAND_LABEL[sub.band]} />}
                    <RelBadge tier="a" label="실측 REL·A" />
                  </View>
                </View>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${sub.pct}%`, backgroundColor: sub.band ? SIGNAL[sub.band] : C.teal }]} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                  <Text style={s.mini}>현재 {sub.score}</Text>
                  <Text style={s.mini}>목표 {m.goalAvg}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 추세 */}
      <View style={ui.card}>
        <Text style={s.cardT}>추세</Text>
        <ScoreTrendView trend={trend} showPlacement={false} />
      </View>

      {/* 처방 */}
      <View style={ui.card}>
        <Text style={s.cardT}>처방 — 이렇게 좁혀요</Text>
        <View style={{ gap: 10 }}>
          {prescriptions.map((p, i) => (
            <View key={i} style={[s.rx, p.gold && s.rxGold]}>
              <Text style={s.rxT}>{p.title}</Text>
              <Text style={s.rxD}>{p.desc}</Text>
              <View style={s.rxBadge}><Text style={s.rxBadgeT}>✦ 추천 근거 · 성적 추이 규칙</Text></View>
              <TouchableOpacity style={[s.rxCta, p.gold ? s.rxCtaGold : s.rxCtaBlue]} onPress={p.onPress} disabled={!p.onPress}>
                <Text style={[s.rxCtaT, { color: p.gold ? '#fff' : C.teal }]}>{p.cta} →</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  cardT: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 10 },
  big: { fontSize: 30, fontWeight: '800', color: C.ink },
  goalT: { fontSize: 14, color: C.body },
  scoreBadge: { backgroundColor: C.teal50, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  scoreBadgeT: { color: C.teal, fontSize: 11, fontWeight: '700' },
  placeBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
  placeLine: { fontSize: 14, fontWeight: '700', color: C.ink, marginTop: 2 },
  subjName: { fontSize: 14, fontWeight: '600', color: C.ink },
  track: { height: 10, borderRadius: 999, backgroundColor: C.lineSoft, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 999 },
  mini: { fontSize: 11, color: C.caption },
  rx: { borderWidth: 1, borderColor: C.line, borderRadius: R.card, padding: 14, backgroundColor: C.white },
  rxGold: { borderColor: '#cf9a3a', borderWidth: 1.5 },
  rxT: { fontSize: 15, fontWeight: '800', color: C.ink },
  rxD: { fontSize: 13, color: C.body, marginTop: 4, lineHeight: 19 },
  rxBadge: { alignSelf: 'flex-start', backgroundColor: C.teal50, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8 },
  rxBadgeT: { fontSize: 11, fontWeight: '700', color: C.teal },
  rxCta: { marginTop: 10, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  rxCtaGold: { backgroundColor: '#cf9a3a' },
  rxCtaBlue: { borderWidth: 1, borderColor: C.teal },
  rxCtaT: { fontSize: 13, fontWeight: '800' },
});
