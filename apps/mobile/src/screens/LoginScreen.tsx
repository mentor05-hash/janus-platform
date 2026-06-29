import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [loginId, setLoginId] = useState('student01');
  const [password, setPassword] = useState('dev-password!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await api.login(loginId, password);
      onLogin();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '로그인 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>잇올 멘토링 로그인</Text>
      <Text style={styles.label}>아이디</Text>
      <TextInput style={styles.input} value={loginId} onChangeText={setLoginId} autoCapitalize="none" />
      <Text style={styles.label}>비밀번호</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>로그인</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F5F7F8' },
  title: { fontSize: 22, fontWeight: '700', color: '#0E5C7C', marginBottom: 24 },
  label: { color: '#5b6b73', fontSize: 13, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e8eb', borderRadius: 8, padding: 12 },
  error: { color: '#d23b3b', marginTop: 8 },
  btn: { backgroundColor: '#0E5C7C', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '700' },
});
