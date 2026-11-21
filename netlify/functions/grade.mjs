// 채점: 분수·소수·대분수 입력을 같은 값으로 비교합니다.
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function parse(s) {
  s = String(s ?? '').trim().replace(/과/g, ' ').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/');
  let m;
  if ((m = s.match(/^(\d+) (\d+)\/(\d+)$/)) && +m[3]) return { n: +m[1] * +m[3] + +m[2], d: +m[3], frac: true, part: [+m[2], +m[3]] };
  if ((m = s.match(/^(\d+)\/(\d+)$/)) && +m[2]) return { n: +m[1], d: +m[2], frac: true, part: [+m[1], +m[2]] };
  if ((m = s.match(/^(\d+)(?:\.(\d+))?$/))) return { n: +(m[1] + (m[2] || '')), d: 10 ** (m[2] || '').length, frac: false };
  return null;
}
export function same(given, ans, reduced) {
  const a = parse(ans), g = parse(given);
  if (!a || !g) return String(given ?? '').trim() === String(ans).trim();
  if (a.n * g.d !== g.n * a.d) return false;
  if (reduced && g.frac) return gcd(g.part[0], g.part[1]) === 1;
  return true;
}
export function check(body, given) {
  if (body.type === 'mc') return String(given) === String(body.answer);
  const ans = [].concat(body.answer), g = [].concat(given ?? []);
  return ans.every((x, i) => same(g[i], x, body.reduced));
}
export const publicQ = ({ answer, reduced, ...rest }) => rest;
