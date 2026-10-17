#!/usr/bin/python3 -I
"""Fixed Veloren bootstrap; patches only declared top-level RON fields.
Existing seed/world/gameplay fields are retained byte-for-byte.
"""
import json
import os
from pathlib import Path
import re
import stat
import tempfile


def settings(text,port):
    if not isinstance(text,str) or len(text.encode())>16384:raise ValueError('Invalid Veloren settings')
    value=json.loads(text)
    if not isinstance(value,dict) or set(value)!={'name','maxPlayers'} or not isinstance(value['name'],str) or not 1<=len(value['name'])<=100 or re.search(r'[\x00-\x1f\x7f]',value['name']):raise ValueError('Invalid Veloren setting')
    if type(port) is not int or port!=14004 or type(value['maxPlayers']) is not int or not 2<=value['maxPlayers']<=64:raise ValueError('Invalid Veloren allocation')
    return value


def patch_ron(text,changes):
    if not isinstance(text,str) or len(text.encode())>262144:raise ValueError('Veloren RON exceeds limit')
    def skip(position):
        while position<len(text):
            if text[position].isspace():position+=1
            elif text.startswith('//',position):
                end=text.find('\n',position);position=len(text) if end<0 else end+1
            elif text.startswith('/*',position):
                level=1;position+=2
                while level and position<len(text):
                    if text.startswith('/*',position):level+=1;position+=2
                    elif text.startswith('*/',position):level-=1;position+=2
                    else:position+=1
                if level:raise ValueError('Unterminated RON comment')
            else:break
        return position
    def quoted(position):
        quote=text[position];position+=1
        while position<len(text):
            if text[position]=='\\':position+=2
            elif text[position]==quote:return position+1
            else:position+=1
        raise ValueError('Unterminated RON string')
    position=skip(0)
    if position>=len(text) or text[position]!='(':raise ValueError('Expected top-level RON settings')
    position+=1;fields={};trailing=True
    while True:
        position=skip(position)
        if position>=len(text):raise ValueError('Unterminated RON settings')
        if text[position]==')':closing=position;break
        match=re.match(r'[A-Za-z_][A-Za-z0-9_]*',text[position:])
        if not match:raise ValueError('Invalid RON field')
        key=match[0];position=skip(position+len(key))
        if key in fields or position>=len(text) or text[position]!=':':raise ValueError('Duplicate or invalid RON field')
        start=skip(position+1);position=start;stack=[]
        while position<len(text):
            next_position=skip(position)
            if next_position!=position:position=next_position;continue
            if position>=len(text):break
            char=text[position]
            if text.startswith('r"',position) or re.match(r'r#+"',text[position:]):raise ValueError('Raw RON strings require offline review')
            if char in ('"',"'"):position=quoted(position);continue
            if char in '([{':stack.append(char)
            elif char in ')]}':
                if not stack:
                    if char!=')':raise ValueError('Unbalanced RON settings')
                    break
                if stack.pop()!= {')':'(',']':'[','}':'{'}[char]:raise ValueError('Unbalanced RON value')
            elif char==',' and not stack:break
            position+=1
        if stack or position>=len(text) or not text[start:position].strip():raise ValueError('Invalid RON value')
        fields[key]=(start,position)
        trailing=text[position]==','
        if trailing:position+=1
    if skip(closing+1)!=len(text):raise ValueError('Unexpected trailing RON data')
    edits=[(start,end,changes[key]) for key,(start,end) in fields.items() if key in changes]
    missing=[key+': '+value+',' for key,value in changes.items() if key not in fields]
    if missing:edits.append((closing,closing,('' if trailing or not fields else ',')+'\n'+ '\n'.join(missing)+'\n'))
    for start,end,value in sorted(edits,reverse=True):text=text[:start]+value+text[end:]
    return text


def write_ron(file,changes):
    file.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    current='()'
    try:descriptor=os.open(file,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    except FileNotFoundError:pass
    else:
        with os.fdopen(descriptor) as source:
            info=os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_nlink!=1 or info.st_size>262144:raise ValueError('Unsafe Veloren settings file')
            current=source.read()
    updated=patch_ron(current,changes)
    descriptor,temporary=tempfile.mkstemp(prefix='.pb-config-',dir=file.parent)
    try:
        with os.fdopen(descriptor,'w') as output:output.write(updated);output.flush();os.fsync(output.fileno())
        os.replace(temporary,file)
    finally:
        if os.path.exists(temporary):os.unlink(temporary)


def prepare(root,value):
    quote=lambda text:json.dumps(text,ensure_ascii=False)
    write_ron(root/'userdata/server/server_config/settings.ron',{
        'gameserver_protocols':'[Tcp(address: "0.0.0.0:14004")]',
        'query_address':'None','auth_server_address':'Some("https://auth.veloren.net")',
        'max_players':str(value['maxPlayers']),'server_name':quote(value['name'])})
    write_ron(root/'userdata/server-cli/settings.ron',{
        'web_address':'"127.0.0.1:14005"','shutdown_signals':'[SIGTERM]',
        'update_shutdown_grace_period_secs':'0','web_chat_secret':'None','ui_api_secret':'None'})


if __name__=='__main__':
    if not 40000<=os.getuid()<=40255 or not Path('/game-data/veloren-server-cli').is_file():raise SystemExit('Reserved runtime namespace required')
    value=settings(Path('/server/server.cfg').read_text(),14004)
    prepare(Path('/server'),value)
    os.execv('/game-data/veloren-server-cli',['/game-data/veloren-server-cli'])
