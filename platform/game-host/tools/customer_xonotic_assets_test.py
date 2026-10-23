import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

if os.name=='nt': raise unittest.SkipTest('Linux root-owned asset publication')
spec=importlib.util.spec_from_file_location('publication',Path(__file__).with_name('install-xonotic-customer-assets.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


@unittest.skipUnless(os.getuid()==0,'Root asset publication')
class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.source=self.root/'source';self.source.mkdir()
        self.destination=self.root/'published';self.data=b'reviewed pk3 fixture'
        (self.source/'data.pk3').write_bytes(self.data)
        self.manifest={'files':[{'path':'data.pk3','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}]}

    def test_large_public_manifests_validate_without_publishing(self):
        for game,filename in [('aneurism-iv','customerAnivAssets.json'),('re-volt-rvgl','customerRvglAssets.json'),('core-keeper','customerCoreKeeperAssets.json'),('barotrauma','customerBarotraumaAssets.json'),('dont-starve-together','customerDstAssets.json'),('morrowind','customerMorrowindAssets.json'),('team-fortress-2','customerTf2Assets.json'),('counter-strike-2','customerCs2Assets.json'),('trackmania','customerTrackmaniaAssets.json'),('counter-strike-source','customerCssAssets.json'),('open-fortress','customerOpenFortressAssets.json'),('battlefield-1942-anthology','customerBattlefieldAssets.json'),('unturned','customerUnturnedAssets.json')]:
            value=json.loads((Path(__file__).parent.parent/filename).read_text())
            with self.subTest(game=game),patch.object(module.shutil,'disk_usage',return_value=type('Disk',(),{'free':0})()):
                with self.assertRaisesRegex(ValueError,'Insufficient disk space'):
                    module.promote(self.source,self.destination,value,game=game)
            self.assertFalse(self.destination.exists())

    def test_aniv_publication_rejects_tokens_state_and_download_metadata(self):
        rows=[]
        for name in ('aniv_server.x86_64','GameAssembly.so','UnityPlayer.so','linux64/steamclient.so','aniv_server_Data/globalgamemanagers'):
            file=self.source/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(self.data)
            rows.append({'path':name,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()})
        result=module.promote(self.source,self.destination,{'files':rows},game='aneurism-iv')
        self.assertEqual(result['files'],5)
        self.assertEqual((self.destination/'aniv_server.x86_64').stat().st_mode&0o777,0o555)
        self.assertEqual((self.destination/'GameAssembly.so').stat().st_mode&0o777,0o444)
        for private in ('gslt.txt','owner-steamid64.txt','data/world.save','home/settings.json','steamapps/appmanifest.acf','unity.lock','build-metadata.json','aniv_server_Data/../gslt.txt'):
            with self.subTest(private=private),self.assertRaises(ValueError):
                module.promote(self.source,self.root/'rejected',{'files':[dict(rows[0],path=private)]},game='aneurism-iv')

    def test_corekeeper_publication_excludes_saves_and_executable_plugins(self):
        rows=[]
        for name in ('CoreKeeperServer','UnityPlayer.so','CoreKeeperServer_Data/Managed/Assembly-CSharp.dll','linux64/steamclient.so','localization/en.csv'):
            file=self.source/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(self.data)
            rows.append({'path':name,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()})
        result=module.promote(self.source,self.destination,{'files':rows},game='core-keeper')
        self.assertEqual(result['files'],5)
        self.assertEqual((self.destination/'CoreKeeperServer').stat().st_mode&0o777,0o555)
        self.assertEqual((self.destination/'UnityPlayer.so').stat().st_mode&0o777,0o444)
        for private in ('data/ServerConfig.json','ServerConfig.json','Saves/world.gzip','BepInEx/plugins/plugin.dll','CoreKeeperServer_Data/../ServerConfig.json'):
            with self.subTest(private=private),self.assertRaises(ValueError):
                module.promote(self.source,self.root/'rejected',{'files':[dict(rows[0],path=private)]},game='core-keeper')

    def test_barotrauma_publication_excludes_private_state(self):
        rows=[]
        for name in ('DedicatedServer','DedicatedServer.dll','Content/ContentPackages/Vanilla.xml','linux64/steamclient.so'):
            file=self.source/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(self.data)
            rows.append({'path':name,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()})
        result=module.promote(self.source,self.destination,{'files':rows},game='barotrauma')
        self.assertEqual(result['files'],4)
        self.assertEqual((self.destination/'DedicatedServer').stat().st_mode&0o777,0o555)
        self.assertEqual((self.destination/'DedicatedServer.dll').stat().st_mode&0o777,0o444)
        for private in ('serversettings.xml','config_player.xml','Data/clientpermissions.xml','Data/Multiplayer/world.save','LocalMods/mod.dll','createdump','../DedicatedServer'):
            with self.subTest(private=private),self.assertRaises(ValueError):
                module.promote(self.source,self.root/'rejected',{'files':[dict(rows[0],path=private)]},game='barotrauma')

    def test_exact_atomic_copy_leaves_sources_and_published_root_unchanged(self):
        (self.source/'unlisted.pk3').write_bytes(b'not published')
        result=module.promote(self.source,self.destination,self.manifest)
        self.assertEqual(result['files'],1)
        self.assertEqual((self.destination/'data.pk3').read_bytes(),self.data)
        self.assertEqual(self.destination.stat().st_mode&0o777,0o555)
        self.assertEqual((self.destination/'data.pk3').stat().st_mode&0o777,0o444)
        self.assertFalse((self.destination/'unlisted.pk3').exists())
        with self.assertRaises(ValueError):module.promote(self.source,self.destination,self.manifest)

    def test_changed_linked_oversized_or_traversing_inputs_never_publish(self):
        for changed in [{'path':'../escape.pk3'},{'bytes':3*1024**3},{'sha256':'0'*64}]:
            row=dict(self.manifest['files'][0],**changed)
            with self.assertRaises(ValueError):module.promote(self.source,self.destination,{'files':[row]})
            self.assertFalse(self.destination.exists())
        file=self.source/'data.pk3';file.unlink();file.symlink_to(self.source/'other')
        with self.assertRaises(OSError):module.promote(self.source,self.destination,self.manifest)
        self.assertFalse(self.destination.exists())
        self.assertEqual(list(self.root.glob('.pb-xonotic-assets-*')),[])

    def test_disk_pressure_and_linked_destination_fail_before_copy(self):
        with patch.object(module.shutil,'disk_usage',return_value=type('Disk',(),{'free':0})()):
            with self.assertRaises(ValueError):module.promote(self.source,self.destination,self.manifest)
        self.destination.symlink_to(self.source)
        with self.assertRaises(ValueError):module.promote(self.source,self.destination,self.manifest)

    def test_freeciv_publication_is_bounded_and_preserves_nested_rulesets(self):
        folder=self.source/'share/freeciv/classic';folder.mkdir(parents=True)
        file=folder/'units.ruleset';file.write_bytes(self.data)
        row={'path':'share/freeciv/classic/units.ruleset','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}
        result=module.promote(self.source,self.destination,{'files':[row]},game='freeciv')
        self.assertEqual(result['files'],1)
        self.assertEqual((self.destination/row['path']).read_bytes(),self.data)
        self.assertEqual((self.destination/'share/freeciv/classic').stat().st_mode&0o777,0o555)
        for invalid in ('share/freeciv/../classic/units.ruleset','bin/freeciv-server','share/freeciv/./units.ruleset'):
            with self.assertRaises(ValueError):module.promote(self.source,self.root/'rejected',{'files':[dict(row,path=invalid)]},game='freeciv')
        with self.assertRaises(ValueError):module.promote(self.source,self.root/'rejected',{'files':[dict(row,path='lib/'+str(i)+'.so') for i in range(1025)]},game='freeciv')

    def test_warzone_assets_never_admit_save_or_executable_directories(self):
        folder=self.source/'data/mods';folder.mkdir(parents=True)
        file=folder/'base.wz';file.write_bytes(self.data)
        row={'path':'data/mods/base.wz','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}
        result=module.promote(self.source,self.destination,{'files':[row]},game='warzone-2100')
        self.assertEqual(result['files'],1)
        for path in ('saves/save.gam','bin/warzone2100','data/../escape.wz'):
            with self.assertRaises(ValueError):module.promote(self.source,self.root/'rejected',{'files':[dict(row,path=path)]},game='warzone-2100')

    def test_veloren_bundle_keeps_worlds_out_and_allows_empty_translation_only(self):
        rows=[]
        for name,data in [('veloren-server-cli',self.data),('assets/common/world.ron',self.data),('assets/voxygen/i18n/en/empty.ftl',b'')]:
            file=self.source/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
            rows.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        module.promote(self.source,self.destination,{'files':rows},game='veloren')
        self.assertEqual((self.destination/'veloren-server-cli').stat().st_mode&0o777,0o555)
        self.assertEqual((self.destination/'assets/common/world.ron').stat().st_mode&0o777,0o444)
        for path in ('userdata/server/saves/db.sqlite','assets/../escape.ron','other-engine'):
            with self.assertRaises(ValueError):module.promote(self.source,self.root/'bad',{'files':[dict(rows[0],path=path)]},game='veloren')
        with self.assertRaises(ValueError):module.promote(self.source,self.root/'bad',{'files':[dict(rows[2],path='assets/common/empty.ron')]},game='veloren')

    def test_necesse_pins_server_java_and_libraries_but_excludes_customer_data(self):
        rows=[]
        for name in ('Server.jar','jre/bin/java','jre/lib/modules','jre/conf/security/java.security','lib/dependency.jar'):
            file=self.source/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(self.data)
            rows.append({'path':name,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()})
        module.promote(self.source,self.destination,{'files':rows},game='necesse')
        self.assertEqual((self.destination/'jre/bin/java').stat().st_mode&0o777,0o555)
        self.assertEqual((self.destination/'Server.jar').stat().st_mode&0o777,0o444)
        # The JVM cannot initialise without its pinned security configuration.
        self.assertEqual((self.destination/'jre/conf/security/java.security').stat().st_mode&0o777,0o444)
        for name in ('saves/world.zip','mods/plugin.jar','jre/bin/other','jre/confx/evil','lib/../escape.jar'):
            with self.assertRaises(ValueError):module.promote(self.source,self.root/'bad',{'files':[dict(rows[0],path=name)]},game='necesse')

    def test_triplea_bundle_never_admits_maps_or_other_java_versions(self):
        rows=[]
        for name in ('jre/temurin-25/bin/java','jre/temurin-25/lib/jspawnhelper','jre/temurin-25/lib/modules','jre/temurin-25/conf/security/java.security','games/triplea/bin/game-headless.jar'):
            file=self.source/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(self.data)
            rows.append({'path':name,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()})
        module.promote(self.source,self.destination,{'files':rows},game='triplea')
        self.assertEqual((self.destination/'jre/temurin-25/bin/java').stat().st_mode&0o777,0o555)
        self.assertEqual((self.destination/'games/triplea/bin/game-headless.jar').stat().st_mode&0o777,0o444)
        self.assertEqual((self.destination/'jre/temurin-25/conf/security/java.security').stat().st_mode&0o777,0o444)
        for name in ('jre/temurin-21/bin/java','jre/temurin-25/confx/evil','games/triplea/downloadedMaps/custom.zip','games/triplea/bin/../../escape.jar'):
            with self.assertRaises(ValueError):module.promote(self.source,self.root/'bad',{'files':[dict(rows[0],path=name)]},game='triplea')

    def test_dotnet_publications_keep_configs_private_and_only_engines_executable(self):
        for game,binary in [('rimworld-together','RTServer'),('space-station-14','Robust.Server')]:
            (self.source/binary).write_bytes(self.data)
            row={'path':binary,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}
            destination=self.root/game
            module.promote(self.source,destination,{'files':[row]},game=game)
            self.assertEqual((destination/binary).stat().st_mode&0o777,0o555)
            self.assertEqual((destination/'profile.json').stat().st_mode&0o777,0o444)
            with self.assertRaises(ValueError):module.promote(self.source,self.root/'bad',{'files':[dict(row,path='Configs/ServerConfig.json')]},game=game)
            with self.assertRaises(ValueError):module.promote(self.source,self.root/'bad',{'files':[dict(row,path='server_config.toml')]},game=game)
        empty='Resources/ConfigPresets/Build/debug.toml'
        file=self.source/empty;file.parent.mkdir(parents=True);file.write_bytes(b'')
        row={'path':empty,'bytes':0,'sha256':hashlib.sha256(b'').hexdigest()}
        module.promote(self.source,self.root/'ss14-empty',{'files':[row]},game='space-station-14')
        with self.assertRaises(ValueError):module.promote(self.source,self.root/'bad',{'files':[dict(row,path='Resources/custom.yml')]},game='space-station-14')

    def test_openra_families_cannot_substitute_another_engine_or_mutable_save(self):
        for game,binary in module.OPENRA_BINARIES.items():
            with self.subTest(game=game):
                file=self.source/binary;file.write_bytes(self.data)
                row={'path':binary,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}
                destination=self.root/game
                module.promote(self.source,destination,{'files':[row]},game=game)
                self.assertEqual((destination/binary).stat().st_mode&0o777,0o555)
                self.assertEqual((destination/'profile.json').stat().st_mode&0o777,0o444)
                if game!='openra':
                    for path in ('other-server','mods/custom.dll','../OpenRA.Server'):
                        with self.assertRaises(ValueError):module.promote(self.source,self.root/'bad',{'files':[dict(row,path=path)]},game=game)
                    with self.assertRaises(ValueError):module.promote(self.source,self.root/'bad',{'files':[row,row]},game=game)

    def test_unvanquished_publishes_only_reviewed_engine_helpers_and_packages(self):
        rows=[]
        for name in ('daemonded','nacl_loader','nacl_helper_bootstrap','irt_core-amd64.nexe','pkg/unvanquished_0.56.2.dpk'):
            file=self.source/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(self.data)
            rows.append({'path':name,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()})
        module.promote(self.source,self.destination,{'files':rows},game='unvanquished')
        for name in ('daemonded','nacl_loader','nacl_helper_bootstrap'):
            self.assertEqual((self.destination/name).stat().st_mode&0o777,0o555)
        for name in ('irt_core-amd64.nexe','pkg/unvanquished_0.56.2.dpk','profile.json'):
            self.assertEqual((self.destination/name).stat().st_mode&0o777,0o444)
        for path in ('server.cfg','pkg/../escape.dpk','pkg/custom.so','custom/evil.dpk'):
            with self.assertRaises(ValueError):module.promote(self.source,self.root/'bad',{'files':[dict(rows[0],path=path)]},game='unvanquished')

    def test_factorio_bundle_keeps_only_engine_executable_and_metadata_readonly(self):
        rows=[]
        for name in ('data/base/info.json','bin/x64/factorio'):
            file=self.source/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(self.data)
            rows.append({'path':name,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()})
        module.promote(self.source,self.destination,{'files':rows},game='factorio')
        self.assertEqual((self.destination/'bin/x64/factorio').stat().st_mode&0o777,0o555)
        self.assertEqual((self.destination/'data/base/info.json').stat().st_mode&0o777,0o444)
        self.assertEqual((self.destination/'profile.json').stat().st_mode&0o777,0o444)
        for name in ('saves/world.zip','mods/custom.zip','data/../escape','bin/x64/other'):
            with self.assertRaises(ValueError):module.promote(self.source,self.root/'rejected',{'files':[dict(rows[0],path=name)]},game='factorio')
        with self.assertRaises(ValueError):module.promote(self.source,self.root/'rejected',{'files':rows*2049},game='factorio')
        with self.assertRaises(ValueError):module.promote(self.source,self.root/'rejected',{'files':rows*33},game='terraria')

    def test_terraria_loader_is_executable_but_assemblies_are_readonly(self):
        rows=[]
        for name in ('TerrariaServer.bin.x86_64','TerrariaServer.exe'):
            (self.source/name).write_bytes(self.data)
            rows.append({'path':name,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()})
        module.promote(self.source,self.destination,{'files':rows},game='terraria')
        self.assertEqual((self.destination/'TerrariaServer.bin.x86_64').stat().st_mode&0o777,0o555)
        self.assertEqual((self.destination/'TerrariaServer.exe').stat().st_mode&0o777,0o444)


@unittest.skipUnless(os.getuid()==0,'Root immutable descriptor fixtures')
class AssetDescriptorTests(unittest.TestCase):
    def setUp(self):
        loader=importlib.util.spec_from_file_location('asset_reader',Path(__file__).with_name('customer-xonotic-assets.py'))
        self.reader=importlib.util.module_from_spec(loader);loader.loader.exec_module(self.reader)
        # The reader deliberately rejects writable ancestors, including /tmp.
        self.temp=tempfile.TemporaryDirectory(prefix='.pb-asset-test-',dir='/usr/local/libexec')
        self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.data=b'reviewed pk3 fixture';self.asset=self.root/'data.pk3'
        self.asset.write_bytes(self.data);self.asset.chmod(0o444)
        self.profile=self.root/'profile.json'
        self.profile.write_text(json.dumps({'files':[{'path':'data.pk3','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}]}))
        self.profile.chmod(0o444)

    def test_source_empty_overlay_mountpoints_cannot_hide_unlisted_files(self):
        source=self.root/'inputs';source.mkdir()
        (source/'srcds_linux64').write_bytes(self.data)
        rows=[{'path':'srcds_linux64','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}]
        published=self.root/'source-runtime'
        module.promote(source,published,{'files':rows},game='team-fortress-2')
        descriptor=self.reader.open_assets(published,game='team-fortress-2');os.close(descriptor)
        self.assertEqual(list((published/'tf/cfg').iterdir()),[])
        (published/'tf/cfg/unreviewed.cfg').write_bytes(self.data)
        with self.assertRaises(ValueError):self.reader.open_assets(published,game='team-fortress-2')

    def test_root_owned_asset_cache_skips_unchanged_bytes_but_rechecks_changed_file(self):
        source=self.root/'cached-source';source.mkdir()
        (source/'srcds_linux64').write_bytes(self.data)
        rows=[{'path':'srcds_linux64','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}]
        published=self.root/'cached-source-runtime'
        module.promote(source,published,{'files':rows},game='team-fortress-2')
        cache=self.root/'verification-cache'
        with patch.object(self.reader.hashlib,'sha256',wraps=hashlib.sha256) as digest:
            descriptor=self.reader.open_assets(published,game='team-fortress-2',cache_root=cache);os.close(descriptor)
            self.assertEqual(digest.call_count,2)
            self.assertTrue((cache/'team-fortress-2.json').exists())
            cached=json.loads((cache/'team-fortress-2.json').read_text())
            self.assertIsNotNone(self.reader.read_asset_cache(cache,'team-fortress-2',published,cached['profileDigest']))
            self.assertEqual(cached['files']['srcds_linux64'],self.reader.asset_stamp((published/'srcds_linux64').stat()))
            descriptor=self.reader.open_assets(published,game='team-fortress-2',cache_root=cache);os.close(descriptor)
            self.assertEqual(digest.call_count,3)
        binary=published/'srcds_linux64'
        binary.write_bytes(b'x'*len(self.data))
        binary.chmod(0o555)
        with self.assertRaisesRegex(ValueError,'Immutable assets differ'):
            self.reader.open_assets(published,game='team-fortress-2',cache_root=cache)
        binary.write_bytes(self.data);binary.chmod(0o555)
        (published/'tf/cfg/unreviewed.cfg').write_bytes(b'unlisted')
        with self.assertRaisesRegex(ValueError,'Unlisted immutable asset entry'):
            self.reader.open_assets(published,game='team-fortress-2',cache_root=cache)

    def test_corekeeper_and_rvgl_roundtrip_reject_extra_private_files(self):
        for game,paths in [('aneurism-iv',('aniv_server.x86_64','aniv_server_Data/globalgamemanagers')),('core-keeper',('CoreKeeperServer','CoreKeeperServer_Data/Managed/Assembly-CSharp.dll')),
                           ('re-volt-rvgl',('rvgl.64','lib/lib64/libunistring.so.2','lib/libunistring.so.2'))]:
            with self.subTest(game=game):
                source=self.root/(game+'-source');source.mkdir();rows=[]
                for name in paths:
                    file=source/name;file.parent.mkdir(parents=True,exist_ok=True)
                    if name=='lib/libunistring.so.2':
                        file.symlink_to('/untrusted/host/path')
                    else:file.write_bytes(self.data)
                    rows.append({'path':name,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()})
                published=self.root/(game+'-public')
                module.promote(source,published,{'files':rows},game=game)
                descriptor=self.reader.open_assets(published,game=game);os.close(descriptor)
                if game=='re-volt-rvgl':
                    alias=published/'lib/libunistring.so.2'
                    self.assertFalse(alias.is_symlink())
                    self.assertEqual(alias.read_bytes(),self.data)
                (published/'ServerConfig.json').write_bytes(b'private data')
                with self.assertRaises(ValueError):self.reader.open_assets(published,game=game)

    def test_corekeeper_mountpoints_never_import_shared_identity_files(self):
        source=self.root/'core-source';source.mkdir()
        (source/'CoreKeeperServer').write_bytes(self.data)
        (source/'GameID.txt').write_bytes(b'not public server identity')
        row={'path':'CoreKeeperServer','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}
        published=self.root/'core-public'
        module.promote(source,published,{'files':[row]},game='core-keeper')
        self.assertEqual((published/'GameID.txt').read_bytes(),b'')
        self.assertEqual((published/'GameInfo.txt').read_bytes(),b'')
        descriptor=self.reader.open_assets(published,game='core-keeper');os.close(descriptor)
        (published/'GameID.txt').write_bytes(b'private identity contamination')
        with self.assertRaises(ValueError):self.reader.open_assets(published,game='core-keeper')

    def test_factorio_reader_verifies_paired_engine_and_rejects_changed_bytes(self):
        source=self.root/'inputs';source.mkdir();rows=[]
        for name in ('data/base/info.json','bin/x64/factorio'):
            file=source/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(self.data)
            rows.append({'path':name,'bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()})
        published=self.root/'factorio'
        module.promote(source,published,{'files':rows},game='factorio')
        descriptor=self.reader.open_assets(published,game='factorio');os.close(descriptor)
        engine=published/'bin/x64/factorio';engine.chmod(0o755);engine.write_bytes(b'changed');engine.chmod(0o555)
        with self.assertRaises(ValueError):self.reader.open_assets(published,game='factorio')

    def test_retained_descriptor_references_only_the_reviewed_root_tree(self):
        descriptor=self.reader.open_assets(self.root)
        try:
            self.assertEqual(set(os.listdir(descriptor)),{'profile.json','data.pk3'})
            with os.fdopen(os.open('data.pk3',os.O_RDONLY,dir_fd=descriptor),'rb') as file:
                self.assertEqual(file.read(),self.data)
        finally:os.close(descriptor)

    def test_changed_linked_writable_and_unlisted_files_fail_closed(self):
        self.asset.chmod(0o644)
        with self.assertRaises(ValueError):self.reader.open_assets(self.root)
        self.asset.chmod(0o444);self.asset.write_bytes(b'changed')
        with self.assertRaises(ValueError):self.reader.open_assets(self.root)
        self.asset.write_bytes(self.data);extra=self.root/'unlisted.pk3';extra.write_bytes(b'extra')
        with self.assertRaises(ValueError):self.reader.open_assets(self.root)
        extra.unlink();self.asset.unlink();self.asset.symlink_to(self.profile)
        with self.assertRaises(OSError):self.reader.open_assets(self.root)

    def test_nested_engine_assets_reject_intermediate_links_and_extra_files(self):
        self.asset.unlink()
        folder=self.root/'legacy';folder.mkdir(mode=0o555)
        file=folder/'qagame.mp.x86_64.so';file.write_bytes(self.data);file.chmod(0o444)
        self.profile.write_text(json.dumps({'files':[{'path':'legacy/qagame.mp.x86_64.so','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}]}))
        descriptor=self.reader.open_assets(self.root,game='wolfenstein-enemy-territory');os.close(descriptor)
        extra=folder/'extra.so';extra.write_bytes(b'extra')
        with self.assertRaises(ValueError):self.reader.open_assets(self.root,game='wolfenstein-enemy-territory')
        extra.unlink();folder.rename(self.root/'elsewhere');folder.symlink_to(self.root/'elsewhere')
        with self.assertRaises(OSError):self.reader.open_assets(self.root,game='wolfenstein-enemy-territory')

    def test_deep_freeciv_tree_rejects_unlisted_descendants_and_traversal(self):
        self.asset.unlink()
        folder=self.root/'share/freeciv/classic';folder.mkdir(parents=True)
        file=folder/'units.ruleset';file.write_bytes(self.data);file.chmod(0o444)
        for directory in (folder,folder.parent,folder.parent.parent):directory.chmod(0o555)
        row={'path':'share/freeciv/classic/units.ruleset','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}
        self.profile.write_text(json.dumps({'files':[row]}))
        fd=self.reader.open_assets(self.root,game='freeciv');os.close(fd)
        extra=folder/'unreviewed.lua';extra.write_bytes(b'extra')
        with self.assertRaises(ValueError):self.reader.open_assets(self.root,game='freeciv')
        extra.unlink()
        row['path']='share/freeciv/classic/../classic/units.ruleset'
        self.profile.write_text(json.dumps({'files':[row]}))
        with self.assertRaises(ValueError):self.reader.open_assets(self.root,game='freeciv')


if __name__=='__main__':unittest.main()
