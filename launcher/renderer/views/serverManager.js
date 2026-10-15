import {renderServerFiles} from './serverFiles.js';
import {createLogFollower} from './serverLogFollow.mjs';

/** Native hosting workspace. All writes use the existing server-scoped API. */
export async function renderServerManager(host, id, { request, escapeHtml: e, back }) {
  const base = `/api/hosting/servers/${encodeURIComponent(id)}`;
  let server, control, busy = false, selected = 'Overview', revision = 0, disposed = false;
  const consoleLines = [];
  let filePanel = null;
  let disposeLogs = () => {};
  const may = permission => control.permissions.includes(`server:${permission}`);
  const button = (label, action, data = '', disabled = false) => `<button type="button" class="btn-secondary" data-action="${action}" ${data} ${disabled ? 'disabled' : ''}>${e(label)}</button>`;
  const field = (label, name, value = '') => `<label class="workspace-field">${e(label)}<input class="input-text" name="${name}" value="${e(String(value ?? ''))}" required></label>`;
  const when = date => new Date(date).toLocaleString();
  const confirmDisconnect = label => confirm(`${label}? ${server.players == null ? 'Player count is unknown. Anyone connected will be disconnected.' : `${server.players} connected player(s) will be disconnected.`} Saved worlds are kept.`);

  async function refresh() {
    ({ server, control } = await request(base));
  }
  function tabs() {
    return ['Overview', may('configure') && 'Settings', control.files && may('read_files') && 'Files', control.maps && 'Maps',
      may('configure') && control.definitions.some(d => d.feature === 'bots') && 'Bots',
      control.capabilities.players && 'Players',
      (may('create_backup') || may('restore_backup')) && 'Backups', may('configure') && may('restart') && 'Maintenance',
      'Access', 'Activity', control.capabilities.console && may('console') && 'Console', may('read_logs') && 'Logs'].filter(Boolean);
  }
  function message(text, error = false) {
    const node = host.querySelector('[data-message]');
    if (node) { node.textContent = text; node.setAttribute('role', error ? 'alert' : 'status'); }
  }
  async function perform(work, done = 'Saved.', reload = true) {
    if (busy) return;
    busy = true;
    host.querySelectorAll('button').forEach(node => { node.disabled = true; });
    message('Working…');
    try {
      const result = await work();
      if (reload && host.isConnected && !disposed) { await refresh(); await render(); }
      if (host.isConnected && !disposed) message(typeof done === 'function' ? done(result) : done);
    } catch (error) { message(error.message, true); }
    finally {
      busy = false;
      if (!disposed) host.querySelectorAll('button').forEach(node => { node.disabled = node.dataset.disabled === 'true'; });
    }
  }
  function settings(botsOnly) {
    const definitions = control.definitions.filter(d => botsOnly ? d.feature === 'bots' : d.feature !== 'bots' && (!control.maps || d.feature !== 'map'));
    return `<form class="workspace-form" data-form="settings"><h2>${botsOnly ? 'Bots' : 'Game settings'}</h2>
      <p>Changes marked Restart disconnect everyone. Offline changes are saved for the next start.</p>
      ${definitions.map(d => {
        const value = control.values[d.key] ?? d.default;
        const attributes = `name="${e(d.key)}" data-setting="${e(d.key)}" data-type="${d.type}"`;
        let input;
        if (d.type === 'enum') input = `<select class="input-text" ${attributes}>${d.options.map(option => `<option value="${e(String(option.value))}" ${String(value) === String(option.value) ? 'selected' : ''}>${e(option.label)}</option>`).join('')}</select>`;
        else if (d.type === 'boolean') input = `<input type="checkbox" ${attributes} ${value ? 'checked' : ''}>`;
        else input = `<input class="input-text" ${attributes} type="${d.type === 'number' ? 'number' : 'text'}" value="${e(String(value ?? ''))}" ${d.min != null ? `min="${d.min}"` : ''} ${d.max != null ? `max="${d.max}"` : ''}>`;
        return `<label class="workspace-field">${e(d.label)} <small>${control.status.status !== 'running' ? 'Next start' : !control.capabilities.liveApply || d.apply === 'restart' ? 'Restart' : d.apply === 'next-round' ? 'Next round' : 'Live'}</small>${input}</label>`;
      }).join('')}${definitions.length ? '<button class="btn-primary">Apply changes</button>' : '<p>No additional game settings.</p>'}</form>`;
  }
  async function content(tab) {
    if (tab === 'Files') return '<div data-file-manager></div>';
    if (tab === 'Maintenance') {
      const data = await request(`${base}/maintenance`);
      const days = data.daysUTC || [0,1,2,3,4,5,6];
      return `<h2>Scheduled maintenance</h2><p>Schedule a configuration restore point, or save one before restarting an empty server. These tasks do not update game files or back up the saved world.</p><form class="workspace-form" data-form="maintenance"><label class="workspace-field"><input type="checkbox" name="enabled" ${data.enabled ? 'checked' : ''}> Enable scheduled task</label><label class="workspace-field">Task<select class="input-text" name="action"><option value="restart" ${data.action !== 'configuration-backup' ? 'selected' : ''}>Back up configuration and restart when empty</option><option value="configuration-backup" ${data.action === 'configuration-backup' ? 'selected' : ''}>Back up configuration only (keep server state)</option></select></label><fieldset><legend>Days (UTC)</legend><div class="workspace-actions">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label,day)=>`<label class="btn-secondary" style="display:flex;align-items:center;gap:.5rem;min-height:44px"><input type="checkbox" name="daysUTC" value="${day}" ${days.includes(day) ? 'checked' : ''}>${label}</label>`).join('')}</div></fieldset><label class="workspace-field">Task window (UTC)<select class="input-text" name="hourUTC">${Array.from({length:24},(_,hour) => `<option value="${hour}" ${hour === data.hourUTC ? 'selected' : ''}>${String(hour).padStart(2,'0')}:00–${String(hour).padStart(2,'0')}:59 UTC</option>`).join('')}</select></label><p>Checked every 15 minutes within the selected UTC days and hour. Restarts wait for a confirmed empty server; configuration backups also work while stopped or occupied. Missed windows wait for the next selected day.</p>${data.nextWindow ? `<p>Next saved window (your time): ${e(when(data.nextWindow.start))} – ${e(new Date(data.nextWindow.end).toLocaleTimeString())}</p>` : ''}${data.lastCheckedAt ? `<p>Last check: ${e(when(data.lastCheckedAt))} · ${e(data.lastCheckResult || '')}</p>` : ''}${data.lastDay ? `<p>Last attempt: ${e(data.lastDay)} · ${e(data.result || 'Preparing maintenance')}</p>` : ''}<button class="btn-primary">Save maintenance</button></form>`;
    }
    if (tab === 'Overview') {
      const resources = control.status.resources;
      const fresh = resources?.collectedAt && Date.now() - Date.parse(resources.collectedAt) < 120000;
      return `<div class="workspace-server-grid"><section class="site-panel site-pad"><h2>Connection</h2><p>${server.host && server.port ? e(`${server.host}:${server.port}`) : 'Address available when online.'}</p>${server.host && server.port ? button('Copy address', 'copy') : ''}<p>${e(server.description || '')}</p><p>${e(server.visibility)} · ${server.slots} player slots</p></section>
        <section class="site-panel site-pad"><h2>Resource usage</h2>${fresh ? `<p>${resources.cpuCores?.toFixed(2) ?? 'Unknown'} CPU cores · ${resources.rssBytes != null ? `${Math.round(resources.rssBytes / 1024 ** 2)} MB memory` : 'Memory unavailable'}</p><p>This server only · ${e(when(resources.collectedAt))}</p>` : '<p>Waiting for a fresh measurement.</p>'}</section></div>
        <div class="workspace-server-grid">${tabs().filter(t => t !== 'Overview').map(t => `<button class="site-panel site-pad workspace-shortcut" data-tab="${t}">${t}</button>`).join('')}</div>`;
    }
    if (tab === 'Settings') return `<form class="workspace-form" data-form="identity"><h2>Server details</h2>${field('Name', 'name', server.name)}<label class="workspace-field">Description<textarea class="input-text" name="description" maxlength="300">${e(server.description || '')}</textarea></label><label class="workspace-field">Visibility<select class="input-text" name="visibility">${['public', 'unlisted', 'private'].map(value => `<option ${value === server.visibility ? 'selected' : ''}>${value}</option>`).join('')}</select></label><p>Private hides the listing; it does not add a game password.</p><button class="btn-primary">Save details</button></form>${settings(false)}${may('delete') ? `<hr><p>Deleting removes this server and its saved world.</p>${button('Delete saved server', 'delete', '', !['stopped', 'failed'].includes(control.status.status) || server.online)}` : ''}`;
    if (tab === 'Bots') return settings(true);
    if (tab === 'Maps') {
      const maps = await request(`${base}/maps`);
      return `<h2>Maps</h2><p>Current map: ${e(maps.current || 'Unknown')}</p>${may('change_map') ? `<form class="workspace-form" data-form="map" data-restart="${maps.mode === 'restart'}"><label class="workspace-field">${maps.mode === 'restart' ? 'Starting map' : 'Choose map'}${maps.freeText ? '<input class="input-text" name="map" required maxlength="64">' : `<select class="input-text" name="map">${maps.options.map(m => `<option value="${e(m.value)}" ${m.value === maps.current ? 'selected' : ''}>${e(m.label)}</option>`).join('')}</select>`}</label><p>${maps.mode === 'restart' ? 'Changing this while online restarts the server.' : 'Changing maps may interrupt the current round.'}</p><button class="btn-primary" name="action" value="change">${maps.mode === 'restart' ? 'Save starting map' : 'Change now'}</button>${maps.canNext ? '<button class="btn-secondary" name="action" value="next">Set next map</button>' : ''}</form>${maps.canRotate ? `<form class="workspace-form" data-form="rotation"><h3>Map rotation</h3><p>One installed map name per line, in play order. Up to 30 maps.</p><textarea class="input-text" name="maps" rows="6">${e((maps.rotation || []).join('\n'))}</textarea><button class="btn-primary">Save rotation</button></form>` : ''}` : '<p>Your role can view maps but cannot change them.</p>'}`;
    }
    if (tab === 'Players') {
      const data = control.status.status === 'running' ? await request(`${base}/players`) : { players: [] };
      const bans = may('ban_players') ? await request(`${base}/bans`) : { bans: [] };
      return `<h2>Players</h2><p>Refresh to see the latest connected players.</p>${data.players.length ? data.players.map(p => `<div class="workspace-manager-row"><span>${e(p.name)}${p.pingMs != null ? ` · ${p.pingMs} ms` : ''}</span><div class="workspace-actions">${p.id != null && may('kick_players') ? button('Kick', 'kick', `data-id="${e(String(p.id))}" data-name="${e(p.name)}"`) : ''}${p.id != null && may('ban_players') ? button('Ban', 'ban', `data-id="${e(String(p.id))}" data-name="${e(p.name)}"`) : ''}</div></div>`).join('') : `<p>${control.status.status === 'running' ? 'No players reported.' : 'Start the server to see connected players.'}</p>`}${may('ban_players') ? `<h3>Banned players</h3>${bans.bans.map(b => `<div class="workspace-manager-row"><span>${e(b.name)} · ${e(when(b.at))}</span>${button('Unban', 'unban', `data-id="${e(b.id)}"`)}</div>`).join('') || '<p>No bans.</p>'}` : ''}`;
    }
    if (tab === 'Console') return `<h2>Game console</h2><p>Advanced game commands only. This is not a system shell. Commands are recorded in Activity.</p><pre class="workspace-console" aria-live="polite">${e(consoleLines.join('\n') || 'Responses to your commands appear here.')}</pre><form class="workspace-form" data-form="console">${field('Command', 'command')}<button class="btn-primary" ${control.status.status !== 'running' ? 'disabled' : ''}>Send command</button></form>`;
    if (tab === 'Logs') {
      const data = await request(`${base}/logs`);
      return `<h2>Server output</h2><p>Latest captured output, up to 200 lines. Credential-bearing lines are omitted. Live output refreshes every five seconds while visible.</p><button class="btn-secondary" data-log-follow aria-pressed="false">Follow live output</button><p data-log-truncated>${data.truncated ? 'Showing the newest portion of the log.' : ''}</p><pre data-log-output class="workspace-console" style="max-width:100%;max-height:24rem;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere">${e(data.available ? data.lines.join('\n') || 'No complete output lines yet.' : 'No captured output is available for this server yet. Some engines use a separate console transport.')}</pre>`;
    }
    if (tab === 'Backups') {
      // A world-data failure must not hide configuration restore points.
      const [data, worldResult] = await Promise.all([request(`${base}/backups`), request(`${base}/world-backups`).catch(error => ({ error: error.message }))]);
      return `<h2>Configuration restore points</h2><p>Saves settings, maps, bans, and roles; does not save world files. Daily automatic backups run when your setup changes. Keeps ${data.retention}.</p>${may('create_backup') ? `<form class="workspace-form" data-form="backup"><label class="workspace-field">Optional label<input class="input-text" name="label" maxlength="80"></label><button class="btn-primary">Save restore point</button></form>` : ''}${data.backups.map(b => `<div class="workspace-manager-row"><span>${e(b.label || b.kind)} · ${e(when(b.at))}<small>${e(b.summary)}</small></span><div class="workspace-actions">${may('restore_backup') ? button('Restore setup', 'restore', `data-id="${e(b.id)}"`, control.status.status !== 'stopped' || server.online) : ''}${may('create_backup') ? button('Delete', 'delete-backup', `data-id="${e(b.id)}"`) : ''}</div></div>`).join('') || '<p>No restore points.</p>'}
        <h2>World and player data</h2>${worldResult.error ? `<p role="alert">${e(worldResult.error)} — refresh to retry.</p>` : !worldResult.supported ? '<p>This game does not support world backups through PlayBound.</p>' : `<p>Backs up this server’s saved world and player files. Stop the server first to create or restore a consistent backup. Keeps ${worldResult.retention}.</p>${may('create_backup') ? button('Back up world', 'world-create', '', control.status.status !== 'stopped' || server.online) : ''}${worldResult.backups.map(b => `<div class="workspace-manager-row"><span>${e(when(b.createdAt))} · ${(b.bytes / 1024 ** 2).toFixed(1)} MB</span>${may('restore_backup') ? button('Restore world', 'world-restore', `data-id="${e(b.id)}"`, control.status.status !== 'stopped' || server.online) : ''}</div>`).join('')}`}`;
    }
    if (tab === 'Access') {
      const data = await request(`${base}/access`);
      return `<h2>Team access</h2><p>Administrators manage the server. Moderators manage maps and players. Only the owner can manage roles, subscription, or deletion.</p>${data.people.map(p => `<div class="workspace-manager-row"><span>${e(p.username || 'PlayBound member')} · ${e(p.role)}</span>${may('manage_access') && p.role !== 'owner' ? button('Remove access', 'revoke', `data-id="${e(p.userId)}"`) : ''}</div>`).join('')}${may('manage_access') ? `<form class="workspace-form" data-form="access">${field('PlayBound username', 'username')}<label class="workspace-field">Role<select class="input-text" name="role"><option value="moderator">Moderator</option><option value="administrator">Administrator</option></select></label><button class="btn-primary">Share access</button></form>` : ''}`;
    }
    const data = await request(`${base}/activity`);
    return `<h2>Activity</h2>${data.activity.map(row => `<div class="workspace-manager-row"><span>${e(row.actor)} · ${e(row.action.replaceAll('_', ' '))}<small>${e(row.detail || '')}</small></span><time>${e(when(row.at))}</time></div>`).join('') || '<p>No activity yet.</p>'}`;
  }
  async function render() {
    if (disposed || !host.isConnected) return;
    disposeLogs();
    const token = ++revision;
    if (!tabs().includes(selected)) selected = 'Overview';
    host.innerHTML = `${button('← My servers', 'back')}<section class="site-panel site-pad"><h2>${e(server.name)}</h2><p>${e(server.gameTitle)} · ${e(control.status.status)} · ${server.players ?? 'Unknown'} / ${server.slots} players · ${e(control.role)}</p>${control.status.error ? `<p role="alert">${e(control.status.error)}</p>` : ''}<div class="workspace-actions">${control.status.status === 'running' ? `${may('restart') ? button('Restart', 'restart') : ''}${may('stop') ? button('Stop', 'stop') : ''}` : may('start') ? button(control.status.status === 'pending' ? 'Starting…' : 'Start', 'start', '', ['pending', 'unknown'].includes(control.status.status)) : ''}${button('Refresh', 'refresh')}</div></section><nav class="workspace-actions workspace-manager-tabs" aria-label="Server management">${tabs().map(t => `<button class="${selected === t ? 'btn-primary' : 'btn-secondary'}" data-tab="${t}" aria-current="${selected === t ? 'page' : 'false'}">${t}</button>`).join('')}</nav><p data-message role="status"></p><section class="site-panel site-pad workspace-manager-content" data-content><p role="status">Loading…</p></section>`;
    try {
      const html = await content(selected);
      if (token === revision && host.isConnected) host.querySelector('[data-content]').innerHTML = html;
      if (token === revision && host.isConnected && selected === 'Files') filePanel = await renderServerFiles(host.querySelector('[data-file-manager]'), {request,base,escapeHtml:e,canWrite:may('write_files'),stopped:control.status.status === 'stopped' && !server.online});
      if (token === revision && host.isConnected && selected === 'Logs') {
        const output = host.querySelector('[data-log-output]'), toggle = host.querySelector('[data-log-follow]');
        const active = () => !disposed && token === revision && output.isConnected && host.getClientRects().length > 0;
        const follower = createLogFollower({read:()=>request(`${base}/logs`),active,visible:()=>!document.hidden && output.getClientRects().length > 0,
          show:data=>{ output.textContent=data.available ? data.lines.join('\n') || 'No complete output lines yet.' : 'No captured output available.'; host.querySelector('[data-log-truncated]').textContent=data.truncated ? 'Showing the newest portion of the log.' : ''; },
          error:failure=>{ message(failure.message,true); updateToggle(); }});
        const updateToggle = () => { toggle.textContent=follower.following ? 'Pause live output' : 'Follow live output'; toggle.setAttribute('aria-pressed',String(follower.following)); };
        toggle.onclick = event => {event.stopPropagation();if(follower.following) follower.stop();else follower.start();updateToggle();};
        const visibility = () => follower.visibilityChanged();
        document.addEventListener('visibilitychange',visibility);
        const observer = new MutationObserver(()=>{if(!active()) dispose();});
        const dispose = () => { follower.stop(); document.removeEventListener('visibilitychange',visibility); observer.disconnect(); };
        observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
        disposeLogs = dispose;
      }
    } catch (error) { if (token === revision && host.isConnected) { host.querySelector('[data-content]').textContent = 'This section is unavailable. Use Refresh to retry.'; message(error.message, true); } }
    host.querySelectorAll('button').forEach(node => { node.dataset.disabled = String(node.disabled); });
  }
  host.onclick = event => {
    const target = event.target.closest('button');
    if (!target || busy || target.disabled) return;
    if (filePanel?.hasUnsavedChanges() && !confirm('Discard your unsaved file edits?')) return;
    filePanel = null;
    if (target.dataset.tab) { selected = target.dataset.tab; void render(); return; }
    const name = target.dataset.action, key = target.dataset.id;
    if (name === 'back') { disposed = true; revision++; host.onclick = host.onsubmit = null; back(); return; }
    if (name === 'refresh') { void perform(refresh, 'Refreshed.'); return; }
    if (name === 'copy') { void perform(() => navigator.clipboard.writeText(`${server.host}:${server.port}`), 'Copied address.', false); return; }
    if (['start', 'stop', 'restart'].includes(name)) {
      if (name !== 'start' && !confirmDisconnect(name === 'stop' ? 'Stop server' : 'Restart server')) return;
      void perform(() => request(`${base}/action`, 'POST', { action: name }), `${name === 'start' ? 'Starting' : name === 'stop' ? 'Stopping' : 'Restarting'}…`); return;
    }
    if (name === 'delete') {
      if (confirm(`Delete ${server.name} and its saved world?`)) void perform(async () => { await request(base, 'DELETE'); disposed = true; revision++; host.onclick = host.onsubmit = null; back(); }, '', false);
      return;
    }
    const operations = {
      kick: ['players', 'POST', { action: 'kick', playerId: key, playerName: target.dataset.name }],
      ban: ['bans', 'POST', { playerId: key }], unban: ['bans', 'DELETE', { banId: key }],
      restore: ['backups', 'POST', { action: 'restore', backupId: key }],
      'delete-backup': ['backups', 'DELETE', { backupId: key }],
      'world-create': ['world-backups', 'POST', { action: 'create' }],
      'world-restore': ['world-backups', 'POST', { action: 'restore', backupId: key }],
      revoke: ['access', 'DELETE', { userId: key }],
    };
    if (operations[name] && confirm(`${target.textContent}${target.dataset.name ? ` ${target.dataset.name}` : ''}?${name === 'world-restore' ? ' This replaces the saved world and player data.' : name === 'restore' ? ' This replaces settings, map rotation, bans, and team roles.' : ''}`)) {
      const [path, method, body] = operations[name];
      void perform(() => request(`${base}/${path}`, method, body), 'Done.');
    }
  };
  host.onsubmit = event => {
    event.preventDefault();
    const form = event.target;
    if (busy) return;
    const data = Object.fromEntries(new window.FormData(form));
    const name = form.dataset.form;
    if (name === 'maintenance') {
      const daysUTC = [...form.querySelectorAll('[name="daysUTC"]:checked')].map(input => Number(input.value));
      if (!daysUTC.length) { message('Select at least one day.', true); return; }
      void perform(() => request(`${base}/maintenance`, 'PUT', { enabled: form.elements.enabled.checked, action: data.action, hourUTC: Number(data.hourUTC), daysUTC }), 'Maintenance saved.'); return;
    }
    if (name === 'identity') { void perform(() => request(base, 'PATCH', data), result => result.restartNeeded ? 'Saved. Restart to show the new name in-game.' : 'Saved.'); return; }
    if (name === 'settings') {
      const values = {};
      form.querySelectorAll('[data-setting]').forEach(field => {
        const definition = control.definitions.find(d => d.key === field.dataset.setting);
        const value = definition.type === 'boolean' ? field.checked : definition.type === 'number' ? Number(field.value) : definition.type === 'enum' ? definition.options.find(o => String(o.value) === field.value)?.value : field.value;
        if (value !== control.values[definition.key]) values[definition.key] = value;
      });
      if (!Object.keys(values).length) { message('No changes to apply.'); return; }
      if (control.status.status === 'running' && Object.keys(values).some(key => !control.capabilities.liveApply || control.definitions.find(d => d.key === key)?.apply === 'restart') && !confirmDisconnect('Apply settings and restart')) return;
      void perform(async () => {
        const result = await request(`${base}/settings`, 'PATCH', { settings: values });
        if (result.rejected?.length) throw new Error(`Some settings were not applied: ${result.rejected.map(r => `${r.key}: ${r.reason}`).join('; ')}`);
        return result;
      }, result => result.outcome === 'restarted' ? 'Saved. Server restarting…' : result.outcome === 'queued' ? 'Saved for the next start.' : 'Changes applied.');
      return;
    }
    if (name === 'map') {
      if (control.status.status === 'running' && form.dataset.restart === 'true' && !confirmDisconnect('Change map and restart')) return;
      void perform(() => request(`${base}/maps`, 'POST', { action: event.submitter?.value || 'change', map: data.map }), 'Map updated.'); return;
    }
    if (name === 'rotation') { void perform(() => request(`${base}/maps`, 'POST', { action: 'rotation', maps: data.maps.split('\n').map(s => s.trim()).filter(Boolean) }), 'Rotation saved.'); return; }
    if (name === 'backup') { void perform(() => request(`${base}/backups`, 'POST', { action: 'create', label: data.label }), 'Restore point saved.'); return; }
    if (name === 'access') { void perform(() => request(`${base}/access`, 'POST', data), 'Access shared.'); return; }
    if (name === 'console') void perform(async () => {
      const result = await request(`${base}/console`, 'POST', { command: data.command });
      consoleLines.push(`> ${data.command}`, String(result.output || 'Command sent.'));
      consoleLines.splice(0, Math.max(0, consoleLines.length - 100));
    }, 'Command sent.');
  };
  await refresh();
  await render();
}
