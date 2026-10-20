import importlib.util
import os
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock

if os.name == 'nt': raise unittest.SkipTest('Customer runtime helper is Linux-only')
spec = importlib.util.spec_from_file_location('customer_runtime', Path(__file__).with_name('customer-runtime.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ID = '0123456789abcdef01234567'
IDENTITY = '01234567-0123-0123-0123-0123456789ab:100'
CONFIG = 'sv_name Fixture\nsv_port 8322\nsv_register 0\nsv_map dm1\nsv_gametype dm\nsv_max_clients 4\n'


class RuntimeBoundaries(unittest.TestCase):
    def setUp(self):
        module.select_game('teeworlds')

    def test_rvgl_candidate_requires_pinned_assets_and_display_handoff(self):
        module.select_game('re-volt-rvgl')
        try:
            self.assertEqual(module.config_bytes('{}',2310),b'{"configuration": {}, "port": 2310}')
            with self.assertRaises(ValueError):module.config_bytes('{"maxPlayers":8}',2310)
            for port in ('2309','2331'):
                with self.assertRaises(ValueError):module.request(['run-native',ID,'42',IDENTITY,'re-volt-rvgl',port,'1000','1024'])
            helper = SimpleNamespace(mounts=Mock(return_value=['--ro-bind','/pinned/rvgl.64','/server/runtime/rvgl.64']))
            with patch.object(module,'trusted_module',return_value=helper):
                args = module.command(Path('/private/data'),7,2310,1024,asset_directory=19)
                self.assertEqual(args[-3:],['/usr/bin/python3','-I','/rvgl-bootstrap.py'])
                helper.mounts.assert_called_once_with(19)
                self.assertIn('/display-helper.py',args)
                self.assertNotIn('--seccomp',args)
                for options in ({},{'asset_directory':19,'seccomp_fd':30}):
                    with self.assertRaises(ValueError):module.command(Path('/private/data'),7,2310,1024,**options)
        finally:module.select_game('teeworlds')

    def test_scoped_command_finds_inner_supervisor_and_rejects_wrong_scope_or_uid(self):
        expected = ['/usr/bin/python3','-I','/corekeeper-bootstrap.py']
        scope = Path('/sys/fs/cgroup/system.slice/fixture.scope')
        with tempfile.TemporaryDirectory() as temporary:
            proc = Path(temporary)
            for pid, children, command in [(10,'11',['/usr/bin/bwrap']), (11,'12',['/usr/bin/bwrap']), (12,'',expected)]:
                directory = proc/str(pid)
                (directory/'task'/str(pid)).mkdir(parents=True)
                (directory/'task'/str(pid)/'children').write_text(children)
                (directory/'cgroup').write_text('0::/system.slice/fixture.scope')
                (directory/'cmdline').write_bytes(b'\0'.join(part.encode() for part in command)+b'\0')
            def path(value):
                return proc if str(value) == '/proc' else Path(value)
            with patch.object(module,'Path',side_effect=path), \
                 patch.object(module,'game_identity',side_effect=lambda pid:'boot:'+str(pid)):
                self.assertEqual(module.scoped_command_identity(10,'boot:10',os.getuid(),scope,expected),(12,'boot:12'))
                (proc/'12'/'cmdline').write_bytes(b'/game-data/veloren-server-cli\0')
                self.assertEqual(module.scoped_command_identity(10,'boot:10',os.getuid(),scope,expected,[['/game-data/veloren-server-cli']]),(12,'boot:12'))
                (proc/'12'/'cmdline').write_bytes(b'\0'.join(part.encode() for part in expected)+b'\0')
                with self.assertRaises(ValueError):
                    module.scoped_command_identity(10,'reused',os.getuid(),scope,expected)
                with self.assertRaises(ValueError):
                    module.scoped_command_identity(10,'boot:10',os.getuid()+1,scope,expected)
                (proc/'12'/'cgroup').write_text('0::/system.slice/another.scope')
                with self.assertRaises(ValueError):
                    module.scoped_command_identity(10,'boot:10',os.getuid(),scope,expected)

    def test_missing_graceful_control_never_signals_the_wrapper(self):
        binding = {'profile':'core-keeper-unix-v1','gamePid':52,'gameIdentity':IDENTITY,'uid':40000}
        with patch.object(module,'binding_read',return_value=binding), \
             patch.object(module,'game_identity',return_value=IDENTITY), \
             patch.object(Path,'exists',return_value=True), \
             patch.object(module,'scoped_command_identity',side_effect=ValueError('refusing wrapper signal')), \
             patch.object(module.os,'pidfd_open') as descriptor:
            with self.assertRaisesRegex(ValueError,'refusing wrapper signal'):
                module.stop_runtime(ID,42,IDENTITY)
            descriptor.assert_not_called()

    def test_legacy_graceful_stop_discovers_inner_command_without_rewriting_binding(self):
        binding = {'profile':'core-keeper-unix-v1','gamePid':52,'gameIdentity':IDENTITY,'uid':40000}
        scope = module.scope_path(ID,42)
        def read(path,*args,**kwargs):
            return '0::/system.slice/'+scope.name if path.name=='cgroup' else 'populated 0'
        with patch.object(module,'binding_read',return_value=binding), \
             patch.object(module,'game_identity',return_value=IDENTITY), \
             patch.object(module,'scoped_command_identity',return_value=(54,IDENTITY)) as discover, \
             patch.object(Path,'exists',return_value=True), \
             patch.object(Path,'stat',return_value=SimpleNamespace(st_uid=40000)), \
             patch.object(Path,'read_text',read), \
             patch.object(module.os,'pidfd_open',return_value=100) as descriptor, \
             patch.object(module.os,'close'), patch.object(module.signal,'pidfd_send_signal') as send, \
             patch.object(module,'binding_write') as write:
            self.assertEqual(module.stop_runtime(ID,42,IDENTITY),{'stopped':True,'graceful':True})
            discover.assert_called_once_with(52,IDENTITY,40000,scope,
                ['/usr/bin/python3','-I','/corekeeper-bootstrap.py'],[])
            descriptor.assert_called_once_with(54)
            send.assert_called_once_with(100,module.signal.SIGTERM)
            write.assert_not_called()
            binding['controlPid'] = 54
            with self.assertRaisesRegex(ValueError,'Incomplete'):
                module.stop_runtime(ID,42,IDENTITY)

    def test_legacy_commands_allow_only_reviewed_profiles_and_factorio_ports(self):
        self.assertEqual(module.legacy_control_commands({'profile':'veloren-unix-v1'}),[
            ['/usr/bin/python3','-I','/veloren-bootstrap.py'],['/game-data/veloren-server-cli']])
        for port in (None,True,34196,34218,'34197'):
            with self.assertRaises(ValueError):
                module.legacy_control_commands({'profile':'factorio-unix-v1','socketBindPort':port})
        spec = importlib.util.spec_from_file_location('legacy_factorio',Path(__file__).with_name('customer-factorio-bootstrap.py'))
        factorio = importlib.util.module_from_spec(spec);spec.loader.exec_module(factorio)
        with patch.object(module,'trusted_module',return_value=factorio):
            commands = module.legacy_control_commands({'profile':'factorio-unix-v1','socketBindPort':34197})
            self.assertEqual(commands,[['/usr/bin/python3','-I','/bootstrap.py'],
                ['/game-data/bin/x64/factorio','--config','/server/config.ini',
                 '--start-server','/server/saves/save.zip','--server-settings',
                 '/server/server-settings.json','--port','34197','--bind','0.0.0.0']])
        with self.assertRaises(ValueError):
            module.legacy_control_commands({'profile':'re-volt-rvgl-unix-v1'})

    def test_legacy_terraria_reconstructs_only_the_fixed_engine_command(self):
        command = ['/game-data/TerrariaServer.bin.x86_64','-port','7870',
                   '-maxplayers','4','-world','/server/Worlds/world.wld',
                   '-autocreate','2','-worldname','Fixture','-noupnp']
        binding = {'profile':'terraria-unix-v1','gamePid':52,
                   'gameIdentity':IDENTITY,'socketBindPort':7870}
        with tempfile.TemporaryDirectory() as temporary:
            proc = Path(temporary)
            (proc/'52').mkdir()
            file = proc/'52'/'cmdline'
            def write(argv):
                file.write_bytes(b'\0'.join(part.encode() for part in argv)+b'\0')
            def path(value):
                return proc if str(value)=='/proc' else Path(value)
            with patch.object(module,'Path',side_effect=path), \
                 patch.object(module,'game_identity',return_value=IDENTITY):
                write(['/usr/bin/bwrap','--unshare-user','--',*command])
                self.assertEqual(module.legacy_control_commands(binding),[command])
                for position, replacement in [(0,'/other/engine'),(2,'7871'),(4,'65'),
                                              (6,'/other/world'),(10,'bad\nname'),(11,'-exec')]:
                    invalid = list(command);invalid[position] = replacement
                    write(['/usr/bin/bwrap','--',*invalid])
                    with self.assertRaises(ValueError): module.legacy_control_commands(binding)
                write(['/other/wrapper','--',*command])
                with self.assertRaises(ValueError): module.legacy_control_commands(binding)
                file.write_bytes(b'x'*16385)
                with self.assertRaises(ValueError): module.legacy_control_commands(binding)

    @unittest.skipUnless(os.getuid() == 0, 'Root-owned persistent binding fixture')
    def test_reloaded_core_controller_reads_persistent_binding_and_retries_stopped_scope(self):
        fixture_id = 'f'*24
        pid = os.getpid()
        if module.scope_path(fixture_id, pid).exists():
            self.skipTest('Reserved fixture scope is already present')
        identity = module.game_identity(pid)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            root.chmod(0o711)
            server = root/fixture_id
            server.mkdir(mode=0o711)
            (server/'control').mkdir(mode=0o700)
            binding = {'profile':'core-keeper-unix-v1','serverId':fixture_id,
                       'gatePid':pid,'gateIdentity':identity,'uid':40254,'gid':40254,
                       'gamePid':pid,'gameIdentity':identity}
            module.binding_write(server, binding)
            spec = importlib.util.spec_from_file_location('reloaded_core_controller', Path(__file__).with_name('customer-runtime.py'))
            reloaded = importlib.util.module_from_spec(spec);spec.loader.exec_module(reloaded)
            reloaded.ROOT = root
            reloaded.select_game('core-keeper')
            self.assertEqual(reloaded.binding_read(fixture_id,pid,identity),binding)
            for _ in range(2):
                self.assertEqual(reloaded.stop_runtime(fixture_id,pid,identity),{'stopped':True})
            with self.assertRaises(ValueError):
                reloaded.stop_runtime(fixture_id,pid,identity+'0')

    def test_corekeeper_uses_typed_config_query_pair_and_pinned_private_files(self):
        import json
        spec = importlib.util.spec_from_file_location('corekeeper_contract', Path(__file__).with_name('customer-corekeeper.py'))
        core = importlib.util.module_from_spec(spec); spec.loader.exec_module(core)
        module.select_game('core-keeper')
        values = {'name': 'Saved world', 'maxPlayers': 4}
        with patch.object(module, 'trusted_module', return_value=core):
            result = json.loads(module.config_bytes(json.dumps(values), 1320))
            self.assertEqual(result, {'configuration': values, 'port': 1320})
            with self.assertRaises(ValueError):
                module.config_bytes(json.dumps({**values, 'exec': 'unreviewed'}), 1320)
        for port in ('1301', '1321'):
            with self.assertRaises(ValueError):
                module.request(['run-native', ID, '42', IDENTITY, 'core-keeper', port, '1000', '2048'])
        module.request(['run-native', ID, '42', IDENTITY, 'core-keeper', '1320', '1000', '2048'])
        mounts = [(20, 'GameInfo.txt'), (21, 'GameID.txt')]
        args = module.command(Path('/fixture/data'), 7, 1320, 2048, native_settings=result,
                              asset_directory=19, identity_files=mounts)
        self.assertEqual(args[-3:], ['/usr/bin/python3', '-I', '/corekeeper-bootstrap.py'])
        self.assertIn('--as=17179869184', args)
        self.assertNotIn('--seccomp', args)
        for descriptor, name in mounts:
            position = args.index('/proc/self/fd/'+str(descriptor))
            self.assertEqual(args[position-1:position+2], ['--bind', '/proc/self/fd/'+str(descriptor), '/game-data/'+name])
        for changes in ({'identity_files': []}, {'asset_directory': None}, {'seccomp_fd': 30}):
            options = {'asset_directory': 19, 'identity_files': mounts, **changes}
            with self.assertRaises(ValueError):
                module.command(Path('/fixture/data'), 7, 1320, 2048, native_settings=result, **options)

    def test_private_display_handoff_requires_enforced_policy_and_trusted_sources(self):
        policy, entry = Mock(), Mock()
        policy.verify_enforced.return_value = 'playbound-customer-ipc-40000'
        def dependency(name, filename):
            return policy if filename.endswith('display-policy') else entry
        args = ['/usr/bin/prlimit', '--core=0', '--', '/usr/bin/bwrap', '--unshare-user', '--', '/fixed-bootstrap']
        with patch.object(module, 'trusted_module', side_effect=dependency):
            result = module.private_display_handoff(args, 40000, 20, 21)
            self.assertEqual(result[:4], ['/usr/bin/aa-exec', '-p', 'playbound-customer-ipc-40000', '--'])
            self.assertEqual(result[4:7], args[:3])
            self.assertEqual(result[7:12], ['/usr/bin/python3', '-I', '/proc/self/fd/20', '21', '--unshare-user'])
            entry.verify_source.assert_any_call(20)
            entry.verify_source.assert_any_call(21)
            guarded = module.private_display_handoff(args, 40000, 20, 21, guarded_x86=True)
            self.assertEqual(guarded[7:13], ['/usr/bin/python3', '-I', '/proc/self/fd/20', '21', '--guarded-x86', '--unshare-user'])
            self.assertIn('counter-strike-source', module.GUARDED_X86_GAMES)
            with self.assertRaises(ValueError):
                module.private_display_handoff(['/usr/bin/bwrap', '--seccomp', '22', '--', '/fixed'], 40000, 20, 21)
            policy.verify_enforced.side_effect = ValueError('missing enforced policy')
            with self.assertRaises(ValueError):
                module.private_display_handoff(args, 40000, 20, 21)

    def test_flightgear_status_port_is_adjacent_and_admin_listener_disabled(self):
        module.select_game('flightgear')
        self.assertEqual(module.config_bytes('{}',5010),b'{}')
        with self.assertRaises(ValueError):module.config_bytes('{"adminPort":9000}',5010)
        command=module.command(Path('/fixture/data'),7,5010,1024,8,{})
        self.assertEqual(command[-8:],['/engine-native','-p','5010','-a','5011','-b','0','-d'])
        with self.assertRaises(ValueError):module.request(['run-native',ID,'42',IDENTITY,'flightgear','5001','750','1024'])

    def test_ysoccer_has_fixed_java_runtime_and_bounded_heap(self):
        module.select_game('ysoccer')
        self.assertEqual(module.config_bytes('{}',54575),b'{}')
        with self.assertRaises(ValueError):module.config_bytes('{"jvm":"-agentlib:payload"}',54575)
        command=module.command(Path('/fixture/data'),7,54575,1536,8,{})
        self.assertIn('-Xmx512m',command)
        self.assertIn('-XX:ActiveProcessorCount=1',command)
        self.assertIn('/engine.jar',command)
        self.assertEqual(command[-4:],['-jar','/engine.jar','54575','54575'])

    def test_openfortress_requires_separate_dependency_descriptor_and_sdk_mounts(self):
        import json
        source_spec=importlib.util.spec_from_file_location('of_source',Path(__file__).with_name('customer-source.py'))
        source=importlib.util.module_from_spec(source_spec);source_spec.loader.exec_module(source)
        module.select_game('open-fortress')
        value={'name':'Private fortress','maxPlayers':16,'map':'dm_2fort','botFill':4,'rconPassword':'fixture','timeLimit':20}
        with patch.object(module,'trusted_module',return_value=source):
            payload=json.loads(module.config_bytes(json.dumps(value),27150))
        self.assertEqual(payload,{'configuration':value,'port':27150,'game':'open-fortress'})
        mounts=Mock();mounts.mounts.return_value=['--ro-bind','/proc/self/fd/9/hl2','/server/runtime/hl2']
        with patch.object(module,'trusted_module',return_value=mounts):
            command=module.command(Path('/fixture/data'),7,27150,2048,None,value,asset_directory=9,dependency_directory=10)
        mounts.mounts.assert_called_once_with(9)
        self.assertEqual(command[-3:],['/usr/bin/python3','-I','/openfortress-bootstrap.py'])
        self.assertIn('/proc/self/fd/10',command)
        self.assertIn('/tf2',command)
        self.assertIn('/server/runtime/hl2',command)
        self.assertNotIn('/runtime/open_fortress/cfg',command)
        self.assertNotIn('/opt/playbound-host',' '.join(command))

    def test_bombsquad_keeps_interpreter_and_assets_in_separate_retained_mounts(self):
        import json
        local=importlib.util.spec_from_file_location('bomb_contract',Path(__file__).with_name('customer-bombsquad.py'))
        contract=importlib.util.module_from_spec(local);local.loader.exec_module(contract)
        module.select_game('bombsquad')
        value={'name':'Private squad','maxPlayers':6}
        with patch.object(module,'trusted_module',return_value=contract):
            self.assertEqual(json.loads(module.config_bytes(json.dumps(value),43210)),{'configuration':value,'port':43210})
        command=module.command(Path('/fixture/data'),7,43210,2048,8,value,asset_directory=9,python_directory=10)
        self.assertEqual(command[-3:],['/usr/bin/python3','-I','/bombsquad-bootstrap.py'])
        self.assertIn('/python/bin/python3.14',command)
        self.assertIn('/proc/self/fd/10/lib',command)
        self.assertNotIn('--exec',command)
        self.assertNotIn('/opt/playbound-host',' '.join(command))

    def test_new_private_bootstraps_keep_host_paths_out_of_commands(self):
        import json
        for game,helper,port,value in (
            ('counter-strike-source','source',27060,{'name':'Fixture','maxPlayers':8,'map':'de_dust2','botFill':0,'rconPassword':'fixture','timeLimit':25}),
            ('morrowind','morrowind',25565,{'name':'Fixture','maxPlayers':8,'password':'','gameMode':'Default'}),
            ('trackmania','trackmania',23520,{'name':'Fixture','maxPlayers':8}),
            ('unturned','unturned',27075,{'name':'Fixture','maxPlayers':8,'map':'PEI','perspective':'Both','pve':False,'cheats':False}),
            ('team-fortress-2','source',27015,{'name':'Fixture','maxPlayers':8,'map':'ctf_2fort','botFill':2,'rconPassword':'fixture'}),
            ('counter-strike-2','source',27030,{'name':'Fixture','maxPlayers':8,'map':'de_dust2','botFill':2,'rconPassword':'fixture'}),
        ):
            with self.subTest(game=game):
                local=importlib.util.spec_from_file_location('contract_'+helper,Path(__file__).with_name('customer-'+helper+'.py'))
                contract=importlib.util.module_from_spec(local);local.loader.exec_module(contract)
                module.select_game(game)
                with patch.object(module,'trusted_module',return_value=contract):
                    payload=json.loads(module.config_bytes(json.dumps(value),port))
                self.assertEqual(payload['configuration'],value)
                command=module.command(Path('/fixture/data'),7,port,2048,None,value,asset_directory=9)
                self.assertEqual(command[-3:],['/usr/bin/python3','-I','/'+helper+'-bootstrap.py'])
                self.assertNotIn('/opt/playbound-host', ' '.join(command))
                self.assertNotIn('rcon_password', ' '.join(command))
                if game=='unturned':
                    self.assertIn('/runtime/Servers/PlayBound',command)
                    self.assertIn('/game-data/Servers/PlayBound',command)
                if game=='trackmania':self.assertIn('/server/runtime/Packs',command)
                if helper=='source':self.assertIn('/fixture/data/private-cfg',command)

    def test_dst_keeps_private_cluster_and_fixed_port_triple(self):
        import json
        local=importlib.util.spec_from_file_location('dst_contract',Path(__file__).with_name('customer-dst.py'))
        contract=importlib.util.module_from_spec(local);local.loader.exec_module(contract)
        module.select_game('dont-starve-together')
        value={'name':'Fixture','maxPlayers':8}
        with patch.object(module,'trusted_module',return_value=contract):
            self.assertEqual(json.loads(module.config_bytes(json.dumps(value),11020)),{'configuration':value,'port':11020})
        command=module.command(Path('/fixture/data'),7,11020,2048,None,value,asset_directory=9)
        self.assertEqual(command[-3:],['/usr/bin/python3','-I','/dst-bootstrap.py'])
        self.assertIn('/proc/self/fd/9',command)
        for port in (11021,11022):
            with self.assertRaises(ValueError):module.request(['run-native',ID,'42',IDENTITY,'dont-starve-together',str(port),'750','1024'])

    def test_barotrauma_mounts_only_retained_assets_and_private_state(self):
        import json
        local=importlib.util.spec_from_file_location('barotrauma_contract',Path(__file__).with_name('customer-barotrauma.py'))
        contract=importlib.util.module_from_spec(local);local.loader.exec_module(contract)
        module.select_game('barotrauma')
        value={'name':'Fixture','maxPlayers':8}
        with patch.object(module,'trusted_module',return_value=contract):
            self.assertEqual(json.loads(module.config_bytes(json.dumps(value),27220)),{'configuration':value,'port':27220})
        with patch.object(module.os,'listdir',return_value=['DedicatedServer','Content','BarotraumaCore.dll','linux64']):command=module.command(Path('/fixture/data'),7,27220,2048,None,value,asset_directory=9)
        index=command.index(str(Path('/fixture/data/runtime')));self.assertEqual(command[index-1:index+2],['--bind',str(Path('/fixture/data/runtime')),'/game-data'])
        self.assertIn('/game-data/linux64',command)
        self.assertEqual(command[-3:],['/usr/bin/python3','-I','/barotrauma-bootstrap.py'])
        self.assertIn('/proc/self/fd/9/Content',command)
        self.assertIn('/game-data/Content',command)
        self.assertIn('/server/.steam/sdk64/steamclient.so',command)
        self.assertEqual(command[command.index('--chdir')+1],'/server/runtime')
        self.assertNotIn('/opt/playbound-host/games/barotrauma',command)
        self.assertEqual(command[command.index('DOTNET_GCHeapHardLimit')+1],'20000000')
        self.assertEqual(command[command.index('DOTNET_GCRegionRange')+1],'40000000')
        self.assertEqual(command[command.index('/usr/bin/prlimit')+1],'--as='+str(4*1024**3))
        with self.assertRaises(ValueError):module.request(['run-native',ID,'42',IDENTITY,'barotrauma','27221','750','1024'])

    def test_veloren_namespace_keeps_assets_and_userdata_separate(self):
        import json
        local=importlib.util.spec_from_file_location('veloren_contract',Path(__file__).with_name('customer-veloren.py'))
        contract=importlib.util.module_from_spec(local);local.loader.exec_module(contract)
        module.select_game('veloren')
        value={'name':'Fixture','maxPlayers':8}
        with patch.object(module,'trusted_module',return_value=contract):
            self.assertEqual(json.loads(module.config_bytes(json.dumps(value),14004)),value)
        command=module.command(Path('/fixture/data'),7,14004,2048,None,value,asset_directory=9)
        self.assertEqual(command[-3:],['/usr/bin/python3','-I','/veloren-bootstrap.py'])
        self.assertIn('/server/userdata',command)
        self.assertIn('/game-data/assets',command)
        self.assertNotIn('/opt/playbound-host/games/veloren/userdata',command)

    def test_dotnet_gc_limits_scale_with_the_envelope_and_regions_are_powers_of_two(self):
        self.assertEqual(module.dotnet_gc(2048,'barotrauma'),('20000000','40000000'))
        self.assertEqual(module.dotnet_gc(4096,'space-station-14'),('40000000','80000000'))
        self.assertEqual(module.dotnet_gc(4096,'openra'),('40000000','80000000'))
        for memory in (1500,3000,6144,8192):
            for game in ('barotrauma','openra'):
                heap,region=(int(value,16) for value in module.dotnet_gc(memory,game))
                self.assertEqual(region&(region-1),0)
                self.assertLessEqual(region,memory*1024**2)

    def test_necesse_uses_its_paired_java_and_private_world_path(self):
        module.select_game('necesse')
        self.assertEqual(module.config_bytes('{"maxPlayers":8}',14160),b'{"maxPlayers":8}')
        for text in ('{"maxPlayers":true}','{"maxPlayers":65}','{"maxPlayers":8,"jvm":"-agentlib:payload"}'):
            with self.assertRaises(ValueError):module.config_bytes(text,14160)
        command=module.command(Path('/fixture/data'),7,14160,1024,None,{'maxPlayers':8},asset_directory=9)
        self.assertIn('/game-data/jre/bin/java',command)
        self.assertIn('/game-data/Server.jar',command)
        self.assertEqual(command[-4:],['-datadir','/server','-pausewhenempty','0'])
        self.assertIn('-Duser.home=/server',command)
        self.assertNotIn('/usr/bin/java',command)

    def test_triplea_requires_paired_java25_and_fixed_private_maps(self):
        module.select_game('triplea')
        self.assertEqual(module.config_bytes('{}',3303),b'{}')
        with self.assertRaises(ValueError):module.config_bytes('{"jvm":"-agentlib:payload"}',3303)
        command=module.command(Path('/fixture/data'),7,3303,1024,None,{},asset_directory=9)
        self.assertIn('/game-data/jre/temurin-25/bin/java',command)
        self.assertIn('/game-data/games/triplea/bin/game-headless.jar',command)
        self.assertIn('/server/downloadedMaps',command)
        self.assertIn('-Duser.home=/server',command)
        self.assertIn('-XX:+DisableAttachMechanism',command)
        self.assertNotIn('/usr/bin/java',command)
        self.assertNotIn('/opt/playbound-host/jre/temurin-25/bin/java',command)

    def test_ss14_seals_settings_and_loads_only_paired_namespace_engine(self):
        import json
        local=importlib.util.spec_from_file_location('ss14_contract',Path(__file__).with_name('customer-ss14.py'))
        contract=importlib.util.module_from_spec(local);local.loader.exec_module(contract)
        module.select_game('space-station-14')
        value={'name':'Fixture','softMaxPlayers':16,'lobbyEnabled':True}
        with patch.object(module,'trusted_module',return_value=contract):
            self.assertEqual(json.loads(module.config_bytes(json.dumps(value),1212)),{'configuration':value,'port':1212})
        command=module.command(Path('/fixture/data'),7,1212,2048,None,value,asset_directory=9)
        self.assertEqual(command[-3:],['/usr/bin/python3','-I','/ss14-bootstrap.py'])
        self.assertIn('DOTNET_ROOT',command)
        self.assertIn('/usr/lib/dotnet',command)
        self.assertIn('/game-data',command)

    def test_rimworld_seals_port_and_settings_for_namespace_bootstrap(self):
        import json
        local=importlib.util.spec_from_file_location('rimworld_contract',Path(__file__).with_name('customer-rimworld.py'))
        contract=importlib.util.module_from_spec(local);local.loader.exec_module(contract)
        module.select_game('rimworld-together')
        value={'name':'Fixture','maxPlayers':16,'settings':{'automaticBackups':True}}
        with patch.object(module,'trusted_module',return_value=contract):
            result=json.loads(module.config_bytes(json.dumps(value),25590))
        self.assertEqual(result,{'configuration':value,'port':25590})
        command=module.command(Path('/fixture/data'),7,25590,1024,None,value,asset_directory=9)
        self.assertEqual(command[-3:],['/usr/bin/python3','-I','/rimworld-bootstrap.py'])
        self.assertIn('DOTNET_BUNDLE_EXTRACT_BASE_DIR',command)
        self.assertIn('/game-data',command)
        self.assertNotIn('/opt/playbound-host/games/rimworld-together',command)

    def test_openra_candidates_use_fixed_root_family_and_private_support_path(self):
        import json
        local=importlib.util.spec_from_file_location('openra_contract',Path(__file__).with_name('customer-openra.py'))
        contract=importlib.util.module_from_spec(local);local.loader.exec_module(contract)
        for family,(binary,mods,image) in contract.FAMILIES.items():
            module.select_game('openra')
            value={'family':family,'mod':mods[0],'name':'Fixture','enableSingleplayer':True,'lockBots':False}
            with patch.object(module,'trusted_module',return_value=contract):
                self.assertEqual(json.loads(module.config_bytes(json.dumps(value),1234)),value)
                command=module.command(Path('/fixture/data'),7,1234,2048,None,value,asset_directory=9)
            self.assertIn('/game-data/'+binary,command)
            self.assertIn('Engine.SupportDir=/server',command)
            self.assertIn('DOTNET_EnableDiagnostics',command)
            self.assertIn('1073741824' if image else '67108864',command)
            self.assertNotIn('/opt/playbound-host/games/'+family,command)

    def test_unvanquished_has_fixed_helpers_packages_and_private_home(self):
        import json
        module.select_game('unvanquished')
        values={'name':'Fixture','maxPlayers':16,'botFill':4,'map':'plat23'}
        self.assertEqual(json.loads(module.config_bytes(json.dumps(values),27965)),values)
        for changes in ({'map':'../escape'},{'maxPlayers':True},{'botFill':33},{'name':'bad\nname'},{'exec':'shell'}):
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,**changes)),27965)
        command=module.command(Path('/fixture/data'),7,27965,1024,None,values,asset_directory=9)
        self.assertEqual(command[-2:],['+map','plat23'])
        self.assertIn('/game-data/daemonded',command)
        self.assertIn('/game-data/pkg',command)
        self.assertIn('/server',command)
        self.assertNotIn('/opt/playbound-host/games/unvanquished',command)

    def test_factorio_creation_is_inside_fixed_namespace_with_immutable_assets(self):
        import json
        local=importlib.util.spec_from_file_location('factorio_bootstrap',Path(__file__).with_name('customer-factorio-bootstrap.py'))
        bootstrap=importlib.util.module_from_spec(local);local.loader.exec_module(bootstrap)
        module.select_game('factorio')
        value={'name':'PlayBound','maxPlayers':16,'port':34197}
        with patch.object(module,'trusted_module',return_value=bootstrap):
            self.assertEqual(json.loads(module.config_bytes(json.dumps(value),34197)),value)
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(value),34198)
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(value,command='shell')),34197)
        command=module.command(Path('/fixture/data'),7,34197,2048,None,value,asset_directory=9)
        self.assertEqual(command[-3:],['/usr/bin/python3','-I','/bootstrap.py'])
        self.assertIn('/usr/local/libexec/playbound-customer-factorio-bootstrap',command)
        self.assertIn('/game-data',command)
        self.assertNotIn('/opt/playbound-host/games/factorio',command)

    def test_zero_ad_fixed_port_and_map_contract(self):
        import json
        module.select_game('0-ad')
        values={'map':'random/mainland','maxPlayers':4}
        self.assertEqual(json.loads(module.config_bytes(json.dumps(values),20595)),values)
        for update in [{'map':'../../private'},{'map':'random/mainland;quit'},{'maxPlayers':9},{'maxPlayers':True},{'exec':'payload'}]:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,**update)),20595)
        command=module.command(Path('/fixture/data'),7,20595,2048,8,values)
        self.assertIn('-autostart-host-players=4',command)
        self.assertIn('-autostart=random/mainland',command)
        with self.assertRaises(ValueError):module.request(['run-native',ID,'42',IDENTITY,'0-ad','20596','750','2048'])

    def test_private_account_database_is_sealed_and_contains_only_the_reserved_identity(self):
        import fcntl
        descriptor=module.identity_database(40000,40000)
        try:
            self.assertEqual(os.read(descriptor,4096),b'playbound-runtime:x:40000:40000:Private game runtime:/server:/usr/sbin/nologin\n')
            self.assertEqual(fcntl.fcntl(descriptor,fcntl.F_GET_SEALS),15)
            with self.assertRaises(OSError):os.write(descriptor,b'changed')
        finally:os.close(descriptor)
        for uid,gid in [(0,0),(39999,39999),(40256,40256),(40000,40001),(True,True),('40000','40000')]:
            with self.assertRaises(ValueError):module.identity_database(uid,gid)

    def test_zandronum_uses_fixed_iwad_and_private_configuration(self):
        import json
        module.select_game('freedoom')
        values={'name':'Private fixture','maxPlayers':4,'map':'MAP01','mode':'coop','skill':3,'fragLimit':0,'timeLimit':0}
        self.assertIn(b'sv_updatemaster false',module.config_bytes(json.dumps(values),10686))
        command=module.command(Path('/fixture/data'),7,10686,2048,8,values)
        self.assertIn('/game-data/freedoom2.wad',command)
        self.assertIn('/server/zandronum.ini',command)
        for update in [{'mode':'exec'},{'map':'../unsafe'},{'skill':True},{'maxPlayers':65},{'iwad':'other.wad'}]:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,**update)),10686)

    def test_openmohaa_generates_bounded_map_slots_and_bot_settings(self):
        import json
        module.select_game('medal-of-honor-allied-assault')
        values={'name':'Private fixture','maxPlayers':4,'bots':2,'map':'dm/mohdm1'}
        config=module.config_bytes(json.dumps(values),12222)
        self.assertIn(b'set sv_minPlayers 2',config)
        command=module.command(Path('/fixture/data'),7,12222,2048,8,values,asset_directory=9)
        self.assertIn('/server/main/playbound.cfg',command)
        self.assertEqual(command[-2:],['+map','dm/mohdm1'])
        for update in [{'name':'bad";quit'},{'bots':5},{'maxPlayers':True},{'map':'../unsafe'},{'plugin':'unsafe.so'}]:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,**update)),12222)

    def test_etlegacy_has_fixed_native_map_and_disables_unreviewed_bot_scripts(self):
        import json
        module.select_game('wolfenstein-enemy-territory')
        values={'name':'Private fixture','maxPlayers':4,'rconPassword':'a'*32}
        config=module.config_bytes(json.dumps(values),27959)
        self.assertIn(b'set omnibot_enable 0',config)
        command=module.command(Path('/fixture/data'),7,27959,2048,8,values,asset_directory=9)
        self.assertIn('/server/legacy/playbound.cfg',command)
        self.assertIn('/game-data',command)
        self.assertEqual(command[-2:],['+map','oasis'])
        for update in [{'name':'bad";quit'},{'rconPassword':'bad\nquit'},{'maxPlayers':True},{'plugin':'unsafe.so'}]:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,**update)),27959)

    def test_xonotic_generates_fixed_config_and_uses_immutable_assets(self):
        import json
        module.select_game('xonotic')
        values={'name':'Private fixture','maxPlayers':4,'map':'stormkeep','gameType':'dm','rconPassword':'a'*32,'bots':1,'fragLimit':-1,'timeLimit':-1}
        config=module.config_bytes(json.dumps(values),26020)
        self.assertIn(b'sv_public 0',config)
        self.assertIn(b'minplayers 1',config)
        command=module.command(Path('/fixture/data'),7,26020,2048,8,values,asset_directory=9)
        self.assertIn('/proc/self/fd/9',command)
        self.assertIn('/game-data/data',command)
        self.assertIn('/server/data/server.cfg',command)
        self.assertNotIn('/opt/playbound-host/games/xonotic',command)
        for update in [{'name':'bad";quit'},{'map':'../unsafe'},{'maxPlayers':True},{'bots':5},{'exec':'unsafe'}]:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,**update)),26020)

    def test_assaultcube_has_private_config_logs_and_allocated_query_pair(self):
        import json
        module.select_game('assaultcube')
        values={'name':'Private fixture','maxPlayers':4}
        self.assertEqual(module.config_bytes(json.dumps(values),28781),b'')
        command=module.command(Path('/fixture/data'),7,28781,2048,8,values,assets=[(9,'/game-data/packages/maps/official/ac_desert.cgz')])
        self.assertIn('-f28781',command)
        self.assertIn('-H/server/logs/',command)
        self.assertIn('-m',command)
        self.assertNotIn('/opt/playbound-host/games/assaultcube',command)
        for port in (28764,28782):
            with self.assertRaises(ValueError):module.request(['run-native',ID,'42',IDENTITY,'assaultcube',str(port),'750','2048'])
        for update in [{'exec':'unsafe'},{'name':'bad\nline'},{'maxPlayers':True}]:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,**update)),28781)

    def test_hurry_curry_uses_sealed_data_without_enabling_registration_or_custom_commands(self):
        import json
        module.select_game('hurry-curry')
        values={'name':'Private fixture','maxPlayers':4}
        self.assertEqual(json.loads(module.config_bytes(json.dumps(values),27052)),values)
        command=module.command(Path('/fixture/data'),7,27052,2048,8,values,assets=[(9,'/game-data/index.yaml')])
        self.assertIn('/engine-native',command)
        self.assertIn('/game-data/index.yaml',command)
        self.assertIn('0.0.0.0:27052',command)
        self.assertNotIn('--register',command)
        self.assertNotIn('/opt/playbound-host/games/hurry-curry',command)
        for update in [{'exec':'unsafe'},{'name':'bad\nline'},{'maxPlayers':True},{'maxPlayers':65}]:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,**update)),27052)

    def test_mindustry_generates_fixed_startup_commands_without_console_injection(self):
        import json
        module.select_game('mindustry')
        values={'name':'Private fixture','maxPlayers':4}
        self.assertEqual(json.loads(module.config_bytes(json.dumps(values),6587)),values)
        command=module.command(Path('/fixture/data'),7,6587,2048,8,values)
        self.assertIn('/engine.jar',command)
        self.assertIn('config name Private fixture,config port 6587,playerlimit 4,host',command)
        for name in ['bad,exit','bad\nexit','bad;exit','bad\\escape']:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,name=name)),6587)
        for slots in [True,0,65,'4']:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,maxPlayers=slots)),6587)
        with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,exec='exit')),6587)

    def test_stk_settings_preserve_declared_modes_and_reject_extra_arguments(self):
        import json
        module.select_game('supertuxkart')
        values={'name':'Private fixture','maxPlayers':12,'mode':8,'difficulty':3}
        self.assertEqual(json.loads(module.config_bytes(json.dumps(values),2777)),values)
        command=module.command(Path('/fixture/data'),7,2777,1536,8,values)
        self.assertIn('--mode=8',command)
        self.assertIn('PLAYBOUND_STK_DISCOVERY_PORT',command)
        self.assertIn('2778',command)
        for port in (2776,2779):
            with self.assertRaises(ValueError):module.request(['run-native',ID,'42',IDENTITY,'supertuxkart',str(port),'750','1536'])
        self.assertIn('--max-players=12',command)
        for update in [{'mode':5},{'maxPlayers':13},{'difficulty':4},{'name':'x\nunsafe'},{'exec':'unsafe'}]:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,**update)),2777)

    def test_wesnoth_series_and_config_paths_are_fixed(self):
        module.select_game('battle-for-wesnoth')
        self.assertEqual(module.config_bytes('{}',15020),b'versions_accepted="1.18.*"\n')
        for value in ['{"versions_accepted":"*"}','{"password":"unsafe"}','[]','false']:
            with self.assertRaises(ValueError):module.config_bytes(value,15020)
        command=module.command(Path('/fixture/data'),7,15020,1024,8,{})
        self.assertEqual(command[-5:],['/usr/games/wesnothd-1.18','-c','/server/server.cfg','-p','15020'])
        with self.assertRaises(ValueError):module.request(['run-native',ID,'42',IDENTITY,'battle-for-wesnoth','15021','750','1024'])

    def test_openarena_typed_configuration_cannot_inject_console_commands(self):
        import json
        module.select_game('openarena')
        values = {'maxPlayers':4,'botPlayers':2,'name':'Private fixture','rconPassword':'a'*32}
        config = module.config_bytes(json.dumps(values),27980)
        self.assertIn(b'set sv_maxclients 4\n',config)
        self.assertIn(b'set bot_minplayers 2\n',config)
        for field, value in [('name','name";quit'),('name','name\nquit'),('rconPassword','x;quit'),('botPlayers',5),('maxPlayers',True)]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                module.config_bytes(json.dumps(dict(values,**{field:value})),27980)
        with self.assertRaises(ValueError):
            module.config_bytes(json.dumps(dict(values,exec='payload.cfg')),27980)
        command = module.command(Path('/fixture/data'),7,27980,1536,8,values)
        self.assertIn('/usr/lib/ioquake3/ioq3ded',command)
        self.assertIn('/server/baseoa/playbound.cfg',command)
        self.assertEqual(command[-4:],['+exec','playbound.cfg','+map','oa_dm1'])

    @unittest.skipUnless(os.getuid() == 0, 'Root-owned migration journal fixture')
    def test_migration_journal_gates_phase_directory_identity_and_legacy_seal(self):
        import json
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'runtime'
            root.mkdir(mode=0o711)
            server = root / ID
            server.mkdir(mode=0o711)
            control = server / 'control'
            control.mkdir(mode=0o700)
            data = server / 'data'
            data.mkdir(mode=0o700)
            legacy = Path(temporary) / 'legacy'
            legacy.mkdir(mode=0o700)
            seal = legacy / ('pb-' + ID)
            seal.mkdir(mode=0o700)
            value = {'version': 1, 'serverId': ID, 'phase': 'active', 'uid': 0, 'activationInode': [data.stat().st_dev, data.stat().st_ino], 'sealedSourceInode': [seal.stat().st_dev, seal.stat().st_ino]}
            journal = control / 'migration.json'
            with patch.object(module, 'ROOT', root), patch.object(module, 'LEGACY_ROOT', legacy):
                self.assertFalse(module.migration_ready(ID, 0))
                journal.write_text(json.dumps(value))
                journal.chmod(0o600)
                self.assertTrue(module.migration_ready(ID, 0))
                self.assertIsNone(module.migration_network_profile(ID, 0))
                journal.write_text(json.dumps({**value, 'networkProfile': 'public-game-v1'}))
                self.assertEqual(module.migration_network_profile(ID, 0), 'public-game-v1')
                journal.write_text(json.dumps({**value, 'networkProfile': 'unknown'}))
                with self.assertRaises(ValueError): module.migration_network_profile(ID, 0)
                journal.write_text(json.dumps(value))
                (data / 'new-game-progress').write_bytes(b'allowed after activation')
                self.assertTrue(module.migration_ready(ID, 0))
                journal.write_text(json.dumps({**value, 'profileTransition': {'state': 'pending', 'target': 'uid'}}))
                with self.assertRaises(ValueError): module.migration_ready(ID, 0)
                self.assertTrue(module.migration_ready(ID, 0, allow_pending=True))
                for phase in ['activating', 'rolling-back', 'rolled-back']:
                    journal.write_text(json.dumps({**value, 'phase': phase}))
                    with self.assertRaises(ValueError): module.migration_ready(ID, 0)
                journal.write_text(json.dumps(value))
                with self.assertRaises(ValueError): module.migration_ready(ID, 40000)
                data.rename(server / 'retained')
                data.mkdir(mode=0o700)
                with self.assertRaises(ValueError): module.migration_ready(ID, 0)
                data.rmdir()
                (server / 'retained').rename(data)
                seal.rename(legacy / 'retained-seal')
                seal.mkdir(mode=0o700)
                with self.assertRaises(ValueError): module.migration_ready(ID, 0)

    def test_additional_native_profiles_have_fixed_ports_commands_and_typed_settings(self):
        for game, port, settings, executable in [('bzflag', 5174, '{"maxPlayers":4,"scoreLimit":3}', '/usr/games/bzfs'), ('hedgewars',46650,'{}','/usr/lib/hedgewars/bin/hedgewars-server'), ('openttd',3999,'{"maxPlayers":4}','/usr/games/openttd'), ('luanti',30020,'{"maxPlayers":4}','/usr/games/minetestserver')]:
            module.select_game(game)
            self.assertEqual(module.request(['run-native',ID,'42',IDENTITY,game,str(port),'750','1536'])[0], 'run')
            config=module.config_bytes(settings,port)
            if game in ('openttd','luanti'): self.assertIn(b'4',config)
            else: self.assertEqual(config,settings.encode())
            if game == 'luanti':
                self.assertIn(b'secure.enable_security = true\n', config)
                self.assertIn(b'secure.trusted_mods =\nsecure.http_mods =\n', config)
                with self.assertRaises(ValueError):
                    module.config_bytes('{"maxPlayers":4,"secure.trusted_mods":"payload"}',port)
            import json
            command=module.command(Path('/fixture/data'),7,port,1536,8,json.loads(settings))
            self.assertEqual(command[command.index('--perms')+4],executable)
            self.assertEqual(command[command.index('--',command.index('/usr/bin/bwrap'))+1],executable)
            for bad in ['{"exec":"/bin/sh"}', '{"maxPlayers":"4","scoreLimit":3}', '{"maxPlayers":201,"scoreLimit":3}']:
                with self.assertRaises(ValueError):module.config_bytes(bad,port)
            with self.assertRaises(ValueError):module.request(['run-native',ID,'42',IDENTITY,game,'9999','750','1536'])

    @unittest.skipUnless(os.getuid() == 0, 'Root-owned profile journal fixture')
    def test_native_journal_rejects_links_wrong_identity_and_unknown_game(self):
        import json
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)/'runtime';root.mkdir(mode=0o711)
            control=root/ID/'control';control.parent.mkdir(mode=0o711);control.mkdir(mode=0o700)
            journal=control/'migration.json'
            journal.write_text(json.dumps({'serverId':ID,'gameSlug':'bzflag'}));journal.chmod(0o600)
            with patch.object(module,'ROOT',root):
                self.assertEqual(module.journal_game(ID),'bzflag')
                for value in [{'serverId':'0'*24,'gameSlug':'bzflag'},{'serverId':ID,'gameSlug':'custom'}]:
                    journal.write_text(json.dumps(value))
                    with self.assertRaises(ValueError):module.journal_game(ID)
                journal.unlink();journal.symlink_to('/etc/passwd')
                with self.assertRaises(OSError):module.journal_game(ID)

    def test_only_fixed_operations_and_bounded_arguments(self):
        self.assertEqual(module.request(['migration', ID]), ('migration', ID, None, None, None))
        self.assertEqual(module.request(['run', ID, '42', IDENTITY, '8322', '750', '1536']), ('run', ID, 42, IDENTITY, (8322, 750, 1536)))
        for action in ['stop', 'status']:
            self.assertEqual(module.request([action, ID, '42', IDENTITY])[0], action)
        for args in [[], ['exec', ID, '42', IDENTITY], ['stop', '../other', '42', IDENTITY], ['stop', ID, '1', IDENTITY], ['stop', ID, '42', '../identity'], ['run', ID, '42', IDENTITY, '9999', '750', '1536'], ['run', ID, '42', IDENTITY, '8322', '6001', '1536'], ['run', ID, '42', IDENTITY, '8322', '750', '8193'], ['run', ID, '42', IDENTITY, '8322', '750;id', '1536'], ['stop', ID, '42', IDENTITY, '8322', '750', '1536']]:
            with self.assertRaises(ValueError): module.request(args)

    def test_config_is_private_declared_and_has_no_commands_paths_or_registration(self):
        self.assertEqual(module.config_bytes(CONFIG, 8322), CONFIG.encode())
        for text in [CONFIG.replace('sv_register 0', 'sv_register 1'), CONFIG.replace('8322', '8321'), CONFIG + 'exec /etc/passwd\n', CONFIG + 'sv_map other\n', CONFIG.replace('dm1', '../world'), CONFIG + 'sv_name other; quit\n', CONFIG + 'sv_motd bad\x00\n', CONFIG.replace('sv_gametype dm', 'sv_gametype other'), CONFIG.replace('sv_max_clients 4', 'sv_max_clients 1000'), CONFIG + 'x' * 17000]:
            with self.assertRaises(ValueError): module.config_bytes(text, 8322)

    def test_game_exec_is_fixed_and_all_privileges_are_dropped_before_launch(self):
        command = module.command(Path('/fixture/data'), 7, 8322, 1536)
        self.assertEqual(command[0], '/usr/bin/prlimit')
        self.assertIn('--as=3221225472', command)
        self.assertIn('--die-with-parent', command)
        self.assertIn('--disable-userns', command)
        self.assertIn('--clearenv', command)
        self.assertEqual(command[-5:], ['--', '/usr/games/teeworlds-server', '-f', 'server.cfg', 'sv_port 8322'])
        self.assertNotIn('/var/lib/playbound-host', command)
        self.assertNotIn('/etc', command)
        self.assertEqual(command[command.index('--ro-bind-data') + 1:command.index('--ro-bind-data') + 3], ['7', '/server/server.cfg'])

    def test_reviewed_engine_bind_uses_only_inherited_sealed_descriptor(self):
        command = module.command(Path('/fixture/data'), 7, 8322, 1536, 8)
        index = command.index('--perms')
        self.assertEqual(command[index:index + 5], ['--perms', '0555', '--ro-bind-data', '8', '/usr/games/teeworlds-server'])
        self.assertLess(index, command.index('--proc'))
        self.assertNotIn('/opt/playbound-host/games', ' '.join(command))

    def test_binding_mismatch_never_signals_or_opens_cgroup(self):
        with patch.object(module, 'binding_read', side_effect=ValueError('wrong identity')), patch.object(module, 'scope_path') as scope:
            with self.assertRaises(ValueError): module.stop_runtime(ID, 42, IDENTITY)
            scope.assert_not_called()

    def test_shutdown_waits_for_entire_cgroup_to_be_empty(self):
        scope = module.scope_path(ID, 42)
        reads = iter(['populated 1\nfrozen 0', 'populated 0\nfrozen 0'])
        writes = []
        with patch.object(module, 'binding_read'), patch.object(module, 'game_identity', return_value=IDENTITY), patch.object(Path, 'exists', return_value=True), patch.object(Path, 'read_text', lambda *args: next(reads)), patch.object(Path, 'write_text', lambda file, text: writes.append((file, text))), patch.object(module.time, 'sleep') as sleep:
            self.assertEqual(module.stop_runtime(ID, 42, IDENTITY), {'stopped': True})
            self.assertEqual(writes, [(scope / 'cgroup.kill', '1')])
            sleep.assert_called_once()

    def test_missing_scope_is_already_stopped_but_only_after_binding_validation(self):
        with patch.object(module, 'binding_read') as binding, patch.object(module, 'game_identity', side_effect=FileNotFoundError), patch.object(Path, 'exists', return_value=False), patch.object(Path, 'write_text') as write:
            self.assertEqual(module.stop_runtime(ID, 42, IDENTITY), {'stopped': True})
            binding.assert_called_once_with(ID, 42, IDENTITY)
            write.assert_not_called()

    def test_stop_timeout_does_not_acknowledge_a_populated_scope(self):
        with patch.object(module, 'binding_read'), patch.object(module, 'game_identity', return_value=IDENTITY), patch.object(Path, 'exists', return_value=True), patch.object(Path, 'read_text', return_value='populated 1\nfrozen 0'), patch.object(Path, 'write_text'), patch.object(module.time, 'monotonic', side_effect=[0, 3]):
            with self.assertRaisesRegex(ValueError, 'did not empty'): module.stop_runtime(ID, 42, IDENTITY)

    def test_reused_gate_pid_cannot_authorize_scope_shutdown(self):
        with patch.object(module, 'binding_read'), patch.object(module, 'game_identity', return_value=IDENTITY + '1'), patch.object(Path, 'write_text') as write:
            with self.assertRaises(ValueError): module.stop_runtime(ID, 42, IDENTITY)
            write.assert_not_called()

    def test_launch_uses_reserved_uid_gid_empty_groups_and_sealed_config_without_env_or_command_input(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'control').mkdir()
            identities = SimpleNamespace(ensure_identity=Mock(return_value={'uid': 40000, 'gid': 40000}), secure_stat=Mock())
            resources = SimpleNamespace(verify_caller=Mock())
            child = Mock(pid=52, returncode=0)
            child.poll.return_value = 0
            with patch.object(module, 'migration_network_profile', return_value=None), patch.object(module, 'journal_game', return_value='teeworlds'), patch.object(module, 'trusted_module', return_value=SimpleNamespace(sealed_engine_for=Mock(return_value=(None, "/usr/games/teeworlds-server")), sealed_filter=Mock(side_effect=lambda **kwargs:os.memfd_create("filter-fixture",os.MFD_CLOEXEC)), quiescent=Mock(), install=Mock(), remove=Mock(), apply_current=Mock(return_value={"8":[1],"9":[2]}))), patch.object(module, 'migration_ready', return_value=True), patch.object(module, 'verify_scope', return_value=Path('/fixture.scope')), patch.object(module, 'verify_supervisor_scope'), patch.object(module, 'workspace', return_value=root), patch.object(module.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=1001)), patch.object(Path, 'stat', return_value=SimpleNamespace(st_mode=0o100755, st_uid=0)), patch.object(module.subprocess, 'Popen', return_value=child) as spawn, patch.object(module, 'binding_write') as binding, patch.object(module, 'game_identity', return_value=IDENTITY):
                self.assertEqual(module.run_runtime(identities, resources, ID, 42, IDENTITY, (8322, 750, 1536), CONFIG), 0)
                options = spawn.call_args.kwargs
                self.assertEqual((options['user'], options['group'], options['extra_groups']), (40000, 40000, []))
                self.assertEqual(options['env'], module.ENV)
                self.assertNotIn('shell', options)
                self.assertEqual(options['cwd'], '/')
                self.assertEqual(binding.call_args.args[1]['gateIdentity'], IDENTITY)
                self.assertEqual(binding.call_args.args[1]['uid'], 40000)

    def test_sudo_or_pam_cannot_move_the_privileged_supervisor_outside_limits(self):
        scope = module.scope_path(ID, 42)
        with patch.object(Path, 'read_text', return_value='0::/system.slice/' + scope.name):
            module.verify_supervisor_scope(scope)
        with patch.object(Path, 'read_text', return_value='0::/system.slice/agent.service'):
            with self.assertRaises(ValueError): module.verify_supervisor_scope(scope)

    def test_missing_network_enforcement_blocks_engine_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'control').mkdir()
            identities = SimpleNamespace(ensure_identity=Mock(return_value={'uid': 40000, 'gid': 40000}), secure_stat=Mock())
            resources = SimpleNamespace(verify_caller=Mock())
            network = SimpleNamespace(apply_current_scope=Mock(side_effect=ValueError('missing hooks')))
            with patch.object(module, 'journal_game', return_value='teeworlds'), patch.object(module, 'migration_ready', return_value=True), patch.object(module, 'migration_network_profile', return_value='public-game-v1'), patch.object(module, 'verify_scope', return_value=Path('/fixture.scope')), patch.object(module, 'verify_supervisor_scope'), patch.object(module, 'workspace', return_value=root), patch.object(module.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=1001)), patch.object(module, 'trusted_module', return_value=network) as trusted, patch.object(module.subprocess, 'Popen') as spawn:
                with self.assertRaisesRegex(ValueError, 'missing hooks'):
                    module.run_runtime(identities, resources, ID, 42, IDENTITY, (8322, 750, 1536), CONFIG)
                spawn.assert_not_called()
                trusted.assert_called_once_with('pb_network', 'playbound-customer-network-check')

    def test_recovery_rechecks_network_enrollment_and_exact_scope_hooks(self):
        value = {'uid': 40000, 'gamePid': 52, 'gameIdentity': IDENTITY, 'networkProfile': 'public-game-v1', 'hostNetworkGuard':'host-egress-v1', 'socketBindPort':8322,'bindPrograms':{'8':[1],'9':[2]}}
        resources = SimpleNamespace(verify_process=Mock())
        network = SimpleNamespace(attached_filters=Mock(return_value={'kernelIngressPrograms': 1, 'kernelEgressPrograms': 1}),verify=Mock(return_value=True),program_ids=Mock(return_value={"8":[1],"9":[2]}))
        with patch.object(module, 'binding_read', side_effect=lambda *args: dict(value)), patch.object(module, 'migration_network_profile', return_value='public-game-v1') as profile, patch.object(module.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=1001)), patch.object(Path, 'read_text', return_value='0::/system.slice/' + module.scope_path(ID, 42).name), patch.object(module, 'trusted_module', return_value=network):
            self.assertTrue(module.runtime_status(resources, ID, 42, IDENTITY)['running'])
            network.attached_filters.assert_called_with(module.scope_path(ID, 42))
            network.attached_filters.side_effect = ValueError('missing hooks')
            self.assertFalse(module.runtime_status(resources, ID, 42, IDENTITY)['running'])
            profile.return_value = None
            self.assertFalse(module.runtime_status(resources, ID, 42, IDENTITY)['running'])

    def test_recovery_requires_live_complete_control_identity_in_the_same_scope(self):
        value = {'uid':40000, 'gamePid':52, 'gameIdentity':IDENTITY,
                 'controlPid':53, 'controlIdentity':IDENTITY,
                 'networkProfile':None, 'hostNetworkGuard':'host-egress-v1',
                 'bindPrograms':{'8':[1]}}
        resources = SimpleNamespace(verify_process=Mock())
        policy = SimpleNamespace(verify=Mock(), program_ids=Mock(return_value={'8':[1]}))
        expected = '0::/system.slice/'+module.scope_path(ID,42).name
        def read(path, *args, **kwargs):
            return expected
        with patch.object(module,'binding_read',side_effect=lambda *args:dict(value)), \
             patch.object(module,'migration_network_profile',return_value=None), \
             patch.object(module.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=1001)), \
             patch.object(module,'trusted_module',return_value=policy), \
             patch.object(Path,'read_text',read):
            self.assertTrue(module.runtime_status(resources,ID,42,IDENTITY)['running'])
            resources.verify_process.assert_any_call(53,IDENTITY,40000)
            def gone(pid, *args):
                if pid == 53: raise ProcessLookupError('controller exited')
            resources.verify_process.side_effect = gone
            self.assertFalse(module.runtime_status(resources,ID,42,IDENTITY)['running'])
            resources.verify_process.side_effect = None
            with patch.object(Path,'read_text',side_effect=lambda path: '0::/other.scope' if str(path)=='/proc/53/cgroup' else expected):
                self.assertFalse(module.runtime_status(resources,ID,42,IDENTITY)['running'])
            for key, bad in [('controlPid',True),('controlPid',0),('controlIdentity','')]:
                original = value[key]
                value[key] = bad
                self.assertFalse(module.runtime_status(resources,ID,42,IDENTITY)['running'])
                value[key] = original
            for key in ('controlPid','controlIdentity'):
                original = value.pop(key)
                self.assertFalse(module.runtime_status(resources,ID,42,IDENTITY)['running'])
                value[key] = original
            del value['controlPid'], value['controlIdentity']
            self.assertTrue(module.runtime_status(resources,ID,42,IDENTITY)['running'])
        policy.verify.assert_called()

    def test_parent_identity_and_actual_kernel_limits_are_required_before_execution(self):
        scope = module.scope_path(ID, 42)
        resources = SimpleNamespace(verify_process=lambda *args: None)
        values = {'/proc/42/cgroup': '0::/system.slice/' + scope.name, str(scope / 'cpu.max'): '75000 100000', str(scope / 'memory.max'): str(1536 * 1024 ** 2), str(scope / 'memory.swap.max'): '0', str(scope / 'pids.max'): '128', str(scope / 'memory.oom.group'): '1'}
        with patch.object(module.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=1001)), patch.object(Path, 'read_text', lambda file: values[str(file)]):
            self.assertEqual(module.verify_scope(resources, ID, 42, IDENTITY, 750, 1536), scope)
            for file, wrong in [('cpu.max', 'max 100000'), ('memory.max', 'max'), ('pids.max', 'max'), ('memory.swap.max', 'max'), ('memory.oom.group', '0')]:
                key = str(scope / file)
                old, values[key] = values[key], wrong
                with self.assertRaises(ValueError): module.verify_scope(resources, ID, 42, IDENTITY, 750, 1536)
                values[key] = old
            values['/proc/42/cgroup'] = '0::/other.scope'
            with self.assertRaises(ValueError): module.verify_scope(resources, ID, 42, IDENTITY, 750, 1536)


