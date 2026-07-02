import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';

const CENTERS = [
  { key: '강남', name: '강남 센터', sub: '서울 강남구 · 본원' },
  { key: '분당', name: '분당 센터', sub: '경기 성남시' },
  { key: '잠실', name: '잠실 센터', sub: '서울 송파구' },
];
const DEMO_PW = 'dev-password!';
// 데모 모드에서만 로그인 편의(자동로그인·역할 원터치·기본 비번) 활성. 실서비스=false.
const DEMO = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
// 모바일 지원 역할(관리자·HR은 웹 콘솔). 탭하면 아이디·비번 자동 채움.
const ROLES = [
  { label: '학생', id: 'student01' },
  { label: '선생님', id: 'lt1' },
  { label: '학부모', id: 'guardian01' },
];

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [loginId, setLoginId] = useState(DEMO ? 'student01' : '');
  const [password, setPassword] = useState(DEMO ? DEMO_PW : '');
  const [center, setCenter] = useState('강남');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

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

  // URL ?u=아이디&p=비번 → 자동 로그인(데모 전용). 실서비스에선 비번 URL 노출 방지 위해 비활성.
  useEffect(() => {
    if (!DEMO || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const u = q.get('u');
    const p = q.get('p');
    if (!u || !p) return;
    setLoginId(u);
    setPassword(p);
    (async () => {
      setBusy(true);
      try { await api.login(u, p); onLogin(); }
      catch (e) { setError(e instanceof ApiError ? e.message : '자동 로그인 실패'); }
      finally { setBusy(false); }
    })();
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.teal }} contentContainerStyle={{ flexGrow: 1 }}>
      {/* 히어로 */}
      <View style={styles.hero}>
        <View style={styles.mark}><Text style={styles.markText}>멘</Text></View>
        <Text style={styles.brand}>멘토링 플랫폼</Text>
        <Text style={styles.heroSub}>우리 센터를 선택하면{'\n'}계정에 자동으로 연동돼요.</Text>
      </View>

      {/* 흰 시트 */}
      <View style={styles.sheet}>
        <Text style={styles.label}>우리 센터 선택</Text>
        <View style={styles.search}>
          <Text style={{ color: C.caption }}>🔍 검색</Text>
        </View>
        <View style={{ gap: 8, marginTop: 8 }}>
          {CENTERS.map((c) => {
            const on = center === c.key;
            return (
              <TouchableOpacity key={c.key} style={[styles.center, on && styles.centerOn]} onPress={() => setCenter(c.key)} activeOpacity={0.8}>
                <View style={[styles.cAvatar, on && { backgroundColor: C.teal }]}>
                  <Text style={[styles.cAvatarT, on && { color: '#fff' }]}>{c.key.slice(0, 1)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cName}>{c.name}</Text>
                  <Text style={styles.cSub}>{c.sub}</Text>
                </View>
                {on && <Text style={{ color: C.teal, fontSize: 18, fontWeight: '800' }}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { marginTop: SP.lg }]}>아이디</Text>
        <TextInput style={ui.input} value={loginId} onChangeText={setLoginId} autoCapitalize="none" placeholder="아이디" placeholderTextColor={C.caption} />
        <Text style={[styles.label, { marginTop: SP.md }]}>비밀번호</Text>
        <View style={styles.pwWrap}>
          <TextInput
            style={[ui.input, { paddingRight: 46 }]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowPw((s) => !s)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
          >
            <Text style={{ fontSize: 18, color: showPw ? C.teal : C.caption }}>👁</Text>
            {!showPw && <View style={styles.eyeSlash} />}
          </TouchableOpacity>
        </View>
        {error ? <Text style={ui.error}>{error}</Text> : null}

        {DEMO && (
          <>
            <Text style={[styles.label, { marginTop: SP.md }]}>역할 선택(원터치 채움)</Text>
            <View style={styles.roleRow}>
              {ROLES.map((r) => {
                const on = loginId === r.id;
                return (
                  <TouchableOpacity key={r.id} style={[styles.rolePill, on && styles.rolePillOn]} onPress={() => { setLoginId(r.id); setPassword(DEMO_PW); setError(''); }}>
                    <Text style={[styles.rolePillT, on && { color: '#fff' }]}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.demo}>
              <Text style={styles.demoText}>
                데모 계정 · 비밀번호 <Text style={{ fontWeight: '800' }}>{DEMO_PW}</Text>{'\n'}
                학생 student01~99 · 선생님 lt1~lt100 · 학부모 guardian01~80 (관리자·HR은 웹 콘솔)
              </Text>
            </View>
          </>
        )}

        <TouchableOpacity style={[ui.btn, { marginTop: SP.md }, busy && ui.btnDisabled]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={ui.btnText}>로그인</Text>}
        </TouchableOpacity>
        <Text style={styles.footer}>선택한 센터가 계정에 자동 연동됩니다</Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  hero: { paddingTop: 56, paddingBottom: 36, paddingHorizontal: SP.xl, alignItems: 'flex-start' },
  mark: { width: 52, height: 52, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  markText: { color: C.teal, fontWeight: '800', fontSize: 22 },
  brand: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  heroSub: { color: '#cfe3ec', fontSize: 14, marginTop: 8, lineHeight: 20 },
  sheet: { flex: 1, backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: SP.xl, paddingTop: 22 },
  label: { fontSize: 13, fontWeight: '700', color: C.muted, marginBottom: 8 },
  pwWrap: { position: 'relative', justifyContent: 'center' },
  eyeBtn: { position: 'absolute', right: 8, top: 0, bottom: 0, width: 34, alignItems: 'center', justifyContent: 'center' },
  eyeSlash: { position: 'absolute', width: 24, height: 2, borderRadius: 1, backgroundColor: C.caption, transform: [{ rotate: '45deg' }] },
  search: { backgroundColor: C.white, borderWidth: 1, borderColor: C.inputBorder, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 11 },
  center: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12 },
  centerOn: { borderColor: C.teal, borderWidth: 2, backgroundColor: C.teal50 },
  cAvatar: { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.teal100, alignItems: 'center', justifyContent: 'center' },
  cAvatarT: { color: C.teal, fontWeight: '800', fontSize: 15 },
  cName: { fontSize: 15, fontWeight: '700', color: C.ink },
  cSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  footer: { textAlign: 'center', color: C.caption, fontSize: 12, marginTop: 14 },
  demo: { marginTop: SP.md, backgroundColor: C.teal50, borderRadius: R.md, paddingVertical: 10, paddingHorizontal: 12 },
  demoText: { color: C.muted, fontSize: 12, lineHeight: 18 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rolePill: { borderWidth: 1, borderColor: C.line, backgroundColor: C.white, borderRadius: R.pill, paddingVertical: 8, paddingHorizontal: 16 },
  rolePillOn: { backgroundColor: C.teal, borderColor: C.teal },
  rolePillT: { color: C.muted, fontWeight: '700', fontSize: 13 },
});
