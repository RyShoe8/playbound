const LIMIT = 64 * 1024 ** 2;
const CHUNK = 1024 ** 2;
function encode(bytes) {
  let value = '';
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i,i+8192));
  return window.btoa(value);
}

/** Native saved-data browser; credentials and filesystem paths stay on the host. */
export async function renderServerFiles(container,{request,base,escapeHtml:e,stopped,canWrite}) {
  let folder = '', entries = [], file = null, history = null, draft = '', busy = false, error = '', notice = '', progress = '', cancelled = false;
  const call = body => request(`${base}/files`,'POST',body);
  const relative = name => folder ? `${folder}/${name}` : name;
  const button = (label,action,data='',disabled=false) => `<button type="button" class="btn-secondary" data-file-action="${action}" ${data} ${disabled ? 'disabled' : ''}>${e(label)}</button>`;
  const discard = () => !file || file.text == null || draft === file.text || confirm('Discard your unsaved file edits?');
  const refresh = async () => { entries = (await call({action:'list',path:folder})).entries; };
  async function run(work) {
    if (busy) return;
    busy = true; cancelled = false; error = ''; notice = ''; render();
    try { await work(); } catch (failure) { error = failure.message; }
    finally { busy = false; progress = ''; if (container.isConnected) render(); }
  }
  function render() {
    const writable = canWrite && stopped && !busy;
    container.innerHTML = `<h2>Saved files</h2><p>Saved worlds and data only. Scripts, plugins, binaries, and sensitive files are excluded. Transfers: 64 MB per file. Text editing: 256 KB.</p>${!stopped ? '<p>Stop the server before changing files. Live downloads may change while the server writes them.</p>' : ''}${error ? `<p role="alert">${e(error)}</p>` : ''}${notice ? `<p role="status">${e(notice)}</p>` : ''}${progress ? `<p role="status">${e(progress)}</p>${button('Cancel transfer','cancel')}` : ''}
      <p>Saved data / ${e(folder)}</p><div class="workspace-actions">${folder ? button('Up a folder','up','',busy) : ''}${button('Refresh files','refresh','',busy)}${button('File history','history','',busy)}${canWrite ? `<label class="btn-secondary">Upload file<input type="file" data-upload aria-label="Upload saved file" ${!writable ? 'disabled' : ''}></label>${button('New folder','mkdir','',!writable)}` : ''}</div>
      ${entries.length ? entries.map(entry => `<div class="workspace-manager-row">${button(`${entry.directory ? '📁 ' : ''}${entry.name}`,entry.directory ? 'folder' : 'open',`data-name="${e(entry.name)}"`,busy || (!entry.directory && entry.bytes > LIMIT))}<span>${entry.directory ? 'Folder' : `${(entry.bytes/1024).toFixed(1)} KB${entry.bytes > LIMIT ? ' · above transfer limit' : ''}`}</span></div>`).join('') : '<p>No supported files in this folder.</p>'}
      ${file ? `<h3>${e(file.path)}</h3>${file.text != null ? `<label class="workspace-field">File content<textarea class="input-text" data-editor rows="12" ${!writable ? 'disabled' : ''}>${e(draft)}</textarea></label>` : '<p>Binary or large text file. Download to view.</p>'}<div class="workspace-actions">${button('Download file','download','',busy)}${canWrite && file.text != null ? button('Save file','save','',!writable || draft === file.text) : ''}${canWrite ? button('Delete file','delete','',!writable) : ''}</div>` : ''}
      ${history ? `<h3>File history</h3><p>Up to 50 previous versions are kept, separately from world backups.</p>${history.map(item => `<div class="workspace-manager-row"><span>${e(item.path)}<small>${e(new Date(item.at).toLocaleString())}</small></span>${canWrite ? button('Restore file','restore',`data-revision="${e(item.id)}"`,!writable) : ''}</div>`).join('') || '<p>No revisions yet.</p>'}` : ''}`;
  }
  container.oninput = event => {
    if (event.target.matches('[data-editor]')) { draft = event.target.value; const save = container.querySelector('[data-file-action="save"]'); if (save) save.disabled = busy || !stopped || draft === file.text; }
  };
  container.onchange = event => {
    if (!event.target.matches('[data-upload]') || !event.target.files?.[0]) return;
    const uploaded = event.target.files[0];
    void run(async () => {
      if (uploaded.size > LIMIT) throw new Error('Uploads are limited to 64 MB per file.');
      const path = relative(uploaded.name);
      let expectedEtag = '';
      if (entries.some(entry => entry.name === uploaded.name)) {
        if (!confirm(`Replace ${uploaded.name}? The current version is saved in File history.`)) return;
        expectedEtag = (await call({action:'stat',path})).etag;
      }
      if (!discard()) return;
      const session = await call({action:'upload-begin',path,expectedEtag,bytes:uploaded.size});
      let committed = false;
      try {
        for (let offset = 0; offset < uploaded.size; offset += CHUNK) {
          if (cancelled || !container.isConnected) throw new Error('Upload cancelled. The saved file was not replaced.');
          progress = `Uploading ${Math.floor(offset / uploaded.size * 100)}%`; render();
          const bytes = new Uint8Array(await uploaded.slice(offset,offset+CHUNK).arrayBuffer());
          await call({action:'upload-chunk',path,uploadId:session.uploadId,offset,contentBase64:encode(bytes)});
        }
        if (cancelled || !container.isConnected) throw new Error('Upload cancelled. The saved file was not replaced.');
        progress = ''; notice = 'Finishing upload…'; render();
        await call({action:'upload-commit',path,uploadId:session.uploadId});
        committed = true;
      } finally {
        if (!committed) await call({action:'upload-cancel',path,uploadId:session.uploadId}).catch(()=>{});
      }
      file = null; await refresh(); notice = 'File uploaded.';
    });
  };
  container.onclick = event => {
    event.stopPropagation();
    const target = event.target.closest('[data-file-action]');
    if (!target || target.disabled) return;
    if (target.dataset.fileAction === 'cancel') { cancelled = true; return; }
    if (busy) return;
    const action = target.dataset.fileAction;
    if (['up','folder','open','history'].includes(action) && !discard()) return;
    void run(async () => {
      if (action === 'refresh') await refresh();
      if (action === 'up' || action === 'folder') { folder = action === 'up' ? folder.split('/').slice(0,-1).join('/') : relative(target.dataset.name); file = null; history = null; await refresh(); }
      if (action === 'open') { file = await call({action:'stat',path:relative(target.dataset.name)}); draft = file.text || ''; history = null; }
      if (action === 'history') { file = null; history = (await call({action:'history'})).history; }
      if (action === 'mkdir') { const name = prompt('New folder name'); if (name) { await call({action:'mkdir',path:relative(name)}); await refresh(); } }
      if (action === 'download') {
        const chunks = [];
        for (let offset = 0; offset < file.bytes; offset += CHUNK) {
          if (cancelled || !container.isConnected) throw new Error('Download cancelled.');
          progress = `Downloading ${Math.floor(offset / file.bytes * 100)}%`; render();
          const chunk = await call({action:'read-chunk',path:file.path,version:file.version,offset});
          const bytes = Uint8Array.from(window.atob(chunk.contentBase64),char => char.charCodeAt(0));
          if (bytes.length !== Math.min(CHUNK,file.bytes-offset)) throw new Error('Incomplete download. Please retry.');
          chunks.push(bytes);
        }
        if (cancelled || !container.isConnected) throw new Error('Download cancelled.');
        const url = URL.createObjectURL(new window.Blob(chunks)), anchor = document.createElement('a');
        anchor.href = url; anchor.download = file.path.split('/').at(-1); anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      if (action === 'save') {
        const bytes = new TextEncoder().encode(draft);
        if (bytes.length > 256*1024) throw new Error('Text editing is limited to 256 KB.');
        const contentBase64 = encode(bytes), saved = await call({action:'write',path:file.path,expectedEtag:file.etag,contentBase64});
        file = {...(await call({action:'stat',path:file.path})),etag:saved.etag}; notice = 'Saved. The previous version is in File history.'; await refresh();
      }
      if (action === 'delete' && confirm(`Delete ${file.path}? A recoverable copy is kept in File history.`)) { await call({action:'delete',path:file.path,expectedEtag:file.etag}); file = null; await refresh(); notice = 'File deleted.'; }
      if (action === 'restore') {
        const item = history.find(item => item.id === target.dataset.revision);
        if (!item || !confirm(`Restore ${item.path} to this version?`)) return;
        const directory = item.path.split('/').slice(0,-1).join('/'), name = item.path.split('/').at(-1);
        const listed = await call({action:'list',path:directory});
        const expectedEtag = listed.entries.some(entry => entry.name === name) ? (await call({action:'stat',path:item.path})).etag : '';
        await call({action:'restore',path:item.path,revision:item.id,expectedEtag});
        await refresh(); history = (await call({action:'history'})).history; notice = 'File restored.';
      }
    });
  };
  await run(refresh);
  return { hasUnsavedChanges: () => busy || (file?.text != null && draft !== file.text) };
}
