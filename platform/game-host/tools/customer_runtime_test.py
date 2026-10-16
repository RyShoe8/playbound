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

    def test_ysoccer_has_fixed_java_runtime_and_bounded_heap(self):
        module.select_game('ysoccer')
        self.assertEqual(module.config_bytes('{}',54575),b'{}')
        with self.assertRaises(ValueError):module.config_bytes('{"jvm":"-agentlib:payload"}',54575)
        command=module.command(Path('/fixture/data'),7,54575,1536,8,{})
        self.assertIn('-Xmx512m',command)
        self.assertIn('-XX:ActiveProcessorCount=1',command)
        self.assertIn('/engine.jar',command)
        self.assertEqual(command[-4:],['-jar','/engine.jar','54575','54575'])

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

    def test_stk_settings_preserve_declared_modes_and_reject_extra_arguments(self):
        import json
        module.select_game('supertuxkart')
        values={'name':'Private fixture','maxPlayers':12,'mode':8,'difficulty':3}
        self.assertEqual(json.loads(module.config_bytes(json.dumps(values),2779)),values)
        command=module.command(Path('/fixture/data'),7,2779,1536,8,values)
        self.assertIn('--mode=8',command)
        self.assertIn('--max-players=12',command)
        for update in [{'mode':5},{'maxPlayers':13},{'difficulty':4},{'name':'x\nunsafe'},{'exec':'unsafe'}]:
            with self.assertRaises(ValueError):module.config_bytes(json.dumps(dict(values,**update)),2779)

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
            with patch.object(module, 'migration_network_profile', return_value=None), patch.object(module, 'journal_game', return_value='teeworlds'), patch.object(module, 'trusted_module', return_value=SimpleNamespace(sealed_engine_for=Mock(return_value=(None, "/usr/games/teeworlds-server")), sealed_filter=Mock(side_effect=lambda:os.memfd_create("filter-fixture",os.MFD_CLOEXEC)), quiescent=Mock(), install=Mock(), remove=Mock(), apply_current=Mock(return_value={"8":[1],"9":[2]}))), patch.object(module, 'migration_ready', return_value=True), patch.object(module, 'verify_scope', return_value=Path('/fixture.scope')), patch.object(module, 'verify_supervisor_scope'), patch.object(module, 'workspace', return_value=root), patch.object(module.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=1001)), patch.object(Path, 'stat', return_value=SimpleNamespace(st_mode=0o100755, st_uid=0)), patch.object(module.subprocess, 'Popen', return_value=child) as spawn, patch.object(module, 'binding_write') as binding, patch.object(module, 'game_identity', return_value=IDENTITY):
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


if __name__ == '__main__': unittest.main()
