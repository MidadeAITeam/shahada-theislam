// Shared recording helpers for v3. Each recorder writes raw/<name>.webm and raw/<name>.json (scene marks, seconds).
import { chromium } from "playwright";
import fs from "node:fs";
export const BASE = process.env.BASE ?? "https://shahada.theislam.chat";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
for (const l of fs.readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
export async function session(name, { phone = false, locale = "ar" } = {}) {
  fs.mkdirSync(`raw/${name}`, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--force-device-scale-factor=${phone ? 2 : 1.2}`] });
  const vp = phone ? { width: 430, height: 932 } : { width: 1600, height: 900 };
  const size = phone ? { width: 860, height: 1864 } : { width: 1920, height: 1080 };
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: phone ? 2 : 1.2, locale, recordVideo: { dir: `raw/${name}`, size }, permissions: ["microphone"] });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const marks = {};
  const mark = (id) => { marks[id] = +((Date.now() - t0) / 1000).toFixed(2); console.log(name, id, marks[id]); };
  const sleep = (ms) => page.waitForTimeout(ms);
  const smooth = async (dy, steps = 20, ms = 40) => { for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(ms); } };
  const done = async () => {
    await ctx.close();
    const f = fs.readdirSync(`raw/${name}`).filter((x) => x.endsWith(".webm")).map((x) => `raw/${name}/${x}`).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    fs.renameSync(f, `raw/${name}.webm`);
    fs.writeFileSync(`raw/${name}.json`, JSON.stringify(marks, null, 1));
    await browser.close();
  };
  return { browser, ctx, page, mark, sleep, smooth, done };
}
