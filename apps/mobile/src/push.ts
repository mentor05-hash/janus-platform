import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * 푸시 토큰 등록.
 * - 네이티브(iOS/Android): expo-notifications 로 권한 요청 + Expo 푸시 토큰 발급.
 * - 웹(expo-web): 네이티브 푸시 미지원 → 브라우저별 데모 토큰(동작 시연용).
 * 네이티브 API 는 Platform.OS 가드 뒤에서만 호출한다.
 */
export async function registerPushToken(): Promise<{ token: string; platform: string } | null> {
  try {
    if (Platform.OS === 'web') {
      const KEY = 'mp_push_token';
      let token = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
      if (!token) {
        token = `ExponentPushToken[web-${Math.random().toString(36).slice(2, 10)}]`;
        if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, token);
      }
      await api.post('/me/push-token', { token, platform: 'web' });
      return { token, platform: 'web' };
    }

    if (!Device.isDevice) return null; // 시뮬레이터/에뮬레이터는 실 토큰 없음

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await api.post('/me/push-token', { token, platform: Platform.OS });
    return { token, platform: Platform.OS };
  } catch {
    return null; // 등록 실패는 무시(다음 로그인 재시도)
  }
}
