// Fixed texts (not generated). The emergency message is shown before anything else when a
// message signals danger to the person's life; it carries the emergency number of the country
// the user stated (never inferred from IP).
type Key = "fatwa_personal" | "crisis" | "practical_need" | "unsure" | "not_in_book" | "failed" | "social" | "emergency";

const T: Record<string, Record<Key, string>> = {
  en: {
    fatwa_personal: "This is a question about your own situation, and it deserves a real person who can understand all of its details. Would you like to talk to a mentor? You can choose a brother or a sister.",
    crisis: "I'm sorry you are going through this. Your safety comes first. A mentor from our team can talk with you — would you like me to connect you now?",
    practical_need: "A mentor from our team can help you with this directly. Would you like me to connect you?",
    unsure: "I want to be sure you get a right answer, so a mentor from our team is better placed to help with this. Would you like to talk to one?",
    not_in_book: "I could not find the answer to this in the book Al-Wajeez, and I will not answer from outside it. A mentor from our team can help — would you like to talk to one?",
    failed: "I'm sorry, I could not prepare an answer I can fully trace to the book. A mentor from our team can help — would you like to talk to one?",
    social: "Wa alaykum as-salam and welcome. Ask me anything about your lesson, or continue to the next one when you are ready.",
    emergency: "If you are thinking about hurting yourself or you are in danger, please call {NUMBER} now, or go to the nearest emergency service. You are not alone, and your life is precious.",
  },
  ar: {
    fatwa_personal: "هذه مسألة تخص حالتك أنت، ويحسن أن يجيبك عنها إنسان يفهم تفاصيلها كلها. هل تريد التحدث إلى مرشد؟ يمكنك أن تختار مرشداً أو مرشدة.",
    crisis: "يؤسفني ما تمر به، وسلامتك أولاً. يستطيع مرشد من فريقنا أن يتحدث معك، هل تريد أن أصلك به الآن؟",
    practical_need: "يستطيع مرشد من فريقنا أن يساعدك في هذا مباشرة. هل تريد أن أصلك به؟",
    unsure: "أريد أن تصلك إجابة صحيحة، والأنسب في هذا أن يساعدك مرشد من فريقنا. هل تريد التحدث إليه؟",
    not_in_book: "لم أجد جواب هذا السؤال في كتاب «الوجيز»، ولا أجيب من خارجه. يستطيع مرشد من فريقنا أن يساعدك، هل تريد التحدث إليه؟",
    failed: "عذراً، لم أستطع إعداد جواب أستطيع إسناده كله إلى الكتاب. يستطيع مرشد من فريقنا أن يساعدك، هل تريد التحدث إليه؟",
    social: "وعليكم السلام ومرحباً بك. اسألني عما تشاء في درسك، أو انتقل إلى الدرس التالي متى شئت.",
    emergency: "إن كنت تفكر في إيذاء نفسك أو كنت في خطر، فاتصل الآن بالرقم {NUMBER}، أو توجّه إلى أقرب جهة طوارئ. لست وحدك، وحياتك غالية.",
  },
};

// Emergency numbers for countries users state most often (public numbers; 112 where it is the general number).
export const EMERGENCY: Record<string, string> = {
  US: "988 (or 911)", CA: "988 (or 911)", GB: "999 (Samaritans: 116 123)", IE: "112", IN: "112 (Tele-MANAS: 14416)",
  PH: "911", SE: "112", DE: "112", FR: "112 (3114)", ES: "112 (024)", NL: "112", BE: "112", IT: "112", AU: "000 (Lifeline: 13 11 14)",
  NZ: "111", KE: "999 (or 112)", NG: "112", ZA: "10111", GH: "112", TZ: "112", UG: "999", BR: "188 (or 192)", MX: "911",
  ID: "112 (or 119)", MY: "999", SG: "995 (SOS: 1767)", TH: "1669 (1323)", VN: "115", JP: "119", KR: "109 (or 119)",
  CN: "120", RU: "112", BA: "112", PK: "1122", BD: "999", LK: "1990", NP: "112", SA: "911", AE: "999", EG: "123", BH: "999",
  KW: "112", QA: "999", JO: "911", MA: "15", DZ: "14", TN: "190", TR: "112",
};

export function emergencyNumber(country?: string | null): string {
  return (country && EMERGENCY[country.toUpperCase()]) || "your local emergency number (112 in most countries)";
}

export function referralText(key: Key | string, lang: string, emergency: boolean, country?: string | null): string {
  const t = T[lang] ?? T.en;
  const main = (t[key as Key] ?? t.unsure);
  if (!emergency) return main;
  return `${t.emergency.replace("{NUMBER}", emergencyNumber(country))}\n\n${main}`;
}
