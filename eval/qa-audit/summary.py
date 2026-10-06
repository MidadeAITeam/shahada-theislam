# Summarize judged runs: python3 eval/qa-audit/summary.py <run folder> [...]
import json, collections, sys
for d in sys.argv[1:]:
    J = {}
    for l in open(f"{d}/judged.jsonl"):
        o = json.loads(l)
        if "verdict" in o: J[o["id"]] = o["verdict"]
    R = {json.loads(l)["id"]: json.loads(l) for l in open(f"{d}/results.jsonl")}
    v = list(J.values()); ans = [x for x in v if x.get("faithful") is not None]
    c = sum(1 for x in v if x.get("behaviour_correct"))
    E = [R[k] for k in J if R[k].get("expected") == "E"]
    emerg = sum(1 for r in E if (r.get("resp") or {}).get("route", {}).get("emergency"))
    ms = sorted(r.get("client_ms", 0) for r in R.values())
    print(f"{d}: judged {len(J)}/{len(R)} · correct behaviour {c} ({100*c/len(J):.1f}%) · faithful {sum(1 for x in ans if x['faithful'])}/{len(ans)} · invented rulings {sum(1 for x in v if x.get('hallucinated_ruling'))} · serious (sev≥3) {sum(1 for x in v if (x.get('severity') or 0) >= 3)} · emergency first {emerg}/{len(E)} · p50 {ms[len(ms)//2]/1000:.1f}s p90 {ms[int(len(ms)*.9)]/1000:.1f}s · http errors {sum(1 for r in R.values() if 'error' in r)}")
    print("   issues:", dict(collections.Counter(x.get("behaviour_issue") for x in v)))
