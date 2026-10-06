import json, time, urllib.request, os, sys, concurrent.futures as cf, http.cookiejar
D = os.path.abspath(sys.argv[1])  # folder with questions.jsonl; results.jsonl is written there
URL = (sys.argv[2] if len(sys.argv) > 2 else "https://shahada.theislam.chat") + "/api/shahada/ask"
qs = [json.loads(l) for l in open(f"{D}/questions.jsonl")]
done = set()
outp = f"{D}/results.jsonl"
if os.path.exists(outp):
    done = {json.loads(l)["id"] for l in open(outp) if '"error"' not in l}
cookie = {"v": None}
def call(x):
    body = {"question": x["question"], "lang": x["lang"], "lesson_id": x["lesson_id"]}
    if x.get("history"): body["history"] = x["history"]
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={"content-type": "application/json", **({"cookie": cookie["v"]} if cookie["v"] else {})})
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            sc = r.headers.get("set-cookie")
            if sc and not cookie["v"]: cookie["v"] = sc.split(";")[0]
            data = json.loads(r.read()); code = r.status
        return {**x, "http": code, "client_ms": int((time.time()-t)*1000), "resp": data}
    except Exception as e:
        return {**x, "error": str(e)[:300], "client_ms": int((time.time()-t)*1000)}
todo = [x for x in qs if x["id"] not in done]
# prime cookie
if todo: r0 = call(todo[0]); todo = todo[1:]; open(outp, "a").write(json.dumps(r0, ensure_ascii=False) + "\n")
with cf.ThreadPoolExecutor(4) as ex, open(outp, "a") as f:
    for r in ex.map(call, todo):
        f.write(json.dumps(r, ensure_ascii=False) + "\n"); f.flush()
        print(r["id"], r.get("error") or r["resp"].get("status"), r["client_ms"], flush=True)
