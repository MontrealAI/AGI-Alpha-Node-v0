#!/usr/bin/env python3
import hashlib,json,subprocess,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0')
files=sorted({p for p in paths if p and (root/p).is_file() and not (root/p).is_symlink()})
for p in files:
 if any(x in Path(p).parts for x in ['node_modules','.alpha-node','.git']) or p.endswith('.key.json'):raise SystemExit('Refusing private/runtime file: '+p)
manifest={'version':version,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root).decode().strip(),'files':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files}}
out=root/'dist';out.mkdir(exist_ok=True)
archive=out/f'AGI_Alpha_Node_v{version}.zip'
prefix=f'AGI_Alpha_Node_v{version}/'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files:
  info=zipfile.ZipInfo(prefix+p,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,(root/p).read_bytes())
 info=zipfile.ZipInfo(prefix+'RELEASE_MANIFEST.json',(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,json.dumps(manifest,indent=2)+'\n')
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'SHA256SUMS.txt').write_text(f'{checksum}  {archive.name}\n')
print(json.dumps({'archive':str(archive),'sha256':checksum,'files':len(files),'sourceCommit':manifest['sourceCommit']}))
