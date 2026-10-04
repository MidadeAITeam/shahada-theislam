// A short scripted pre-Shahada conversation, so visitors and judges can reach the module without
// holding a full da'wah conversation first. The user's lines carry the facts the start card reads
// ("I'm Christian from the US", "questions about Jesus"), so the card has real evidence to show.
import { apiLang } from './i18n.js';

const SCRIPTS = {
  en: [
    ['user', "Hi. I'm Christian from the US, and I've been reading about Islam for a few months."],
    ['assistant', "Welcome! It's good that you are reading and asking. What would you like to talk about?"],
    ['user', 'I have questions about Jesus. Do Muslims believe in him?'],
    ['assistant', 'Yes. Muslims love and honour Jesus (peace be upon him) as one of the greatest prophets of God, born to Mary by a miracle, without a father. Muslims believe he is a prophet and messenger, not God, and that God is One, with no partner.'],
    ['user', 'I think I am ready. I want to become Muslim. How do I do it?'],
    ['assistant', 'That is a beautiful decision. You enter Islam by saying the testimony of faith, the Shahada, with understanding and sincerity:\n\n**Ash-hadu an la ilaha illa Allah, wa ash-hadu anna Muhammadan rasulu Allah.**\n\n"I bear witness that there is no god but Allah, and I bear witness that Muhammad is the Messenger of Allah."\n\nWrite it here when you are ready.'],
    ['user', 'I bear witness that there is no god but Allah, and I bear witness that Muhammad is the Messenger of Allah.'],
    ['assistant', 'Congratulations, and welcome to Islam! You begin today with a clean page. Let us take your first steps together, one at a time.'],
  ],
  ar: [
    ['user', 'مرحباً، أنا مسيحي من أمريكا، وأقرأ عن الإسلام منذ بضعة أشهر.'],
    ['assistant', 'أهلاً بك! جميل أنك تقرأ وتسأل. عمّ تحب أن نتحدث؟'],
    ['user', 'عندي أسئلة عن عيسى. هل يؤمن المسلمون به؟'],
    ['assistant', 'نعم. يحب المسلمون عيسى عليه السلام ويعظّمونه، فهو من أعظم أنبياء الله، وُلد من مريم بمعجزة دون أب. ويؤمن المسلمون أنه نبي ورسول وليس إلهاً، وأن الله واحد لا شريك له.'],
    ['user', 'أظن أنني مستعد. أريد أن أصبح مسلماً، فكيف ذلك؟'],
    ['assistant', 'هذا قرار جميل. تدخل الإسلام بأن تنطق الشهادتين عن فهم وصدق:\n\n**أشهد أن لا إله إلا الله، وأشهد أن محمداً رسول الله.**\n\nاكتبها هنا متى كنت مستعداً.'],
    ['user', 'أشهد أن لا إله إلا الله، وأشهد أن محمداً رسول الله.'],
    ['assistant', 'مبارك، وأهلاً بك في الإسلام! تبدأ اليوم صفحة جديدة. لنخطُ خطواتك الأولى معاً، خطوة خطوة.'],
  ],
};

/** The scripted turns for a locale, as {role, text}. The last one is the congratulation. */
export function demoConversation(locale) {
  return (SCRIPTS[apiLang(locale)] || SCRIPTS.en).map(([role, text]) => ({ role, text }));
}

/**
 * Hand the turns to `onTurn` one by one with a short pause, so the demo reads as a conversation
 * rather than appearing all at once. Resolves after the congratulation.
 */
export async function playDemo(locale, onTurn, pauseMs = 450) {
  const turns = demoConversation(locale);
  for (let i = 0; i < turns.length; i++) {
    onTurn(turns[i], i === turns.length - 1);
    if (i < turns.length - 1) await new Promise((r) => setTimeout(r, pauseMs));
  }
}
