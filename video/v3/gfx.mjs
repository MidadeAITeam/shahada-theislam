// Motion graphics and overlays for v3, rendered deterministically (frame by frame) from timeline.json.
//   node gfx.mjs            -> gfx/*.png (static overlays, transparent) and gfx/<name>/%05d.png (animated, 25 fps)
import { chromium } from "playwright";
import fs from "node:fs";
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const TL = JSON.parse(fs.readFileSync("timeline.json", "utf8"));
const BT = Object.fromEntries(TL.beats.map((b) => [b.id, b]));
const FPS = 25;
const only = process.argv.slice(2);
const quran = fs.readFileSync("../../data/quran/quran-uthmani.txt", "utf8").split("\n").find((l) => l.startsWith("28|56|")).split("|")[2];
const AYAH = quran.slice(quran.indexOf("وَلَٰكِن"), quran.indexOf("وَهُوَ")).trim(); // copied from Tanzil text, character for character
const C = { bg: "#0A0F2C", ink: "#FFFFFF", mint: "#2EF2C2", violet: "#7C6CF2", mute: "#AEB4D6" };
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;500;600;700&family=Amiri:wght@400;700&family=Amiri+Quran&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;background:transparent;color:#fff;font-family:'Readex Pro',sans-serif}
.abs{position:absolute}.ar{direction:rtl;font-family:'Readex Pro'}
.mint{color:${C.mint}}.mute{color:${C.mute}}
.pill{background:rgba(10,15,44,.78);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:10px 22px;font-size:22px;backdrop-filter:blur(6px)}
.box{background:rgba(10,15,44,.82);border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:26px 34px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.sub{left:50%;transform:translateX(-50%);bottom:46px;max-width:1500px;text-align:center;font-size:34px;line-height:1.35;font-weight:400;
     background:rgba(0,0,0,.62);padding:10px 26px;border-radius:12px;text-shadow:0 1px 2px #000}
.side{left:1110px;width:740px;top:50%;transform:translateY(-50%);font-size:60px;font-weight:600;line-height:1.18;letter-spacing:-.5px}
.side small{display:block;font-size:28px;font-weight:400;color:${C.mute};margin-top:18px;letter-spacing:0}
.top{left:64px;top:64px;max-width:1100px;font-size:46px;font-weight:600;line-height:1.2}
.top small{display:block;font-size:24px;font-weight:400;color:${C.mute};margin-top:10px}
`;
const b = await chromium.launch({ executablePath: EXE });
const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
fs.mkdirSync("gfx", { recursive: true });
async function still(name, html, opaque = false) {
  if (only.length && !only.some((o) => name.startsWith(o))) return;
  await page.setContent(`<style>${CSS}</style><body style="background:${opaque ? C.bg : "transparent"}">${html}</body>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `gfx/${name}.png`, omitBackground: !opaque });
}
async function anim(name, dur, html, render, opaque = true) {
  if (only.length && !only.some((o) => name.startsWith(o))) return;
  fs.rmSync(`gfx/${name}`, { recursive: true, force: true }); fs.mkdirSync(`gfx/${name}`);
  await page.setContent(`<style>${CSS}</style><body style="background:${opaque ? "#05081c" : "transparent"}">${html}</body><script>window.R=${render.toString()}</script>`);
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.R(t), i / FPS);
    await page.screenshot({ path: `gfx/${name}/${String(i).padStart(5, "0")}.png`, omitBackground: !opaque });
  }
  console.log(name, n);
}
const d = (id) => BT[id].end - BT[id].start;
const rel = (id, k = 0) => BT[id].sent[k].start - BT[id].start; // sentence start, relative to beat
const sd = (id, k = 0) => BT[id].sent[k].dur;