class FreecivTypedTests(unittest.TestCase):
    def test_fixed_configuration_rejects_commands_and_noninteger_slots(self):
        module.select_game('freeciv')
        try:
            self.assertEqual(module.config_bytes('{"maxPlayers":4}',5576),b'set maxplayers 4\n')
            for value in ('{"maxPlayers":true}','{"maxPlayers":65}','{"maxPlayers":4,"command":"lua unsafe"}'):
                with self.assertRaises(ValueError):module.config_bytes(value,5576)
        finally:module.select_game('teeworlds')

class WarzoneTypedTests(unittest.TestCase):
    def test_bounded_autohost_configuration_has_no_arbitrary_script_path(self):
        import json
        module.select_game('warzone-2100')
        try:
            value={'name':'Private fixture','map':'Sk-Mountain','maxPlayers':4,'techLevel':1,'bases':2,'powerLevel':1,'alliances':0,'scavengers':0,'openSpectatorSlots':4}
            result=json.loads(module.config_bytes(json.dumps(value),2120))
            self.assertEqual(result['challenge']['maxPlayers'],4)
            self.assertTrue(result['challenge']['spectatorHost'])
            for key,bad in [('maxPlayers',True),('maxPlayers',9),('map','../../scripts/unsafe'),('techLevel',4),('openSpectatorSlots',11),('name','bad\ncommand')]:
                with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(value,**{key:bad})),2120)
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(value,script='unsafe')),2120)
        finally:module.select_game('teeworlds')

