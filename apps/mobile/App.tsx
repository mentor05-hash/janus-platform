import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { api, Child, hasSession, loadTokens, Me, Teacher } from './src/api';
import { backStack } from './src/webBack';
import { registerPushToken } from './src/push';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { DiagnosticScreen } from './src/screens/DiagnosticScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { GlobalSearchScreen } from './src/screens/GlobalSearchScreen';
import { TeacherDetailScreen } from './src/screens/TeacherDetailScreen';
import { SlotsScreen } from './src/screens/SlotsScreen';
import { BookingsScreen } from './src/screens/BookingsScreen';
import { QnaScreen } from './src/screens/QnaScreen';
import { MaterialsScreen } from './src/screens/MaterialsScreen';
import { CommunityScreen } from './src/screens/CommunityScreen';
import { MyScreen } from './src/screens/MyScreen';
import { PrescriptionScreen } from './src/screens/PrescriptionScreen';
import { ClassroomScreen } from './src/screens/ClassroomScreen';
import { AcademyFinderScreen } from './src/screens/AcademyFinderScreen';
import { GuardianConsult, GuardianHome, GuardianMy, GuardianWallet } from './src/screens/GuardianScreens';
import { GuardianLinkScreen } from './src/screens/GuardianLinkScreen';
import { TeacherInbox, TeacherToday, TeacherSessions, TeacherRecords, TeacherMy } from './src/screens/TeacherScreens';
import { SATELLITE_PARENT } from './src/nav/hubMenu';
import { ThemeProvider, useTheme, type Palette, SP } from './src/theme';
import { AlertHost } from './src/lib/alertHost';
import { APP_NAME } from './src/branding.generated';

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
      {/* 앱 내 알림 대화상자 — react-native-web 의 Alert 가 빈 함수라 웹 빌드에서 안내가 전부 무음이었다. */}
      <AlertHost />
    </ThemeProvider>
  );
}

