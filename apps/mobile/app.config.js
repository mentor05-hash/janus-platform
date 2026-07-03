/**
 * 화이트라벨 — app.json(권한·플러그인 등 기능 설정)을 베이스로, 브랜드 값만
 * branding.config.json 에서 덮어씀. 기능·동작 불변, 브랜드만 설정 주입.
 * (Expo 는 app.config.js 가 있으면 이를 우선 사용)
 */
const base = require('./app.json').expo;
let b;
try {
  b = require('../../branding.config.json');
} catch {
  b = null; // 설정 없으면 app.json 그대로
}

module.exports = () => {
  if (!b) return { expo: base };
  return {
    expo: {
      ...base,
      name: b.appName,
      slug: b.ids?.slug ?? base.slug,
      scheme: b.ids?.scheme ?? base.scheme,
      splash: { ...base.splash, backgroundColor: b.colors?.primary ?? base.splash.backgroundColor },
      ios: { ...base.ios, bundleIdentifier: b.ids?.bundleId ?? base.ios.bundleIdentifier },
      android: {
        ...base.android,
        package: b.ids?.bundleId ?? base.android.package,
        adaptiveIcon: { ...base.android.adaptiveIcon, backgroundColor: b.colors?.primary ?? base.android.adaptiveIcon.backgroundColor },
      },
      notification: { ...base.notification, color: b.colors?.primary ?? base.notification.color },
      extra: { ...base.extra, apiBase: b.urls?.apiBase ?? base.extra.apiBase, webOrigin: b.urls?.webOrigin ?? base.extra.webOrigin },
    },
  };
};
