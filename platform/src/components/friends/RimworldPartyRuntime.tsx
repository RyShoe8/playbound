"use client";
import { useCallback, useEffect, useState } from "react";

export function RimworldPartyRuntime({ partyId, canEdit }: {partyId:string;canEdit:boolean}) {
  const [players,setPlayers]=useState<{id:string;name:string}[]|null>(null);
  const [command,setCommand]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const url=`/api/parties/${encodeURIComponent(partyId)}/server-runtime`;
  const refresh=useCallback(async()=>{
    try {const response=await fetch(url);const data=await response.json();if(!response.ok)throw Error(data.error);setPlayers(data.players);}
    catch {setPlayers(null);}
  },[url]);
  useEffect(()=>{const initial=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>void refresh(),15000);return()=>{clearTimeout(initial);clearInterval(timer);};},[refresh]);
  async function send(value:string){
    if(busy||!canEdit)return;
    setBusy(true);
    try{const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command:value})});const data=await response.json();setMessage(data.output||data.error||"No response");await refresh();}
    catch{setMessage("Could not reach the server");}
    finally{setBusy(false);}
  }
  return <section className="space-y-3 rounded-lg border border-border p-3">
    <h4 className="font-semibold text-sm">RimWorld Together players</h4>
    {players===null?<p className="text-xs text-muted-foreground">Player status unavailable.</p>:players.length?players.map(player=><div key={player.id} className="flex items-center justify-between gap-2 text-sm"><span>{player.name}</span>{canEdit?<button type="button" disabled={busy} onClick={()=>void send(`pbkick ${player.id}`)} className="rounded border border-border px-2 py-1">Kick</button>:null}</div>):<p className="text-xs text-muted-foreground">No players connected.</p>}
    {canEdit?<><div className="flex flex-wrap gap-2">{[["List players","list"],["Backup world","backup"],["List accounts","deeplist"],["List events","eventlist"]].map(([label,cmd])=><button type="button" key={cmd} disabled={busy} onClick={()=>void send(cmd)} className="rounded border border-border px-2 py-1 text-xs">{label}</button>)}</div>
      <p className="text-xs text-muted-foreground">Advanced commands: op username, deop username, forcesave username, broadcast message, ban username, pardon username, setpassword password, clearpassword.</p>
      <form className="flex gap-2" onSubmit={event=>{event.preventDefault();void send(command);setCommand("");}}><input aria-label="RimWorld server command" value={command} maxLength={200} onChange={event=>setCommand(event.target.value)} className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm"/><button disabled={busy||!command.trim()} className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground">Send</button></form>
    </>:null}
    {message?<pre className="whitespace-pre-wrap break-words text-xs" role="status">{message}</pre>:null}
  </section>;
}