// ---------- subtitles (one PNG per event; long lines split into two events) ----------
const subs = [];
for (const be of TL.beats) for (const s of be.sent) {
  const parts = s.en.length > 84 ? splitHalf(s.en) : [s.en];
  const tot = parts.reduce((a, p) => a + p.length, 0); let t = s.start;
  parts.forEach((p) => { const dd = s.dur * p.length / tot; subs.push({ text: p, start: +t.toFixed(2), end: +(t + dd + 0.25).toFixed(2) }); t += dd; });
}
function splitHalf(s) { const m = s.length / 2; let best = -1; for (const re of [/[.?!…] /g, /[,;:] /g, / /g]) { let x; while ((x = re.exec(s))) if (best < 0 || Math.abs(x.index - m) < Math.abs(best - m)) best = x.index; if (best > s.length * 0.25 && best < s.length * 0.75) break; best = -1; }
  return best < 0 ? [s] : [s.slice(0, best + 1).trim(), s.slice(best + 1).trim()]; }
// testimonial captions (his words)
const tb = BT.b05.start;
subs.push({ text: "Subhanallah brother, Mashallah tabarakallah, it is really amazing.", start: tb + 0.3, end: tb + 4.4, ar: "سبحان الله يا أخي، ما شاء الله تبارك الله، إنه مدهشٌ حقًّا،" });
subs.push({ text: "And it's kind of blown my mind, actually.", start: tb + 4.4, end: tb + 8.0, ar: "وقد أذهلني فعلًا." });
subs.forEach((s, i) => (s.png = `gfx/sub_${String(i).padStart(2, "0")}.png`));
fs.writeFileSync("gfx/subs.json", JSON.stringify(subs, null, 1));
for (const [i, s] of subs.entries())
  await still(`sub_${String(i).padStart(2, "0")}`, `<div class="abs sub">${s.ar ? `<div class="ar" style="font-size:32px;color:#e9ecff;margin-bottom:4px">${s.ar}</div>` : ""}${s.text}</div>`);

// ---------- static overlays ----------
await still("corner", `<div class="abs pill" style="right:40px;top:36px;font-size:20px;color:#dfe3ff"><span class="ar">مشهد من العرض التجريبي</span> &nbsp;|&nbsp; Product demo</div>`);
await still("b01_a", `<div class="abs side">Someone declares the Shahada…</div>`);
await still("b01_b", `<div class="abs side">Someone declares the Shahada…<br><span class="mint">…in a chat window.</span></div>`);
await still("b02", `<div class="abs side">Words like these, from people we have never met.</div>`);
await still("b03_name", `<div class="abs" style="left:64px;bottom:150px"><div class="box" style="display:inline-block;font-size:84px;font-weight:700;letter-spacing:-1px;padding:10px 34px">theislam<span class="mint">.chat</span></div><br>
  <div class="box" style="display:inline-block;margin-top:14px;padding:14px 24px;font-size:26px">An initiative of Osoul Association | <span class="ar">مبادرة من جمعية أصول</span> · since October 2024</div></div>`);
for (const [k, l] of [["sw", "Kiswahili"], ["ja", "日本語"], ["fi", "Suomi"], ["ar", "العربية"]])
  await still(`b04_tag_${k}`, `<div class="abs pill" style="left:1060px;top:84px;font-size:30px;padding:12px 28px;border-color:${C.mint}">${l}</div>`);
await still("b05_name", `<div class="abs" style="left:64px;top:300px;width:600px"><div style="font-size:44px;font-weight:600;line-height:1.15">Dr. Laurence B. Brown</div>
  <div style="font-size:26px;color:${C.mute};margin-top:10px">physician, author and da'i</div><div style="width:80px;height:3px;background:${C.mint};margin:22px 0"></div>
  <div style="font-size:24px;color:#dfe3ff">on theislam.chat's voice dialogue</div></div>`);
await still("b06", `<div class="abs" style="left:1110px;top:50%;transform:translateY(-50%)"><div style="font-size:250px;font-weight:700;line-height:.9;letter-spacing:-8px" class="mint">166</div>
  <div style="font-size:50px;font-weight:600;margin-top:24px;line-height:1.2">conversations:<br><span style="font-weight:400">the Shahada declared<br>in the chat</span></div></div>`);
