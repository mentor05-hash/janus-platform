import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Teacher } from '../api';
import { C, R, SP, ui, gradeColor } from '../theme';

type Detail = Teacher & { career?: string | null; subSubjects?: string[] };
type Material = { id: string; title: string; description: string | null; subject: string | null; category: string | null; teacherId: string; filename: string | null; downloadUrl: string | null; createdAt: string };
const KST = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' });

export function TeacherDetailScreen({ teacher, onBack, onBook }: { teacher: Teacher; onBack: () => void; onBook: () => void }) {
  const [detail, setDetail] = useState<Detail>(teacher);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const isWeb = typeof document !== 'undefined';

  useEffect(() => {
    api.get<Detail>(`/teachers/${teacher.id}`).then((d) => setDetail({ ...teacher, ...d })).catch(() => {});
    api.get<{ data?: Material[] } | Material[]>('/materials').then((r) => {
      const list = Array.isArray(r) ? r : (r.data ?? []);
      setMaterials(list.filter((m) => m.teacherId === teacher.id));
    }).catch(() => setMaterials([]));
  }, [teacher]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 90 }}>
        <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ 선생님 목록</Text></TouchableOpacity>
        <View style={ui.card}>
          <View style={styles.head}>
            <View style={styles.avatar}><Text style={styles.avatarT}>{teacher.name.slice(0, 1)}</Text></View>
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{teacher.name}</Text>
                <View style={[styles.grade, { backgroundColor: gradeColor(teacher.grade) }]}><Text style={styles.gradeT}>{teacher.grade}</Text></View>
                {teacher.offlineAvailable ? <View style={styles.offTag}><Text style={styles.offT}>오프라인</Text></View> : null}
              </View>
              <Text style={styles.sub}>{detail.subjects.join(', ')}{detail.category ? ` · ${detail.category}` : ''}{detail.career ? ` · ${detail.career}` : ''}</Text>
            </View>
          </View>
          <View style={styles.stats}>
            {[['만족도', `★ ${detail.rating ?? 0}`], ['누적 상담', `${(detail.totalConsult ?? 0).toLocaleString()}회`], ['질문 답변', `${detail.questionCount ?? 0}회`]].map(([l, v]) => (
              <View key={l} style={styles.stat}><Text style={styles.statV}>{v}</Text><Text style={styles.statL}>{l}</Text></View>
            ))}
          </View>
        </View>

        <Text style={styles.sec}>칼럼 · 기출 자료</Text>
        {materials === null ? <Text style={ui.sub}>불러오는 중…</Text> : materials.length === 0 ? (
          <View style={[ui.card, { paddingVertical: 16 }]}><Text style={ui.sub}>등록된 자료가 없어요.</Text></View>
        ) : materials.map((m) => (
          <View key={m.id} style={[ui.card, { marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mTitle}>📄 {m.title}</Text>
                <Text style={styles.mMeta}>{m.subject ?? ''}{m.category ? ` · ${m.category}` : ''} · {KST(m.createdAt)}</Text>
              </View>
              {m.downloadUrl && isWeb ? (
                <TouchableOpacity style={styles.dl} onPress={() => api.downloadWebPath(m.downloadUrl!, m.filename ?? m.title).catch(() => {})}><Text style={styles.dlT}>다운로드</Text></TouchableOpacity>
              ) : null}
            </View>
            {m.description ? <Text style={styles.mDesc}>{m.description}</Text> : null}
          </View>
        ))}
      </ScrollView>
      <View style={styles.dock}>
        <TouchableOpacity style={ui.btn} onPress={onBook}><Text style={ui.btnText}>시간대 선택하고 예약 →</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: C.teal, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 14, backgroundColor: C.teal100, alignItems: 'center', justifyContent: 'center' },
  avatarT: { color: C.teal, fontWeight: '800', fontSize: 20 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 18, fontWeight: '800', color: C.ink },
  grade: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.md },
  gradeT: { color: C.white, fontWeight: '800', fontSize: 11 },
  offTag: { backgroundColor: C.doneBg, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 2 },
  offT: { color: C.done, fontSize: 10, fontWeight: '800' },
  sub: { fontSize: 13, color: C.muted, marginTop: 4 },
  stats: { flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line },
  stat: { flex: 1, alignItems: 'center' },
  statV: { fontSize: 17, fontWeight: '800', color: C.ink },
  statL: { fontSize: 12, color: C.muted, marginTop: 2 },
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  mTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  mMeta: { fontSize: 12, color: C.caption, marginTop: 2 },
  mDesc: { fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 18 },
  dl: { backgroundColor: C.teal50, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  dlT: { color: C.teal, fontWeight: '800', fontSize: 12 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, padding: SP.lg },
});
