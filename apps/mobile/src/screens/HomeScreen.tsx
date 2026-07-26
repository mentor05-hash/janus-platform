import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, Booking } from '../api';
import { KR_TEXT, SP, useTheme, useUI, type Palette } from '../theme';

// "나의 관문" 홈(O44) — 지금 위치 → 다음 할 일 → 바로가기 3단. 기존 API 재조합만(신규 백엔드 없음).
// 어떤 상태에서도 다음 행동 카드 1개 이상 보장(막다른 화면 금지).
type QnaPost = { id: string; subject: string | null; status: string; created_at: string; answers?: { id: string }[] };

const KST = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' });

export function HomeScreen({ name, onQna, onSearch, onDiag, onSched }: {
  name: string;
  onQna: () => void;
  onSearch: () => void;
  onDiag: () => void;
  onSched: () => void;
}) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [posts, setPosts] = useState<QnaPost[] | null>(null);
  const [access, setAccess] = useState<{ showTrend: boolean } | null>(null);

  useEffect(() => {
    api.get<Booking[]>('/bookings?role=student').then((r) => setBookings(Array.isArray(r) ? r : [])).catch(() => setBookings([]));
    api.get<QnaPost[]>('/qna/posts').then((r) => setPosts(Array.isArray(r) ? r : [])).catch(() => setPosts([]));
    api.get<{ showTrend: boolean }>('/me/scores/access').then(setAccess).catch(() => setAccess({ showTrend: false }));
  }, []);

  const now = Date.now();
  const upcoming = (bookings ?? [])
    .filter((b) => b.start && new Date(b.start).getTime() > now && (b.status === 'new' || b.status === 'confirmed'))
    .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime())
    .slice(0, 3);
  const answered = (posts ?? []).filter((p) => (p.answers?.length ?? 0) > 0).slice(0, 2);
  const loading = bookings === null || posts === null;

  const TodoCard = ({ icon, title, desc, onPress, accent }: { icon: string; title: string; desc: string; onPress: () => void; accent?: boolean }) => (
    <TouchableOpacity style={[ui.card, styles.todo, accent && styles.todoAccent]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.todoIc}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text {...KR_TEXT} style={styles.todoT}>{title}</Text>
        <Text {...KR_TEXT} style={styles.sub}>{desc}</Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>{name ? `${name}님의 관문` : '나의 관문'}</Text>
      <Text {...KR_TEXT} style={[ui.sub, { marginTop: -6, marginBottom: SP.md }]}>치열한 현재에서 안정된 미래로 — 오늘 열 문을 고르세요.</Text>

      <Text style={styles.sec}>지금 위치</Text>
      {access === null ? <Text style={ui.sub}>불러오는 중…</Text> : access.showTrend ? (
        <TodoCard icon="📈" title="내 성적·배치 확인" desc="최근 추이와 예상 배치 라인을 확인하세요" onPress={onDiag} />
      ) : (
        <TodoCard icon="🚪" title="성적으로 진단받기" desc="현재 위치와 목표까지의 격차를 데이터로 확인하는 첫 문" onPress={onDiag} accent />
      )}

      <Text style={styles.sec}>다음 할 일</Text>
      {loading ? <Text style={ui.sub}>불러오는 중…</Text> : (
        <View>
          {upcoming.map((b) => (
            <TodoCard key={b.id} icon="📅" title={`${KST(b.start!)} ${b.consultType ?? '상담'}`}
              desc={b.status === 'confirmed' ? '확정된 일정이에요 — 일정에서 입장하세요' : '신청 확인 중인 일정이에요'} onPress={onSched} />
          ))}
          {answered.map((p) => (
            <TodoCard key={p.id} icon="💬" title={`${p.subject ?? '질문'}에 답변 ${p.answers!.length}개 도착`}
              desc="답변을 확인하고 채택하거나 상담으로 이어가세요" onPress={onQna} />
          ))}
          {upcoming.length === 0 && answered.length === 0 && (
            <TodoCard icon="💬" title="첫 질문 올리기" desc="사진 한 장으로 질문하면 선생님 답변이 달립니다" onPress={onQna} accent />
          )}
        </View>
      )}

      <Text style={styles.sec}>바로가기</Text>
      <View style={styles.grid}>
        {([
          ['💬', '질문 올리기', '사진 한 장이면 충분해요', onQna],
          ['🔍', '선생님 찾기', '상담·과외 매칭', onSearch],
          ['📈', '진단·배치', '성적 추이와 배치 라인', onDiag],
          ['📅', '일정·강의실', '예약과 수업 입장', onSched],
        ] as const).map(([ic, t, d, fn]) => (
          <TouchableOpacity key={t} style={[ui.card, styles.tile]} onPress={fn} activeOpacity={0.7}>
            <Text style={styles.tileIc}>{ic}</Text>
            <Text {...KR_TEXT} style={styles.tileT}>{t}</Text>
            <Text {...KR_TEXT} style={styles.sub}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  sec: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  sub: { fontSize: 12, color: C.muted, marginTop: 3 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  todoAccent: { borderColor: C.teal, backgroundColor: C.teal50 },
  todoIc: { fontSize: 22 },
  todoT: { fontSize: 14, fontWeight: '700', color: C.ink },
  chev: { fontSize: 22, color: C.caption },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexGrow: 1, marginBottom: 0 },
  tileIc: { fontSize: 22, marginBottom: 4 },
  tileT: { fontSize: 14, fontWeight: '700', color: C.ink },
});
