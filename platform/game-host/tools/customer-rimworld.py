"""Root-reviewed RimWorld settings; no caller-selected files or commands."""
import json
import math
import re

DIFFICULTY = {'IsDifficultyEnforced': {'default': False},
 'ThreatScale': {'default': 1, 'min': 0, 'max': 10},
 'AllowBigThreats': {'default': True},
 'AllowViolentQuests': {'default': True},
 'AllowIntroThreats': {'default': True},
 'PredatorsHuntHumanlikes': {'default': True},
 'AllowExtremeWeatherIncidents': {'default': True},
 'CropYieldFactor': {'default': 1, 'min': 0, 'max': 10},
 'MineYieldFactor': {'default': 1, 'min': 0, 'max': 10},
 'ButcherYieldFactor': {'default': 1, 'min': 0, 'max': 10},
 'ResearchSpeedFactor': {'default': 1, 'min': 0, 'max': 10},
 'QuestRewardValueFactor': {'default': 1, 'min': 0, 'max': 10},
 'RaidLootPointsFactor': {'default': 1, 'min': 0, 'max': 10},
 'TradePriceFactorLoss': {'default': 0, 'min': 0, 'max': 1},
 'MaintenanceCostFactor': {'default': 1, 'min': 0, 'max': 10},
 'ScariaRotChance': {'default': 0.6, 'min': 0, 'max': 1},
 'EnemyDeathOnDownedChanceFactor': {'default': 1, 'min': 0, 'max': 1},
 'ColonistMoodOffset': {'default': 0, 'min': -100, 'max': 100},
 'FoodPoisonChanceFactor': {'default': 1, 'min': 0, 'max': 1},
 'ManhunterChanceOnDamageFactor': {'default': 1, 'min': 0, 'max': 1},
 'PlayerPawnInfectionChanceFactor': {'default': 1, 'min': 0, 'max': 1},
 'DiseaseIntervalFactor': {'default': 1, 'min': 0, 'max': 10},
 'EnemyReproductionRateFactor': {'default': 1, 'min': 0, 'max': 10},
 'DeepDrillInfestationChanceFactor': {'default': 1, 'min': 0, 'max': 1},
 'FriendlyFireChanceFactor': {'default': 0.4, 'min': 0, 'max': 1},
 'AllowInstantKillChance': {'default': 1, 'min': 0, 'max': 1},
 'PeacefulTemples': {'default': False},
 'AllowCaveHives': {'default': True},
 'UnwaveringPrisoners': {'default': True},
 'AllowTraps': {'default': True},
 'AllowTurrets': {'default': True},
 'AllowMortars': {'default': True},
 'ClassicMortars': {'default': False},
 'AdaptationEffectFactor': {'default': 0.9, 'min': 0, 'max': 1},
 'AdaptationGrowthRateFactorOverZero': {'default': 1, 'min': 0, 'max': 10},
 'FixedWealthMode': {'default': False},
 'LowPopConversionBoost': {'default': 3, 'min': 0, 'max': 10},
 'NoBabiesOrChildren': {'default': False},
 'BabiesAreHealthy': {'default': False},
 'ChildRaidersAllowed': {'default': False},
 'ChildAgingRate': {'default': 4, 'min': 0, 'max': 10},
 'AdultAgingRate': {'default': 1, 'min': 0, 'max': 10},
 'WastepackInfestationChanceFactor': {'default': 1, 'min': 0, 'max': 1},
 'NomadicMineableResourcesFactor': {'default': 1, 'min': 0, 'max': 10}}
BOOLS = {'useClientSave':True,'displayChat':False,'automaticBackups':True,'loginNotifications':False,'disconnectNotifications':False,'allowAllMods':False,'enforceModSettings':False}
STRINGS = {'description':2000,'discordUrl':200,'messageOfTheDay':2000,'storyteller':64}


def settings(text,port):
    if not isinstance(text,str) or len(text.encode())>16384:raise ValueError('Invalid RimWorld settings')
    value=json.loads(text)
    if not isinstance(value,dict) or set(value)!={'name','maxPlayers','settings'}:raise ValueError('Undeclared RimWorld configuration')
    if not isinstance(value['name'],str) or not 1<=len(value['name'])<=48 or re.search(r'[\x00-\x1f\x7f]',value['name']):raise ValueError('Invalid RimWorld name')
    if type(value['maxPlayers']) is not int or not 2<=value['maxPlayers']<=64 or type(port) is not int or not 25590<=port<=25610:raise ValueError('Invalid RimWorld allocation')
    options=value['settings']
    allowed=set(BOOLS)|set(STRINGS)|{'maxPlayers','backupIntervalHours','backupCount'}|{'difficulty.'+key for key in DIFFICULTY}
    if not isinstance(options,dict) or set(options)-allowed:raise ValueError('Undeclared RimWorld setting')
    for key,item in options.items():
        if key in BOOLS and type(item) is not bool:raise ValueError('Invalid RimWorld boolean')
        if key in STRINGS and (not isinstance(item,str) or len(item)>STRINGS[key] or re.search(r'[\x00-\x1f\x7f]',item)):raise ValueError('Invalid RimWorld text')
        if key=='storyteller' and item and not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',item):raise ValueError('Invalid storyteller')
        if key in ('maxPlayers','backupIntervalHours','backupCount'):
            low,high=(2,64) if key=='maxPlayers' else (1,168) if key=='backupIntervalHours' else (1,100)
            if type(item) is not int or not low<=item<=high:raise ValueError('Invalid RimWorld numeric setting')
        if key.startswith('difficulty.'):
            rule=DIFFICULTY[key[11:]]
            if isinstance(rule['default'],bool):
                if type(item) is not bool:raise ValueError('Invalid difficulty boolean')
            elif type(item) not in (int,float) or not math.isfinite(item) or not rule['min']<=item<=rule['max']:raise ValueError('Invalid difficulty number')
    if 'maxPlayers' in options and options['maxPlayers']!=value['maxPlayers']:raise ValueError('RimWorld slot mismatch')
    return value


def configurations(value,port):
    options=value['settings'];story=options.get('storyteller','player-choice')
    result={
        'ServerConfig.json':{'Name':value['name'],'IP':'0.0.0.0','Port':port,'MaxPlayers':value['maxPlayers'],'EnableServerBrowser':False,'EnableServerTelemetry':False,'UseUPnP':False,'Description':options.get('description',''),'DiscordURL':options.get('discordUrl',''),'UseClientSave':options.get('useClientSave',True),'DisplayChatInConsole':options.get('displayChat',False)},
        'BackupConfig.json':{'AutomaticBackups':options.get('automaticBackups',True),'IntervalHours':options.get('backupIntervalHours',1),'Amount':options.get('backupCount',6),'AutomaticDeletion':True},
        'ChatConfig.json':{'EnableMoTD':bool(options.get('messageOfTheDay')),'MessageOfTheDay':options.get('messageOfTheDay',''),'LoginNotifications':options.get('loginNotifications',False),'DisconnectNotifications':options.get('disconnectNotifications',False)},
        'ModConfig.json':{'AllowAllMods':options.get('allowAllMods',False),'EnforceSettings':options.get('enforceModSettings',False)},
        'StorytellerConfig.json':{'IsEnforced':story!='player-choice','DefName':story if story!='player-choice' else ''},
    }
    values={key[11:]:item for key,item in options.items() if key.startswith('difficulty.')}
    if values:result['DifficultyConfig.json']=values
    return result