await still("b06q", `<div class="abs" style="inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#05081c">
  <div style="font-family:'Amiri Quran','Amiri';font-size:96px;direction:rtl;line-height:2">﴿${AYAH}﴾</div>
  <div class="ar" style="font-family:Amiri;font-size:38px;color:${C.mute};margin-top:6px">[القصص: ٥٦]</div>
  <div style="font-size:30px;color:#dfe3ff;margin-top:34px">“…but Allah guides whom He wills.” <span class="mute">(Al-Qasas 28:56)</span></div></div>`, true);
await still("b07", `<div class="abs side" style="font-size:84px">And then?</div>`);
await still("b08", `<div class="abs side"><span class="mint" style="font-size:150px;font-weight:700;letter-spacing:-4px;line-height:1">89</span><br>ended within two messages<br><span style="font-weight:400">of the Shahada</span></div>`);
await still("b14_a", `<div class="abs side">The same moment.<br><span class="mint">This time, a next step.</span></div>`);
await still("b14_b", `<div class="abs side">Now there is a way back to them.<small>sign in with Google or e-mail · daily lesson e-mail</small></div>`);
await still("b15_1", `<div class="abs top box">Al-Wajeez by Osoul Center · 4 units · 19 lessons<small>the whole book, page by page</small></div>`);
await still("b15_2", `<div class="abs top box">10 language editions · answers in 20+ languages</div>`);
await still("b15_3", `<div class="abs top box">What do I do now? → <span class="mint">Wudu · Prayer · Al-Fatiha</span></div>`);
await still("b15_4", `<div class="abs top box" style="font-size:30px">Listen &amp; repeat (Al-Minshawi) · exercises from the book</div>`);
await still("b16_a", `<div class="abs top box">No page, no sentence.<small>checked by code, not by AI</small></div>`);
await still("b16_tag", `<div class="abs pill" style="left:64px;top:64px;font-size:24px">Tanzil · QuranEnc</div>`);
await still("b16_card", `<div class="abs" style="inset:0;background:rgba(5,8,28,.72)"></div><div class="abs box" style="left:50%;top:46%;transform:translate(-50%,-50%);width:1180px;padding:50px 64px;border-color:rgba(46,242,194,.5)">
  <div style="font-size:26px;color:${C.mint};font-weight:500;letter-spacing:2px;text-transform:uppercase">In testing</div>
  <div style="font-size:58px;font-weight:700;margin-top:12px"><span class="mint">0</span> invented rulings</div>
  <div style="font-size:44px;font-weight:500;margin-top:22px"><span class="mint">84/84</span> Shahada conversations handled correctly</div>
  <div style="font-size:44px;font-weight:500;margin-top:16px"><span class="mint">100%</span> faithful to the book in the final checks</div></div>`);
await still("b17_1", `<div class="abs top box">No AI ruling on personal questions.</div>`);
await still("b17_2", `<div class="abs top box">A mentor from the Osoul team<small>mentor platform · demo case</small></div>`);
await still("b17_3", `<div class="abs top box">Life at risk: <span style="color:#FF8A8A">emergency number first</span><small>test message, blurred</small></div>`);
await still("b18_a", `<div class="abs side" style="font-size:66px">Not the last message.</div>`);
await still("b18_b", `<div class="abs side" style="font-size:66px">Not the last message.<br><span class="mint">The first lesson.</span></div>`);
await still("b18_url", `<div class="abs side" style="top:auto;bottom:150px;transform:none;font-size:40px;font-weight:500;letter-spacing:0">shahada<span class="mint">.theislam.chat</span></div>`);

await still("bg", `<div class="abs" style="inset:0;background:radial-gradient(1200px 800px at 30% 40%,#1b2160 0%,#0A0F2C 55%,#05081c 100%)"></div>
  <div class="abs" style="left:-200px;top:-200px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(46,242,194,.10),transparent 65%)"></div>`, true);