class HypersomniaTypedTests(unittest.TestCase):
    def test_updates_and_external_map_sync_cannot_escape_managed_updates(self):
        import json
        module.select_game('hypersomnia')
        try:
            value={'name':'Private fixture','maxPlayers':4}
            result=json.loads(module.config_bytes(json.dumps(value),8432))
            self.assertEqual(result['server_start'],{'port':8432,'slots':4})
            self.assertFalse(result['self_update']['update_on_launch'])
            self.assertFalse(result['server']['daily_autoupdate'])
            self.assertFalse(result['server']['sync_all_external_arenas_on_startup'])
            for bad in ({'name':'bad\nname','maxPlayers':4},{'name':'fixture','maxPlayers':True},dict(value,command='unsafe')):
                with self.assertRaises(ValueError):module.config_bytes(json.dumps(bad),8432)
        finally:module.select_game('teeworlds')

class TerrariaTypedTests(unittest.TestCase):
    def test_world_name_and_slots_do_not_accept_paths_or_extra_controls(self):
        module.select_game('terraria')
        try:
            self.assertEqual(module.config_bytes('{"name":"Fixture","maxPlayers":4}',7890),b'{"name":"Fixture","maxPlayers":4}')
            for bad in ('{"name":"bad\\nname","maxPlayers":4}','{"name":"Fixture","maxPlayers":true}','{"name":"Fixture","maxPlayers":4,"world":"/other/world"}'):
                with self.assertRaises(ValueError):module.config_bytes(bad,7890)
        finally:module.select_game('teeworlds')

