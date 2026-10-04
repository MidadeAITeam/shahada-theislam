# Plain TTS per sentence (no style prompt, which the model sometimes reads aloud); pauses are added when composing.
import json,urllib.request,base64,os,time,sys,re
S=json.load(open('script2.json')); out=sys.argv[1]; os.makedirs(out,exist_ok=True)
for b in S['beats']:
    if not b['ar']: continue
    parts=[p.strip() for p in re.split(r'(?<=[.؟?])\s+|…\s*', b['ar']) if p.strip()]
    for k,p in enumerate(parts):
        body={'contents':[{'parts':[{'text':p}]}],'generationConfig':{'responseModalities':['AUDIO'],'speechConfig':{'voiceConfig':{'prebuiltVoiceConfig':{'voiceName':S['voice']}}}}}
        for i in range(4):
            try:
                req=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent',json.dumps(body).encode(),{'Content-Type':'application/json','x-goog-api-key':os.environ['GEMINI_API_KEY']})
                d=json.load(urllib.request.urlopen(req,timeout=120))
                open(f'{out}/{b["id"]}_{k}.wav','wb').write(base64.b64decode(d['candidates'][0]['content']['parts'][0]['inlineData']['data'])); break
            except Exception as e: time.sleep(5)
open(f'{out}/DONE','w').write('ok')
