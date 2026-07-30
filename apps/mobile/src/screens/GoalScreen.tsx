import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI, type Palette } from '../theme';
import { BAND_COLOR, REL_TIER_LABEL, type GoalCandidate, type GoalCandidateReport } from '../lib/gap';

/**
 * 목표 설정 (WD-9) — 목표 대학·학과·라인·평균(janus_goal 규약).
 * 저장 시 격차 리포트·대시보드에 반영. GET/PUT /me/goal. 웹 StudentGoalPage 패리티.
 */
type Goal = { tier: string | null; avg: number | null; university: string | null; department: string | null };

const TIERS = ['최상위', '상위', '중상위', '중위', '중하위', '기초'];

export function GoalScreen({ onBack, backLabel = '‹ 뒤로' }: { onBack: () => void; backLabel?: string }) {
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

  // ── 목표 후보 비교(웹 /student/goal 패리티) ──
  // 서버가 트렁크 정본 밴드(안정/적정/소신/상향)를 주므로 로컬 포크 어휘를 쓰지 않는다(O102).
  const [mode, setMode] = useState<'jeongsi' | 'susi'>('jeongsi');
  const [myGrade, setMyGrade] = useState('');
  const [cands, setCands] = useState<GoalCandidate[] | null>(null);
  const [report, setReport] = useState<GoalCandidateReport | null>(null);
  const [candErr, setCandErr] = useState('');
  const [form, setForm] = useState({ univ: '', dept: '', cut: '' });
  const [busy, setBusy] = useState(false);

  const loadCands = () =>
    api.get<GoalCandidate[]>(`/me/goal/candidates?mode=${mode}`)
      .then((r) => setCands(Array.isArray(r) ? r : []))
      .catch(() => setCands([]));

  useEffect(() => { loadCands(); }, [mode]);
  useEffect(() => {
    if (!cands?.length) { setReport(null); return; }
    if (mode === 'susi' && !myGrade.trim()) { setReport(null); return; }
    const q = mode === 'susi' ? `?mode=susi&myGrade=${encodeURIComponent(myGrade)}` : '?mode=jeongsi';
    api.get<GoalCandidateReport>(`/me/goal/candidates/report${q}`)
      .then((r) => { setReport(r); setCandErr(''); })
      .catch((e) => { setReport(null); setCandErr(e instanceof ApiError ? e.message : '비교 실패'); });
  }, [cands, mode, myGrade]);

  async function addCand() {
    const cut = Number(form.cut);
    if (!form.univ.trim() || !form.dept.trim() || !Number.isFinite(cut) || cut <= 0) {
      setCandErr('대학·학과·목표 컷을 입력하세요.');
      return;
    }
    setBusy(true); setCandErr('');
    try {
      // cutSource=manual — 배치표 조회값이 아니라 직접 입력한 컷임을 감사 기록(O65).
      await api.post('/me/goal/candidates', { mode, univ: form.univ.trim(), dept: form.dept.trim(), cut, cutSource: 'manual' });
      setForm({ univ: '', dept: '', cut: '' });
      await loadCands();
    } catch (e) {
      setCandErr(e instanceof ApiError ? e.message : '후보 추가 실패');
    } finally { setBusy(false); }
  }

  async function delCand(id: string) {
    await api.del(`/me/goal/candidates/${id}`).catch(() => {});
    await loadCands();
  }

  /** 후보를 기준 목표로 승격 — 기존 PUT /me/goal 계약 재사용(대학·학과만 교체). */
  async function promote(univ: string, dept: string) {
    setBusy(true); setCandErr('');
    try {
      const g = await api.put<Goal>('/me/goal', { tier: goal?.tier ?? null, avg: goal?.avg ?? null, university: univ, department: dept });
      setGoal({ tier: g.tier ?? null, avg: g.avg ?? null, university: g.university ?? null, department: g.department ?? null });
      setSaved(true);
    } catch (e) {
      setCandErr(e instanceof ApiError ? e.message : '목표 설정 실패');
    } finally { setBusy(false); }
  }

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
      <TouchableOpacity onPress={onBack}><Text style={{ color: C.teal, fontWeight: '700', marginBottom: 8 }}>{backLabel}</Text></TouchableOpacity>
      <Text style={ui.h}>목표 설정</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>목표 대학·학과·평균을 정하면 [과목별 점수 격차]에서 얼마나 남았는지 보여요.</Text>
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
            <TextInput value={goal.avg != null ? String(goal.avg) : ''} onChangeText={(v) => { const n = v.replace(/[^0-9]/g, ''); set({ avg: n === '' ? null : Number(n) }); }} placeholder="예) 90" placeholderTextColor={C.caption} keyboardType="number-pad" style={ui.input} />
            <Text style={[ui.sub, { marginTop: 4 }]}>과목별 점수 격차의 계산 기준이에요.</Text>

            <TouchableOpacity onPress={save} disabled={saving} style={[ui.btn, saving && ui.btnDisabled, { marginTop: 16 }]}>
              <Text style={ui.btnText}>{saving ? '저장 중…' : '목표 저장 · 리포트 갱신'}</Text>
            </TouchableOpacity>
            {saved && <Text style={{ color: C.teal, fontSize: 13, marginTop: 8, textAlign: 'center' }}>✓ 저장됐어요</Text>}
          </View>

          <View style={ui.card}>
            <Text style={s.infoT}>목표는 이렇게 쓰여요</Text>
            <Text style={s.infoLine}>• 과목별 점수 격차 — 최신 성적 대비 목표까지 과목마다 몇 점 남았는지 계산해요.</Text>
            <Text style={s.infoLine}>• 상담·컨설팅 — 선생님·컨설턴트가 같은 목표를 보고 전략을 잡아요.</Text>
            <Text style={s.infoLine}>• 목표 평균을 비워 두면 격차 수치 대신 목표 설정 안내가 표시돼요.</Text>
            <Text style={[ui.sub, { marginTop: 8 }]}>본 목표는 통계적 격차 계산의 기준일 뿐이며, 실제 합격을 보장하지 않아요.</Text>
          </View>

          {/* 목표 후보 비교 — 직접 담은 후보 최대 3개를 같은 성적으로 비교(시스템 추천 아님). */}
          <View style={ui.card}>
            <Text style={s.infoT}>목표 후보 비교</Text>
            <Text style={ui.sub}>목표를 바꿀지 고민될 때 후보를 최대 3개까지 담아, 지금 성적으로 각각 얼마나 남았는지 나란히 보세요. 후보는 직접 담은 것만 표시돼요.</Text>

            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {(['jeongsi', 'susi'] as const).map((m) => (
                <TouchableOpacity key={m} onPress={() => { setMode(m); setReport(null); }} style={[s.chip, mode === m && s.chipOn]}>
                  <Text style={[s.chipT, mode === m && s.chipTOn]}>{m === 'jeongsi' ? '정시(누백)' : '수시(등급)'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {mode === 'susi' && (
              <TextInput value={myGrade} onChangeText={setMyGrade} placeholder="내 내신 평균등급 (예: 2.3)" placeholderTextColor={C.caption}
                keyboardType="decimal-pad" style={[ui.input, { marginTop: 8 }]} />
            )}

            {candErr ? <Text style={ui.error}>{candErr}</Text> : null}

            {/* 후보 담기 */}
            {/* 375px 폭에서 입력을 세로로 쌓는다 — RN Web 의 TextInput 은 기본 너비를 가져
                한 행에 둘을 flex:1 로 나란히 두면 카드를 넘쳤다(실측 305px 행에 193+193). */}
            <View style={{ gap: 6, marginTop: 10 }}>
              <TextInput value={form.univ} onChangeText={(v) => setForm({ ...form, univ: v })} placeholder="후보 대학" placeholderTextColor={C.caption} style={ui.input} maxLength={60} />
              <TextInput value={form.dept} onChangeText={(v) => setForm({ ...form, dept: v })} placeholder="후보 학과" placeholderTextColor={C.caption} style={ui.input} maxLength={60} />
              <TextInput value={form.cut} onChangeText={(v) => setForm({ ...form, cut: v })} placeholder={mode === 'susi' ? '목표 내신등급 (예: 1.8)' : '목표 전국누백 (예: 2.0)'} placeholderTextColor={C.caption}
                keyboardType="decimal-pad" style={ui.input} />
              <TouchableOpacity onPress={addCand} disabled={busy} style={[ui.btn, busy && ui.btnDisabled]}>
                <Text style={ui.btnText}>후보 담기</Text>
              </TouchableOpacity>
            </View>

            {cands === null ? (
              <Text style={[ui.sub, { marginTop: 12 }]}>불러오는 중…</Text>
            ) : cands.length === 0 ? (
              <Text style={[ui.sub, { marginTop: 12 }]}>담은 후보가 없어요. 위에서 추가하면 밴드가 계산돼요.</Text>
            ) : !report ? (
              <Text style={[ui.sub, { marginTop: 12 }]}>
                {mode === 'susi' && !myGrade.trim() ? '내신 평균등급을 입력하면 후보별 격차가 계산돼요.' : '계산 중…'}
              </Text>
            ) : (
              <View style={{ marginTop: 12 }}>
                <Text style={ui.sub}>
                  내 {report.unit.label} {report.myValue}{report.unit.suffix} 기준 · 최신 회차 격차가 작은 순
                  {report.spread ? ` · 최근 ${report.spread.count}회 ${report.spread.best}~${report.spread.worst}${report.unit.suffix}(폭 ${report.spread.spread})` : ''}
                </Text>
                {/* 경고는 '흔들렸는가'가 아니라 '판정이 갈리는 후보가 있는가'로 분기한다(O108) —
                    폭이 있어도 어느 후보도 안 갈리면 불필요한 불안만 남는다. */}
                {report.spread && report.spread.spread > 0 && (
                  <Text style={[ui.sub, { marginTop: 4 }]}>
                    {/* 향상·하락 중이면 '흔들림'이 아니라 방향을 먼저 말한다 — 도메인 message 와 같은 이유. */}
                    {report.direction === 'improving'
                      ? `최근 ${report.spread.count}회 ${report.spread.worst} → ${report.myValue}${report.unit.suffix}로 꾸준히 올랐어요. 아래 구간은 예전 회차까지 포함한 범위예요 — 지금 위치는 최근 회차 기준이에요.`
                      : report.direction === 'worsening'
                        ? `최근 ${report.spread.count}회 ${report.spread.best} → ${report.myValue}${report.unit.suffix}로 계속 내려갔어요. 지금 위치는 최근 회차 기준이에요.`
                        : report.flipCount > 0
                          ? `시험은 회차마다 흔들려요(컨디션·난이도). ${report.flipCount}곳은 어느 회차로 보느냐에 따라 판정이 갈려요.`
                          : '회차마다 흔들렸지만, 어느 회차로 봐도 후보들의 판정은 그대로예요.'}
                    {report.smallSample ? ` 아직 ${report.spread.count}회뿐이라 추세로 보기엔 일러요.` : ''}
                  </Text>
                )}
                {report.volatilityNote ? <Text style={[ui.sub, { marginTop: 4 }]}>{report.volatilityNote}</Text> : null}
                {report.candidates.map((c) => (
                  <View key={c.id} style={s.candRow}>
                    <View style={[s.bandChip, { backgroundColor: C.fill }]}>
                      <Text style={[s.bandT, { color: BAND_COLOR[c.band] ?? C.ink }]}>{c.band}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.candName} numberOfLines={1}>{c.univ} {c.dept}</Text>
                      <Text style={s.candMeta}>목표 컷 {c.cut}{report.unit.suffix} · {c.shortfall > 0 ? `${c.shortfall} 부족` : '도달'}</Text>
                      {/* 뒤집히는 후보만 세로 1줄 — 칩을 가로로 더 붙이면 375px 행(칩+이름+'목표로'+'✕')에서 학과명이 눌린다.
                          숫자는 후보 불변값이라 목록 레벨 spread 에서 온다(후보 행에 3중복으로 싣지 않는 이유). */}
                      {c.volatility && !c.volatility.consistent && report.spread ? (
                        <Text
                          style={s.candVol}
                          numberOfLines={2}
                          accessibilityLabel={`회차에 따라 ${report.spread.best}${report.unit.suffix}면 ${c.volatility.bestBand}, ${report.spread.worst}${report.unit.suffix}면 ${c.volatility.worstBand}`}
                        >
                          회차에 따라{' '}
                          <Text style={{ color: BAND_COLOR[c.volatility.bestBand] ?? C.ink, fontWeight: '800' }}>
                            {report.spread.best}{report.unit.suffix}면 {c.volatility.bestBand}
                          </Text>
                          {' · '}
                          <Text style={{ color: BAND_COLOR[c.volatility.worstBand] ?? C.ink, fontWeight: '800' }}>
                            {report.spread.worst}{report.unit.suffix}면 {c.volatility.worstBand}
                          </Text>
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity onPress={() => promote(c.univ, c.dept)} disabled={busy}><Text style={s.candGo}>목표로</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => delCand(c.id)} accessibilityLabel="후보 삭제"><Text style={s.candDel}>✕</Text></TouchableOpacity>
                  </View>
                ))}
                {/* 합격률 힌트는 후보별이 아니라 목록에 1회(인접 후보 동일 수치 오독 방지). */}
                {report.admitHintNote ? <Text style={[ui.sub, { marginTop: 8 }]}>{report.admitHintNote}</Text> : null}
                {report.evidence.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={[s.infoT, { fontSize: 13, marginBottom: 4 }]}>근거</Text>
                    {report.evidence.map((e, i) => (
                      <Text key={i} style={s.evi}>• {e.claim} [{REL_TIER_LABEL[e.relTier] ?? e.relTier}] — {e.source}</Text>
                    ))}
                  </View>
                )}
                <Text style={[ui.sub, { marginTop: 8 }]}>{report.disclaimer} 컷에 도달해도 합격이 보장되지 않아요.</Text>
              </View>
            )}
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
  candRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  bandChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  bandT: { fontSize: 11.5, fontWeight: '800' },
  candName: { fontSize: 13.5, color: C.ink, fontWeight: '600' },
  candMeta: { fontSize: 11.5, color: C.muted, marginTop: 2 },
  candVol: { fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 15 },
  candGo: { fontSize: 12, fontWeight: '700', color: C.teal },
  candDel: { fontSize: 15, color: C.muted, paddingHorizontal: 2 },
  evi: { fontSize: 11.5, color: C.muted, lineHeight: 17 },
});
