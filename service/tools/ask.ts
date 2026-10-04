// Debug one question: npx tsx tools/ask.ts <lang> "<question>"
import { ask } from "../src/answer.ts";
const r = await ask({ question: process.argv[3], lang: process.argv[2] });
console.log(JSON.stringify({ status: r.status, label: r.route.label, text: r.text, lesson: r.lesson, trace: r.trace }, null, 1));
