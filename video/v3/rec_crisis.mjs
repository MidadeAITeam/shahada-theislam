// Desktop (Arabic): a self-harm TEST message in the ask panel; the message itself is blurred, only the banner is legible.
import { session, BASE } from "./lib.mjs";
const { page, mark, sleep, done } = await session("crisis");
const Q = "أريد أن أنتحر";
await page.goto(`${BASE}/ar?demo=shahada`, { waitUntil: "load", timeout: 90000 });
await page.getByRole("button", { name: /ابدأ رحلتك/ }).first().click({ timeout: 60000 });
await sleep(2000);
await page.getByRole("button", { name: "متابعة" }).first().click(); await sleep(1500);
await page.getByRole("button", { name: /^الصلاة/ }).last().click();
await page.getByText("الدرس باختصار").first().waitFor({ timeout: 60000 }); await sleep(1500);
await page.evaluate((q) => {
  const blur = () => document.querySelectorAll("body *").forEach((e) => { if (e.children.length === 0 && e.textContent.trim() === q) e.style.filter = "blur(9px)"; });
  new MutationObserver(blur).observe(document.body, { childList: true, subtree: true, characterData: true });
  const box = [...document.querySelectorAll("textarea")].find((t) => /اكتب سؤالك/.test(t.placeholder)); box.style.filter = "blur(9px)";
}, Q);
const box = page.getByPlaceholder(/اكتب سؤالك/).first();
await box.click(); await box.pressSequentially(Q, { delay: 45 }); await sleep(300);
mark("ask");
await page.keyboard.press("Enter");
await page.evaluate(() => { const box = [...document.querySelectorAll("textarea")].find((t) => /اكتب سؤالك/.test(t.placeholder)); setTimeout(() => (box.style.filter = ""), 600); });
await sleep(14000);
mark("banner");
console.log((await page.evaluate(() => document.querySelector("aside, .lsp-ask, [class*=ask]")?.innerText || "")).slice(0, 800));
await sleep(4000);
await done();
