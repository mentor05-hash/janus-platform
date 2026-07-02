import { useEffect, useRef } from 'react';

/**
 * 웹(expo-web) 뒤로가기 처리 — 하드코딩 탭 네비에는 브라우저 히스토리가 없어
 * 뒤로가기 시 링크를 이탈한다. 하위 화면들이 자신의 "닫기" 핸들러를 스택에 등록하고,
 * App 의 popstate 핸들러가 가장 위 핸들러부터 소비해 앱 내부에서 뒤로 이동시킨다.
 */
type Handler = () => void;
const stack: Handler[] = [];

export const backStack = {
  push(h: Handler) {
    stack.push(h);
  },
  remove(h: Handler) {
    const i = stack.lastIndexOf(h);
    if (i >= 0) stack.splice(i, 1);
  },
  /** 최상위 핸들러 1개 실행. 처리했으면 true. */
  pop(): boolean {
    const h = stack.pop();
    if (h) {
      h();
      return true;
    }
    return false;
  },
};

/** 하위 화면이 열려있는 동안(active) 뒤로가기 핸들러를 등록. */
export function useWebBack(active: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const h = () => ref.current();
    backStack.push(h);
    // forward 시 실제 히스토리 엔트리를 쌓아 브라우저/제스처 back 과 1:1 매칭(이탈 방지).
    if (typeof window !== 'undefined' && window.history?.pushState) window.history.pushState({ itall: true }, '');
    return () => backStack.remove(h);
  }, [active]);
}
