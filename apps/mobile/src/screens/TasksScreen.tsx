import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI, type Palette } from '../theme';

type Task = {
  id: string;
  title: string;
  category: string;
  subject: string | null;
  due_date: string | null;
  status: 'todo' | 'done' | 'dismissed';
  cta_href: string | null;
  created_by: string;
};

const CAT: Record<string, { label: string; icon: string; color: string }> = {
  gap: { label: '약점', icon: '🎯', color: '#d06b52' },
  academic: { label: '학사', icon: '📅', color: '#2F6FB3' },
  consult: { label: '상담', icon: '🧭', color: '#57a86a' },
  qna: { label: '질문', icon: '❓', color: '#CF9A3A' },
  custom: { label: '직접', icon: '📌', color: '#64748B' },
};
const catOf = (c: string) => CAT[c] ?? CAT.custom;
const dday = (d: string | null) => {
  if (!d) return null;
  const t0 = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
  const diff = Math.round((new Date(d.slice(0, 10)).getTime() - t0.getTime()) / 86400000);
  return diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
};

/** 맞춤 할 일(모바일) — 격차·학사 자동 제안 + 수동. CTA는 관련 탭으로. */
export function TasksScreen({ onBack, goTab }: { onBack: () => void; goTab?: (t: string) => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const load = () => api.get<Task[]>('/me/tasks').then((r) => setTasks(Array.isArray(r) ? r : [])).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  useEffect(() => { load(); }, []);

  async function toggle(t: Task) {
    const next = t.status === 'done' ? 'todo' : 'done';
    setTasks((p) => p && p.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    await api.patch(`/me/tasks/${t.id}`, { status: next }).catch(() => load());
  }
  async function remove(t: Task) {
    setTasks((p) => p && p.filter((x) => x.id !== t.id));
    await api.del(`/me/tasks/${t.id}`).catch(() => load());
  }
  async function add() {
    if (!title.trim()) return;
    try { await api.post('/me/tasks', { title: title.trim() }); setTitle(''); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '추가 실패'); }
  }
  const ctaTab = (t: Task) => (t.category === 'gap' || t.category === 'consult' ? 'a' : t.category === 'qna' ? 'c' : null);

  const todo = (tasks ?? []).filter((t) => t.status === 'todo');
  const done = (tasks ?? []).filter((t) => t.status === 'done');

  const Row = ({ t }: { t: Task }) => {
    const c = catOf(t.category);
    const dl = dday(t.due_date);
    const tab = ctaTab(t);
    return (
      <View style={s.row}>
        <TouchableOpacity onPress={() => toggle(t)} style={[s.cb, t.status === 'done' && s.cbOn]} accessibilityRole="checkbox" accessibilityState={{ checked: t.status === 'done' }}>
          {t.status === 'done' && <Text style={s.cbTick}>✓</Text>}
        </TouchableOpacity>
        <View style={[s.catChip, { backgroundColor: C.fill }]}><Text style={[s.catT, { color: c.color }]}>{c.icon} {c.label}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, t.status === 'done' && s.titleDone]} numberOfLines={2}>{t.title}</Text>
          {dl && <Text style={s.due}>{dl} · {t.due_date?.slice(0, 10)}</Text>}
        </View>
        {tab && t.status !== 'done' && <TouchableOpacity onPress={() => goTab?.(tab)}><Text style={s.go}>바로가기 →</Text></TouchableOpacity>}
        <TouchableOpacity onPress={() => remove(t)} accessibilityLabel="삭제"><Text style={s.del}>✕</Text></TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: C.teal, fontWeight: '700', marginBottom: 8 }}>‹ 마이</Text></TouchableOpacity>
      <Text style={ui.h}>할 일</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>약점·학사일정에서 자동 제안된 할 일. 직접 추가도 가능해요.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}

      <View style={[ui.card, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
        <TextInput value={title} onChangeText={setTitle} placeholder="직접 할 일 추가" placeholderTextColor={C.muted} style={[ui.input, { flex: 1 }]} onSubmitEditing={add} />
        <TouchableOpacity style={[ui.btn, { paddingHorizontal: 18 }]} onPress={add}><Text style={ui.btnText}>추가</Text></TouchableOpacity>
      </View>

      {tasks === null ? <Text style={[ui.sub, { marginTop: 16 }]}>불러오는 중…</Text> : todo.length === 0 && done.length === 0 ? (
        <Text style={[ui.sub, { marginTop: 16 }]}>할 일이 없어요. 성적·목표가 입력되면 약점 과목이 자동 제안돼요.</Text>
      ) : (
        <>
          <Text style={s.sec}>할 일 ({todo.length})</Text>
          <View style={ui.card}>{todo.length === 0 ? <Text style={ui.sub}>모두 완료했어요! 👏</Text> : todo.map((t) => <Row key={t.id} t={t} />)}</View>
          {done.length > 0 && (<>
            <Text style={s.sec}>완료 ({done.length})</Text>
            <View style={ui.card}>{done.map((t) => <Row key={t.id} t={t} />)}</View>
          </>)}
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  cb: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.inputBorder, alignItems: 'center', justifyContent: 'center' },
  cbOn: { backgroundColor: C.teal, borderColor: C.teal },
  cbTick: { color: '#fff', fontSize: 13, fontWeight: '800' },
  catChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  catT: { fontSize: 11, fontWeight: '700' },
  title: { fontSize: 14, color: C.ink },
  titleDone: { color: C.muted, textDecorationLine: 'line-through' },
  due: { fontSize: 11.5, color: C.muted, marginTop: 2 },
  go: { fontSize: 12, fontWeight: '700', color: C.teal },
  del: { fontSize: 15, color: C.muted, paddingHorizontal: 2 },
});
