import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { api, hasSession, loadTokens, Teacher } from './src/api';
import { LoginScreen } from './src/screens/LoginScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SlotsScreen } from './src/screens/SlotsScreen';
import { CreditsScreen } from './src/screens/CreditsScreen';

type Tab = 'search' | 'credits';

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('search');
  const [teacher, setTeacher] = useState<Teacher | null>(null);

  useEffect(() => {
    loadTokens().then(() => {
      setAuthed(hasSession());
      setReady(true);
    });
  }, []);

  if (!ready)
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0E5C7C" />
      </View>
    );

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.brand}>잇올 멘토링 · 학생</Text>
        <TouchableOpacity
          onPress={async () => {
            await api.logout();
            setAuthed(false);
          }}
        >
          <Text style={styles.logout}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {tab === 'search' &&
          (teacher ? (
            <SlotsScreen teacher={teacher} onBack={() => setTeacher(null)} />
          ) : (
            <SearchScreen onPick={setTeacher} />
          ))}
        {tab === 'credits' && <CreditsScreen />}
      </View>

      <View style={styles.tabs}>
        {(['search', 'credits'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={styles.tab}
            onPress={() => {
              setTab(t);
              if (t === 'search') setTeacher(null);
            }}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabActive]}>{t === 'search' ? '선생님 찾기' : '크레딧'}</Text>
          </TouchableOpacity>
        ))}
      </View>
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
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e3e8eb', backgroundColor: '#fff' },
  tab: { flex: 1, padding: 14, alignItems: 'center' },
  tabLabel: { color: '#8a979e', fontWeight: '600' },
  tabActive: { color: '#0E5C7C' },
});
