export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  display_name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export const BANNED_PASSWORDS = [
  'qwertyui',
  'qwerty123',
  'password',
  'password1',
  '12345678',
  '123456789',
  '1234567890',
  'abcdefgh',
  'asdfghjk',
  'zxcvbnm1',
  'qweasdzxc',
  '11111111',
  '00000000',
  'iloveyou',
  'admin123',
  'welcome1',
  'letmein1',
  'changeme',
];
