const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const session = require("./openborSession");
const cfg = require("./openborCfg");

for (const [size,version] of [[348,0x33747],[352,0x33748]]) {
  test(`OpenBOR ${size}: renamed games get streaming display and separate virtual pads`, t => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pb-openbor-"));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    fs.mkdirSync(path.join(dir,"Saves"));
    const file=path.join(dir,"Saves","pack.cfg"), data=Buffer.alloc(size);
    data.writeUInt32LE(version,0); data.writeInt32LE(1,size-28);
    cfg.XMEN_DUALSENSE_P1_KEYS.forEach((key,i)=>data.writeInt32LE(key,0x34+i*4));
    fs.writeFileSync(file,data);
    session.prepare("another-openbor-pack",{exe:path.join(dir,"renamed.exe")},{streaming:true,profile:{family:"xbox"}});
    const written=fs.readFileSync(file);
    assert.equal(written.readInt32LE(size-28),0);
    assert.deepEqual(cfg.readP1Keys(written),cfg.XBOX_P1_KEYS);
    assert.equal(cfg.joyPortOfKey(cfg.readPlayerKeys(written,1)[0]),1);
    written[12]=77;fs.writeFileSync(file,written);
    session.restore("another-openbor-pack");
    const restored=fs.readFileSync(file);
    assert.equal(restored.readInt32LE(size-28),1);
    assert.equal(restored[12],77);
    assert.deepEqual(cfg.readP1Keys(restored),cfg.XBOX_P1_KEYS);
  });
}
test("unrelated configs and custom mappings remain untouched",t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pb-openbor-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.mkdirSync(path.join(dir,"Saves"));
  const file=path.join(dir,"Saves","other.cfg");fs.writeFileSync(file,Buffer.alloc(352));
  assert.equal(session.prepare("unknown",{dir},{streaming:true}),null);
  const data=Buffer.alloc(352);data.writeUInt32LE(0x33748,0);
  for(let i=0;i<12;i++)data.writeInt32LE(640+i,0x34+i*4);
  fs.writeFileSync(file,data);
  session.prepare("custom",{dir},{profile:{family:"xbox"}});
  assert.deepEqual(fs.readFileSync(file),data);
});
