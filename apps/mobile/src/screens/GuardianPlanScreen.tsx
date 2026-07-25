import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI, type Palette } from '../theme';

/**
 * 학부모 자녀 계획(O106·모바일) — 웹 /guardian/plan 패리티.
 * 내 공간에서 계획을 세우고 '제안'하면 자녀가 수락/거절한다. 자녀 할 일을 직접 고치지 않는다.
 * 연령 권한(O105): 미성년은 바로 제안 / 성인 자녀는 자녀 본인의 동의가 있어야 제안된다.
 */
type Status = 'draft' | 'proposed' | 'accepted' | 'declined';
type PlanItem = {
  id: string; title: string; subject: string | null; due_date: string | null;
  status: Status; proposed_at: string | null;
};

const META: Record<Status, { label: string; color: string; desc: string }> = {
  draft: { label: '내 메모', color: '#64748B', desc: '아직 자녀에게 보이지 않아요' },
  proposed: { label: '제안 중', color: '#2F6FB3', desc: '자녀의 응답을 기다려요' },
  accepted: { label: '수락됨', color: '#2a8a5f', desc: '자녀 할 일에 추가됐어요' },
  declined: { label: '거절됨', color: '#d06b52', desc: '자녀가 받지 않았어요' },
};
const D = (iso: string | null) => (iso ? iso.slice(5, 10) : '');

export function GuardianPlanScreen({ studentId, studentName, onBack }: { studentId: string; studentName: string; onBack: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [form, setForm] = useState({ title: '', subject: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get<PlanItem[]>(`/guardian/plan?studentId=${encodeURIComponent(studentId)}`)
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch((e) => { setItems([]); setError(e instanceof ApiError ? e.message : '조회 실패'); });
  }, [studentId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!form.title.trim()) { setError('계획 제목을 입력하세요.'); return; }
    setBusy(true); setError(''); setMsg('');
    try {
      await api.post(`/guardian/plan?studentId=${encodeURIComponent(studentId)}`, {
        title: form.title.trim(), subject: form.subject.trim() || null,
      });
      setForm({ title: '', subject: '' });
      setMsg('계획을 추가했어요. 준비되면 제안하세요.');
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '추가 실패'); }
    finally { setBusy(false); }
  }

  async function propose(id: string) {
    setBusy(true); setError(''); setMsg('');
    try {
      await api.post(`/guardian/plan/${id}/propose`, {});
      setMsg('자녀에게 제안했어요.');
      load();
    } catch (e) {
      // 성인 자녀인데 동의가 없으면 사유가 온다(NEED_STUDENT_CONSENT).
      setError(e instanceof ApiError ? e.message : '제안 실패');
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true); setError('');
    try { await api.del(`/guardian/plan/${id}`); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '삭제 실패'); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: C.teal, fontWeight: '700', marginBottom: 8 }}>‹ 홈</Text></TouchableOpacity>
      <Text style={ui.h}>{studentName} 계획</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>
        내 공간에서 계획을 세우고 '제안'하면 자녀가 수락/거절해요. 자녀 할 일을 직접 고치지는 않아요.
      </Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {msg ? <Text style={{ color: C.teal, fontSize: 13, marginBottom: 6 }}>{msg}</Text> : null}

      <View style={[ui.card, { gap: 6 }]}>
        <Text style={ui.label}>계획</Text>
        <TextInput value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="예) 수학 오답노트 매일 30분"
          placeholderTextColor={C.caption} style={ui.input} maxLength={160} />
        <Text style={ui.label}>과목(선택)</Text>
        <TextInput value={form.subject} onChangeText={(v) => setForm({ ...form, subject: v })} placeholder="예) 수학"
          placeholderTextColor={C.caption} style={ui.input} maxLength={30} />
        <TouchableOpacity onPress={add} disabled={busy} style={[ui.btn, busy && ui.btnDisabled, { marginTop: 10 }]}>
          <Text style={ui.btnText}>계획 추가(내 메모)</Text>
        </TouchableOpacity>
        <Text style={[ui.sub, { marginTop: 6 }]}>추가한 계획은 내게만 보여요. '제안'을 누르면 자녀에게 전달돼요.</Text>
      </View>

      <Text style={s.sec}>내 계획</Text>
      <View style={ui.card}>
        {items === null ? <Text style={ui.sub}>불러오는 중…</Text> : items.length === 0 ? (
          <Text style={ui.sub}>아직 계획이 없어요. 위에서 추가해 보세요.</Text>
        ) : (
          items.map((it) => {
            const m = META[it.status];
            return (
              <View key={it.id} style={s.row}>
                <View style={[s.chip, { backgroundColor: C.fill }]}><Text style={[s.chipT, { color: m.color }]}>{m.label}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title} numberOfLines={2}>{it.title}{it.subject ? ` · ${it.subject}` : ''}</Text>
                  <Text style={s.meta}>{m.desc}{it.proposed_at ? ` · 제안 ${D(it.proposed_at)}` : ''}</Text>
                </View>
                {it.status === 'draft' && (
                  <TouchableOpacity onPress={() => propose(it.id)} disabled={busy}><Text style={s.go}>제안</Text></TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => remove(it.id)} accessibilityLabel="계획 삭제"><Text style={s.del}>✕</Text></TouchableOpacity>
              </View>
            );
          })
        )}
      </View>
      <Text style={[ui.sub, { marginTop: 10 }]}>
        제안한 계획은 자녀가 본 내용과 달라지지 않도록 수정할 수 없어요. 성인 자녀는 자녀 본인의 동의가 있어야 제안이 전달됩니다.
      </Text>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipT: { fontSize: 11, fontWeight: '800' },
  title: { fontSize: 13.5, color: C.ink, fontWeight: '600' },
  meta: { fontSize: 11.5, color: C.muted, marginTop: 2 },
  go: { fontSize: 12, fontWeight: '700', color: C.teal },
  del: { fontSize: 15, color: C.muted, paddingHorizontal: 2 },
});
