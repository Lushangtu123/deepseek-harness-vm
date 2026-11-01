#!/bin/sh
# Fixed scanner adapter. Inputs and this script are read-only; output lives in tmpfs.
set -u
out=$1
shift
case "$out" in /out|/zap/wrk) ;; *) exit 74 ;; esac
"$@" > /tmp/harness-scanner.log 2>&1
code=$?
result="$out/result.json"
auth="$out/auth-check.json"
# Stream only two fixed regular files. Raw logs never leave the bounded tmpfs.
if [ ! -f "$result" ] || [ -L "$result" ]; then
 printf '{"result":null,"authentication":null}\n'
 exit "$code"
fi
if [ "$(wc -c < "$result")" -gt 8388608 ]; then exit 73; fi
printf '{"result":'
head -c 8388609 "$result" || exit 74
printf ',"authentication":'
if [ -f "$auth" ] && [ ! -L "$auth" ]; then
 if [ "$(wc -c < "$auth")" -gt 1024 ]; then exit 73; fi
 head -c 1025 "$auth" || exit 74
else printf 'null'; fi
printf '}\n'
exit "$code"
