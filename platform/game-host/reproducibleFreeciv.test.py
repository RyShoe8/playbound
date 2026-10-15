import pathlib,tempfile,unittest,re
from reproducibleFreeciv import prepare_generator


class GeneratorTests(unittest.TestCase):
 def test_registration_is_sorted_and_timestamp_is_omitted(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);file=root/'dependencies/tolua-5.2/src/bin/lua/package.lua'
   file.parent.mkdir(parents=True)
   registration=' foreach(_usertype,function(n,v) output(\' tolua_usertype(tolua_S,"\',v,\'");\') end)\n'
   timestamp="output('generated'..' on '..date()..'.\\n')\n"
   file.write_text(registration+timestamp*2,encoding='utf-8')
   embedded=file.parent.parent/'toluabind.c'
   script='tolua_reg_types\n'+registration.lstrip()+timestamp
   embedded.write_text('static unsigned char B[] = {'+','.join(str(n) for n in script.encode())+'};',encoding='utf-8')
   prepare_generator(root);text=file.read_text(encoding='utf-8')
   self.assertIn('table.sort(ordered_usertypes)',text)
   self.assertIn('ipairs(ordered_usertypes)',text)
   self.assertNotIn('date()',text)
   compiled=embedded.read_text(encoding='utf-8')
   values=re.search(r'B\[\] = \{([\d,\s]+)\};',compiled)[1]
   decoded=bytes(int(n) for n in re.findall(r'\d+',values)).decode()
   self.assertIn('table.sort(ordered_usertypes)',decoded)
   self.assertNotIn('date()',decoded)
 def test_unknown_generator_is_preserved(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);file=root/'dependencies/tolua-5.2/src/bin/lua/package.lua'
   file.parent.mkdir(parents=True);file.write_text('unreviewed generator',encoding='utf-8')
   with self.assertRaisesRegex(ValueError,'registration generator changed'):prepare_generator(root)
   self.assertEqual(file.read_text(encoding='utf-8'),'unreviewed generator')


if __name__=='__main__':unittest.main()
