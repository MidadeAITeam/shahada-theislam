// Renders the title, results and closing cards (1280x720) in the challenge template's colours.
import { chromium } from "playwright";
import fs from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const css = `
@import url('https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{width:1280px;height:720px;font-family:'Readex Pro',sans-serif;background:#12183F;color:#F2F4FF;direction:rtl;display:flex;flex-direction:column;justify-content:center;padding:70px 90px}
.k{color:#2EF2C2;font-size:22px;font-weight:600;letter-spacing:.5px;margin-bottom:18px}
h1{font-size:52px;font-weight:700;line-height:1.3}
h1 span{color:#2EF2C2}
.sub{font-size:24px;color:#cfd4f5;margin-top:16px;line-height:1.6}
.stats{display:flex;gap:28px;margin-top:44px}
.stat{flex:1;background:#1c2457;border-radius:22px;padding:26px 24px}
.stat b{display:block;font-size:64px;color:#2EF2C2;font-weight:700;line-height:1}
.stat.v b{color:#a79dff}
.stat span{display:block;font-size:20px;color:#dfe3ff;margin-top:12px;line-height:1.4}
.row{display:flex;justify-content:space-between;align-items:center;background:#1c2457;border-radius:16px;padding:16px 26px;margin-top:14px;font-size:24px}
.row b{font-size:30px}.row .o{color:#2EF2C2}.row .x{color:#9aa2d6;font-size:22px}
.foot{font-size:18px;color:#9aa2d6;margin-top:26px}
.url{font-family:monospace;direction:ltr;color:#2EF2C2;font-size:30px;margin-top:30px}
.logo{font-size:26px;color:#F2F4FF;font-weight:600}
`;
const cards = {
  s1: `<div class="k">theislam.chat · ما بعد الشهادة</div>
<h1>الشهادة كانت <span>نهاية</span> المحادثة</h1>
<div class="stats">
 <div class="stat"><b>166</b><span>محادثة أعلن فيها المستخدم إسلامه</span></div>
 <div class="stat v"><b>89</b><span>توقفت بعد رسالتين أو أقل</span></div>
 <div class="stat"><b>11</b><span>فقط تركوا وسيلة تواصل</span></div>
</div>
<div class="foot">من تصدير قاعدة بيانات المنصة في 8 سبتمبر 2026 · أرقام مجمّعة دون أي محادثة</div>`,
  s7: `<div class="k">النتائج · 200 سؤال ثُبّتت بصمتها قبل البناء × 3 محاولات</div>
<h1 style="font-size:40px">مقارنة بالنموذج نفسه على المقاطع نفسها دون الفاحص والموجّه</h1>
<div class="row"><span>اقتباسات مطابقة لنص الكتاب</span><span><b class="o">100%</b> <span class="x">مقابل 92%</span></span></div>
<div class="row"><span>أسئلة الخلاف بصيغة السعة</span><span><b class="o">87%</b> <span class="x">مقابل 0%</span></span></div>
<div class="row"><span>حالات حرجة: لا حكم شخصي وعرض المرشد</span><span><b class="o">99%</b> <span class="x">مقابل 81%</span></span></div>
<div class="row"><span>رسالة الطوارئ أولاً في حالات إيذاء النفس</span><span><b class="o">100%</b></span></div>
<div class="foot">التقرير الكامل وما لم يتحقق من الأهداف: docs/evaluation.md</div>`,
  s8: `<div class="k">جمعية أصول · المسار 03</div>
<h1>الشهادة <span>بداية</span> الطريق</h1>
<div class="sub">رحلة تعليمية من كتاب «الوجيز» داخل محادثة theislam.chat، بلغة المستخدم، مع إسناد كل جملة وإحالة إلى إنسان عند الحاجة.</div>
<div class="url">shahada.theislam.chat</div>
<div class="url" style="font-size:22px;margin-top:12px">github.com/MidadeAITeam/shahada-theislam</div>`,
};
fs.mkdirSync("raw", { recursive: true });
const b = await chromium.launch({ executablePath: EXE });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
for (const [id, html] of Object.entries(cards)) {
  await p.setContent(`<html><head><style>${css}</style></head><body>${html}</body></html>`, { waitUntil: "networkidle" });
  await p.screenshot({ path: `raw/${id}.png` });
}
await b.close();
console.log("cards ok");
