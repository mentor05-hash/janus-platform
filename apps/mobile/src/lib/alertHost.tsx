import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { R, SP, useTheme, type Palette } from '../theme';

/**
 * 앱 내 알림 대화상자 — `Alert.alert` 대체.
 *
 * 왜 만들었나: 이 앱은 네이티브뿐 아니라 **웹으로도 빌드돼 서빙된다**(:8090, `Dockerfile.web`).
 * 그런데 `react-native-web` 의 Alert 구현은 **문자 그대로 빈 함수**다 —
 *     `class Alert { static alert() {} }`
 * 그래서 웹에서는 22곳의 안내가 전부 무음이었다. 상태는 바뀌는데(예약 생성·찜 토글) 사용자는 아무것도 못 본다.
 * 특히 예약 화면의 '예약 완료'·'크레딧 부족'·'줌 상담실 만석'·'예약할 수 없어요' 가 전부 사라져
 * **성공했는지 실패했는지 알 수 없는 상태**로 결제성 동작을 하게 했다.
 *
 * 왜 네이티브에서도 OS 대화상자를 안 쓰나: 경로가 둘이면 한쪽은 반드시 검증 밖에 남는다(이 버그가 그렇게 생겼다).
 * RN `Modal` 은 웹·네이티브 양쪽에서 동작하므로 **한 경로로 합치고 브라우저에서 실측**한다.
 *
 * 시그니처는 `Alert.alert` 와 호환된다 — 호출부는 이름만 바꾸면 된다.
 */
export type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};
type AlertReq = { title: string; message?: string; buttons?: AlertButton[] };

/** 호스트가 붙기 전(초기 렌더·로그인 전) 호출도 잃지 않도록 큐에 담는다. */
let emit: ((r: AlertReq) => void) | null = null;
const queue: AlertReq[] = [];

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const req = { title, message, buttons };
  if (emit) emit(req);
  else queue.push(req);
}

export function AlertHost() {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [req, setReq] = useState<AlertReq | null>(null);

  useEffect(() => {
    emit = setReq;
    const pending = queue.splice(0, queue.length);
    if (pending.length) setReq(pending[pending.length - 1]); // 밀린 것 중 마지막 하나만 — 연속 팝업은 소음이다
    return () => { emit = null; };
  }, []);

  if (!req) return null;

  // 버튼이 없으면 RN Alert 와 같이 '확인' 하나. cancel 은 왼쪽에 둔다(파괴적 선택을 오른쪽으로).
  const buttons: AlertButton[] = req.buttons?.length ? [...req.buttons] : [{ text: '확인' }];
  const close = () => setReq(null);
  const press = (b: AlertButton) => { close(); b.onPress?.(); };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      {/* 바깥을 눌러도 닫히지 않는다 — 확인/취소를 명시적으로 고르게 한다(파괴적 선택이 섞여 있다). */}
      <View style={s.backdrop}>
        <View style={s.box}>
          <Text style={s.title}>{req.title}</Text>
          {req.message ? <Text style={s.msg}>{req.message}</Text> : null}
          <View style={s.row}>
            {buttons.map((b, i) => (
              <TouchableOpacity
                key={`${b.text}-${i}`}
                onPress={() => press(b)}
                style={[s.btn, b.style === 'destructive' && s.btnDanger, b.style === 'cancel' && s.btnCancel]}
              >
                <Text style={[s.btnT, b.style === 'destructive' && s.btnDangerT, b.style === 'cancel' && s.btnCancelT]}>{b.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center', padding: SP.lg },
  box: { width: '100%', maxWidth: 340, backgroundColor: C.white, borderRadius: R.card, padding: 20 },
  title: { fontSize: 16, fontWeight: '800', color: C.ink },
  msg: { fontSize: 14, color: C.body, lineHeight: 20, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  btn: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: C.teal },
  btnT: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  btnCancel: { backgroundColor: C.white, borderWidth: 1, borderColor: C.inputBorder },
  btnCancelT: { color: C.body },
  btnDanger: { backgroundColor: C.danger },
  btnDangerT: { color: '#FFFFFF' },
});
