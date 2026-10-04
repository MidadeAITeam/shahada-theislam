import { route } from "../src/router.ts";
import { search } from "../src/book.ts";
for (const q of process.argv.slice(2)) {
  const r = await route(q);
  const h = await search("en", [q]);
  console.log(r.action, r.label, "|", h.slice(0, 3).map((x) => `${x.chunk.id} sem=${x.semantic.toFixed(2)}`).join(" "), "|", q.slice(0, 60));
}
