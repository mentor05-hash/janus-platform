#!/usr/bin/env node
// 순수 node 부하 테스트(외부 의존 없음). 지정 URL 에 동시요청을 D초간 던지고 처리량·지연 분포 리포트.
// 사용: node ops/loadtest/loadtest.mjs [URL] [--conc 50] [--dur 15] [--token JWT]
//   예: node ops/loadtest/loadtest.mjs http://localhost:3000/api/v1/health --conc 100 --dur 20
import http from 'node:http';
import https from 'node:https';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) || 'http://localhost:3000/api/v1/health';
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const CONC = parseInt(flag('--conc', '50'), 10);
const DUR = parseInt(flag('--dur', '15'), 10) * 1000;
const TOKEN = flag('--token', '');

const lib = url.startsWith('https') ? https : http;
const opts = TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}` } } : {};
const lat = [];
let ok = 0, err = 0, done = false;

function one() {
  if (done) return;
  const t0 = process.hrtime.bigint();
  const req = lib.get(url, opts, (res) => {
    res.resume();
    res.on('end', () => {
      lat.push(Number(process.hrtime.bigint() - t0) / 1e6);
      if (res.statusCode >= 200 && res.statusCode < 400) ok++; else err++;
      setImmediate(one);
    });
  });
  req.on('error', () => { err++; setImmediate(one); });
  req.setTimeout(10000, () => req.destroy());
}

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };

console.log(`[loadtest] ${url} · 동시=${CONC} · ${DUR / 1000}s`);
const start = Date.now();
for (let i = 0; i < CONC; i++) one();
setTimeout(() => {
  done = true;
  setTimeout(() => {
    const secs = (Date.now() - start) / 1000;
    const total = ok + err;
    console.log(`\n== 결과 ==`);
    console.log(`총 요청   : ${total} (성공 ${ok} · 실패 ${err})`);
    console.log(`처리량    : ${(total / secs).toFixed(1)} req/s`);
    console.log(`지연(ms)  : avg ${(lat.reduce((a, b) => a + b, 0) / (lat.length || 1)).toFixed(1)} · p50 ${pct(lat, 50).toFixed(1)} · p95 ${pct(lat, 95).toFixed(1)} · p99 ${pct(lat, 99).toFixed(1)} · max ${Math.max(0, ...lat).toFixed(1)}`);
    console.log(`에러율    : ${total ? ((err / total) * 100).toFixed(2) : 0}%`);
    process.exit(err / (total || 1) > 0.05 ? 1 : 0); // 에러율 5% 초과 시 비정상 종료
  }, 1500);
}, DUR);