function AppInner() {
  const { C, dark, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState('a');
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookMode, setBookMode] = useState<string | undefined>(undefined);
  const [bookType, setBookType] = useState<string | undefined>(undefined); // 검색에서 고른 상담 종류(담임/교과/입시/심리)
  const [bookSub, setBookSub] = useState<string | undefined>(undefined); // 세부 유형(과목 등)
  const [children, setChildren] = useState<Child[]>([]);
  const [activeChild, setActiveChild] = useState<string | null>(null);
  const [childState, setChildState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [searchOpen, setSearchOpen] = useState(false); // 전역 통합검색 오버레이(학생)
  // 검색이 허브 **안쪽**(예: 처방 › 강좌)을 가리킬 때 그 화면까지 열어 준다. 한 번 쓰고 비운다.
  const [pendingHub, setPendingHub] = useState<string | null>(null);
  const [exitHint, setExitHint] = useState(false); // 홈에서 '한 번 더 누르면 종료' 토스트
  const exitArmed = useRef(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 화면이 깊어질 때마다 실제 히스토리 엔트리를 쌓는다 — 브라우저/제스처 back 과 1:1 로 맞춰
  // 모바일에서 서비스 이탈을 막는다(단일 센티넬 재장전 방식은 스와이프 back 에서 취약).
  const pushGuard = () => {
    if (typeof window !== 'undefined' && window.history?.pushState) window.history.pushState({ mp: true }, '');
  };
  // 탭 이동 이력 — 뒤로가기가 홈이 아니라 '직전 탭'으로 복귀하도록(App back 검증).
  const tabHist = useRef<string[]>([]);
  const goTab = (next: string) => {
    if (next !== tab) { tabHist.current.push(tab); pushGuard(); }
    setTab(next);
    setTeacher(null);
    setBooking(false);
  };
  /** 탭 이동 + 그 탭의 허브 하위 화면까지 연다(검색·처방 CTA 가 같은 길을 쓴다). */
  const goHub = (t: string, hub: string) => { setPendingHub(hub); goTab(t); };
  const openTeacher = (t: Teacher, m?: string, ct?: string, sub?: string) => { setTeacher(t); setBooking(false); setBookMode(m); setBookType(ct); setBookSub(sub); pushGuard(); };
  const openBooking = () => { setBooking(true); pushGuard(); };

  useEffect(() => {
    loadTokens().then(async () => {
      if (hasSession()) {
        try {
          setMe(await api.me());
        } catch {
          /* 토큰 만료 */
        }
      }
      setReady(true);
    });
  }, []);

  // N30 — 학생 로그인/복귀 시 첫 화면은 홈('h'). me 가 바뀔 때 1회만 보정(이후 탭 이동은 그대로).
  useEffect(() => {
    if (me?.role === 'student') setTab('h');
  }, [me?.id, me?.role]);

  // 연결 신청 후에도 다시 부른다(승인 전이면 여전히 0명이 정상 — 그때는 신청 화면이 계속 열려 있다).
  // 조회 **실패**를 '0명'과 같이 다루면 안 된다: 이미 연결된 학부모가 일시적 오류로 신청 폼으로 강등된다.
  const loadChildren = useCallback(() => {
    if (me?.role !== 'guardian') return;
    api.get<Child[]>('/guardian/children').then((cs) => {
      setChildren(cs);
      setChildState('ok');
      // 새 목록과 대조한다 — 계정을 바꾸거나 연결이 해제되면 이전 자녀를 계속 가리키게 된다.
      setActiveChild((prev) => (prev && cs.some((c) => c.studentId === prev) ? prev : cs[0]?.studentId ?? null));
    }).catch(() => setChildState('error'));
  }, [me?.role]);
  useEffect(() => {
    // 계정이 바뀌면 이전 계정의 자녀를 먼저 지운다(fetch 완료 전까지 남으면 남의 자녀를 가리킨다).
    setChildren([]); setActiveChild(null); setChildState(me?.role === 'guardian' ? 'loading' : 'ok');
    loadChildren();
  }, [me, loadChildren]);

  // 푸시 토큰 등록 — 네이티브는 expo-notifications 실 토큰, 웹은 데모 토큰.
  useEffect(() => {
    if (!me) return;
    void registerPushToken();
  }, [me]);

  // 뒤로가기(웹) → 앱 내부 이전 화면. 하위 화면 스택 우선, 없으면 예약/선생님/탭 순으로 복귀.
  const appBackRef = useRef<() => boolean>(() => false);
  appBackRef.current = () => {
    if (backStack.pop()) return true; // 하위 화면(자동매칭·기록·분류·시간변경 등) 닫기
    if (booking) { setBooking(false); return true; }
    if (teacher) { setTeacher(null); return true; }
    const homeTab = me?.role === 'student' ? 'h' : 'a'; // N30 — 학생 홈은 'h'
    if (tab !== homeTab) { setTab(tabHist.current.pop() ?? homeTab); return true; } // 직전 탭으로 복귀(없으면 홈)
    // 홈 최상위: 첫 뒤로가기는 종료 안내 후 유지, 2초 내 다시 누르면 종료 허용.
    if (exitArmed.current) {
      exitArmed.current = false;
      setExitHint(false);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      if (typeof window !== 'undefined' && window.history) setTimeout(() => window.history.back(), 0); // 실제 이탈
      return true; // 재장전하지 않음 → 앱을 벗어남
    }
    exitArmed.current = true;
    setExitHint(true);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => { exitArmed.current = false; setExitHint(false); }, 2000);
    return false; // 센티넬 재장전 → 유지(+ 종료 안내 토스트)
  };
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history?.pushState) return;
    window.history.pushState({ mp: true }, ''); // 홈 기준 센티넬 1개
    const onPop = () => {
      // 깊은 화면은 forward 시 이미 엔트리를 쌓았으므로 back 이 그걸 소비 → 재장전 불필요.
      // 홈 최상위(처리할 게 없음)일 때만 센티넬을 다시 쌓아 서비스 이탈을 막는다.
      const handled = appBackRef.current();
      if (!handled) window.history.pushState({ mp: true }, '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (!ready)
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#2F6FB3" />
      </View>
    );

  if (!me)
    return (
      <LoginScreen
        onLogin={async () => {
          setTab('a');
          setTeacher(null);
          setMe(await api.me());
        }}
      />
    );

  const isGuardian = me.role === 'guardian';
  const isStudent = me.role === 'student';
  const isTeacher = me.role === 'teacher';
  // N30 — 학생 하단 탭 7→5(홈/질문/진단/일정/내정보). 탭에서 빠진 화면(a/r/e/f)은 홈 바로가기로 보존(기능 보존).
  // 학부모 탭 5 → 4(O185): 결제 계열 3개(멤버십·결제·충전)를 '결제' 하나로 합치고 '내정보'를 신설했다.
  //   웹에서 그 셋은 `결제·충전` 한 화면인데 모바일만 3탭이라 결제에 과대 대표돼 있었고,
  //   그만큼 동의·본인확인이 탭에서 밀려나 상담 탭 안에 묻혀 있었다.
  // 학생 탭을 **관문 축**으로(O189): 홈·진단·처방·실행·내정보.
  //   이전 `홈·질문·진단·일정·내정보` 는 '질문'과 '일정'이 둘 다 실행인데 도구 이름이라
  //   북극성(진단→처방→실행→통과)이 메뉴에서 보이지 않았다. 질문은 실행 허브 첫 줄 + 홈 타일로 남는다.
  const tabs = isGuardian ? ['a', 'b', 'c', 'd'] : isTeacher ? ['ti', 'to', 'ts', 'tr', 'tm'] : ['h', 'dg', 'rx', 'b', 'd'];
  const guardianLabel: Record<string, string> = { a: '홈', b: '상담', c: '결제', d: '내정보' };
  const studentLabel: Record<string, string> = { h: '홈', dg: '진단', rx: '처방', b: '실행', a: '선생님 찾기', r: '실시간 수업', e: '자료실', c: '질문', f: '라운지', d: '내정보' };
  const teacherLabel: Record<string, string> = { ti: '인박스', to: '오늘', ts: '상담', tr: '기록', tm: '마이' };
  // 시안(janus_app_v1) 하단 탭: 아이콘+라벨 — 도메인 아이콘 슬롯 규칙
  const guardianIcon: Record<string, string> = { a: '⌂', b: '◇', c: '₩', d: '◯' };
  const studentIcon: Record<string, string> = { h: '⌂', dg: '◱', rx: '◈', b: '▤', a: '◇', r: '▶', e: '▦', c: '✎', f: '◫', d: '◯' };
  const teacherIcon: Record<string, string> = { ti: '✎', to: '▤', ts: '◇', tr: '▦', tm: '◯' };
  const tabLabel = (t: string) => (isGuardian ? guardianLabel[t] ?? '' : isTeacher ? teacherLabel[t] ?? '' : studentLabel[t] ?? '');
  const tabIcon = (t: string) => (isGuardian ? guardianIcon[t] ?? '' : isTeacher ? teacherIcon[t] ?? '' : studentIcon[t] ?? '');
  // 선생님은 탭키가 다르므로 기본 진입 탭 보정('a' → 'ti')
  const tTab = isTeacher && !['ti', 'to', 'ts', 'tr', 'tm'].includes(tab) ? 'ti' : tab;
  /**
   * 하단 탭 활성 표시는 **소속 탭** 기준이다.
   * 탭 배열 밖 화면(선생님 찾기·학원찾기·강의실·자료실·라운지)에 들어가면 `tTab === t` 가
   * 어디서도 참이 아니라 활성 표시가 전부 꺼졌다 — 5개 화면에서 자기 위치를 잃는 상태였다.
   * 소속은 `SATELLITE_PARENT`(웹 사이드바가 정한 대항목)를 따른다.
   */
  const activeTab = SATELLITE_PARENT[tTab] ?? tTab;

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.brand}>{APP_NAME} · {isGuardian ? '학부모' : isTeacher ? '선생님' : '학생'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {isStudent && (
            <TouchableOpacity onPress={() => setSearchOpen(true)}>
              <Text style={styles.logout}>🔍 검색</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={toggle}>
            <Text style={styles.logout}>{dark ? '☀️ 라이트' : '🌙 다크'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await api.logout();
              setMe(null);
            }}
          >
            <Text style={styles.logout}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        {searchOpen && isStudent && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }}>
            <GlobalSearchScreen
              onClose={() => setSearchOpen(false)}
              goTab={(t, hub) => { setTeacher(null); setBooking(false); setPendingHub(hub ?? null); goTab(t); }}
            />
          </View>
        )}
        {!isStudent && !isGuardian && !isTeacher && <Text style={styles.notice}>이 역할은 웹(apps/web)을 이용하세요.</Text>}

        {isTeacher && (tTab === 'ti' ? <TeacherInbox /> : tTab === 'to' ? <TeacherToday myId={me.id} /> : tTab === 'ts' ? <TeacherSessions myId={me.id} /> : tTab === 'tr' ? <TeacherRecords /> : <TeacherMy myId={me.id} />)}

        {isStudent &&
          (tab === 'h' ? (
            <HomeScreen name={me.name} goTab={goTab} />
          ) : tab === 'dg' ? (
            <DiagnosticScreen onGoQna={() => goTab('c')} goTab={goTab} role={me.role} />
          ) : tab === 'rx' ? (
            <PrescriptionScreen goTab={goTab} goHub={goHub} initial={pendingHub} key={pendingHub ?? 'rx'} />
          ) : tab === 'a' ? (
            teacher ? (
              booking ? (
                <SlotsScreen teacher={teacher} initialMode={bookMode} consultType={bookType} initialSubType={bookSub} onBack={() => setBooking(false)} />
              ) : (
                <TeacherDetailScreen teacher={teacher} onBack={() => setTeacher(null)} onBook={openBooking} />
              )
            ) : (
              <SearchScreen onPick={(t, m, ct, sub) => openTeacher(t, m, ct, sub)} onGoQna={() => goTab('c')} />
            )
          ) : tab === 'b' ? (
            <BookingsScreen myId={me.id} goTab={goTab} initial={pendingHub} key={pendingHub ?? 'b'} />
          ) : tab === 'ac' ? (
            <AcademyFinderScreen />
          ) : tab === 'r' ? (
            <ClassroomScreen />
          ) : tab === 'e' ? (
            <MaterialsScreen />
          ) : tab === 'c' ? (
            <QnaScreen />
          ) : tab === 'f' ? (
            <CommunityScreen />
          ) : (
            <MyScreen goTab={goTab} />
          ))}

        {isGuardian && (
          // 자녀가 0명이면 5탭 전부가 안내 한 줄이었고 **신청 화면이 없어** 학생에게 승인할 것도 생기지 않았다(교착).
          // 유일한 탈출구이므로 안내 대신 신청 화면 자체를 띄운다.
          // 단 '조회 실패'는 0명이 아니다 — 연결된 학부모를 신청 폼으로 강등시키면 안 된다.
          childState === 'loading' ? (
            <View style={styles.center}><ActivityIndicator color={C.teal} /></View>
          ) : childState === 'error' ? (
            <View style={{ padding: SP.xl }}>
              <Text style={styles.notice}>자녀 목록을 불러오지 못했어요.</Text>
              <TouchableOpacity onPress={loadChildren} style={{ marginTop: SP.md }}>
                <Text style={{ color: C.teal, fontWeight: '700' }}>다시 시도</Text>
              </TouchableOpacity>
            </View>
          ) : children.length === 0 ? (
            <GuardianLinkScreen onLinked={loadChildren} />
          ) : tab === 'a' ? (
            <GuardianHome children={children} activeId={activeChild} setActiveId={setActiveChild} goTab={goTab} onLinked={loadChildren} />
          ) : tab === 'b' ? (
            <GuardianConsult children={children} activeId={activeChild} setActiveId={setActiveChild} />
          ) : tab === 'c' ? (
            <GuardianWallet children={children} activeId={activeChild} setActiveId={setActiveChild} goTab={goTab} />
          ) : (
            <GuardianMy children={children} activeId={activeChild} setActiveId={setActiveChild} />
          )
        )}
      </View>

      {/* 학부모는 자녀가 있어야 탭이 의미를 갖는다 — 0명일 때 탭을 두면 하이라이트만 움직이고 화면은 그대로다(거짓 이동). */}
      {(isStudent || isTeacher || (isGuardian && childState === 'ok' && children.length > 0)) && (
        <View style={styles.tabs}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, activeTab === t && styles.tabActiveBox]}
              onPress={() => goTab(t)}
            >
              <Text style={[styles.tabIcon, activeTab === t && styles.tabIconActive]}>{tabIcon(t)}</Text>
              <Text style={[styles.tabLabel, activeTab === t && styles.tabActive]}>{tabLabel(t)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {exitHint && (
        <View pointerEvents="none" style={styles.exitToast}>
          <Text style={styles.exitToastT}>뒤로 한 번 더 누르면 종료됩니다</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  app: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header: { backgroundColor: C.navy, paddingHorizontal: SP.lg, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, letterSpacing: -0.3 },
  logout: { color: '#cfe0f5', fontSize: 13, fontWeight: '600' },
  body: { flex: 1 },
  notice: { padding: SP.xl, color: C.muted },
  exitToast: { position: 'absolute', left: 0, right: 0, bottom: 76, alignItems: 'center' },
  exitToastT: { backgroundColor: 'rgba(13,22,38,0.92)', color: '#fff', fontSize: 13, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, overflow: 'hidden' },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingBottom: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderTopWidth: 2, borderTopColor: 'transparent' },
  tabActiveBox: { borderTopColor: C.blue },
  tabIcon: { color: C.caption, fontSize: 16, lineHeight: 20 },
  tabIconActive: { color: C.blue },
  tabLabel: { color: C.caption, fontWeight: '600', fontSize: 12, marginTop: 1 },
  tabActive: { color: C.blue, fontWeight: '800' },
});
