# 대시보드 작성 가이드 (확장형)

새 대시보드는 **위젯 조합**으로 만든다. 직접 표/막대를 그리지 말고 아래 키트를 쓴다.

## 위젯 (`widgets.tsx`)
- `StatGrid` + `StatCard` — KPI 숫자 카드(라벨·값·단위·전기간 delta).
- `BarList` — 순위 막대(`{id, rank, label, value, caption}[]`). 센터/선생님 비교에 사용.
- `SectionCard` — 제목·설명·액션이 있는 섹션 래퍼.
- 공통 UI는 `../ui` (Table, Tabs, SelectField, PageHeader, Badge, Modal …).

## 새 대시보드 추가 절차
1. `pages/Admin<Name>Page.tsx` 생성. 데이터는 `api.get(...)`로.
2. 레이아웃: `<PageHeader>` → 필터(`SelectField`) → `StatGrid`(KPI) → `SectionCard`(차트/표).
3. 라우트: `App.tsx` `/admin/<path>` 추가.
4. 네비: `components/AdminLayout.tsx` 에 `<NavLink>` 추가(권한 게이트: 본사 전용은 `{hq && …}`).
5. 권한: 서버가 역할/센터 스코프를 강제하므로 화면은 `user.permLevel`로 **설정 버튼 노출만** 제어.

## 예시 (최소 골격)
```tsx
export function AdminFooPage() {
  const [kpi, setKpi] = useState<Foo | null>(null);
  useEffect(() => { api.get<Foo>('/admin/foo').then(setKpi); }, []);
  return (
    <div>
      <PageHeader title="Foo 대시보드" />
      <StatGrid>
        <StatCard label="합계" value={kpi?.total ?? '–'} />
      </StatGrid>
      <SectionCard title="순위">
        <BarList items={(kpi?.rows ?? []).map((r, i) => ({ id: r.id, rank: i + 1, label: r.name, value: r.score }))} />
      </SectionCard>
    </div>
  );
}
```

> 백엔드 응답은 `{data, meta}` 규약. `api.get`은 `data`만 언래핑하므로 meta가 필요하면 raw fetch(예: `AdminDashboardPage`).
