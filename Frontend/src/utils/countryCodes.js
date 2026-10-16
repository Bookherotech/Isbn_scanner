/** Dialling codes offered when adding a staff member's phone number. India first. */
export const COUNTRY_CODES = [
  { code: '+91', name: 'India' },
  { code: '+1', name: 'United States / Canada' },
  { code: '+44', name: 'United Kingdom' },
  { code: '+971', name: 'United Arab Emirates' },
  { code: '+966', name: 'Saudi Arabia' },
  { code: '+974', name: 'Qatar' },
  { code: '+968', name: 'Oman' },
  { code: '+965', name: 'Kuwait' },
  { code: '+973', name: 'Bahrain' },
  { code: '+61', name: 'Australia' },
  { code: '+64', name: 'New Zealand' },
  { code: '+65', name: 'Singapore' },
  { code: '+60', name: 'Malaysia' },
  { code: '+94', name: 'Sri Lanka' },
  { code: '+977', name: 'Nepal' },
  { code: '+880', name: 'Bangladesh' },
  { code: '+92', name: 'Pakistan' },
  { code: '+49', name: 'Germany' },
  { code: '+33', name: 'France' },
  { code: '+81', name: 'Japan' },
]

/** "+919876543210" -> { code: '+91', number: '9876543210' }. An unknown code gives { code: '', number: <all digits> }. */
export function splitPhone(phone = '') {
  const match = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length).find((c) => phone.startsWith(c.code))
  return match ? { code: match.code, number: phone.slice(match.code.length) } : { code: '', number: phone.replace(/\D/g, '') }
}
