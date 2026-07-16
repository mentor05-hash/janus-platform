/**
 * 상품 카탈로그(순수) — 결정(2026-07-16): 유료 상품 4종, 모두 일회성 기간제(수능시즌).
 * 상품 = 판매 단위, 서비스 = 해제 그레인(sso_service.id 또는 배치표 유사서비스).
 * 결제/가격은 미확정(N23~N25) — 여기선 "상품 → 어떤 서비스를 여는가"만 정의. 결제 훅은 grant() 호출.
 */
export type ProductKey = 'full' | 'jeongsi' | 'kairos' | 'kairos-alea';

export interface ProductDef {
  key: ProductKey;
  label: string;
  /** 이 상품이 부여하는 서비스 id(sso_service.id 또는 배치표 유사서비스). */
  services: string[];
}

/** 배치표 유사서비스(sso_service 로 등록 · min_tier paid): 허브 유료표 해제용. */
export const PLACEMENT_FULL_SERVICE = 'baechipyo-full'; // 전체 유료 배치표
export const PLACEMENT_JEONGSI_SERVICE = 'baechipyo-jeongsi'; // 정시(kind=jeongsi) 유료 배치표

export const PRODUCTS: Record<ProductKey, ProductDef> = {
  full: { key: 'full', label: '전체 배치표', services: [PLACEMENT_FULL_SERVICE, PLACEMENT_JEONGSI_SERVICE] },
  jeongsi: { key: 'jeongsi', label: '정시 정밀배치표', services: [PLACEMENT_JEONGSI_SERVICE] },
  kairos: { key: 'kairos', label: '카이로스 단독', services: ['kairos'] },
  'kairos-alea': { key: 'kairos-alea', label: '카이로스+알레아 묶음', services: ['kairos', 'alea'] },
};

export const PRODUCT_KEYS = Object.keys(PRODUCTS) as ProductKey[];

export const isProductKey = (k: string): k is ProductKey => k in PRODUCTS;

/**
 * 활성 서비스 집합이 허브 배치표(kind) 유료 열람을 덮는지.
 *   baechipyo-full   → 모든 유료 배치표
 *   baechipyo-jeongsi→ 정시(kind=jeongsi)만
 */
export function coversPlacement(activeServiceIds: Set<string>, kind?: string): boolean {
  if (activeServiceIds.has(PLACEMENT_FULL_SERVICE)) return true;
  if (kind === 'jeongsi' && activeServiceIds.has(PLACEMENT_JEONGSI_SERVICE)) return true;
  return false;
}
