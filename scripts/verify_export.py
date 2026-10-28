#!/usr/bin/env python3
"""Read-only integrity and bounded credential-pattern check; no YAML execution."""
from pathlib import Path
import ast,hashlib,json,re

root=Path(__file__).resolve().parent.parent
manifest_path=root/'inventory/files.sha256.json'
expected=json.loads(manifest_path.read_text())
actual={}
issues=[]
text_count=0
binary_count=0
patterns={
 'provider-key':re.compile(rb'\bsk-[A-Za-z0-9_-]{20,}\b'),
 'github-token':re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})'),
 'private-key':re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
}
assert patterns['provider-key'].search(b'sk-'+b'A'*24)
assert patterns['github-token'].search(b'ghp_'+b'A'*30)
assert patterns['private-key'].search(b'-----BEGIN '+'OPENSSH PRIVATE KEY-----'.encode())
for p in sorted(root.rglob('*')):
 relative=p.relative_to(root)
 if any(part in {'.git','__pycache__'} for part in relative.parts):continue
 if p.is_symlink():issues.append({'file':str(relative),'kind':'symlink'});continue
 if not p.is_file() or p==manifest_path:continue
 raw=p.read_bytes()
 actual[str(relative)]=hashlib.sha256(raw).hexdigest()
 if p.name.startswith('.credentials.') or p.suffix in {'.db','.sqlite','.jsonl','.log','.qcow2','.img','.iso','.tar','.tgz','.zip'} or any(part in {'sessions','storages','node_modules','.ssh'} for part in relative.parts):
  issues.append({'file':str(relative),'kind':'excluded-artifact'})
 for label,pattern in patterns.items():
  if pattern.search(raw):issues.append({'file':str(relative),'kind':label})
 try:
  text=raw.decode('utf-8');text_count+=1
 except UnicodeDecodeError:
  binary_count+=1
  if p.suffix not in {'.png','.jpg'}:issues.append({'file':str(relative),'kind':'unexpected-binary'})
  continue
 if p.suffix=='.py':ast.parse(text,filename=str(relative))
 if p.suffix=='.json':json.loads(text)
 assert not ('-----BEGIN ' in text and 'PRIVATE KEY-----' in text and 'patterns[' not in text),'Unexpected private key material'
if actual!=expected:
 for name in sorted(set(actual)|set(expected)):
  if actual.get(name)!=expected.get(name):issues.append({'file':name,'kind':'manifest-mismatch'})
source=json.loads((root/'work/harness-purge-improved/package-files.json').read_text())
program=root/'work/harness-purge-improved/package'
assert len(source)==114
for name,want in source.items():
 assert hashlib.sha256((program/name).read_bytes()).hexdigest()==want,name
ledger=json.loads((root/'inventory/export.json').read_text())
for name,row in ledger['guestFiles'].items():
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==row['sha256'],name
assert not issues,json.dumps(issues,ensure_ascii=False)
print(json.dumps({'filesMatched':len(expected),'programFilesMatched':len(source),'guestFilesMatched':len(ledger['guestFiles']),'textFilesChecked':text_count,'upstreamImageFiles':binary_count,'credentialPatternFindings':len(issues),'scope':'integrity, Python/JSON parse and fixed credential patterns; not a complete security audit'},ensure_ascii=False))
