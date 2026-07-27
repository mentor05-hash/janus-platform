import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';

type Section = { h: string; b: string };
type Doc = { title: string; version: string; updatedAt: string; sections: Section[] };
type Consent = {
  agreed: boolean;
  current: { termsVersion: string; privacyVersion: string; marketingAgreed: boolean; isMinor: boolean; guardianName: string | null; agreedAt: string } | null;
  needsRenewal: boolean;
  latest: { termsVersion: string; privacyVersion: string };
};
const KST = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

/** 보호자 공유 동의(O105) — 성인 학생은 이 동의가 없으면 보호자가 내 산출물을 볼 수 없다. */
type ShareConsents = {
  isMinor: boolean;
  guardians: Array<{ guardianId: string; guardianName: string | null; relation: string | null; granted: boolean; grantedAt: string | null }>;
};

/**
 * 보호자 연결 — **공유 동의의 선결조건**이라 그 카드보다 위에 둔다(순서가 곧 절차).
 * 승인 UI 가 없으면 공유 동의 카드는 아예 렌더되지 않는다(guardians 목록이 승인된 연결에서 나온다).
 * 모바일에는 이 화면이 없어서, 신청 알림(`guardian_link_requested`)은 오는데 **누를 곳이 없었다**.
 */
type GuardianLink = { id: string; status: string; relation: string | null; counterpartName: string; canRespond: boolean };

/** 학생 관점 라벨 — 보호자 화면(GuardianLinkScreen)과 문자열이 다른 것은 의도다(같은 행을 각자 관점으로 본다). */
const LINK_STATUS: Record<string, string> = {
  pending: '승인 대기 중', approved: '연결됨', rejected: '거절함', revoked: '연결 해제됨',
};

