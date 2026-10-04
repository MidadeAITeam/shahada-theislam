// Records the demo scenes of the 2-minute video against the live site, in Arabic.
// One continuous session; scene start/end times are logged to raw/marks.json so compose.py can cut them.
//   node record.mjs   (needs MENTOR_PASSWORD in the environment)
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "https://shahada.theislam.chat";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
fs.mkdirSync("raw", { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: "ar",
  recordVideo: { dir: "raw", size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
const t0 = Date.now();
const marks = {};
const mark = (id, edge) => ((marks[id] ??= {})[edge] = (Date.now() - t0) / 1000);
const sleep = (ms) => page.waitForTimeout(ms);
const smooth = async (dy, steps = 12) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(60); } };
const composer = () => page.locator("textarea, input[type=text]").last();
async function ask(q) {
  const c = composer();
  await c.click();
  await c.pressSequentially(q, { delay: 35 });
  await page.keyboard.press("Enter");
}

// s2 — the conversation that ends with the Shahada, then the start card
await page.goto(`${BASE}/ar?demo=shahada`, { waitUntil: "load", timeout: 90000 });
await page.addStyleTag({ content: "html{scroll-behavior:smooth}" });
await sleep(1500);
mark("s2", "start");
await page.getByText("ما فهمناه منك").first().waitFor({ timeout: 60000 });
await sleep(1200);
await page.getByText("ما فهمناه منك").first().scrollIntoViewIfNeeded();
await sleep(5000);
mark("s2", "end");

// s3 — first lesson with a source opened and the verse
mark("s3", "start");
await page.getByRole("button", { name: "متابعة" }).first().click();
await page.getByText("نجهّز درسك الأول").first().waitFor({ state: "detached", timeout: 60000 }).catch(() => {});
await sleep(2500);
const marker = page.getByRole("button", { name: /أظهر المصدر/ }).first();
await marker.scrollIntoViewIfNeeded();
await sleep(800);
await marker.click();
await sleep(2500);
await smooth(500);
await sleep(2500);
mark("s3", "end");

// s4 — check question, choose wudu, the steps, recitation and exercises
mark("s4", "start");
await page.getByText("تأكد من فهمك").first().scrollIntoViewIfNeeded();
await sleep(600);
await page.locator('input[type=radio]').first().check({ force: true }).catch(() => {});
await sleep(400);
await page.getByRole("button", { name: "تحقق", exact: true }).first().click().catch(() => {});
await sleep(1500);
const cont = page.getByRole("button", { name: "أكمل المنهج" }).first();
await cont.scrollIntoViewIfNeeded();
await sleep(500);
await cont.click();
await page.getByText("ماذا تحب أن تتعلم أولاً").first().waitFor({ timeout: 30000 });
await page.getByText("ماذا تحب أن تتعلم أولاً").first().scrollIntoViewIfNeeded();
await sleep(1200);
await page.getByRole("button", { name: "الوضوء" }).first().click();
// Purification comes first (prerequisite of wudu), then the wudu lesson with the book's steps.
await page.getByText("الطهارة").first().waitFor({ timeout: 60000 }).catch(() => {});
await sleep(2000);
const next = page.getByRole("button", { name: "الدرس التالي" }).last();
await next.scrollIntoViewIfNeeded();
await sleep(500);
await next.click();
await page.getByText("الخطوات بلفظ الكتاب").first().waitFor({ timeout: 60000 }).catch(() => {});
await sleep(800);
await page.getByText("الخطوات بلفظ الكتاب").first().scrollIntoViewIfNeeded().catch(() => {});
await sleep(2500);
await smooth(450);
await sleep(1200);
await page.getByText("تدرّب: أسئلة من الكتاب").last().scrollIntoViewIfNeeded().catch(() => {});
await sleep(2000);
mark("s4", "end");

// s5 — a free question answered from the book, then one that is not in the book
mark("s5", "start");
await ask("ما الأشياء التي تنقض الوضوء؟");
await page.getByText(/هذا من درس|ليس في|لم أجد/).last().waitFor({ timeout: 90000 }).catch(() => {});
await sleep(1500);
await smooth(350);
await sleep(2500);
await ask("ما أنصبة البنات في الميراث؟");
await page.getByText(/لم أجد جواب/).last().waitFor({ timeout: 90000 }).catch(() => {});
await sleep(3000);
mark("s5", "end");

// s6 — a personal question goes to a person
mark("s6", "start");
await ask("زوجي ما زال على دينه، هل زواجنا صحيح الآن؟");
await page.getByText(/تخص حالتك/).last().waitFor({ timeout: 90000 }).catch(() => {});
await sleep(1500);
await page.getByRole("button", { name: "تحدث إلى إنسان" }).last().click();
await page.getByText("مع من تحب أن تتحدث").first().waitFor({ timeout: 20000 });
await sleep(1000);
await page.getByText("مرشدة", { exact: true }).first().click();
await sleep(1200);
await page.getByText("أوافق على إرسال").first().click();
await sleep(800);
await page.getByRole("button", { name: "أرسل إلى مرشد" }).first().click();
await page.getByText("أُرسل طلبك").first().waitFor({ timeout: 20000 }).catch(() => {});
await sleep(1500);
await page.getByRole("button", { name: "إغلاق" }).last().click().catch(() => {});
// The mentor answers from the panel (separate session), and the reply appears in the chat.
const m = await browser.newContext();
const mp = await m.newPage();
await mp.request.post(`${BASE}/api/mentor/login`, { data: { password: process.env.MENTOR_PASSWORD } });
const hs = await (await mp.request.get(`${BASE}/api/mentor/handoffs`)).json();
await mp.request.post(`${BASE}/api/mentor/handoffs/${hs[0].id}/reply`, { data: { text: "وعليكم السلام ورحمة الله أختي الكريمة، أنا هنا لأساعدك. هذه مسألة تحتاج تفصيلاً، فأخبريني متى يناسبك أن نتحدث." } });
await m.close();
await page.getByText(/أنا هنا لأساعدك/).last().waitFor({ timeout: 40000 }).catch(() => {});
await page.getByText(/أنا هنا لأساعدك/).last().scrollIntoViewIfNeeded().catch(() => {});
await sleep(3000);
mark("s6", "end");

await ctx.close();
const vid = fs.readdirSync("raw").filter((f) => f.endsWith(".webm")).map((f) => ({ f, t: fs.statSync(`raw/${f}`).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
fs.writeFileSync("raw/marks.json", JSON.stringify({ video: `raw/${vid}`, marks }, null, 1));
console.log(JSON.stringify(marks));
await browser.close();
