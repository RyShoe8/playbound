import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('display_acceptance', Path(__file__).with_name('customer-display-acceptance.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StagingLifecycle(unittest.TestCase):
    def test_controller_and_launch_scope_must_match_before_spawning(self):
        unit = 'playbound-customer-'+('f'*24)+'-123'
        scope = Path('/sys/fs/cgroup/system.slice')/(unit+'.scope')
        module.verify_controller_scope(['--scope','--unit='+unit],unit,scope)
        for args in ([], ['--unit=playbound-staging-corekeeper'], ['--unit='+unit,'--unit='+unit]):
            with self.subTest(args=args), self.assertRaises(ValueError):
                module.verify_controller_scope(args,unit,scope)
        with self.assertRaises(ValueError):
            module.verify_controller_scope(['--unit='+unit],unit,Path('/other.scope'))

    def test_online_corekeeper_requires_query_slots_identity_and_clean_shutdown(self):
        row = {'case': 'corekeeper-isolated-start-stop', 'engineSpawned': True,
               'engineExitCode': 0, 'exitStatus': 143, 'udpBound': True,
               'querySucceeded': True, 'players': 0, 'maxPlayers': 4, 'bots': 0,
               'privateGameIdWritten': True, 'privateGameInfoWritten': True}
        module.validate_engine_result(json.dumps(row), corekeeper=True, online=True)
        with self.assertRaises(ValueError):
            module.validate_engine_result(json.dumps(row), corekeeper=True, online=True, root_command=True)
        module.validate_engine_result(json.dumps({**row, 'rootCommandGenerated': True}), corekeeper=True, online=True, root_command=True)
        for key, value in [('engineSpawned', False), ('engineExitCode', -9),
                           ('engineExitCode', False), ('exitStatus', 0),
                           ('udpBound', False), ('querySucceeded', False),
                           ('players', 1), ('players', False), ('bots', 2),
                           ('maxPlayers', 64), ('privateGameIdWritten', False),
                           ('privateGameInfoWritten', False)]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                module.validate_engine_result(json.dumps({**row, key: value}), corekeeper=True, online=True)
        for text in ('', '{}', '[]', json.dumps(row)+'\n'+json.dumps(row)):
            with self.subTest(text=text), self.assertRaises(ValueError):
                module.validate_engine_result(text, corekeeper=True, online=True)

    def test_rvgl_spawn_alone_is_not_acceptance(self):
        row = {'case': 'rvgl-isolated-start-stop', 'engineSpawned': True,
               'engineExitCode': 0, 'exitStatus': 143, 'udpBound': True}
        module.validate_engine_result(json.dumps(row), rvgl=True)
        with self.assertRaises(ValueError):
            module.validate_engine_result(json.dumps(row),rvgl=True,root_command=True)
        module.validate_engine_result(json.dumps({**row,'rootCommandGenerated':True}),rvgl=True,root_command=True)
        for key in ('udpBound', 'engineSpawned', 'engineExitCode', 'exitStatus'):
            incomplete = {name: value for name, value in row.items() if name != key}
            with self.subTest(key=key), self.assertRaises(ValueError):
                module.validate_engine_result(json.dumps(incomplete), rvgl=True)

    def test_cleanup_attempts_every_resource_without_disclosing_failure_output(self):
        calls = []
        def fail():
            calls.append('failure')
            raise RuntimeError('private game output')
        with self.assertRaisesRegex(RuntimeError, 'egress rules, IPC label') as caught:
            module.cleanup_all([
                ('egress rules', fail),
                ('workspace', lambda: calls.append('workspace')),
                ('IPC label', fail),
                ('descriptor', lambda: calls.append('descriptor')),
            ])
        self.assertEqual(calls, ['failure', 'workspace', 'failure', 'descriptor'])
        self.assertNotIn('private game output', str(caught.exception))

    def test_successful_cleanup_and_empty_cleanup(self):
        module.cleanup_all([])
        calls = []
        module.cleanup_all([('one', lambda: calls.append(1)), ('two', lambda: calls.append(2))])
        self.assertEqual(calls, [1, 2])

    def test_root_namespace_mode_cannot_use_another_fixture(self):
        for options in ({}, {'rvgl': True,'corekeeper':True}, {'corekeeper': True}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                module.display_probe(None, root_command=True, **options)
        with self.assertRaises(ValueError):
            module.display_probe(None, external_stop=True)

    def test_identity_is_dropped_before_policy_entry(self):
        for uid in module.UIDS:
            command = module.confined_prefix(uid, 'playbound-customer-ipc-'+str(uid))
            self.assertEqual(command[0], '/usr/bin/setpriv')
            self.assertLess(command.index('--clear-groups'), command.index('/usr/bin/aa-exec'))
            self.assertIn('--reuid='+str(uid), command)
            self.assertIn('--regid='+str(uid), command)

    def test_only_fixed_staging_identities_are_allowed(self):
        for uid, label in [(0, 'unconfined'), (40000, 'playbound-customer-ipc-40000'),
                           (True, 'playbound-customer-ipc-True'),
                           (40254, 'playbound-customer-ipc-40255'),
                           ('40254', 'playbound-customer-ipc-40254')]:
            with self.subTest(uid=uid, label=label), self.assertRaises(ValueError):
                module.confined_prefix(uid, label)


if __name__ == '__main__':
    unittest.main()
