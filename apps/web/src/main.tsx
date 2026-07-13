import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { I18nProvider } from './i18n';
import './styles/tokens.css';
import './styles/components.css';
import { initTheme } from './theme';
import { COLORS, APP_NAME } from './branding.generated'; // 화이트라벨 브랜드(설정 주입)

// 브랜드 컬러를 CSS 변수로 주입(tokens.css 기본값 오버라이드 — 기본값=현재값이면 무변화)
// 스타일시트 방식: 다크모드 :root[data-theme='dark'] 블록이 특이도로 이겨 다크 팔레트가 유지된다.
const brandStyle = document.createElement('style');
brandStyle.textContent = `:root{--teal:${COLORS.primary};--teal-900:${COLORS.primaryDark};--teal-500:${COLORS.primary500};}`;
document.head.appendChild(brandStyle);
document.title = `${APP_NAME} — 미래를 여는 문`; // 브라우저 탭 제목(index.html 기본값 오버라이드)

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
