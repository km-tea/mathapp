import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import { buildBank, UNITS } from './bank.mjs';
import { check, publicQ } from './grade.mjs';

export const config = { path: '/api/*' };
const sql = neon(process.env.DATABASE_URL);
const N = { 하: 10, 중: 8, 상: 5 };
const J = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const fail = (msg, status = 400) => J({ error: msg }, status);

// ── 비밀번호·토큰 (외부 패키지 없이 node:crypto 사용) ──
const hash = (pw) => { const s = crypto.randomBytes(8).toString('hex'); return `${s}:${crypto.scryptSync(pw, s, 32).toString('hex')}`; };
const verify = (pw, h) => { const [s, k] = h.split(':'); return crypto.timingSafeEqual(Buffer.from(k, 'hex'), crypto.scryptSync(pw, s, 32)); };
const b64 = (x) => Buffer.from(x).toString('base64url');
const sig = (p) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(p).digest('base64url');
const sign = (d) => { const p = b64(JSON.stringify({ ...d, exp: Date.now() + 12 * 3600e3 })); return `${p}.${sig(p)}`; };
function who(req) {
  const [p, s] = (req.headers.get('authorization') || '').replace('Bearer ', '').split('.');
  if (!p || s !== sig(p)) return null;
  const d = JSON.parse(Buffer.from(p, 'base64url'));
  return d.exp > Date.now() ? d : null;
}

