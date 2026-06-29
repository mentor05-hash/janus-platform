import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { api, Child, hasSession, loadTokens, Me, Teacher } from './src/api';
import { LoginScreen } from './src/screens/LoginScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SlotsScreen } from './src/screens/SlotsScreen';
import { CreditsScreen } from './src/screens/CreditsScreen';
import { ChildrenScreen } from './src/screens/ChildrenScreen';
import { ChildNotesScreen } from './src/screens/ChildNotesScreen';
import { PaymentsScreen } from './src/screens/PaymentsScreen';

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
  const tabs = isGuardian ? ['a', 'b'] : ['a', 'b'];
  const tabLabel = (t: string) => (isGuardian ? (t === 'a' ? '자녀' : '결제요청') : t === 'a' ? '선생님 찾기' : '크레딧');

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
          ) : (
            <CreditsScreen />
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
              style={styles.tab}
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
  app: { flex: 1, backgroundColor: '#F5F7F8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#0E5C7C', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#fff', fontWeight: '700', fontSize: 16 },
  logout: { color: '#cfe3ec' },
  body: { flex: 1 },
  notice: { padding: 24, color: '#5b6b73' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e3e8eb', backgroundColor: '#fff' },
  tab: { flex: 1, padding: 14, alignItems: 'center' },
  tabLabel: { color: '#8a979e', fontWeight: '600' },
  tabActive: { color: '#0E5C7C' },
});
