"""Fixed OpenRA family/edition contract for the isolated supervisor.
No caller-selected executable, asset root, environment or free-form flag.
"""
import json
import re

FAMILIES = {
    'openra': ('OpenRA.Server', ('ra','cnc','d2k'), False),
    'openhv': ('OpenHV.Server', ('hv',), True),
    'combined-arms': ('OpenRA.Server', ('ca',), True),
    'earth-2140-trilogy': ('OpenE2140', ('e2140',), True),
    'romanovs-vengeance': ('OpenRA.Server', ('rv',), True),
    'tiberian-dawn-hd': ('OpenRA.Server', ('cnc',), True),
    'crystallized-nexus': ('OpenRA.Server', ('cn',), True),
}


def settings(text, game):
    if not isinstance(text,str) or len(text.encode())>16384:raise ValueError('Invalid OpenRA settings')
    value=json.loads(text)
    if not isinstance(value,dict) or set(value)!={'family','mod','name','enableSingleplayer','lockBots'}:raise ValueError('Undeclared OpenRA settings')
    family=value['family']
    if not isinstance(family,str) or family not in FAMILIES:raise ValueError('Unknown OpenRA family')
    allowed={'openra':tuple(FAMILIES),'openhv':('openhv',),'earth-2140-trilogy':('earth-2140-trilogy',)}
    if game not in allowed or family not in allowed[game] or value['mod'] not in FAMILIES[family][1]:raise ValueError('OpenRA edition/engine mismatch')
    if not isinstance(value['name'],str) or not 1<=len(value['name'])<=100 or re.search(r'[\x00-\x1f\x7f]',value['name']):raise ValueError('Invalid OpenRA name')
    if type(value['enableSingleplayer']) is not bool or type(value['lockBots']) is not bool:raise ValueError('Invalid OpenRA boolean')
    return value


def arguments(value, port):
    if type(port) is not int or not any(low<=port<=high for low,high in ((1234,1250),(1255,1270),(1275,1290))):raise ValueError('Invalid OpenRA port')
    binary,_,image=FAMILIES[value['family']]
    return ('/game-data/'+binary, (['--appimage-extract-and-run','--server'] if image else [])+[
        'Game.Mod='+value['mod'],'Engine.SupportDir=/server',
        'Server.Name='+value['name'],'Server.ListenPort='+str(port),
        'Server.AdvertiseOnline=False',
        'Server.EnableSingleplayer='+str(value['enableSingleplayer']),
        'Server.LockBots='+str(value['lockBots']),'Server.OrderLatency=5'])
