import sys,subprocess
from PIL import Image
FF="/opt/anaconda3/lib/python3.13/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"
src,out,w=sys.argv[1],sys.argv[2],int(sys.argv[3]); ts=sys.argv[4:]
ims=[]
for t in ts:
    subprocess.run([FF,"-loglevel","error","-y","-ss",t,"-i",src,"-frames:v","1","-vf",f"scale={w}:-1","/tmp/_f.png"],check=True); ims.append(Image.open("/tmp/_f.png").copy())
import os; cols=int(os.environ.get("COLS",min(len(ims),6))); rows=(len(ims)+cols-1)//cols
s=Image.new('RGB',(cols*ims[0].width,rows*ims[0].height))
for k,i in enumerate(ims): s.paste(i,((k%cols)*i.width,(k//cols)*i.height))
s.save(out)
