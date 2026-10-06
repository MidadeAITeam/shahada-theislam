// Phone (English) demo: the hook (Shahada typed, sent, congratulation), the empty "and then?" frame,
// the journey card sliding in, the sign-in sheet, and the bookend. Same crop throughout.
import { session, BASE } from "./lib.mjs";
const { page, mark, sleep, done } = await session("phone", { phone: true, locale: "en" });
await page.goto(`${BASE}/en?demo=shahada`, { waitUntil: "load", timeout: 90000 });
await page.getByRole("button", { name: /Start your journey/ }).first().waitFor({ timeout: 60000 });
await sleep(1500);
// Stage the demo: hide the last user message (the Shahada), the congratulation and the card.
await page.addStyleTag({ content: `
  .v-hide{display:none!important}
  .v-pop{animation:vpop .35s cubic-bezier(.2,.8,.2,1.2)}
  @keyframes vpop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
  .v-slide{animation:vslide .7s cubic-bezier(.2,.8,.2,1)}
  @keyframes vslide{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}` });
await page.evaluate(() => {
  const lis = [...document.querySelectorAll("ul.list-unstyled > li")];
  const u = lis.filter((l) => l.classList.contains("user-message")).pop();
  const a = lis.filter((l) => l.classList.contains("ai-message")).pop();
  u.id = "v-u"; a.id = "v-a"; u.classList.add("v-hide"); a.classList.add("v-hide");
  a.querySelector(".shd-flow").id = "v-card"; a.querySelector(".shd-flow").classList.add("v-hide");
  const sc = (e) => { while (e && e.scrollHeight <= e.clientHeight + 2) e = e.parentElement; return e; };
  window.vScroll = () => { const s = sc(document.getElementById("v-a").parentElement) || document.scrollingElement; s.scrollTop = s.scrollHeight; window.scrollTo(0, document.body.scrollHeight); };
  window.vScroll();
});
await sleep(1200);
const ta = page.locator("textarea").first();
await ta.click();
mark("type_start");
await ta.pressSequentially("I bear witness that there is no god but Allah, and I bear witness that Muhammad is the Messenger of Allah.", { delay: 22 });
await sleep(300);
mark("send");
await page.evaluate(() => { const t = document.querySelector("textarea"); t.value = ""; t.dispatchEvent(new Event("input", { bubbles: true }));
  const u = document.getElementById("v-u"); u.classList.remove("v-hide"); u.classList.add("v-pop"); window.vScroll(); });
await sleep(900);
mark("congrat");
await page.evaluate(() => { const a = document.getElementById("v-a"); a.classList.remove("v-hide"); a.classList.add("v-pop"); window.vScroll(); });
await sleep(4000);
mark("silence_start"); // composer focused, cursor blinking, nothing below
await ta.click();
await sleep(9000);
mark("card");
await page.evaluate(() => { const c = document.getElementById("v-card"); c.classList.remove("v-hide"); c.classList.add("v-slide"); });
await sleep(200);
await page.evaluate(() => document.getElementById("v-card").scrollIntoView({ behavior: "smooth", block: "end" }));
await sleep(2300);
mark("card_held");
await sleep(1500);
await page.getByRole("button", { name: /Start your journey/ }).first().click();
await sleep(2500);
mark("ls_open");
await sleep(1500);
await page.getByRole("dialog").getByRole("button", { name: /Sign in/ }).first().click().catch((e) => console.log("signin", e.message));
await sleep(500);
mark("signin");
await sleep(3500);
await page.keyboard.press("Escape");
await sleep(800);
console.log("BTN", (await page.$$eval("button", (e) => e.filter(x=>x.offsetParent).map((x) => (x.getAttribute("aria-label")||x.innerText||"").trim().slice(0,30)))).join(" | "));
await page.keyboard.press("Escape"); await sleep(1500);
await page.keyboard.press("Escape"); await sleep(1500);
mark("chat_again");
await page.locator("button[aria-label*='oice' i], button[aria-label*='mic' i], button[title*='oice' i], button[title*='mic' i]").first().click().catch((e) => console.log("mic", e.message));
await sleep(500);
mark("voice");
await sleep(7000);
await done();
