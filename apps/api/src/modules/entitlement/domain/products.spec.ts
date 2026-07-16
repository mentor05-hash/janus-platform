import { coversPlacement, isProductKey, PLACEMENT_FULL_SERVICE, PLACEMENT_JEONGSI_SERVICE, PRODUCTS } from './products';

describe('entitlement products', () => {
  it('상품 4종이 정의되고 각자 서비스를 연다', () => {
    expect(PRODUCTS.full.services).toEqual([PLACEMENT_FULL_SERVICE, PLACEMENT_JEONGSI_SERVICE]);
    expect(PRODUCTS.jeongsi.services).toEqual([PLACEMENT_JEONGSI_SERVICE]);
    expect(PRODUCTS.kairos.services).toEqual(['kairos']);
    expect(PRODUCTS['kairos-alea'].services).toEqual(['kairos', 'alea']);
  });

  it('isProductKey 는 카탈로그 키만 인정', () => {
    expect(isProductKey('full')).toBe(true);
    expect(isProductKey('kairos-alea')).toBe(true);
    expect(isProductKey('nope')).toBe(false);
    expect(isProductKey('baechipyo')).toBe(false);
  });

  describe('coversPlacement — 유료 배치표 열람 판정', () => {
    it('full 서비스는 모든 kind 를 덮는다', () => {
      const s = new Set([PLACEMENT_FULL_SERVICE]);
      expect(coversPlacement(s, 'jeongsi')).toBe(true);
      expect(coversPlacement(s, 'susi')).toBe(true);
      expect(coversPlacement(s, 'gap')).toBe(true);
      expect(coversPlacement(s, undefined)).toBe(true);
    });

    it('jeongsi 서비스는 정시(kind=jeongsi)만 덮는다', () => {
      const s = new Set([PLACEMENT_JEONGSI_SERVICE]);
      expect(coversPlacement(s, 'jeongsi')).toBe(true);
      expect(coversPlacement(s, 'susi')).toBe(false);
      expect(coversPlacement(s, undefined)).toBe(false);
    });

    it('권한 없으면 어떤 kind 도 못 연다', () => {
      const s = new Set<string>(['kairos']);
      expect(coversPlacement(s, 'jeongsi')).toBe(false);
      expect(coversPlacement(s, 'susi')).toBe(false);
    });
  });
});
