// Phone screenshots of the demo in other UI languages (B4 language cuts).
import { chromium } from "playwright";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const b = await chromium.launch({ executablePath: EXE });
for (const [l, mode] of [["sw", "chat"], ["ja", "ls"], ["fi", "chat"], ["en", "ls"]]) {
  const p = await (await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, locale: l })).newPage();
  await p.goto(`https://shahada.theislam.chat/${l}?demo=shahada`, { waitUntil: "load", timeout: 90000 }).catch((e) => console.log(l, e.message));
  await p.waitForTimeout(12000);
  if (mode === "ls") { await p.locator(".lsp-journey__btn").first().click().catch((e) => console.log("btn", e.message)); await p.waitForTimeout(4000); }
  await p.screenshot({ path: `raw/lang_${l}.png` });
  console.log(l, p.url());
}
await b.close();
