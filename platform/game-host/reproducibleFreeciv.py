"""Canonicalize only tolua's generated registration order and build timestamp."""
import pathlib
import re


def prepare_generator(source: pathlib.Path):
    filename = source / 'dependencies/tolua-5.2/src/bin/lua/package.lua'
    text = filename.read_text(encoding='utf-8')
    old = ' foreach(_usertype,function(n,v) output(\' tolua_usertype(tolua_S,"\',v,\'");\') end)'
    new = ''' local ordered_usertypes = {}
 for _, value in pairs(_usertype) do
  table.insert(ordered_usertypes, value)
 end
 table.sort(ordered_usertypes)
 for _, value in ipairs(ordered_usertypes) do
  output(' tolua_usertype(tolua_S,"',value,'");')
 end'''
    if text.count(old) != 1:
        raise ValueError('Reviewed tolua registration generator changed')
    # Dates occur only in generated comments; omit wall-clock values entirely.
    date = "..' on '..date()..'.\\n'"
    if text.count(date) != 2:
        raise ValueError('Reviewed tolua timestamp generator changed')
    prepared = text.replace(old, new).replace(date, "..'.\\n'")
    # Meson compiles the bundled C embedding, not the adjacent Lua sources.
    embedded = filename.parent.parent / 'toluabind.c'
    original = embedded.read_text(encoding='utf-8')
    replacements = 0
    def replace_script(match):
        nonlocal replacements
        script = bytes(int(n) for n in re.findall(r'\d+', match[1])).decode('utf-8')
        if 'tolua_reg_types' not in script:
            return match[0]
        if script.count(old.lstrip()) != 1 or script.count(date) != 1:
            raise ValueError('Reviewed embedded tolua generator changed')
        replacements += 1
        script = script.replace(old.lstrip(), new).replace(date, "..'.\\n'")
        return 'static unsigned char B[] = {\n' + ','.join(str(n) for n in script.encode('utf-8')) + '\n};'
    result = re.sub(r'static unsigned char B\[\] = \{([\d,\s]+)\};', replace_script, original)
    if replacements != 1:
        raise ValueError('Reviewed embedded tolua generator is missing')
    filename.write_text(prepared, encoding='utf-8')
    embedded.write_text(result, encoding='utf-8')
