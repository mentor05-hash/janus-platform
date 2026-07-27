import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText } from '../components/ui';

type Win = { start: string; end: string };
type Tpl = Record<string, Win[]>;
type Item = { loginId: string; recurringTemplate: Tpl; weekPlans: { weekStart: string; template: Tpl }[] };
type Result = { loginId: string; ok: boolean; error?: string };

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function mondayOf(d: Date) { const x = new Date(d); x.setDate(d.getDate() - ((d.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; }
function parseLine(line: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out.map((x) => x.trim());
}

export function AdminSchedulesPage() {
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function downloadTemplate() {
    const nm = mondayOf(new Date()); nm.setDate(nm.getDate() + 7); const d1 = iso(nm);
    const rows: string[][] = [
      ['아이디', '주', '요일', '시작', '종료', '설명'],
      ['# 아이디=선생님 로그인 아이디. 주=기본(매주) 또는 그 주 월요일 날짜. 하루 여러 줄=분할근무. 휴무=시간 비움. 설명=참고용(무시).', '', '', '', '', ''],
      ['simt01', '기본', '월', '09:00', '18:00', '종일'],
      ['simt01', '기본', '화', '09:00', '12:00', '오전(분할)'],
      ['simt01', '기본', '화', '17:00', '21:00', '오전 근무 후 쉬고 저녁(분할)'],
      ['simt01', '기본', '토', '10:00', '14:00', '주말'],
      ['simt01', '기본', '일', '', '', '휴무'],
      ['simt01', d1, '수', '', '', `${d1} 주 수요일 휴무`],
      ['simt03', '기본', '월', '14:00', '18:00', '오후 파트'],
      ['simt03', '기본', '수', '14:00', '18:00', ''],
      ['simt03', '기본', '금', '14:00', '18:00', ''],
    ];
    const csv = '﻿' + rows.map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = '선생님_근무시간_일괄양식.csv'; a.click(); URL.revokeObjectURL(a.href);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setError(''); setMsg(''); setResults(null);
    try {
      const text = (await f.text()).replace(/^﻿/, '');
      const map = new Map<string, Item>();
      for (const line of text.split(/\r?\n/).slice(1)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const [loginId, wk, wdName, s, en] = parseLine(line);
        if (!loginId || !wk) continue;
        const wd = WD.indexOf(wdName); if (wd < 0) continue;
        const valid = /^\d{1,2}:\d{2}$/.test(s ?? '') && /^\d{1,2}:\d{2}$/.test(en ?? ''); // 휴무행=빈칸 → []로 명시(off)
        if (!map.has(loginId)) map.set(loginId, { loginId, recurringTemplate: {}, weekPlans: [] });
        const item = map.get(loginId)!;
        if (wk === '기본') { const arr = (item.recurringTemplate[String(wd)] ??= []); if (valid) arr.push({ start: s, end: en }); }
        else if (/^\d{4}-\d{2}-\d{2}$/.test(wk)) {
          const key = iso(mondayOf(new Date(wk + 'T00:00:00')));
          let wp = item.weekPlans.find((p) => p.weekStart === key);
          if (!wp) { wp = { weekStart: key, template: {} }; item.weekPlans.push(wp); }
          const arr = (wp.template[String(wd)] ??= []); if (valid) arr.push({ start: s, end: en });
        }
      }
      const items = [...map.values()];
      if (!items.length) { setError('유효한 데이터를 찾지 못했어요. 양식(아이디,주,요일,시작,종료)을 확인하세요.'); return; }
      if (!window.confirm(`${items.length}명 선생님의 근무시간을 일괄 적용할까요?`)) return;
      setBusy(true);
      const r = await api.post<{ results: Result[]; applied: number; total: number }>('/admin/schedules/bulk', { items });
      setResults(r.results); setMsg(`적용 완료 — ${r.applied}/${r.total}명 성공`);
    } catch (er) { setError(er instanceof ApiError ? er.message : '처리 실패'); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="선생님 근무시간 일괄 업로드" sub="여러 선생님의 기본·주별 근무시간을 엑셀(CSV) 한 파일로 일괄 적용합니다." />
      {error && <ErrorText>{error}</ErrorText>}
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      <Card style={{ maxWidth: 680 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
          <b>아이디</b>(선생님 로그인) 열로 회원별 근무를 함께 담습니다. <b>주</b>=<code>기본</code> 또는 그 주 월요일 날짜, 하루 <b>여러 줄</b>이면 <b>분할근무</b>(오전 후 저녁 등), 휴무는 시간 비움.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={downloadTemplate}>⬇ 일괄 양식(예시 포함) 내려받기</Button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            {busy ? '적용 중…' : '⬆ 엑셀 업로드'}<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFile} disabled={busy} />
          </label>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--fill,#f4f7fb)', borderRadius: 8, padding: 10, fontFamily: 'monospace', whiteSpace: 'pre', overflowX: 'auto', marginTop: 12 }}>
{`아이디,주,요일,시작,종료,설명
simt01,기본,월,09:00,18:00,종일
simt01,기본,화,09:00,12:00,오전(분할)
simt01,기본,화,17:00,21:00,쉬고 저녁(분할)
simt01,2026-07-13,수,,,그 주 수요일 휴무
simt03,기본,월,14:00,18:00,오후 파트`}
        </div>
      </Card>

      {results && (
        <Card title="적용 결과" style={{ maxWidth: 680, marginTop: 14 }}>
          {results.map((r) => (
            <div key={r.loginId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <b>{r.loginId}</b>
              {r.ok ? <Badge kind="done">적용됨</Badge> : <><Badge kind="danger">실패</Badge><span style={{ fontSize: 13, color: 'var(--muted)' }}>{r.error}</span></>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
