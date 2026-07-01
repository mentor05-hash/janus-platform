import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { api, Child, hasSession, loadTokens, Me, Teacher } from './src/api';
import { backStack } from './src/webBack';
import { LoginScreen } from './src/screens/LoginScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { TeacherDetailScreen } from './src/screens/TeacherDetailScreen';
import { SlotsScreen } from './src/screens/SlotsScreen';
import { BookingsScreen } from './src/screens/BookingsScreen';
import { QnaScreen } from './src/screens/QnaScreen';
import { MaterialsScreen } from './src/screens/MaterialsScreen';
import { CommunityScreen } from './src/screens/CommunityScreen';
import { MyScreen } from './src/screens/MyScreen';
import { GuardianHome, GuardianConsult, GuardianPay, GuardianCharge } from './src/screens/GuardianScreens';
import { ThemeProvider, useTheme, type Palette, SP } from './src/theme';

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const { C, dark, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState('a');
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [booking, setBooking] = useState(false);
  const [children, setChildren] = useState<Child[]>([]);
  const [activeChild, setActiveChild] = useState<string | null>(null);

  useEffect(() => {
    loadTokens().then(async () => {
      if (hasSession()) {
        try {
          setMe(await api.me());
        } catch {
          /* 토큰 만료 */
        }
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (me?.role === 'guardian') {
      api.get<Child[]>('/guardian/children').then((cs) => {
        setChildren(cs);
        setActiveChild((prev) => prev ?? cs[0]?.studentId ?? null);
      }).catch(() => {});
    }
  }, [me]);

  // 뒤로가기(웹) → 앱 내부 이전 화면. 하위 화면 스택 우선, 없으면 예약/선생님/탭 순으로 복귀.
  const appBackRef = useRef<() => boolean>(() => false);
  appBackRef.current = () => {
    if (backStack.pop()) return true; // 하위 화면(자동매칭·기록·분류·시간변경 등) 닫기
    if (booking) { setBooking(false); return true; }
    if (teacher) { setTeacher(null); return true; }
    if (tab !== 'a') { setTab('a'); return true; }
    return false; // 홈 최상위 — 이탈 대신 그대로 유지
  };
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history?.pushState) return;
    window.history.pushState({ itall: true }, '');
    const onPop = () => {
      appBackRef.current();
      // 버퍼 엔트리를 다시 쌓아 다음 뒤로가기도 앱 내부에서 처리(링크 이탈 방지).
      window.history.pushState({ itall: true }, '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (!ready)
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0E5C7C" />
      </View>
    );

  if (!me)
    return (
      <LoginScreen
        onLogin={async () => {
          setTab('a');
          setTeacher(null);
          setMe(await api.me());
        }}
      />
    );

  const isGuardian = me.role === 'guardian';
  const isStudent = me.role === 'student';
  const tabs = isGuardian ? ['a', 'b', 'c', 'd'] : ['a', 'b', 'e', 'c', 'f', 'd'];
  const guardianLabel: Record<string, string> = { a: '홈', b: '상담', c: '결제', d: '충전' };
  const studentLabel: Record<string, string> = { a: '선생님', b: '내 예약', e: '자료실', c: 'Q&A', f: '커뮤니티', d: '마이' };
  const tabLabel = (t: string) => (isGuardian ? guardianLabel[t] ?? '' : studentLabel[t] ?? '');

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.brand}>잇올 멘토링 · {isGuardian ? '학부모' : '학생'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={toggle}>
            <Text style={styles.logout}>{dark ? '☀️ 라이트' : '🌙 다크'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await api.logout();
              setMe(null);
            }}
          >
            <Text style={styles.logout}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        {!isStudent && !isGuardian && <Text style={styles.notice}>이 역할은 웹(apps/web)을 이용하세요.</Text>}

        {isStudent &&
          (tab === 'a' ? (
            teacher ? (
              booking ? (
                <SlotsScreen teacher={teacher} onBack={() => setBooking(false)} />
              ) : (
                <TeacherDetailScreen teacher={teacher} onBack={() => setTeacher(null)} onBook={() => setBooking(true)} />
              )
            ) : (
              <SearchScreen onPick={(t) => { setTeacher(t); setBooking(false); }} onGoQna={() => setTab('c')} />
            )
          ) : tab === 'b' ? (
            <BookingsScreen />
          ) : tab === 'e' ? (
            <MaterialsScreen />
          ) : tab === 'c' ? (
            <QnaScreen />
          ) : tab === 'f' ? (
            <CommunityScreen />
          ) : (
            <MyScreen />
          ))}

        {isGuardian && (
          children.length === 0 ? (
            <View style={{ padding: SP.xl }}><Text style={styles.notice}>연결된 자녀가 없어요. 학생 계정에서 보호자 연결을 승인하면 표시됩니다.</Text></View>
          ) : tab === 'a' ? (
            <GuardianHome children={children} activeId={activeChild} setActiveId={setActiveChild} goTab={setTab} />
          ) : tab === 'b' ? (
            <GuardianConsult children={children} activeId={activeChild} setActiveId={setActiveChild} />
          ) : tab === 'c' ? (
            <GuardianPay children={children} activeId={activeChild} setActiveId={setActiveChild} goTab={setTab} />
          ) : (
            <GuardianCharge children={children} activeId={activeChild} setActiveId={setActiveChild} />
          )
        )}
      </View>

      {(isStudent || isGuardian) && (
        <View style={styles.tabs}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActiveBox]}
              onPress={() => {
                setTab(t);
                setTeacher(null);
                setBooking(false);
              }}
            >
              <Text style={[styles.tabLabel, tab === t && styles.tabActive]}>{tabLabel(t)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  app: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header: { backgroundColor: C.teal, paddingHorizontal: SP.lg, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, letterSpacing: -0.3 },
  logout: { color: '#cfe3ec', fontSize: 13, fontWeight: '600' },
  body: { flex: 1 },
  notice: { padding: SP.xl, color: C.muted },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingBottom: 4 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderTopWidth: 2, borderTopColor: 'transparent' },
  tabActiveBox: { borderTopColor: C.teal },
  tabLabel: { color: C.caption, fontWeight: '600', fontSize: 13 },
  tabActive: { color: C.teal, fontWeight: '800' },
});
