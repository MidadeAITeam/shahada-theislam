"""Embed every passage with gemini-embedding-2 for semantic retrieval.

Input : data/build/<lang>/chunks.jsonl
Output: data/build/<lang>/vectors.json  ({"model", "dim", "ids", "vectors": [[...], ...]})
Usage : python scripts/build_index.py [lang ...]
"""
import json, os, pathlib, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / "data/build"
MODEL = "gemini-embedding-2"
DIM = 768


def embed(texts):
    body = {"requests": [{"model": f"models/{MODEL}", "content": {"parts": [{"text": t}]},
                          "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": DIM} for t in texts]}
    for i in range(6):
        r = subprocess.run(["curl", "-sS", "-m", "180", "-H", "Content-Type: application/json",
                            "-H", f"x-goog-api-key: {os.environ['GEMINI_API_KEY']}",
                            f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:batchEmbedContents",
                            "-d", json.dumps(body)], capture_output=True, text=True)
        try:
            return [e["values"] for e in json.loads(r.stdout)["embeddings"]]
        except Exception:
            time.sleep(4 * (i + 1))
    raise RuntimeError(r.stdout[:400])


def build(lang):
    rows = [json.loads(l) for l in (BUILD / lang / "chunks.jsonl").read_text().splitlines() if l.strip()]
    vecs = []
    for i in range(0, len(rows), 50):
        batch = rows[i:i + 50]
        vecs += embed([f"{r['heading']}\n{r['text']}"[:6000] for r in batch])
    (BUILD / lang / "vectors.json").write_text(json.dumps(
        {"model": MODEL, "dim": DIM, "ids": [r["id"] for r in rows], "vectors": [[round(x, 6) for x in v] for v in vecs]}))
    print(lang, len(vecs), flush=True)


if __name__ == "__main__":
    for lang in sys.argv[1:] or sorted(p.name for p in BUILD.iterdir() if p.is_dir()):
        build(lang)