await still("shade_right", `<div class="abs" style="inset:0;background:linear-gradient(90deg,rgba(5,8,28,0) 30%,rgba(5,8,28,.88) 55%,rgba(5,8,28,.95) 100%)"></div>`);
await still("phonemask", `<div class="abs" style="left:0;top:0;width:780px;height:1000px;border-radius:44px;background:#fff"></div>`);
await still("phoneframe", `<div class="abs" style="left:0;top:0;width:780px;height:1000px;border-radius:44px;border:3px solid rgba(255,255,255,.22);box-shadow:0 0 0 10px rgba(255,255,255,.04)"></div>`);
// ---------- animated graphics ----------
// B4 numbers: one stack, count-up lands on «محادثةً» (~50% of the sentence), 150 at ~78%, 52 at ~98%.
{
  const s0 = rel("b04"), L = sd("b04");
  const land = [s0 + L * 0.5, s0 + L * 0.79, s0 + L * 0.97];
  await anim("b04_num", d("b04"), `<div class="abs" style="left:1060px;top:180px;width:820px">
   <div id="n1" style="font-size:150px;font-weight:700;letter-spacing:-4px;line-height:1">0</div><div id="l1" style="font-size:40px;opacity:0">conversations <span class="mute" style="font-size:26px;display:block;margin-top:6px">about 115,000 messages</span></div>
   <div id="r2" style="margin-top:40px;opacity:0"><span style="font-size:110px;font-weight:700;line-height:1" class="mint">150</span> <span style="font-size:40px">countries</span></div>
   <div id="r3" style="margin-top:20px;opacity:0"><span style="font-size:110px;font-weight:700;line-height:1" class="mint">52</span> <span style="font-size:40px">languages</span></div></div>`,
   `(t)=>{const L=${JSON.stringify(land)};const e=(x)=>Math.max(0,Math.min(1,x));const k=e((t-(L[0]-0.6))/0.6);const ease=1-Math.pow(1-k,3);
     const n=Math.round(16653*ease);document.getElementById('n1').textContent=n.toLocaleString('en-US');document.getElementById('n1').style.opacity=t>L[0]-0.8?1:0;
     document.getElementById('l1').style.opacity=e((t-L[0])/0.25);
     for(const [id,tt] of [['r2',L[1]],['r3',L[2]]]){const q=e((t-tt+0.12)/0.18);const el=document.getElementById(id);el.style.opacity=q;el.style.transform='scale('+(1.25-0.25*q)+')';el.style.transformOrigin='left center'}}`, false);
}
// B9 + B10: the three questions as kinetic type; the last stays, grows to fill, then loses contrast.
{
  const s0 = rel("b09"), L = sd("b09"), D9 = d("b09"), D = D9 + d("b10");
  const q = [s0 + L * 0.40, s0 + L * 0.60, s0 + L * 0.78];
  await anim("b09", D, `<div class="abs" id="sm" style="left:0;right:0;top:170px;text-align:center;font-size:34px;color:${C.mute};opacity:0">22 asked right away</div>
   <div class="abs" id="q1" style="left:0;right:0;top:330px;text-align:center;font-size:84px;font-weight:600;opacity:0">How do I make wudu?</div>
   <div class="abs" id="q2" style="left:0;right:0;top:480px;text-align:center;font-size:84px;font-weight:600;opacity:0">How do I pray?</div>
   <div class="abs" id="q3" style="left:0;right:0;top:630px;text-align:center;font-size:84px;font-weight:700;opacity:0;color:${C.mint}">What do I do now?</div>
   <div class="abs" id="bd" style="left:0;right:0;bottom:170px;text-align:center;opacity:0"><span class="box" style="font-size:36px;font-weight:500;padding:16px 30px">By design: no worship from AI memory.</span></div>`,
   `(t)=>{const Q=${JSON.stringify(q)},D9=${D9},D=${D};const e=(x)=>Math.max(0,Math.min(1,x));
    document.getElementById('sm').style.opacity=e((t-Q[0]+0.4)/0.4)*(1-e((t-D9+0.6)/0.5));
    ['q1','q2','q3'].forEach((id,i)=>{const el=document.getElementById(id);const k=e((t-Q[i]+0.1)/0.22);el.style.opacity=k;el.style.transform='translateY('+(30*(1-k))+'px)';});
    const g=e((t-(Q[2]+0.9))/1.6), gg=1-Math.pow(1-g,3);
    ['q1','q2'].forEach(id=>{const el=document.getElementById(id);el.style.opacity=Math.min(el.style.opacity,1-gg)});
    const q3=document.getElementById('q3');q3.style.top=(630-(630-420)*gg)+'px';q3.style.fontSize=(84+86*gg)+'px';
    const fade=e((t-D9-0.3)/(D-D9-0.8));const c=Math.round(46+(70-46)*fade),cc=Math.round(242-(242-80)*fade),c3=Math.round(194-(194-90)*fade);q3.style.color='rgb('+c+','+cc+','+c3+')';
    document.getElementById('bd').style.opacity=e((t-D9-0.2)/0.4);}`);
}
// B11 + B12: 166 white dots; 11 turn mint and a thin line joins each to the point "Osoul"; the others stay lit.
{
  const D11 = d("b11"), D = D11 + d("b12");
  const on = rel("b11") + sd("b11") * 0.36;
  const s12a = D11 + rel("b12", 0), s12b = D11 + rel("b12", 1), nahnu = s12b + sd("b12", 1) - 0.25;
  const cols = 22, rows = 8, gx = 62, gy = 62, x0 = 960 - (cols - 1) * gx / 2, y0 = 170;
  const dots = []; for (let i = 0; i < 166; i++) dots.push([x0 + (i % cols) * gx, y0 + Math.floor(i / cols) * gy]);
  const pick = [3, 17, 26, 40, 58, 71, 85, 99, 118, 134, 151];
  const O = [960, 720];
  let svg = `<svg class="abs" width="1920" height="1080" style="left:0;top:0">`;
  pick.forEach((p, k) => (svg += `<line id="ln${k}" x1="${O[0]}" y1="${O[1]}" x2="${dots[p][0]}" y2="${dots[p][1]}" stroke="${C.mint}" stroke-width="2" stroke-opacity=".75" stroke-dasharray="2000" stroke-dashoffset="2000"/>`));
  dots.forEach(([x, y], i) => (svg += `<circle id="d${i}" cx="${x}" cy="${y}" r="11" fill="#fff"/>`));
  svg += `<circle cx="${O[0]}" cy="${O[1]}" r="16" fill="${C.violet}"/><text x="${O[0]}" y="${O[1] + 56}" fill="#dfe3ff" font-size="30" text-anchor="middle" font-family="Readex Pro">Osoul</text></svg>`;
  await anim("b11", D, `<div id="all" class="abs" style="inset:0">${svg}
   <div class="abs" id="t1" style="left:0;right:0;bottom:150px;text-align:center;font-size:46px;font-weight:600;opacity:0"><span class="mint">11</span> of 166 could be contacted</div>
   <div class="abs" id="t2" style="left:0;right:0;bottom:150px;text-align:center;font-size:44px;font-weight:500;opacity:0">We don't know who taught them wudu the next day.</div>
   <div class="abs" id="t3" style="left:0;right:0;bottom:150px;text-align:center;font-size:56px;font-weight:700;opacity:0">The trust is ours.</div></div>`,
   `(t)=>{const e=(x)=>Math.max(0,Math.min(1,x));const ON=${on},A=${s12a},B=${s12b},N=${nahnu};const P=${JSON.stringify(pick)};
    document.querySelectorAll('circle[id^=d]').forEach((c,i)=>{c.style.opacity=e((t-i*0.006)/0.3)});
    P.forEach((p,k)=>{const q=e((t-ON-k*0.05)/0.5);document.getElementById('d'+p).setAttribute('fill',q>0.1?'${C.mint}':'#fff');document.getElementById('ln'+k).setAttribute('stroke-dashoffset',2000-2000*q)});
    document.getElementById('t1').style.opacity=e((t-ON)/0.3)*(1-e((t-A+0.1)/0.3));
    document.getElementById('t2').style.opacity=e((t-A)/0.3)*(1-e((t-B+0.1)/0.3));
    document.getElementById('t3').style.opacity=e((t-B)/0.3);
    document.getElementById('all').style.opacity=t<N?1:Math.max(0,1-(t-N)/0.08);}`);
}
// B13: title typed letter by letter on black.
{
  const D = d("b13"), st = Math.max(0.4, rel("b13") + sd("b13") * 0.45);
  await anim("b13", D, `<div class="abs" style="inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
   <div style="font-size:120px;font-weight:700;direction:rtl"><span id="ar"></span></div>
   <div style="font-size:64px;font-weight:500;margin-top:6px"><span id="en"></span><span id="cur" style="display:inline-block;width:4px;height:64px;background:${C.mint};vertical-align:-8px;margin-left:6px"></span></div>
   <div id="tr" style="font-size:24px;color:${C.mute};margin-top:40px;opacity:0">Track 03 · AI in the Service of Islamic Content Challenge 2026</div></div>`,
   `(t)=>{const A='ما بعد الشهادة',E='After the Shahada',S=${st},e=(x)=>Math.max(0,Math.min(1,x));const n=Math.floor((t-S)/0.045);
    document.getElementById('ar').textContent=A.slice(0,Math.max(0,n));document.getElementById('en').textContent=E.slice(0,Math.max(0,n-A.length+4));
    document.getElementById('cur').style.opacity=(Math.floor(t*2.5)%2)?1:0.15;document.getElementById('tr').style.opacity=e((t-S-1.4)/0.3);}`);
}
// B19: end card — the URL typed into a chat bubble with the chat's input field around it.
{
  const D = d("b19");
  await anim("b19", D, `<div class="abs" style="inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
   <div style="width:1300px;border:2px solid rgba(255,255,255,.18);border-radius:48px;padding:34px 46px;background:rgba(255,255,255,.04);display:flex;align-items:center;gap:30px">
     <div style="flex:1;font-size:92px;font-weight:600;letter-spacing:-1px;white-space:nowrap"><span id="u"></span><span id="cur" style="display:inline-block;width:5px;height:84px;background:${C.mint};vertical-align:-10px;margin-left:4px"></span></div>
     <div style="width:96px;height:96px;border-radius:50%;background:${C.mint};display:flex;align-items:center;justify-content:center;color:#05081c;font-size:54px">↑</div></div>
   <div style="font-size:32px;color:#dfe3ff;margin-top:46px">theislam.chat · an initiative of Osoul Association | <span class="ar">مبادرة من جمعية أصول</span></div>
   <div class="ar" style="font-family:Amiri;font-size:46px;margin-top:34px;color:#fff;direction:rtl">يا مُقَلِّبَ القُلُوبِ، ثَبِّتْ قُلُوبَنا وقُلُوبَهُم على دِينِكَ.</div></div>`,
   `(t)=>{const U='shahada.theislam.chat';const n=Math.floor(t/0.03);const u=U.slice(0,n);document.getElementById('u').innerHTML=u.replace('.theislam.chat','<span style="color:${C.mint}">.theislam.chat</span>').replace(/\\.theislam\\.cha?t?$/,m=>m);
    document.getElementById('cur').style.opacity=(Math.floor(t*2.5)%2)?1:0.15;}`);
}
await b.close();
console.log("gfx done");