class TerrariaStopTests(unittest.TestCase):
    def test_private_display_supervisors_get_time_to_reap_engine_and_xvfb(self):
        scope = module.scope_path(ID, 42)
        def read(path, *args, **kwargs):
            return '0::/system.slice/'+scope.name if path.name == 'cgroup' else 'populated 0'
        for profile in ('core-keeper-unix-v1', 're-volt-rvgl-unix-v1'):
            binding = {'profile': profile, 'gamePid': 52, 'gameIdentity': IDENTITY, 'uid': 40000, 'controlPid': 52, 'controlIdentity': IDENTITY}
            with self.subTest(profile=profile), \
                 patch.object(module, 'binding_read', return_value=binding), \
                 patch.object(module, 'game_identity', return_value=IDENTITY), \
                 patch.object(Path, 'exists', return_value=True), \
                 patch.object(Path, 'stat', return_value=SimpleNamespace(st_uid=40000)), \
                 patch.object(Path, 'read_text', read), patch.object(Path, 'write_text') as kill, \
                 patch.object(module.os, 'pidfd_open', return_value=100), patch.object(module.os, 'close'), \
                 patch.object(module.signal, 'pidfd_send_signal') as send, \
                 patch.object(module.time, 'monotonic', side_effect=[0, 9]):
                self.assertEqual(module.stop_runtime(ID, 42, IDENTITY), {'stopped': True, 'graceful': True})
                send.assert_called_once_with(100, module.signal.SIGTERM)
                kill.assert_not_called()

    def test_veloren_graceful_stop_uses_registered_sigterm_handler(self):
        scope=module.scope_path(ID,42)
        binding={'profile':'veloren-unix-v1','gamePid':52,'gameIdentity':IDENTITY,'uid':40000,'controlPid':52,'controlIdentity':IDENTITY}
        def read(path,*args,**kwargs):return '0::/system.slice/'+scope.name if path.name=='cgroup' else 'populated 0'
        with patch.object(module,'binding_read',return_value=binding),patch.object(module,'game_identity',return_value=IDENTITY),patch.object(Path,'exists',return_value=True),patch.object(Path,'stat',return_value=SimpleNamespace(st_uid=40000)),patch.object(Path,'read_text',read),patch.object(Path,'write_text') as kill,patch.object(module.os,'pidfd_open',return_value=100),patch.object(module.os,'close'),patch.object(module.signal,'pidfd_send_signal') as send:
            self.assertEqual(module.stop_runtime(ID,42,IDENTITY),{'stopped':True,'graceful':True})
            send.assert_called_once_with(100,module.signal.SIGTERM)
            kill.assert_not_called()

    def test_graceful_stop_uses_pidfd_and_requires_matching_uid_and_scope(self):
        scope=module.scope_path(ID,42)
        binding={'profile':'terraria-unix-v1','gamePid':52,'gameIdentity':IDENTITY,'uid':40000,'controlPid':52,'controlIdentity':IDENTITY}
        def read(path,*args,**kwargs):return '0::/system.slice/'+scope.name if path.name=='cgroup' else 'populated 0'
        with patch.object(module,'binding_read',return_value=binding),patch.object(module,'game_identity',return_value=IDENTITY),patch.object(Path,'exists',return_value=True),patch.object(Path,'stat',return_value=SimpleNamespace(st_uid=40000)),patch.object(Path,'read_text',read),patch.object(Path,'write_text') as kill,patch.object(module.os,'pidfd_open',return_value=100),patch.object(module.os,'close'),patch.object(module.signal,'pidfd_send_signal') as send:
            self.assertEqual(module.stop_runtime(ID,42,IDENTITY),{'stopped':True,'graceful':True})
            send.assert_called_once_with(100,module.signal.SIGINT)
            kill.assert_not_called()
        with patch.object(module,'binding_read',return_value=binding),patch.object(module,'game_identity',return_value=IDENTITY),patch.object(Path,'exists',return_value=True),patch.object(Path,'stat',return_value=SimpleNamespace(st_uid=40001)),patch.object(module.os,'pidfd_open',return_value=100),patch.object(module.os,'close'),patch.object(module.signal,'pidfd_send_signal') as send:
            with self.assertRaisesRegex(ValueError,'identity changed'):module.stop_runtime(ID,42,IDENTITY)
            send.assert_not_called()

if __name__ == '__main__': unittest.main()
