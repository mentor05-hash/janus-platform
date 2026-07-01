import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { api, Child, hasSession, loadTokens, Me, Teacher } from './src/api';
import { LoginScreen } from './src/screens/LoginScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SlotsScreen } from './src/screens/SlotsScreen';
import { BookingsScreen } from './src/screens/BookingsScreen';
import { QnaScreen } from './src/screens/QnaScreen';
import { MaterialsScreen } from './src/screens/MaterialsScreen';
import { MyScreen } from './src/screens/MyScreen';
import { ChildrenScreen } from './src/screens/ChildrenScreen';
import { ChildNotesScreen } from './src/screens/ChildNotesScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';
import { C, SP } from './src/theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState('a');
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [child, setChild] = useState<Child | null>(null);

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
          setChild(null);
          setMe(await api.me());
        }}
      />
    );

  const isGuardian = me.role === 'guardian';
  const isStudent = me.role === 'student';
  const tabs = isGuardian ? ['a', 'b'] : ['a', 'b', 'e', 'c', 'd'];
  const studentLabel: Record<string, string> = { a: '선생님', b: '내 예약', e: '자료실', c: 'Q&A', d: '마이' };
  const tabLabel = (t: string) => (isGuardian ? (t === 'a' ? '자녀' : '결제요청') : studentLabel[t] ?? '');

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.brand}>잇올 멘토링 · {isGuardian ? '학부모' : '학생'}</Text>
        <TouchableOpacity
          onPress={async () => {
            await api.logout();
            setMe(null);
          }}
        >
          <Text style={styles.logout}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {!isStudent && !isGuardian && <Text style={styles.notice}>이 역할은 웹(apps/web)을 이용하세요.</Text>}

        {isStudent &&
          (tab === 'a' ? (
            teacher ? (
              <SlotsScreen teacher={teacher} onBack={() => setTeacher(null)} />
            ) : (
              <SearchScreen onPick={setTeacher} />
            )
          ) : tab === 'b' ? (
            <BookingsScreen />
          ) : tab === 'e' ? (
            <MaterialsScreen />
          ) : tab === 'c' ? (
            <QnaScreen />
          ) : (
            <MyScreen />
          ))}

        {isGuardian &&
          (tab === 'a' ? (
            child ? (
              <ChildNotesScreen child={child} onBack={() => setChild(null)} />
            ) : (
              <ChildrenScreen onPick={setChild} />
            )
          ) : (
            <PaymentsScreen />
          ))}
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
                setChild(null);
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

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header: { backgroundColor: C.teal, paddingHorizontal: SP.lg, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: C.white, fontWeight: '800', fontSize: 16, letterSpacing: -0.3 },
  logout: { color: '#cfe3ec', fontSize: 13, fontWeight: '600' },
  body: { flex: 1 },
  notice: { padding: SP.xl, color: C.muted },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingBottom: 4 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderTopWidth: 2, borderTopColor: 'transparent' },
  tabActiveBox: { borderTopColor: C.teal },
  tabLabel: { color: C.caption, fontWeight: '600', fontSize: 13 },
  tabActive: { color: C.teal, fontWeight: '800' },
});
