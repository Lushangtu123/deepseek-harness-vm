#!/usr/bin/env python3
"""Use the dedicated Kali SSH connection from inside the Harness VM."""
from pathlib import Path
import os,shlex,sys

STATUS_SOURCE="import json,os,platform; from pathlib import Path; print(json.dumps({'hostname':platform.node(),'uid':os.getuid(),'kernel':platform.release(),'osRelease':Path('/etc/os-release').read_text(),'persistentInstall':Path('/var/lib/harness-kali-install-complete').is_file()}))"

def ssh_argv(arguments,home):
    argv=['/usr/bin/ssh','-F',str(home/'.config/harness-kali/ssh_config'),'--','kali-lab']
    if arguments==['shell']:return argv
    if arguments==['status']:return argv+[shlex.join(['python3','-c',STATUS_SOURCE])]
    if arguments[:1]==['exec']:
        command=arguments[1:]
        if command[:1]==['--']:command=command[1:]
        if command:return argv+[shlex.join(command)]
    raise ValueError('Usage: kali-vm status | shell | exec -- COMMAND [ARG ...]')

def main():
    try:argv=ssh_argv(sys.argv[1:],Path.home())
    except ValueError as error:print(error,file=sys.stderr);return 2
    # Replace this process: preserve stdin, terminal signals, and SSH exit code.
    # Never retry a remote operation or implicitly start/elevate the Kali guest.
    os.execv(argv[0],argv)

if __name__=='__main__':raise SystemExit(main())
