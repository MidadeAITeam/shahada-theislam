// Keynote-style animated beats, recorded as video at 1280x720, plus transparent caption overlays.
//   node anim.mjs <durations.json>   (durations.json: {beatId: seconds})
import { chromium } from "playwright";
import fs from "node:fs";

const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const S = JSON.parse(fs.readFileSync("script2.json", "utf8"));
const D = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
fs.mkdirSync("raw2", { recursive: true });

const base = `
@import url('https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;600;700&family=Amiri&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1280px;height:720px;background:#000;color:#fff;font-family:'Readex Pro',sans-serif;direction:rtl;overflow:hidden}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.fade{opacity:0;transform:translateY(18px);animation:in .9s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes in{to{opacity:1;transform:none}}
.t{color:#2EF2C2}
`;

function page(beat, dur) {
  const v = beat.visual;
  if (v === "chat") {
    return `<style>${base}
.phone{width:620px;display:flex;flex-direction:column;gap:18px}
.b{max-width:80%;padding:16px 22px;border-radius:22px;font-size:26px;line-height:1.6}
.u{align-self:flex-start;background:#1f2a5c}
.a{align-self:flex-end;background:#e9ecff;color:#12183F;opacity:0}
.dots{align-self:flex-end;opacity:0;font-size:34px;letter-spacing:6px;color:#666}
.cur{display:inline-block;width:2px;height:28px;background:#2EF2C2;margin-inline-start:4px;animation:bl 1s steps(1) infinite;vertical-align:middle}
@keyframes bl{50%{opacity:0}}
</style><div class="c"><div class="phone"><div class="b u" id="u"><span id="tx"></span><span class="cur"></span></div><div class="b a" id="a">مبارك! أهلاً بك في الإسلام.</div><div class="dots" id="d">• • •</div></div></div>
<script>
const s="أشهد أن لا إله إلا الله، وأشهد أن محمداً رسول الله";let i=0;
const iv=setInterval(()=>{document.getElementById('tx').textContent=s.slice(0,++i);if(i>=s.length)clearInterval(iv)},55);
setTimeout(()=>{const a=document.getElementById('a');a.style.transition='opacity .6s';a.style.opacity=1},3600);
setTimeout(()=>{const d=document.getElementById('d');d.style.transition='opacity .4s';d.style.opacity=1},5000);
setTimeout(()=>{const d=document.getElementById('d');d.style.opacity=0},${Math.max(6000, dur * 1000 - 1500)});
</script>`;
  }
  if (v === "words") {
    const n = beat.words.length;
    const step = Math.min(1.6, (dur - 1.2) / n);
    return `<style>${base}.w{font-size:${n > 2 ? 64 : 84}px;font-weight:600;line-height:1.5}</style><div class="c">${beat.words
      .map((w, i) => `<div class="w fade ${i === n - 1 ? "t" : ""}" style="animation-delay:${(0.3 + i * step).toFixed(2)}s">${w}</div>`)
      .join("")}</div>`;
  }
  if (v === "number") {
    return `<style>${base}.n{font-size:260px;font-weight:700;line-height:1;letter-spacing:-6px}.l{font-size:38px;font-weight:300;margin-top:26px;color:#d9dcf2}</style>
<div class="c"><div class="n t" id="n">0</div><div class="l fade" style="animation-delay:1.3s">${beat.label}</div></div>
<script>const N=${beat.num};let k=0;const iv=setInterval(()=>{k=Math.min(N,k+Math.ceil(N/30));document.getElementById('n').textContent=k;if(k>=N)clearInterval(iv)},33);</script>`;
  }
  if (v === "reveal") {
    return `<style>${base}
.ring{position:absolute;width:40px;height:40px;border-radius:50%;box-shadow:0 0 120px 40px rgba(46,242,194,.35);animation:g ${Math.max(2, dur - 1).toFixed(1)}s ease-out forwards}
@keyframes g{to{width:900px;height:900px;box-shadow:0 0 200px 60px rgba(97,80,234,.25);opacity:.6}}
.h{font-size:96px;font-weight:700}.s{font-size:30px;color:#9aa2d6;margin-top:14px;direction:ltr}</style>
<div class="c"><div class="ring"></div><div class="h fade" style="animation-delay:1.6s">ما بعد <span class="t">الشهادة</span></div><div class="s fade" style="animation-delay:2.4s">theislam.chat</div></div>`;
  }
  if (v === "proof") {
    return `<style>${base}.k{font-size:30px;color:#9aa2d6}.big{font-size:200px;font-weight:700;line-height:1.05}.l{font-size:34px;font-weight:300;color:#d9dcf2}
.row{display:flex;gap:60px;margin-top:40px}.m b{display:block;font-size:56px;color:#a79dff}.m span{font-size:22px;color:#c9cdea}</style>
<div class="c"><div class="k fade" style="animation-delay:.3s">200 سؤال · ثُبّتت بصمتها قبل البناء · 3 محاولات لكل سؤال</div>
<div class="big t fade" style="animation-delay:${(dur * 0.45).toFixed(1)}s">100%</div>
<div class="l fade" style="animation-delay:${(dur * 0.45 + 0.6).toFixed(1)}s">من الاقتباسات طابقت نص الكتاب</div>
<div class="row fade" style="animation-delay:${(dur * 0.45 + 1.6).toFixed(1)}s"><div class="m"><b>87%</b><span>أسئلة الخلاف بصيغة السعة</span></div><div class="m"><b>100%</b><span>رسالة الطوارئ أولاً</span></div></div></div>`;
  }
  if (v === "close") {
    return `<style>${base}.a{font-size:62px;font-weight:400}.b{font-size:96px;font-weight:700;margin-top:10px}.u{font-size:28px;color:#9aa2d6;margin-top:48px;direction:ltr}</style>
<div class="c"><div class="a fade" style="animation-delay:.4s">الشهادة ليست نهاية المحادثة.</div><div class="b t fade" style="animation-delay:${(dur * 0.45).toFixed(1)}s">إنها بدايتها.</div>
<div class="u fade" style="animation-delay:${(dur * 0.45 + 1.4).toFixed(1)}s">shahada.theislam.chat · جمعية أصول</div></div>`;
  }
  return null;
}

const b = await chromium.launch({ executablePath: EXE });
for (const beat of S.beats) {
  const dur = D[beat.id];
  if (beat.visual === "screen") {
    // caption overlay (transparent PNG)
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    await p.setContent(`<style>${base}html,body{background:transparent}
.cap{position:absolute;top:40px;left:50%;transform:translateX(-50%);background:rgba(18,24,63,.88);color:#fff;font-size:38px;font-weight:600;padding:16px 34px;border-radius:999px;white-space:nowrap}</style><div class="cap">${beat.caption}</div>`, { waitUntil: "networkidle" });
    await p.screenshot({ path: `raw2/${beat.id}_cap.png`, omitBackground: true });
    await p.close();
    continue;
  }
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: "raw2/tmp", size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  await p.setContent(`<html><body>${page(beat, dur)}</body></html>`, { waitUntil: "networkidle" });
  await p.waitForTimeout(dur * 1000 + 300);
  const vp = await p.video().path();
  await ctx.close();
  fs.renameSync(vp, `raw2/${beat.id}.webm`);
  console.log(beat.id, dur);
}
await b.close();
