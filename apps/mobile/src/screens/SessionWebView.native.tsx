import { useMemo, type ComponentType } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useTheme, type Palette } from '../theme';

/**
 * 하이브리드 스캐폴딩(§앱 스토어 등록 준비) — 네이티브에서 몰입형 상담(채팅·화이트보드·음성)을
 * WebView 로 임베드. 웹(expo-web)에서는 SessionHost 의 DOM 구현을 그대로 쓰고, 네이티브에서만
 * 이 화면을 사용한다(App/SessionHost 에서 Platform.OS 로 분기).
 *
 * 전제(스토어 빌드 시 채움):
 *  - extra.webOrigin: 몰입형 세션을 서빙하는 HTTPS 오리진(모바일 웹 빌드 배포 주소).
 *  - 웹앱에 임베드 라우트 `/embed/session?booking=&kind=` 제공(토큰은 postMessage 또는 주입).
 *  - app.json 카메라·마이크 권한 선언 완료(NSCamera/Microphone, CAMERA/RECORD_AUDIO).
 *  - Android: WebView onPermissionRequest 로 카메라·마이크 grant 필요(아래 참고).
 *
 * 실제 네이티브 동작은 EAS 개발 빌드에서 검증해야 함(웹 미리보기로는 확인 불가).
 */
const WEB_ORIGIN = (Constants.expoConfig?.extra as { webOrigin?: string } | undefined)?.webOrigin ?? '';

export function SessionWebView({
  bookingId, token, kind = 'chat', title, onClose,
}: {
  bookingId: string;
  token: string | null;
  kind?: 'chat' | 'whiteboard' | 'call';
  title: string;
  onClose: () => void;
}) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);

  // 웹에서는 이 컴포넌트를 쓰지 않음(SessionHost DOM 구현 사용). 방어적으로 안내.
  if (Platform.OS === 'web' || !WEB_ORIGIN) {
    return (
      <View style={s.wrap}>
        <Text style={s.t}>몰입형 상담(WebView) 임베드</Text>
        <Text style={s.d}>
          {Platform.OS === 'web'
            ? '웹에서는 내장 화면(SessionHost)을 사용합니다.'
            : 'extra.webOrigin(HTTPS 세션 주소)이 설정되지 않았습니다. 스토어 빌드 시 eas.json/app.json 에 지정하세요.'}
        </Text>
      </View>
    );
  }

  // 네이티브 전용 — react-native-webview 는 네이티브 빌드에서만 로드(웹 번들 오염 방지).
  // 타입은 설치 후 해석되므로 스캐폴딩 단계에선 느슨히 처리.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { WebView } = require('react-native-webview') as { WebView: ComponentType<any> };
  const uri = `${WEB_ORIGIN}/embed/session?booking=${encodeURIComponent(bookingId)}&kind=${kind}`;
  const injected = `window.__ITALL_TOKEN=${JSON.stringify(token ?? '')};window.__ITALL_EMBED=true;true;`;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.head}>
        <Text style={s.headT} numberOfLines={1}>{title}</Text>
        <Text style={s.close} onPress={onClose}>✕</Text>
      </View>
      <WebView
        source={{ uri }}
        injectedJavaScriptBeforeContentLoaded={injected}
        originWhitelist={["*"]}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // iOS: 앱 내 카메라·마이크 자동 허용(권한 문자열은 Info.plist 에 선언됨)
        mediaCapturePermissionGrantType="grant"
        // Android 카메라·마이크는 onPermissionRequest 에서 grant 필요:
        //   onPermissionRequest={(e) => e.grant(e.resources)}  // 타입은 라이브러리 버전 참고
        onMessage={() => { /* 웹→네이티브 이벤트(종료·상태) 후결합 */ }}
        style={{ flex: 1 }}
      />
    </View>
  );
}

const mk = (C: Palette) => StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: C.bg, gap: 8 },
  t: { fontSize: 15, fontWeight: '800', color: C.ink },
  d: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.white },
  headT: { fontSize: 15, fontWeight: '800', color: C.ink, flex: 1 },
  close: { fontSize: 18, fontWeight: '800', color: C.muted, paddingHorizontal: 8 },
});
