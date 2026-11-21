// 문제은행: 6-1 1단원(분수의 나눗셈). 교사 파일 문항 + 변형 문항.
export const UNITS = { '6-1-1': '6-1 · 1. 분수의 나눗셈' };
const U = '6-1-1';
const g = (a, b) => (b ? g(b, a % b) : a);
const F = (n, d) => `\\frac{${n}}{${d}}`;
const A = (n, d) => { const k = g(n, d); n /= k; d /= k; return d === 1 ? String(n) : `${n}/${d}`; };

// 파일 문항 (기초→하, 기본→중, 심화→상). 도형·그림 문항은 img 필드로 연결할 예정.
const C = (id, level, body) => ({ id: `${U}-${id}`, unit: U, level, body });
const curated = [
  C('c1', '하', { type: 'short', q: '나눗셈의 몫을 분수로 나타내어 보세요. $1 \\div 8 = $', answer: '1/8' }),
  C('c2', '하', { type: 'short', q: '나눗셈의 몫을 분수로 나타내어 보세요. $3 \\div 14 = $', answer: '3/14' }),
  C('c3', '하', { type: 'mc', q: '나눗셈의 몫이 1보다 큰 것은 어느 것일까요?', choices: ['$2\\div5$', '$5\\div8$', '$9\\div17$', '$7\\div4$', '$12\\div13$'], answer: 4 }),
  C('c4', '하', { type: 'short', q: `계산해 보세요. $${F(10, 19)} \\div 5 = $`, answer: '2/19' }),
  C('c5', '하', { type: 'short', q: `계산해 보세요. $${F(5, 6)} \\div 3 = $`, answer: '5/18' }),
  C('c6', '하', { type: 'short', q: `□ 안에 알맞은 수를 써넣으세요. $${F(21, 8)} \\div 7 = $`, answer: '3/8' }),
  C('c7', '하', { type: 'short', q: '계산해 보세요. $1\\frac{3}{4} \\div 7 = $', answer: '1/4' }),
  C('c8', '중', { type: 'short', q: '길이가 3 m인 나무 막대를 5도막으로 똑같이 나누어 잘랐습니다. 1도막은 몇 m인지 분수로 나타내어 보세요.', suffix: 'm', answer: '3/5' }),
  C('c9', '중', { type: 'short', q: '가로가 15 cm, 세로가 8 cm인 직사각형이 있습니다. 가로는 세로의 몇 배인지 분수로 나타내어 보세요.', suffix: '배', answer: '15/8' }),
  C('c10', '중', { type: 'short', q: '어떤 수를 5로 나누어야 할 것을 잘못하여 곱했더니 35가 되었습니다. 바르게 계산한 값은 얼마인지 분수로 나타내어 보세요.', answer: '7/5' }),
  C('c11', '중', { type: 'mc', q: '몫이 1보다 큰 나눗셈은 어느 것일까요?', choices: ['$13\\div15$', '$7\\div16$', '$12\\div13$', '$11\\div9$', '$5\\div6$'], answer: 4 }),
  C('c12', '중', { type: 'short', q: '계산해 보세요. $4\\frac{1}{8} \\div 9 = $ (기약분수로)', reduced: true, answer: '11/24' }),
  C('c13', '상', { type: 'short', q: '끈 25 cm를 모두 사용하여 정삼각형을 한 개 만들었습니다. 한 변의 길이는 몇 cm일까요? (분수로)', suffix: 'cm', answer: '25/3' }),
  C('c14', '상', { type: 'short', q: '주스 1 L를 6명이 똑같이 나누어 마셨습니다. 한 사람이 마신 주스의 양은 몇 L일까요?', suffix: 'L', answer: '1/6' }),
  C('c15', '상', { type: 'mc', q: '몫이 가장 작은 것을 찾아보세요.', choices: ['$2\\div3$', '$1\\div4$', '$7\\div8$', '$5\\div6$', '$3\\div8$'], answer: 2 }),
];

// 변형 문항: 같은 유형에서 수만 바꿔 만든 문제 (고정 시드라 문제 ID가 항상 같음)
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
function variants() {
  const r = rng(61), pick = (a, b) => a + Math.floor(r() * (b - a + 1)), out = [];
  const cop = (b) => { let a; do a = pick(1, b - 1); while (g(a, b) !== 1); return a; }; // b와 서로소인 수
  const add = (level, i, body) => out.push(C(`v${level}${i}`, level, body));
  for (let i = 1; i <= 12; i++) { // 하: 분자가 자연수의 배수
    const n = pick(2, 5), b = pick(6, 13), k = cop(b);
    add('하', i, { type: 'short', q: `계산해 보세요. $${F(n * k, b)} \\div ${n} = $`, answer: A(k, b) });
  }
  for (let i = 1; i <= 12; i++) { // 중: (분수)÷(자연수), 몫의 분수 표현, 대분수
    const t = i % 3, n = pick(2, 7), b = pick(3, 11), a = cop(b);
    if (t === 0) { const p = pick(2, 19), q = pick(p + 1, 23); add('중', i, { type: 'short', q: `나눗셈의 몫을 분수로 나타내어 보세요. $${p} \\div ${q} = $`, answer: A(p, q) }); }
    else if (t === 1) add('중', i, { type: 'short', q: `계산해 보세요. $${F(a, b)} \\div ${n} = $`, answer: A(a, b * n) });
    else { const m = pick(1, 4); add('중', i, { type: 'short', q: `계산해 보세요. $${m}${F(a, b)} \\div ${n} = $ (기약분수로)`, reduced: true, answer: A(m * b + a, b * n) }); }
  }
  for (let i = 1; i <= 9; i++) { // 상: 문장제
    const t = i % 3;
    if (t === 0) { const k = pick(3, 6), L = pick(10, 40); add('상', i, { type: 'short', q: `끈 ${L} cm를 모두 사용하여 정${k}각형을 한 개 만들었습니다. 한 변의 길이는 몇 cm일까요? (분수로)`, suffix: 'cm', answer: A(L, k) }); }
    else if (t === 1) { const w = pick(3, 9), S = pick(10, 50); add('상', i, { type: 'short', q: `넓이가 ${S} cm²이고 가로가 ${w} cm인 직사각형이 있습니다. 세로는 몇 cm일까요? (분수로)`, suffix: 'cm', answer: A(S, w) }); }
    else { const n = pick(3, 9), b = pick(3, 11), a = cop(b); add('상', i, { type: 'short', q: `어떤 수에 ${n}${'2459'.includes(n % 10) ? '를' : '을'} 곱하면 $${F(a, b)}$입니다. 어떤 수는 얼마일까요?`, answer: A(a, b * n) }); }
  }
  return out;
}
export const buildBank = () => [...curated, ...variants()];