export function LegalScreen({ onBack, onWithdrawn }: { onBack: () => void; onWithdrawn: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);

  // 약관·방침 보기
  const [docs, setDocs] = useState<Record<'terms' | 'privacy', Doc | undefined>>({ terms: undefined, privacy: undefined });
  const [openDoc, setOpenDoc] = useState<'terms' | 'privacy' | null>(null);
  const [docError, setDocError] = useState('');

  // 동의 현황
  const [consent, setConsent] = useState<Consent | null>(null);
  // 보호자 공유 동의(O105) — 성인 학생 전용 게이트. 실패는 무해(보호자 연결이 없을 수도 있다).
  const [share, setShare] = useState<ShareConsents | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const loadShare = () => api.get<ShareConsents>('/me/share-consents').then(setShare).catch(() => setShare(null));
  // 보호자 연결 — 조회 실패는 조용히 빈 배열(연결이 없는 것이 정상 상태다).
  const [links, setLinks] = useState<GuardianLink[] | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState('');
  const [linksFailed, setLinksFailed] = useState(false);
  // 조회 실패를 빈 배열로 삼키면 **승인 UI 자체가 사라진다** — 대기 중 요청이 있어도 학생이 모른다.
  const loadLinks = () =>
    api.get<GuardianLink[]>('/me/guardian-links')
      .then((r) => { setLinks(Array.isArray(r) ? r : []); setLinksFailed(false); })
      .catch(() => { setLinks([]); setLinksFailed(true); });
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [marketingAgreed, setMarketingAgreed] = useState(false);
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianContact, setGuardianContact] = useState('');
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [consentMsg, setConsentMsg] = useState('');

  // 데이터 내보내기
  const [exportError, setExportError] = useState('');

  // 회원 탈퇴
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [reason, setReason] = useState('');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');

  function loadConsent() {
    api.get<Consent>('/legal/consent').then(setConsent).catch((e) => setConsentError(e instanceof ApiError ? e.message : '조회 실패'));
  }
  useEffect(loadConsent, []);

  async function toggleDoc(kind: 'terms' | 'privacy') {
    if (openDoc === kind) { setOpenDoc(null); return; }
    setOpenDoc(kind);
    setDocError('');
    if (!docs[kind]) {
      try { const d = await api.get<Doc>(`/legal/${kind}`); setDocs((p) => ({ ...p, [kind]: d })); }
      catch (e) { setDocError(e instanceof ApiError ? e.message : '불러오기 실패'); }
    }
  }

  async function submitConsent() {
    setConsentBusy(true); setConsentError(''); setConsentMsg('');
    try {
      await api.post('/legal/consent', { termsAgreed, privacyAgreed, marketingAgreed, isMinor, guardianName, guardianContact });
      setConsentMsg('동의가 저장되었어요.');
      setTermsAgreed(false); setPrivacyAgreed(false); setMarketingAgreed(false); setIsMinor(false); setGuardianName(''); setGuardianContact('');
      loadConsent();
    } catch (e) { setConsentError(e instanceof ApiError ? e.message : '동의 저장 실패'); }
    finally { setConsentBusy(false); }
  }

  async function exportData() {
    setExportError('');
    try { await api.downloadWebPath('/me/data-export', 'mydata.json'); }
    catch (e) { setExportError(e instanceof ApiError ? e.message : '내보내기 실패'); }
  }

  async function withdraw() {
    setWithdrawBusy(true); setWithdrawError('');
    try {
      await api.post('/me/withdraw', { reason });
      await api.logout();
      onWithdrawn();
    } catch (e) { setWithdrawError(e instanceof ApiError ? e.message : '탈퇴 실패'); setWithdrawBusy(false); }
  }

  const DocView = ({ d }: { d: Doc }) => (
    <View style={styles.docBox}>
      <Text style={styles.docMeta}>버전 {d.version} · {KST(d.updatedAt)} 개정</Text>
      {d.sections.map((s, i) => (
        <View key={i} style={{ marginTop: SP.sm }}>
          <Text style={styles.docH}>{s.h}</Text>
          <Text style={styles.docB}>{s.b}</Text>
        </View>
      ))}
    </View>
  );

  useEffect(() => { loadShare(); loadLinks(); }, []);

  async function respondLink(id: string, action: 'approve' | 'reject' | 'revoke') {
    setLinkBusy(true); setLinkErr('');
    try {
      await api.patch(`/guardian/links/${id}/respond`, { action });
      await loadLinks();
      await loadShare(); // 승인하면 공유 동의 대상(보호자)이 생긴다 — 같은 화면에서 이어서 설정하게 한다
    } catch (e) {
      setLinkErr(e instanceof ApiError ? e.message : '응답 실패');
    } finally { setLinkBusy(false); }
  }

  /**
   * 연결 해제는 성립한 관계를 끊으므로 한 번 되묻는다 — 다만 `Alert.alert` 는 쓸 수 없다.
   * react-native-web 의 Alert 는 **빈 함수**(`static alert() {}`)라 웹 빌드(:8090)에서 아무 일도 일어나지 않는다.
   * 같은 화면의 회원 탈퇴가 쓰는 인라인 2단계 확인을 따른다 — 웹·네이티브 양쪽에서 동작한다.
   */
  // 확인 대기 중인 행 — 거절·해제 **둘 다** 되돌릴 수 없으므로 같은 절차를 쓴다.
  const [confirming, setConfirming] = useState<{ id: string; action: 'reject' | 'revoke' } | null>(null);

  async function toggleShare(guardianId: string, next: boolean) {
    setShareBusy(true);
    try {
      if (next) await api.post('/me/share-consents', { guardianId });
      else await api.del(`/me/share-consents?guardianId=${encodeURIComponent(guardianId)}`);
      await loadShare();
    } catch { /* 무해 — 상태를 다시 읽는다 */ await loadShare(); }
    finally { setShareBusy(false); }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>‹ 뒤로</Text></TouchableOpacity>
      <Text style={ui.h}>약관·개인정보</Text>

      {/* 보호자 연결 — 공유 동의의 **선결조건**이라 위에 둔다(연결 승인 → 그 다음 공유 동의). */}
      {linksFailed ? (
        <View style={[ui.card, { marginTop: SP.md }]}>
          <Text style={ui.sub}>보호자 연결 정보를 불러오지 못했어요. 대기 중인 신청이 있을 수 있으니 다시 시도해 주세요.</Text>
          <TouchableOpacity onPress={loadLinks} style={{ marginTop: 8 }}>
            <Text style={{ color: C.teal, fontWeight: '700', fontSize: 13 }}>↻ 다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {links && links.length > 0 && (
        <View style={[ui.card, { marginTop: SP.md }]}>
          <Text style={styles.sec}>보호자 연결</Text>
          {/* 미성년은 '무엇을 보여줄지'를 스스로 고르지 못한다(O105 · 공유 동의는 성인 전용) — 없는 통제권을 약속하지 않는다. */}
          <Text style={ui.sub}>
            {share?.isMinor
              ? '보호자가 연결을 신청하면 여기에서 승인하거나 거절할 수 있어요. 승인하면 보호자가 법정대리인 권한으로 내 학습 정보를 볼 수 있어요(보호자 본인확인·동의 완료 시). 공유 범위를 따로 고르는 기능은 성인이 된 뒤에 열려요.'
              : '보호자가 연결을 신청하면 여기에서 승인하거나 거절할 수 있어요. 승인해야 보호자 화면이 열리고, 무엇을 보여줄지는 아래 공유 동의에서 따로 정합니다(연결 = 열람 허용이 아니에요).'}
          </Text>
          {linkErr ? <Text style={ui.error}>{linkErr}</Text> : null}
          {links.map((l) => {
            const pend = confirming?.id === l.id ? confirming.action : null;
            return (
            <View key={l.id} style={styles.linkRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkName} numberOfLines={1} ellipsizeMode="tail">
                  {l.counterpartName}
                  {l.relation ? <Text style={styles.linkRel}> · {l.relation}</Text> : null}
                </Text>
                {/* 숫자(7일·3회)는 API 의 RELINK_COOLDOWN_DAYS·RELINK_MAX_ATTEMPTS 와 짝이다 —
                    바꾸면 여기와 웹 LegalPage·GuardianConsentPage 문구를 함께 고쳐야 한다(O124). */}
                <Text style={styles.linkStatus}>
                  {pend === 'revoke'
                    ? '해제하면 보호자 화면이 바로 닫혀요. 이 보호자는 7일 뒤 다시 신청할 수 있고, 그때도 승인할지는 내가 정해요.'
                    : pend === 'reject'
                    ? '거절하면 이 보호자는 7일 뒤 다시 신청할 수 있어요(최대 3회, 관리자가 제한을 풀어 줄 수도 있어요). 그때도 승인할지는 내가 정해요. 정말 거절할까요?'
                    : (LINK_STATUS[l.status] ?? l.status)}
                </Text>
                {(l.status === 'rejected' || l.status === 'revoked') && !pend ? (
                  <Text style={styles.linkStatus}>보호자가 7일 뒤 다시 신청할 수 있어요. 더 빨리 연결하려면 관리자에게 문의해 주세요.</Text>
                ) : null}
              </View>
              {pend ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity disabled={linkBusy} onPress={() => setConfirming(null)} style={[styles.linkBtn, linkBusy && { opacity: 0.6 }]}>
                    <Text style={styles.linkBtnT}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={linkBusy} onPress={() => { setConfirming(null); void respondLink(l.id, pend); }} style={[styles.linkBtn, styles.linkBtnDanger, linkBusy && { opacity: 0.6 }]}>
                    <Text style={styles.linkBtnDangerT}>{pend === 'revoke' ? '해제 확정' : '거절 확정'}</Text>
                  </TouchableOpacity>
                </View>
              ) : l.canRespond ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity disabled={linkBusy} onPress={() => respondLink(l.id, 'approve')} style={[styles.linkBtn, styles.linkBtnOn, linkBusy && { opacity: 0.6 }]}>
                    <Text style={styles.linkBtnOnT}>승인</Text>
                  </TouchableOpacity>
                  {/* 재신청은 열렸지만 7일을 기다려야 한다 — 오탭 비용이 여전히 커서 해제와 같은 2단계를 유지한다. */}
                  <TouchableOpacity disabled={linkBusy} onPress={() => setConfirming({ id: l.id, action: 'reject' })} style={[styles.linkBtn, linkBusy && { opacity: 0.6 }]}>
                    <Text style={styles.linkBtnT}>거절</Text>
                  </TouchableOpacity>
                </View>
              ) : l.status === 'approved' ? (
                <TouchableOpacity disabled={linkBusy} onPress={() => setConfirming({ id: l.id, action: 'revoke' })} style={[styles.linkBtn, linkBusy && { opacity: 0.6 }]}>
                  <Text style={styles.linkBtnT}>연결 해제</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            );
          })}
        </View>
      )}

      {/* 보호자 공유 동의(O105) — 동의한 보호자만 내 산출물 이력을 볼 수 있다. */}
      {share && share.guardians.length > 0 && (
        <View style={[ui.card, { marginTop: SP.md }]}>
          <Text style={styles.sec}>보호자에게 내 리포트 공유</Text>
          <Text style={ui.sub}>
            {share.isMinor
              ? '미성년 회원은 보호자가 법정대리인 권한으로 열람할 수 있어요(보호자 본인확인·동의 완료 시). 아래 설정은 성인이 되면 적용됩니다.'
              : '동의한 보호자만 내 격차 리포트 이력을 볼 수 있어요. 언제든 철회할 수 있고, 철회하면 바로 볼 수 없게 됩니다.'}
          </Text>
          {share.guardians.map((g) => (
            <View key={g.guardianId} style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                {g.guardianName ?? '보호자'}{g.relation ? ` · ${g.relation}` : ''}
                {'\n'}
                <Text style={{ fontSize: 11.5, color: C.muted }}>{g.granted ? `공유 중${g.grantedAt ? ` · ${g.grantedAt.slice(0, 10)}` : ''}` : '비공개'}</Text>
              </Text>
              <Switch value={g.granted} disabled={shareBusy} onValueChange={(v) => toggleShare(g.guardianId, v)}
                trackColor={{ true: C.teal, false: C.lineSoft }} />
            </View>
          ))}
        </View>
      )}

      {/* 약관·방침 보기 */}
      <View style={[ui.card, { marginTop: SP.md }]}>
        <Text style={styles.sec}>약관·방침 보기</Text>
        <View style={styles.docBtnRow}>
          <TouchableOpacity style={[styles.docBtn, openDoc === 'terms' && styles.docBtnOn]} onPress={() => toggleDoc('terms')}>
            <Text style={[styles.docBtnT, openDoc === 'terms' && { color: C.white }]}>이용약관</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.docBtn, openDoc === 'privacy' && styles.docBtnOn]} onPress={() => toggleDoc('privacy')}>
            <Text style={[styles.docBtnT, openDoc === 'privacy' && { color: C.white }]}>개인정보처리방침</Text>
          </TouchableOpacity>
        </View>
        {docError ? <Text style={ui.error}>{docError}</Text> : null}
        {openDoc && (docs[openDoc] ? <DocView d={docs[openDoc]!} /> : <ActivityIndicator color={C.teal} style={{ marginTop: 12 }} />)}
      </View>

      {/* 동의 현황 */}
      <View style={[ui.card, { marginTop: SP.md }]}>
        <Text style={styles.sec}>동의 현황</Text>
        {consent === null ? <ActivityIndicator color={C.teal} style={{ marginTop: 8 }} /> : (
          <>
            <Text style={styles.sub}>{consent.agreed ? '동의 완료' : '미동의'}
              {consent.current ? ` · 약관 v${consent.current.termsVersion} · 방침 v${consent.current.privacyVersion}` : ''}
              {consent.current ? ` · ${KST(consent.current.agreedAt)}` : ''}</Text>
            <Text style={styles.sub}>최신 버전 · 약관 v{consent.latest.termsVersion} · 방침 v{consent.latest.privacyVersion}</Text>
            {consent.needsRenewal && (
              <View style={styles.form}>
                <Text style={styles.formNote}>최신 약관에 다시 동의가 필요해요.</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>필수: 이용약관 동의</Text>
                  <Switch value={termsAgreed} onValueChange={setTermsAgreed} trackColor={{ false: C.line, true: C.teal100 }} thumbColor={termsAgreed ? C.teal : '#f4f3f4'} />
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>필수: 개인정보 수집·이용 동의</Text>
                  <Switch value={privacyAgreed} onValueChange={setPrivacyAgreed} trackColor={{ false: C.line, true: C.teal100 }} thumbColor={privacyAgreed ? C.teal : '#f4f3f4'} />
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>선택: 마케팅 수신 동의</Text>
                  <Switch value={marketingAgreed} onValueChange={setMarketingAgreed} trackColor={{ false: C.line, true: C.teal100 }} thumbColor={marketingAgreed ? C.teal : '#f4f3f4'} />
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>만 14세 미만(미성년)</Text>
                  <Switch value={isMinor} onValueChange={setIsMinor} trackColor={{ false: C.line, true: C.teal100 }} thumbColor={isMinor ? C.teal : '#f4f3f4'} />
                </View>
                {isMinor && (
                  <>
                    <Text style={ui.label}>보호자 성명</Text>
                    <TextInput style={ui.input} value={guardianName} onChangeText={setGuardianName} placeholder="보호자 성명" placeholderTextColor={C.caption} />
                    <Text style={ui.label}>보호자 연락처</Text>
                    <TextInput style={ui.input} value={guardianContact} onChangeText={setGuardianContact} placeholder="010-0000-0000" placeholderTextColor={C.caption} keyboardType="phone-pad" />
                  </>
                )}
                {consentError ? <Text style={ui.error}>{consentError}</Text> : null}
                <TouchableOpacity style={[ui.btn, { marginTop: SP.md }, consentBusy && ui.btnDisabled]} disabled={consentBusy} onPress={submitConsent}>
                  <Text style={ui.btnText}>동의하기</Text>
                </TouchableOpacity>
              </View>
            )}
            {consentMsg ? <Text style={styles.ok}>{consentMsg}</Text> : null}
          </>
        )}
      </View>

      {/* 내 데이터 내보내기 */}
      <View style={[ui.card, { marginTop: SP.md }]}>
        <Text style={styles.sec}>내 데이터 내보내기</Text>
        <Text style={styles.sub}>보유 중인 내 정보를 JSON으로 내려받아요.</Text>
        {exportError ? <Text style={ui.error}>{exportError}</Text> : null}
        <TouchableOpacity style={[ui.btn, { marginTop: SP.md }]} onPress={exportData}>
          <Text style={ui.btnText}>내 데이터 내보내기</Text>
        </TouchableOpacity>
      </View>

      {/* 회원 탈퇴 */}
      <View style={[ui.card, { marginTop: SP.md }]}>
        <Text style={styles.sec}>회원 탈퇴</Text>
        <Text style={styles.warn}>탈퇴 시 인적사항은 비식별 처리되며, 이후 로그인이 제한돼요. 되돌릴 수 없어요.</Text>
        {!confirmWithdraw ? (
          <TouchableOpacity style={[styles.dangerBtn, { marginTop: SP.md }]} onPress={() => setConfirmWithdraw(true)}>
            <Text style={styles.dangerT}>회원 탈퇴</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.confirmBox}>
            <Text style={ui.label}>사유(선택)</Text>
            <TextInput style={ui.input} value={reason} onChangeText={setReason} placeholder="탈퇴 사유를 남겨주세요" placeholderTextColor={C.caption} multiline />
            {withdrawError ? <Text style={ui.error}>{withdrawError}</Text> : null}
            <View style={styles.confirmRow}>
              <TouchableOpacity style={styles.cancelBtn} disabled={withdrawBusy} onPress={() => setConfirmWithdraw(false)}>
                <Text style={styles.cancelT}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dangerBtn, { flex: 1 }, withdrawBusy && { opacity: 0.6 }]} disabled={withdrawBusy} onPress={withdraw}>
                <Text style={styles.dangerT}>탈퇴 확정</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  back: { color: C.teal, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  sec: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 8 },
  sub: { fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 18 },
  ok: { color: C.done, fontSize: 13, marginTop: 8, fontWeight: '600' },
  docBtnRow: { flexDirection: 'row', gap: 8 },
  docBtn: { flex: 1, borderWidth: 1, borderColor: C.teal, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  docBtnOn: { backgroundColor: C.teal },
  docBtnT: { color: C.teal, fontWeight: '800', fontSize: 13 },
  docBox: { marginTop: 12, backgroundColor: C.fill, borderRadius: R.md, padding: 12 },
  docMeta: { fontSize: 12, color: C.caption, fontWeight: '700' },
  docH: { fontSize: 13, fontWeight: '800', color: C.ink },
  docB: { fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 19 },
  form: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 12 },
  formNote: { fontSize: 12, color: C.confirmed, fontWeight: '600', marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, marginTop: 10, borderTopWidth: 1, borderTopColor: C.lineSoft },
  linkName: { fontSize: 14, fontWeight: '700', color: C.ink },
  linkRel: { fontWeight: '400', color: C.muted },
  linkStatus: { fontSize: 12.5, color: C.muted, marginTop: 2 },
  linkBtn: { borderWidth: 1, borderColor: C.inputBorder, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.white },
  linkBtnT: { fontSize: 13, color: C.body, fontWeight: '700' },
  linkBtnOn: { backgroundColor: C.teal, borderColor: C.teal },
  linkBtnOnT: { fontSize: 13, color: C.white, fontWeight: '700' },
  linkBtnDanger: { backgroundColor: C.danger, borderColor: C.danger },
  linkBtnDangerT: { fontSize: 13, color: '#FFFFFF', fontWeight: '700' },
  switchLabel: { fontSize: 13, color: C.body, fontWeight: '500', flex: 1, paddingRight: SP.md },
  warn: { fontSize: 12, color: C.danger, lineHeight: 18 },
  dangerBtn: { backgroundColor: C.danger, borderRadius: 11, paddingVertical: 14, alignItems: 'center' },
  dangerT: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  confirmBox: { marginTop: SP.md, backgroundColor: C.dangerBg, borderRadius: R.md, padding: 12 },
  confirmRow: { flexDirection: 'row', gap: 8, marginTop: SP.md },
  cancelBtn: { borderWidth: 1, borderColor: C.inputBorder, borderRadius: 11, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  cancelT: { color: C.body, fontWeight: '700', fontSize: 15 },
});
