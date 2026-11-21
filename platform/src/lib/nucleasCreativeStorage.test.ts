import { afterEach, describe, expect, it, vi } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { creativeScope, nucleasCreativeAction } from './nucleasCreativeStorage';
import { verifyRoundupRequest } from './nucleasRoundup';
import { createHmac } from 'node:crypto';
const scope = { organizationId: 'a'.repeat(24), companyId: 'b'.repeat(24), assetId: 'c'.repeat(24) };
function configure() {
  for (const [key,value] of Object.entries({S3_ARCHIVE_ENDPOINT:'https://s3.rogly.net',S3_ARCHIVE_BUCKET:'playbound',S3_ARCHIVE_REGION:'us-east-1',S3_ARCHIVE_ACCESS_KEY_ID:'test-existing-key',S3_ARCHIVE_SECRET_ACCESS_KEY:'test-existing-secret'})) vi.stubEnv(key,value);
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('Nucleas creative access on existing game storage',()=>{
  it('accepts the existing signature only for its exact path, body and fresh timestamp',()=>{
    const secret='synthetic-existing-secret', now=1800000000000, timestamp=String(now/1000), path='/api/integrations/nucleas/creative-storage', body=JSON.stringify({...scope,action:'upload',size:1024});
    const signature=createHmac('sha256',secret).update(`${timestamp}.POST.${path}.${body}`).digest('hex');
    const req=new Request(`https://playbound.club${path}`,{method:'POST',headers:{'x-nucleas-timestamp':timestamp,'x-nucleas-signature':signature}});
    expect(verifyRoundupRequest(req,body,secret,now)).toBe(true);
    expect(verifyRoundupRequest(req,body+' ',secret,now)).toBe(false);
    expect(verifyRoundupRequest(req,body,secret,now+600000)).toBe(false);
  });
  it('cannot address game files, traverse folders or mix company identifiers',()=>{
    expect(creativeScope(scope).source).toContain('nucleas/creative/organizations/');
    expect(()=>creativeScope({...scope,assetId:'../../games/example.zip'})).toThrow();
  });
  it('merges browser access and staging expiry without replacing existing game rules',async()=>{
    configure();const commands:{type:string;input:Record<string,unknown>}[]=[];
    const oldCors={ID:'existing-game-rule',AllowedMethods:['GET'],AllowedOrigins:['https://playbound.club']};
    const oldLifecycle={ID:'existing-game-cache',Status:'Enabled',Filter:{Prefix:'cache/'},Expiration:{Days:30}};
    vi.spyOn(S3Client.prototype,'send').mockImplementation((async(command:{constructor:{name:string};input:Record<string,unknown>})=>{
      commands.push({type:command.constructor.name,input:command.input});
      if(command.constructor.name==='GetBucketCorsCommand')return {CORSRules:[oldCors]};
      if(command.constructor.name==='GetBucketLifecycleConfigurationCommand')return {Rules:[oldLifecycle]};
      return {};
    }) as never);
    const result=await nucleasCreativeAction({...scope,action:'upload',size:1024});
    const url=new URL(result.url!);
    expect(url.pathname).toBe(`/playbound/${creativeScope(scope).staging}`);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    const cors=commands.find(c=>c.type==='PutBucketCorsCommand')!.input.CORSConfiguration as {CORSRules:unknown[]};
    expect(cors.CORSRules).toContainEqual(oldCors);
    const lifecycle=commands.find(c=>c.type==='PutBucketLifecycleConfigurationCommand')!.input.LifecycleConfiguration as {Rules:unknown[]};
    expect(lifecycle.Rules).toContainEqual(oldLifecycle);
    expect(lifecycle.Rules).toContainEqual(expect.objectContaining({Filter:{Prefix:'nucleas/creative/staging/'}}));
    expect(commands.every(c=>c.input.Bucket==='playbound')).toBe(true);
  });
  it('binds promotion to the verified ETag and deletes only the staging source',async()=>{
    configure();const commands:{type:string;input:Record<string,unknown>}[]=[];
    vi.spyOn(S3Client.prototype,'send').mockImplementation((async(command:{constructor:{name:string};input:Record<string,unknown>})=>{commands.push({type:command.constructor.name,input:command.input});return {};}) as never);
    const etag='"'+'d'.repeat(32)+'"';
    await nucleasCreativeAction({...scope,action:'promote',etag});
    await nucleasCreativeAction({...scope,action:'remove-staging'});
    expect(commands[0].input).toMatchObject({Key:creativeScope(scope).source,CopySourceIfMatch:etag,ACL:'private'});
    expect(commands[1].input.Key).toBe(creativeScope(scope).staging);
  });
});
