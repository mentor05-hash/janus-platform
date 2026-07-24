import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI, type Palette } from '../theme';

/**
 * 목표 설정 (WD-9) — 목표 대학·학과·라인·평균(janus_goal 규약).
 * 저장 시 격차 리포트·대시보드에 반영. GET/PUT /me/goal. 웹 StudentGoalPage 패리티.
 */
type Goal = { tier: string | null; avg: number | null; university: string | null; department: string | null };

const TIERS = ['최상위', '상위', '중상위', '중위', '중하위', '기초'];

export function GoalScreen({ onBack }: { onBack: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Goal>('/me/goal')
      .then((g) => setGoal({ tier: g.tier ?? null, avg: g.avg ?? null, university: g.university ?? null, department: g.department ?? null }))
      .catch((e) => { setGoal({ tier: null, avg: null, university: null, department: null }); if (!(e instanceof ApiError && e.status === 404)) setError(e instanceof ApiError ? e.message : '조회 실패'); });
  }, []);

  const set = (patch: Partial<Goal>) => { setGoal((g) => ({ ...(g as Goal), ...patch })); setSaved(false); };

  async function save() {
    if (!goal) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const avg = goal.avg != null && !Number.isNaN(goal.avg) ? goal.avg : null;
      const g = await api.put<Goal>('/me/goal', { tier: goal.tier || null, avg, university: goal.university?.trim() || null, department: goal.department?.trim() || null });
      setGoal({ tier: g.tier ?? null, avg: g.avg ?? null, university: g.university ?? null, department: g.department ?? null });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally { setSaving(false); }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: C.teal, fontWeight: '700', marginBottom: 8 }}>‹ 마이</Text></TouchableOpacity>
      <Text style={ui.h}>목표 설정</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>목표 대학·학과·평균을 정하면 격차 리포트에서 과목별로 얼마나 남았는지 보여요.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {!goal ? <Text style={ui.sub}>불러오는 중…</Text> : (
        <View style={{ gap: 14 }}>
          <View style={ui.card}>
            <Text style={ui.label}>목표 대학</Text>
            <TextInput value={goal.university ?? ''} onChangeText={(v) => set({ university: v })} placeholder="예) 성균관대" placeholderTextColor={C.caption} style={ui.input} />
            <Text style={ui.label}>목표 학과</Text>
            <TextInput value={goal.department ?? ''} onChangeText={(v) => set({ department: v })} placeholder="예) 전자공학" placeholderTextColor={C.caption} style={ui.input} />
            <Text style={ui.label}>목표 라인 (선택)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
              {TIERS.map((t) => (
                <TouchableOpacity key={t} onPress={() => set({ tier: goal.tier === t ? null : t })} style={[s.chip, goal.tier === t && s.chipOn]}>
                  <Text style={[s.chipT, goal.tier === t && s.chipTOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={ui.label}>목표 평균 점수</Text>
            <TextInput value={goal.avg != null ? String(goal.avg) : ''} onChangeText={(v) => set({ avg: v === '' ? null : Number(v.replace(/[^0-9]/g, '')) })} placeholder="예) 90" placeholderTextColor={C.caption} keyboardType="number-pad" style={ui.input} />
            <Text style={[ui.sub, { marginTop: 4 }]}>격차 리포트의 과목별 격차 계산 기준이에요.</Text>

            <TouchableOpacity onPress={save} disabled={saving} style={[ui.btn, saving && ui.btnDisabled, { marginTop: 16 }]}>
              <Text style={ui.btnText}>{saving ? '저장 중…' : '목표 저장 · 리포트 갱신'}</Text>
            </TouchableOpacity>
            {saved && <Text style={{ color: C.teal, fontSize: 13, marginTop: 8, textAlign: 'center' }}>✓ 저장됐어요</Text>}
          </View>

          <View style={ui.card}>
            <Text style={s.infoT}>목표는 이렇게 쓰여요</Text>
            <Text style={s.infoLine}>• 격차 리포트 — 최신 성적 대비 목표까지 과목별 격차와 처방을 계산해요.</Text>
            <Text style={s.infoLine}>• 상담·컨설팅 — 선생님·컨설턴트가 같은 목표를 보고 전략을 잡아요.</Text>
            <Text style={s.infoLine}>• 목표 평균을 비워 두면 격차 수치 대신 목표 설정 안내가 표시돼요.</Text>
            <Text style={[ui.sub, { marginTop: 8 }]}>본 목표는 통계적 격차 계산의 기준일 뿐이며, 실제 합격을 보장하지 않아요.</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  chip: { borderWidth: 1, borderColor: C.inputBorder, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.white },
  chipOn: { backgroundColor: C.teal, borderColor: C.teal },
  chipT: { fontSize: 13, color: C.body, fontWeight: '600' },
  chipTOn: { color: '#fff' },
  infoT: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 8 },
  infoLine: { fontSize: 13, color: C.body, lineHeight: 20 },
});
