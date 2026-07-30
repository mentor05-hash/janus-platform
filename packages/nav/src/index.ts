/**
 * `@mentoring/nav` — 역할별 메뉴의 **단일 정본**.
 *
 * 웹 사이드바(`roleNav`) · 모바일 탭/허브(`mobile`) · 경로 해석(`routes`)이 한 패키지에 있다.
 * 셋이 각 앱 안에 흩어져 있던 동안 서로를 못 봤고, 그 사이가 O185(같은 이름 다른 내용)·
 * O186(오연결 4건)이 자란 자리였다.
 *
 * 규칙: **React·React Native 를 import 하지 않는다.** 데이터와 순수 함수만 둬야
 * 웹·모바일·API 스펙이 모두 이 패키지를 읽을 수 있다(테스트가 대조할 수 있는 이유).
 */
export * from './roleNav';
export * from './mobile';
export * from './routes';
