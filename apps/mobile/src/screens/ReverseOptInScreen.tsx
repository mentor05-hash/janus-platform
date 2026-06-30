import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { api, ApiError } from '../api';
import { C, R, SP, ui } from '../theme';

export function ReverseOptInScreen() {
  const [value, setValue] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api
      .get<{ reverseSelf: boolean }>('/bookings/reverse/self')
      .then((r) => setValue(r.reverseSelf))
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setError('');
    setMsg('');
    const prev = value;
    setValue(next);
    try {
      await api.patch('/bookings/reverse/self', { value: next });
      setMsg(next ? '역상담 받기를 신청했습니다.' : '역상담 받기 신청을 취소했습니다.');
    } catch (e) {
      setValue(prev ?? false);
      setError(e instanceof ApiError ? e.message : '변경 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={ui.screen}>
      <Text style={ui.h}>역상담 받기</Text>
      <Text style={[ui.sub, { marginBottom: SP.lg }]}>
        역상담은 선생님이 먼저 상담을 제안하는 기능입니다. 아래를 켜면, 첫 상담을 이미 진행한
        경우에도 선생님이 회원님에게 추가 상담을 제안할 수 있습니다.
      </Text>

      {value === null && !error ? (
        <ActivityIndicator color={C.teal} />
      ) : (
        <View style={[ui.card, styles.card]}>
          <View style={{ flex: 1, paddingRight: SP.md }}>
            <Text style={styles.title}>선생님 역상담 제안 받기</Text>
            <Text style={styles.desc}>
              {value ? '신청됨 — 선생님 목록에 노출됩니다.' : '꺼짐 — 첫 상담만 제안받습니다.'}
            </Text>
          </View>
          <Switch
            value={!!value}
            onValueChange={toggle}
            disabled={busy}
            trackColor={{ false: C.line, true: C.teal100 }}
            thumbColor={value ? C.teal : '#f4f3f4'}
          />
        </View>
      )}

      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      {error ? <Text style={ui.error}>{error}</Text> : null}

      <View style={styles.note}>
        <Text style={styles.noteText}>
          • 첫 상담이 필요한 회원은 이 설정과 무관하게 선생님이 제안할 수 있습니다.{'\n'}
          • 관리자가 역상담 대상으로 지정할 수도 있습니다.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '700', color: C.ink },
  desc: { fontSize: 13, color: C.muted, marginTop: 4 },
  ok: { color: C.done, fontSize: 13, marginTop: SP.md, fontWeight: '600' },
  note: { marginTop: SP.xl, backgroundColor: C.teal50, borderRadius: R.md, padding: SP.md },
  noteText: { color: C.muted, fontSize: 12, lineHeight: 19 },
});
