import { useLiveKitAudio } from '../utils/liveKitAudio';

// 강의 음성 컨트롤 — media-token({url, token, provider})을 받아 LiveKit 연결.
// 선생님(publish): 🎙 송출 토글 / 학생: 🔊 수신 음소거.
export function LectureAudioBar({ media, publish }: { media: { provider: string; url: string | null; token: string | null; note?: string } | null; publish: boolean }) {
  const active = !!(media && media.provider === 'livekit' && media.url && media.token);
  const audio = useLiveKitAudio(active ? { url: media!.url, token: media!.token, publish } : null);

  if (!media) return null;
  if (!active) {
    // SFU 미설정(mock 등) — 안내만.
    return <span style={{ fontSize: 12, color: 'var(--muted)' }}>🔇 {media.note ?? '음성 미설정'}</span>;
  }
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: audio.connected ? 'var(--good, #1e7a4d)' : 'var(--muted)' }}>
        {audio.connected ? '🎧 음성 연결' : '음성 연결 중…'}
      </span>
      {publish ? (
        <button className="btn ghost sm" onClick={audio.toggleMic}>{audio.micOn ? '🎙 송출 중' : '🔇 마이크 꺼짐'}</button>
      ) : (
        <button className="btn ghost sm" onClick={audio.toggleMute}>{audio.muted ? '🔇 음소거' : '🔊 듣는 중'}</button>
      )}
      {audio.error && <span style={{ fontSize: 11, color: 'var(--crit, #a5372a)' }}>{audio.error}</span>}
    </span>
  );
}
