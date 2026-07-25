import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI, type Palette } from '../theme';

/**
 * 자녀 연결(보호자) — 웹 `GuardianConsentPage` 의 '자녀 연결' 카드 모바일 이식.
 *
 * 왜 필요했나: 모바일 학부모는 자녀가 0명이면 **탭 분기 이전에** 가로채여
 * "연결된 자녀가 없어요. 학생 계정에서 보호자 연결을 승인하면 표시됩니다." 한 줄만 봤다(App.tsx).
 * 그런데 **신청하는 화면이 없어서** 학생에게는 승인할 것이 애초에 생기지 않는다 —
 * 서로가 상대를 기다리는 교착이었고, 5개 탭 전부가 같은 문구였다.
 * (신청 알림 자체는 백엔드가 보낸다: guardian.service `guardian_link_requested`.)
 *
 * 상태 라벨이 학생 화면과 다른 것은 의도다 — 같은 행을 **각자 관점**으로 본다
 * (`listLinks` 는 counterpartName 을 호출자 기준 '상대'로 내려준다).
 */
type GLink = { id: string; status: string; relation: string | null; counterpartName: string; canRespond?: boolean };

/** 보호자 관점 라벨 — 웹 GuardianConsentPage 와 문자열을 맞춘다(두 클라이언트가 다른 말을 하면 안 된다). */
const LINK_STATUS: Record<string, string> = {
  pending: '자녀 승인 대기 중',
  approved: '연결됨',
  rejected: '자녀가 거절함',
  revoked: '연결 해제됨',
};

const RELATIONS = ['모', '부', '기타'] as const;

export function GuardianLinkScreen({ onBack, onLinked }: { onBack?: () => void; onLinked?: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);

  const [links, setLinks] = useState<GLink[] | null>(null);
  const [loginId, setLoginId] = useState('');
  const [relation, setRelation] = useState<string>('모');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const loadLinks = () =>
    api.get<GLink[]>('/guardian/links')
      .then((r) => setLinks(Array.isArray(r) ? r : []))
      .catch(() => setLinks([])); // 조회 실패로 신청 폼까지 숨기면 다시 막다른 길이 된다

  useEffect(() => { void loadLinks(); }, []);

  async function requestLink() {
    const id = loginId.trim();
    if (!id) { setError('자녀 아이디를 입력하세요.'); return; }
    setBusy(true); setMsg(''); setError('');
    try {
      await api.post('/guardian/links', { studentLoginId: id, relation: relation || undefined });
      setMsg('연결을 신청했어요. 자녀가 승인하면 자녀 화면이 열립니다.');
      setLoginId(''); // 관계는 유지 — 자녀가 여럿이어도 보통 같은 관계다
      await loadLinks();
      onLinked?.(); // 상위(App)가 자녀 목록을 다시 읽게 한다 — 승인 전에는 아직 비어 있는 것이 정상
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '연결 신청 실패');
    } finally { setBusy(false); }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      {onBack ? (
        <TouchableOpacity onPress={onBack}><Text style={s.back}>‹ 뒤로</Text></TouchableOpacity>
      ) : null}
      <Text style={ui.h}>자녀 연결</Text>

      <View style={ui.card}>
        <Text style={ui.sub}>
          자녀의 아이디로 연결을 신청하면 자녀가 승인합니다. <Text style={s.b}>연결은 '열람 허용'이 아니에요</Text> —
          무엇을 볼 수 있는지는 자녀의 연령과 본인확인·동의(또는 성인 자녀의 공유 동의)로 정해집니다.
        </Text>

        {error ? <Text style={ui.error}>{error}</Text> : null}
        {msg ? <Text style={s.ok}>{msg}</Text> : null}

        <Text style={ui.label}>자녀 아이디</Text>
        <TextInput
          value={loginId}
          onChangeText={setLoginId}
          placeholder="자녀 아이디"
          placeholderTextColor={C.caption}
          autoCapitalize="none"
          autoCorrect={false}
          style={ui.input}
        />

        <Text style={ui.label}>관계</Text>
        <View style={s.pills}>
          {RELATIONS.map((r) => (
            <TouchableOpacity key={r} onPress={() => setRelation(r)} style={[s.pill, relation === r && s.pillOn]}>
              <Text style={[s.pillT, relation === r && { color: C.white }]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity onPress={requestLink} disabled={busy} style={[ui.btn, busy && ui.btnDisabled, { marginTop: SP.md }]}>
          <Text style={ui.btnText}>{busy ? '신청 중…' : '연결 신청'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[ui.card, { marginTop: SP.md }]}>
        <Text style={s.sec}>내 신청 상태</Text>
        {links === null ? (
          <Text style={ui.sub}>불러오는 중…</Text>
        ) : links.length === 0 ? (
          <Text style={ui.sub}>아직 신청한 연결이 없어요. 위에서 자녀 아이디로 신청해 주세요.</Text>
        ) : (
          links.map((l) => (
            <View key={l.id} style={s.row}>
              <Text style={s.rowName}>
                {l.counterpartName}
                {l.relation ? <Text style={s.rowRel}> · {l.relation}</Text> : null}
              </Text>
              <Text style={s.rowStatus}>{LINK_STATUS[l.status] ?? l.status}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  sec: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 8 },
  b: { fontWeight: '800', color: C.body },
  ok: { color: C.done, fontSize: 13, marginTop: SP.sm, fontWeight: '600' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderWidth: 1, borderColor: C.inputBorder, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.white },
  pillOn: { backgroundColor: C.teal, borderColor: C.teal },
  pillT: { fontSize: 13, color: C.body, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: C.lineSoft },
  rowName: { flex: 1, fontSize: 14, fontWeight: '700', color: C.ink },
  rowRel: { fontWeight: '400', color: C.muted },
  rowStatus: { fontSize: 12.5, color: C.muted },
});