// ── DB 준비: 테이블 생성 + 문제은행 동기화 ──
async function syncBank() {
  await Promise.all(buildBank().map((q) =>
    sql`INSERT INTO questions(id, unit, level, body) VALUES (${q.id}, ${q.unit}, ${q.level}, ${JSON.stringify(q.body)}::jsonb)
        ON CONFLICT (id) DO UPDATE SET unit = EXCLUDED.unit, level = EXCLUDED.level, body = EXCLUDED.body`));
}
let ready;
const init = () => (ready ??= (async () => {
  await sql`CREATE TABLE IF NOT EXISTS teacher(id text PRIMARY KEY, pw text NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS students(id serial PRIMARY KEY, username text UNIQUE NOT NULL, name text NOT NULL, pw text NOT NULL, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS questions(id text PRIMARY KEY, unit text NOT NULL, level text NOT NULL, body jsonb NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS attempts(id serial PRIMARY KEY, student_id int NOT NULL REFERENCES students(id) ON DELETE CASCADE, unit text NOT NULL, level text NOT NULL, total int NOT NULL, score int, qids jsonb NOT NULL, finished boolean DEFAULT false, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS answers(id serial PRIMARY KEY, attempt_id int NOT NULL REFERENCES attempts(id) ON DELETE CASCADE, student_id int NOT NULL REFERENCES students(id) ON DELETE CASCADE, question_id text NOT NULL, given jsonb, correct boolean NOT NULL, resolved boolean DEFAULT false, created_at timestamptz DEFAULT now())`;
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM questions`;
  if (!n) await syncBank();
})());

export default async (req) => {
  try {
    await init();
    const url = new URL(req.url), route = url.pathname.replace(/^\/api\//, ''), me = who(req);
    const b = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const needT = () => (me?.role === 'teacher' ? null : fail('교사 로그인이 필요합니다.', 401));
    const needS = () => (me?.role === 'student' ? null : fail('학생 로그인이 필요합니다.', 401));
    let deny;

    switch (route) {
      // ───── 교사: 가입(최초 1회) · 로그인 ─────
      case 'teacher/status': {
        const t = await sql`SELECT 1 FROM teacher WHERE id = ${process.env.TEACHER_ID}`;
        return J({ registered: t.length > 0 });
      }
      case 'teacher/register': {
        if (b.id !== process.env.TEACHER_ID || b.code !== process.env.SIGNUP_CODE) return fail('아이디 또는 가입 코드가 맞지 않습니다.', 403);
        if (!b.password || b.password.length < 6) return fail('비밀번호는 6자 이상이어야 합니다.');
        if ((await sql`SELECT 1 FROM teacher WHERE id = ${b.id}`).length) return fail('이미 가입되어 있습니다. 로그인해 주세요.');
        await sql`INSERT INTO teacher(id, pw) VALUES (${b.id}, ${hash(b.password)})`;
        return J({ token: sign({ role: 'teacher', id: b.id }), name: '선생님' });
      }
      case 'teacher/login': {
        const [t] = await sql`SELECT pw FROM teacher WHERE id = ${b.id || ''}`;
        if (!t || !verify(b.password || '', t.pw)) return fail('아이디 또는 비밀번호가 맞지 않습니다.', 401);
        return J({ token: sign({ role: 'teacher', id: b.id }), name: '선생님' });
      }
      // ───── 교사: 학생 계정·결과 ─────
      case 'teacher/students': {
        if ((deny = needT())) return deny;
        if (req.method === 'POST') { // 줄마다 "이름,아이디,비밀번호" · 같은 아이디면 이름·비밀번호를 갱신
          let ok = 0; const bad = [];
          for (const line of String(b.lines || '').split('\n').map((l) => l.trim()).filter(Boolean)) {
            const [name, username, pw] = line.split(/[,\t]/).map((x) => x?.trim());
            if (!name || !username || !pw || pw.length < 4) { bad.push(line); continue; }
            await sql`INSERT INTO students(username, name, pw) VALUES (${username}, ${name}, ${hash(pw)})
                      ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, pw = EXCLUDED.pw`;
            ok++;
          }
          return J({ ok, bad });
        }
        return J(await sql`SELECT s.id, s.username, s.name, count(a.id) FILTER (WHERE a.finished)::int AS tries,
          round(avg(a.score::numeric / NULLIF(a.total, 0) * 100) FILTER (WHERE a.finished))::int AS avg, max(a.created_at) AS last
          FROM students s LEFT JOIN attempts a ON a.student_id = s.id GROUP BY s.id ORDER BY s.name`);
      }
      case 'teacher/student-delete': {
        if ((deny = needT())) return deny;
        await sql`DELETE FROM students WHERE id = ${b.id}`; return J({ ok: true });
      }
      case 'teacher/detail': { // 한 학생의 기록 + 아직 못 푼 오답
        if ((deny = needT())) return deny;
        const id = +url.searchParams.get('id');
        const attempts = await sql`SELECT id, unit, level, score, total, created_at FROM attempts WHERE student_id = ${id} AND finished ORDER BY id DESC LIMIT 50`;
        const wrong = await sql`SELECT * FROM (SELECT DISTINCT ON (a.question_id) q.body, a.given, a.correct, a.resolved
          FROM answers a JOIN questions q ON q.id = a.question_id WHERE a.student_id = ${id} ORDER BY a.question_id, a.id DESC) t WHERE NOT correct`;
        return J({ attempts: attempts.map((x) => ({ ...x, unitName: UNITS[x.unit] })), wrong: wrong.map((w) => ({ body: w.body, given: w.given, resolved: w.resolved })) });
      }
      case 'teacher/sync-bank': {
        if ((deny = needT())) return deny;
        await syncBank(); const [{ n }] = await sql`SELECT count(*)::int AS n FROM questions`; return J({ count: n });
      }
      // ───── 학생 ─────
      case 'student/login': {
        const [s] = await sql`SELECT id, name, pw FROM students WHERE username = ${b.username || ''}`;
        if (!s || !verify(b.password || '', s.pw)) return fail('아이디 또는 비밀번호가 맞지 않습니다.', 401);
        return J({ token: sign({ role: 'student', id: s.id }), name: s.name });
      }
      case 'student/units': {
        if ((deny = needS())) return deny;
        const rows = await sql`SELECT unit, level, count(*)::int AS n FROM questions GROUP BY unit, level`;
        return J(Object.entries(UNITS).map(([unit, name]) => ({ unit, name, levels: Object.fromEntries(rows.filter((r) => r.unit === unit).map((r) => [r.level, r.n])) })));
      }
      case 'student/start': {
        if ((deny = needS())) return deny;
        if (!N[b.level] || !UNITS[b.unit]) return fail('단원과 난이도를 골라 주세요.');
        const qs = await sql`SELECT id, body FROM questions WHERE unit = ${b.unit} AND level = ${b.level} ORDER BY random() LIMIT ${N[b.level]}`;
        const [a] = await sql`INSERT INTO attempts(student_id, unit, level, total, qids) VALUES (${me.id}, ${b.unit}, ${b.level}, ${qs.length}, ${JSON.stringify(qs.map((q) => q.id))}::jsonb) RETURNING id`;
        return J({ attemptId: a.id, questions: qs.map((q) => ({ id: q.id, ...publicQ(q.body) })) });
      }
      case 'student/submit': {
        if ((deny = needS())) return deny;
        const [a] = await sql`SELECT id, qids, finished FROM attempts WHERE id = ${b.attemptId} AND student_id = ${me.id}`;
        if (!a || a.finished) return fail('이미 제출했거나 없는 시험입니다.');
        const qs = await sql`SELECT id, body FROM questions WHERE id = ANY(${a.qids})`;
        const by = Object.fromEntries(qs.map((q) => [q.id, q.body]));
        const results = a.qids.map((id) => ({ id, given: b.answers?.[id] ?? '', correct: check(by[id], b.answers?.[id]) }));
        await Promise.all(results.map((r) => sql`INSERT INTO answers(attempt_id, student_id, question_id, given, correct) VALUES (${a.id}, ${me.id}, ${r.id}, ${JSON.stringify(r.given)}::jsonb, ${r.correct})`));
        const score = results.filter((r) => r.correct).length;
        await sql`UPDATE attempts SET score = ${score}, finished = true WHERE id = ${a.id}`;
        return J({ score, total: results.length, results: results.map((r) => ({ ...r, q: by[r.id] })) });
      }
      case 'student/history': {
        if ((deny = needS())) return deny;
        const rows = await sql`SELECT id, unit, level, score, total, created_at FROM attempts WHERE student_id = ${me.id} AND finished ORDER BY id DESC LIMIT 30`;
        return J(rows.map((x) => ({ ...x, unitName: UNITS[x.unit] })));
      }
      case 'student/wrong': { // 아직 해결하지 못한 틀린 문항 (문제별 최신 1건)
        if ((deny = needS())) return deny;
        const rows = await sql`SELECT * FROM (SELECT DISTINCT ON (a.question_id) a.question_id AS id, q.unit, q.level, q.body, a.correct, a.resolved
          FROM answers a JOIN questions q ON q.id = a.question_id WHERE a.student_id = ${me.id} ORDER BY a.question_id, a.id DESC) t
          WHERE NOT correct AND NOT resolved`;
        return J(rows.map((r) => ({ id: r.id, unitName: UNITS[r.unit], level: r.level, ...publicQ(r.body) })));
      }
      case 'student/wrong-check': {
        if ((deny = needS())) return deny;
        const [q] = await sql`SELECT body FROM questions WHERE id = ${b.id}`;
        if (!q) return fail('없는 문항입니다.');
        const ok = check(q.body, b.given);
        if (ok) await sql`UPDATE answers SET resolved = true WHERE student_id = ${me.id} AND question_id = ${b.id} AND NOT correct`;
        return J({ correct: ok, answer: q.body.answer });
      }
      default: return fail('없는 주소입니다.', 404);
    }
  } catch (e) {
    console.error(e);
    return fail('서버 오류가 발생했습니다. 환경 변수와 DB 연결을 확인해 주세요.', 500);
  }
};
