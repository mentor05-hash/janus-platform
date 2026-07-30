import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';

/**
 * 학습 플랜 — 처방 탭 하위. 웹 `CurriculumPage` 와 같은 계약(`GET /curriculum/me`).
 *
 * 진단 약점 + 성적을 묶어 **이번 주 무엇부터 할지 순서대로** 처방한다. 처방 탭의 마지막
 * `webOnly` 자리였고(O189), 이걸로 처방 층이 다 찬다.
 *
 * **CTA 가 이 화면의 요점이다.** 처방은 "무엇을 해야 하는지"가 아니라 **"그걸 지금 어디서
 * 하는지"** 까지 이어져야 의미가 있다. 웹은 과목을 쿼리로 실어 4곳(질문·자료실·강좌·학원)으로
 * 보내는데, 모바일도 같은 4곳으로 보낸다 — O191·O192 로 강좌·리그 Q&A 가 생겨서 이제
 * **네 목적지가 모두 앱 안에 있다**(그 전에 만들었다면 절반이 웹 안내로 끝났을 것이다).
 *
 * ⚠ 과목 프리필은 넘기지 않는다. 모바일 목적지 화면들이 아직 `subject` 초기값을 받지 않아서,
 * 넘기는 시늉만 하면 사용자는 필터가 걸린 줄 알고 엉뚱한 목록을 본다. 화면만 열고 **거기서
 * 과목을 고르게** 한다(가짜 정확도보다 정직한 한 번의 탭이 낫다).
 */

type PlanItem = { order: number; subject: string; unit: string; rate: number; focus: string; actions: string[] };
type Plan = {
  headline: string;
  score: { label: string; hasScore: boolean };
  items: PlanItem[];
  hasDiagnostic: boolean;
  latestAttemptId: string | null;
};

export function CurriculumScreen({
  onBack,
  backLabel = '‹ 처방',
  goTab,
  goHub,
}: {
  onBack: () => void;
  backLabel?: string;
  goTab?: (t: string) => void;
  /** 다른 탭의 **허브 하위 화면**까지 여는 이동(예: 실행 › 리그 Q&A). */
  goHub?: (tab: string, hub: string) => void;
}) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => mk(C), [C]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Plan>('/curriculum/me').then(setPlan).catch((e) => setError(e instanceof ApiError ? e.message : '플랜 조회 실패'));
  }, []);

  const CTAS: { label: string; go: () => void }[] = [
    { label: '이 과목 질문하기', go: () => goHub?.('b', 'league') },
    { label: '자료 찾기', go: () => goTab?.('e') },
    { label: '강좌 보기', go: () => goHub?.('rx', 'lectures') },
    { label: '🏫 주변 학원 반', go: () => goTab?.('ac') },
  ];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={s.back}>{backLabel}</Text></TouchableOpacity>
      <Text style={ui.h}>학습 플랜</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>실력진단 약점과 성적을 묶어, 이번 주 무엇부터 할지 순서대로 처방해요.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {!plan && !error ? (
        <View style={{ paddingVertical: SP.xl }}><ActivityIndicator color={C.teal} /></View>
      ) : plan ? (
        <>
          <View style={[ui.card, { marginBottom: SP.md }]}>
            <Text style={s.headline}>{plan.headline}</Text>
            <Text style={[ui.sub, { marginTop: 6, color: plan.score.hasScore ? C.muted : C.danger }]}>📊 {plan.score.label}</Text>
            {!plan.score.hasScore && (
              // 성적이 없으면 플랜이 비는 원인이 그것이다 — 원인을 고치는 자리로 바로 보낸다.
              <TouchableOpacity style={[ui.btnGhost, { marginTop: 10 }]} onPress={() => goHub?.('dg', 'scoreInput')}>
                <Text style={ui.btnGhostText}>성적진단에서 입력하기 →</Text>
              </TouchableOpacity>
            )}
          </View>

          {plan.items.length === 0 ? (
            <View style={ui.card}>
              <Text style={{ fontSize: 14, color: C.ink, lineHeight: 20 }}>
                아직 처방할 약점이 없어요. 실력진단을 먼저 보면 여기에 이번 주 플랜이 만들어져요.
              </Text>
              <TouchableOpacity style={[ui.btn, { marginTop: 10 }]} onPress={() => goTab?.('dg')}>
                <Text style={ui.btnText}>실력진단 하러 가기 →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {plan.items.map((it) => (
                <View key={it.order} style={[ui.card, s.item]}>
                  <View style={s.headRow}>
                    <Text style={s.no}>{it.order}</Text>
                    <Text style={s.badge}>{it.subject}</Text>
                    <Text style={s.badgeSoft}>{it.unit}</Text>
                    <Text style={s.rate}>정답률 {it.rate}%</Text>
                  </View>
                  <Text style={s.focus}>{it.focus}</Text>
                  <View style={s.ctaRow}>
                    {CTAS.map((c) => (
                      <TouchableOpacity key={c.label} style={s.cta} onPress={c.go}>
                        <Text style={s.ctaT}>{c.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const mk = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, fontWeight: '700', marginBottom: 8 },
  headline: { fontSize: 15, fontWeight: '800', color: C.ink, lineHeight: 21 },
  item: { borderLeftWidth: 3, borderLeftColor: C.blue },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  no: { width: 22, height: 22, borderRadius: 999, backgroundColor: C.blue, color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 22, overflow: 'hidden' },
  badge: { fontSize: 11, fontWeight: '800', color: C.blue, backgroundColor: C.blueSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  badgeSoft: { fontSize: 11, fontWeight: '700', color: C.muted, backgroundColor: C.lineSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  rate: { fontSize: 11.5, color: C.danger, fontWeight: '700' },
  focus: { fontSize: 13.5, color: C.ink, lineHeight: 20, marginBottom: 10 },
  ctaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  cta: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: C.white },
  ctaT: { fontSize: 12, fontWeight: '700', color: C.body },
});
