import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { C, R, SP, ui } from '../theme';

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
      <View style={styles.brandRow}>
        <View style={styles.mark}>
          <Text style={styles.markText}>잇</Text>
        </View>
        <Text style={styles.title}>잇올 멘토링</Text>
      </View>
      <Text style={styles.welcome}>로그인하고 상담을 예약하세요</Text>

      <Text style={ui.label}>아이디</Text>
      <TextInput style={ui.input} value={loginId} onChangeText={setLoginId} autoCapitalize="none" />
      <Text style={ui.label}>비밀번호</Text>
      <TextInput style={ui.input} value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <TouchableOpacity style={[ui.btn, { marginTop: SP.xl }, busy && ui.btnDisabled]} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={ui.btnText}>로그인</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: SP.xl, backgroundColor: C.bg },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  mark: { width: 38, height: 38, borderRadius: R.md, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' },
  markText: { color: C.white, fontWeight: '800', fontSize: 18 },
  title: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  welcome: { color: C.muted, fontSize: 14, marginBottom: SP.xl },
});
