import type { MessageKey } from './ko';

/**
 * 영어 사전(부분 — 골격). 누락 키는 자동으로 한국어(기준)로 폴백된다.
 * 국제화가 필요해지면 여기에 키를 채워 나간다.
 */
export const en: Partial<Record<MessageKey, string>> = {
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading…',
  'common.search': 'Search',
  'common.send': 'Send',
  'nav.search': 'Find a teacher',
  'nav.bookings': 'My sessions',
  'nav.scores': 'My scores',
  'notif.new': 'You have a new notification.',
  'greeting.welcome': 'Welcome, {name}.',
};
