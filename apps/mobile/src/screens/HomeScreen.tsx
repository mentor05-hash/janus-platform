import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { SP, useTheme, useUI, type Palette } from '../theme';
import { AcademicUpcoming } from './AcademicUpcoming';

/* 학생 홈(N30 — 시안 5탭의 '홈') — 웹 '나의 관문' 파리티: ① 지금 위치(진단 상태) → ② 다음 할 일 → ③ 바로가기.
 * 탭에서 빠진 화면(선생님 찾기·강의실·자료실·커뮤니티)은 바로가기로 보존(기능 보존 원칙). */

type DiagRow = { score: number; correct: number; total: number; submitted_at: string };
type OpenQ = { id: string; subject: string | null; answered: boolean };

export function HomeScreen({ name, goTab }: { name?: string; goTab: (t: string) => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [diag, setDiag] = useState<DiagRow | null | undefined>(undefined);
  const [openQ, setOpenQ] = useState<OpenQ[]>([]);
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    api.get<{ attempts: DiagRow[] }>('/diagnostics/me').then((r) => setDiag(r.attempts[0] ?? null)).catch(() => setDiag(null));
    api.get<{ posts: OpenQ[] }>('/qna/my-open').then((r) => setOpenQ(r.posts ?? [])).catch(() => {});
    api.get<Array<{ read_at: string | null }>>('/notifications').then((r) => setUnread((Array.isArray(r) ? r : []).filter((n) => !n.read_at).length)).catch(() => {});
    api.get<Record<string, number>>('/chat/unread').then((u) => setChatUnread(Object.values(u).reduce((a, b) => a + b, 0))).catch(() => {});
  }, []);

  const hasDiag = !!diag;
  const NEXT: { icon: string; title: string; desc: string; tab: string }[] = [
    { icon: '◱', title: hasDiag ? '진단 다시 받기' : '진단 받기', desc: '문항 풀이 → 약점·처방', tab: 'g' },
    { icon: '✎', title: '질문 올리기', desc: 'AI 초안 즉시 · 선생님 검토', tab: 'c' },
    { icon: '◇', title: '선생님 찾기', desc: '상담·과외 1:1 매칭', tab: 'a' },
  ];
  const SHORTCUTS: { icon: string; label: string; tab: string; badge?: number }[] = [
    { icon: '◇', label: '선생님 찾기', tab: 'a' },
    { icon: '🏫', label: '학원찾기', tab: 'ac' },
    { icon: '▤', label: '내 예약·일정', tab: 'b' },
    { icon: '▶', label: '강의실', tab: 'r' },
    { icon: '◫', label: '자료실', tab: 'e' },
    { icon: '👥', label: '커뮤니티', tab: 'f' },
    { icon: '◯', label: '내정보·채팅', tab: 'd', badge: chatUnread },
  ];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>나의 관문</Text>
      <Text style={styles.sub}>{name ? `${name}님, ` : ''}지금 위치 → 다음 할 일 → 바로가기</Text>

      {/* ① 지금 위치 — 진단 상태 */}
      <TouchableOpacity style={[ui.card, { marginTop: SP.md }]} activeOpacity={0.75} onPress={() => goTab('g')}>
        {diag === undefined ? (
          <Text style={styles.dim}>불러오는 중…</Text>
        ) : hasDiag ? (
          <>
            <Text style={styles.stateT}>최근 실력진단 {diag!.score}점 <Text style={styles.dim}>({diag!.correct}/{diag!.total})</Text></Text>
            <Text style={styles.stateD}>진단 탭에서 추이·약점 클리닉을 확인하고, 약점만 다시 풀어보세요.</Text>
          </>
        ) : (
          <>
            <Text style={styles.stateT}>아직 진단 전입니다</Text>
            <Text style={styles.stateD}>실력진단으로 약점을 찾아보세요. 지금 시작할 수 있어요 →</Text>
          </>
        )}
      </TouchableOpacity>

      {/* 위젯 — 진행 중 질문·알림 */}
      <View style={styles.widgets}>
        {openQ.length > 0 && (
          <TouchableOpacity style={[ui.card, styles.widget]} activeOpacity={0.75} onPress={() => goTab('c')}>
            <Text style={styles.wLbl}>✎ 진행 중인 질문</Text>
            <Text style={styles.wVal}>{openQ.length}건</Text>
            <Text style={styles.wSub}>{openQ[0].subject ?? '질문'} {openQ[0].answered ? '· 답변 도착 ✓' : '· 답변 대기'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[ui.card, styles.widget]} activeOpacity={0.75} onPress={() => goTab('d')}>
          <Text style={styles.wLbl}>🔔 알림</Text>
          <Text style={[styles.wVal, unread > 0 && { color: '#dc2626' }]}>{unread > 0 ? `${unread}건` : '없음'}</Text>
          <Text style={styles.wSub}>{chatUnread > 0 ? `💬 안 읽은 채팅 ${chatUnread}건` : '내정보에서 확인'}</Text>
        </TouchableOpacity>
      </View>

      {/* ② 다음 할 일 */}
      <Text style={styles.secHead}>다음 할 일</Text>
      {NEXT.map((a) => (
        <TouchableOpacity key={a.title} style={[ui.card, styles.nextRow]} activeOpacity={0.75} onPress={() => goTab(a.tab)}>
          <Text style={styles.nextIc}>{a.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.nextT}>{a.title}</Text>
            <Text style={styles.wSub}>{a.desc}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </TouchableOpacity>
      ))}

      {/* ③ 바로가기 — 탭에서 빠진 화면 포함(기능 보존) */}
      <Text style={styles.secHead}>바로가기</Text>
      <View style={styles.grid}>
        {SHORTCUTS.map((s) => (
          <TouchableOpacity key={s.label} style={[ui.card, styles.gridItem]} activeOpacity={0.75} onPress={() => goTab(s.tab)}>
            <Text style={{ fontSize: 15 }}>{s.icon}</Text>
            <Text style={styles.gridT}>{s.label}</Text>
            {!!s.badge && <Text style={styles.gridBadge}>{s.badge > 99 ? '99+' : s.badge}</Text>}
          </TouchableOpacity>
        ))}
      </View>

      <AcademicUpcoming />
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  sub: { fontSize: 12, color: C.muted, marginTop: 4 },
  dim: { fontSize: 12.5, color: C.muted, fontWeight: '400' },
  stateT: { fontSize: 15.5, fontWeight: '800', color: C.ink },
  stateD: { fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 18 },
  widgets: { flexDirection: 'row', gap: 10, marginTop: 10 },
  widget: { flex: 1 },
  wLbl: { fontSize: 11.5, color: C.muted, marginBottom: 4 },
  wVal: { fontSize: 18, fontWeight: '800', color: C.ink },
  wSub: { fontSize: 11.5, color: C.muted, marginTop: 3 },
  secHead: { fontSize: 12, fontWeight: '800', color: C.caption, marginTop: SP.lg, marginBottom: 8, letterSpacing: 1 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  nextIc: { fontSize: 20, color: C.teal, width: 30, textAlign: 'center' },
  nextT: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  chev: { fontSize: 22, color: C.caption },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridItem: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '48%', flexGrow: 1, paddingVertical: 12 },
  gridT: { fontSize: 13, fontWeight: '700', color: C.ink },
  gridBadge: { marginLeft: 'auto', minWidth: 18, textAlign: 'center', borderRadius: 999, backgroundColor: '#dc2626', color: '#fff', fontSize: 10.5, fontWeight: '700', paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
});
