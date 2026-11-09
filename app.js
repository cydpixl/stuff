import * as tus from 'https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/+esm';

const PROJECT = 'jqzdszkkrdzmedkcnpzp';
const PUBLIC_KEY = 'sb_publishable_EAgHLyLauUNkdEOUxzI7bg_fwcFVORy';
const API = `https://${PROJECT}.supabase.co`;
const ADMIN_API = `${API}/functions/v1/video-admin`;
const STORAGE = `${API}/storage/v1/object/public/`;
const VIDEO_BUCKET = 'watch-videos';
const THUMB_BUCKET = 'watch-thumbnails';
const CAPTION_BUCKET = 'watch-captions';
const KEY_STORAGE = 'watch-upload-key';
const $ = id => document.getElementById(id);
const state = { videos: [], selected: null, preview: '', thumbnail: '', subtitle: null, uploading: null, current: null, captionUrl: '', menu: '', hideTimer: null, lastVolume: 1, activeTrack: null, loading: false };
const video = $('video');
let toastTimer;

function toast(message) { const el = $('toast'); el.textContent = message; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 3800); }
function adminKey() { return localStorage.getItem(KEY_STORAGE) || sessionStorage.getItem(KEY_STORAGE) || ''; }
function fmtBytes(n) { return n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`; }
function fmtTime(s) { if (!Number.isFinite(s)) return '0:00'; s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60; return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`; }
function safeTitle(file) { return file.replace(/\.[^.]+$/, '').replace(/[_-]+/g,' ').trim() || 'Untitled video'; }
function pathURL(bucket, path) { return STORAGE + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'); }
function shareLink(id) { return `${location.origin}${location.pathname}?v=${encodeURIComponent(id)}`; }
function page(name) { ['library','uploadPage','watchPage'].forEach(id => $(id).hidden = id !== name); $('header').hidden = name === 'watchPage'; }
function showLibrary(push=true) { closeMenus(); video.pause(); video.removeAttribute('src'); video.load(); if (push) history.pushState(null,'',location.pathname); document.title='Videos'; page('library'); loadVideos(); }
function showUpload() { if (!adminKey()) { showAccess(); return; } closeMenus(); page('uploadPage'); document.title='Upload video'; if (location.search) history.pushState(null,'',location.pathname); }
function showAccess() { $('accessOverlay').hidden=false; $('accessKeyInput').focus(); }
function closeAccess() { $('accessOverlay').hidden=true; $('accessKeyInput').value=''; }
async function api(action, data={}, key=adminKey()) {
  const res = await fetch(ADMIN_API, {method:'POST', headers: {'Content-Type':'application/json', 'x-upload-key': key, apikey:PUBLIC_KEY}, body:JSON.stringify({action,...data})});
  let result; try {result=await res.json();}catch { throw Error(`Server returned ${res.status}`); }
  if(!res.ok || result.error) throw Error(result.error || `Request failed (${res.status})`);
  return result;
}
async function loadVideos() {
  if(state.loading) return; state.loading=true;
  try {
    const res=await fetch(`${API}/rest/v1/watch_videos?select=id,title,filename,object_path,thumbnail_path,duration_seconds,bytes,mime,caption_path,created_at&status=eq.ready&order=created_at.desc&limit=200`, {headers:{apikey:PUBLIC_KEY,Authorization:`Bearer ${PUBLIC_KEY}`},cache:'no-store'});
    if(!res.ok) throw Error(`Couldn't load videos (${res.status})`);
    state.videos = await res.json(); renderGrid();
  } catch(err) { $('videoGrid').textContent=''; $('emptyState').hidden=true; toast(err.message); }
  finally { state.loading=false; }
}
function renderGrid() {
  const grid=$('videoGrid'); grid.replaceChildren();
  const search=$('searchInput').value.toLocaleLowerCase();
  const matches=state.videos.filter(item=>(item.title||'').toLocaleLowerCase().includes(search));
  $('emptyState').hidden=state.videos.length>0 || search.length>0;
  matches.forEach(item=>{
    const card=document.createElement('article'); card.className='video-card'; card.tabIndex=0;
    const wrap=document.createElement('div'); wrap.className='thumb-wrap';
    const img=document.createElement('img'); img.alt=''; img.loading='lazy'; img.src=item.thumbnail_path?pathURL(THUMB_BUCKET,item.thumbnail_path):'./fallback.svg'; img.onerror=()=>{img.onerror=null;img.src='./fallback.svg';};
    const dur=document.createElement('span'); dur.className='duration'; dur.textContent=fmtTime(Number(item.duration_seconds)||0);
    wrap.append(img,dur);
    const info=document.createElement('div');info.className='card-info';
    const title=document.createElement('strong');title.textContent=item.title || item.filename;
    const more=document.createElement('button');more.className='card-more';more.textContent='···';more.title='Video actions';more.setAttribute('aria-label','Video actions');
    more.addEventListener('click',event=>{event.stopPropagation(); openCardMenu(more,item);});
    info.append(title,more);card.append(wrap,info);card.addEventListener('click',()=>openVideo(item.id));
    card.addEventListener('keydown',e=>{if(e.key==='Enter' && e.target===card) openVideo(item.id);});grid.append(card);
  });
}
function openCardMenu(button,item){document.querySelectorAll('.card-more-menu').forEach(el=>el.remove());const menu=document.createElement('div');menu.className='card-more-menu';
  [['Watch',()=>openVideo(item.id)],['Copy link',()=>copy(shareLink(item.id))],['Download',()=>window.open(pathURL(VIDEO_BUCKET,item.object_path),'_blank','noopener')],...(adminKey()?[['Rename',()=>renameVideo(item)],['Delete',()=>deleteVideo(item)]]:[])].forEach(([label,fn])=>{const b=document.createElement('button');b.textContent=label;b.addEventListener('click',e=>{e.stopPropagation();menu.remove();fn();});menu.append(b);});
  document.body.append(menu);const r=button.getBoundingClientRect();menu.style.top=`${Math.min(r.bottom+7,innerHeight-225)}px`;menu.style.left=`${Math.max(10,Math.min(r.right-175,innerWidth-190))}px`;
  const out=e=>{if(!menu.contains(e.target)&&e.target!==button){menu.remove();document.removeEventListener('pointerdown',out);}};setTimeout(()=>document.addEventListener('pointerdown',out),0);
}
async function renameVideo(item) {const title=prompt('Video title',item.title);if(!title?.trim())return;try{await api('rename',{id:item.id,title:title.trim()});await loadVideos();}catch(e){toast(e.message);}}
async function deleteVideo(item){if(!confirm(`Delete "${item.title}"? This cannot be undone.`))return;try{await api('delete',{id:item.id});await loadVideos();toast('Video deleted');}catch(e){toast(e.message);}}
async function copy(value){try{await navigator.clipboard.writeText(value);toast('Link copied');}catch{const ta=document.createElement('textarea');ta.value=value;document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();toast('Link copied');}}

function selectFile(file){
  if(!file) return;
  if(!file.type.startsWith('video/') && !/\.(mp4|mkv|mov|webm|m4v|avi)$/i.test(file.name)){toast('Select a video file');return;}
  if(file.size > 50*1024**3){toast('Maximum file size is 50 GB');return;}
  resetSelection();state.selected=file;
  $('selectedName').textContent=file.name; $('selectedSize').textContent=fmtBytes(file.size);
  $('videoTitle').value=safeTitle(file.name); $('uploadDetails').hidden=false; $('startUpload').hidden=false;
  makeThumbnail(file).then(({url,data,duration})=>{if(state.selected!==file)return;state.preview=url;state.thumbnail=data;state.duration=duration;$('previewThumb').src=url;});
}
function resetSelection(){if(state.preview.startsWith('blob:'))URL.revokeObjectURL(state.preview);state.selected=null;state.preview='';state.thumbnail='';state.subtitle=null;state.duration=0;$('previewThumb').src='./fallback.svg';$('videoInput').value='';$('uploadSubtitleInput').value='';$('selectedSubLabel').textContent='Subtitles';$('uploadDetails').hidden=true;$('uploadProgressPanel').hidden=true;$('startUpload').disabled=false;}
function fallbackThumb(){const c=document.createElement('canvas');c.width=640;c.height=360;const ctx=c.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='#666';ctx.lineWidth=5;ctx.strokeRect(266,139,108,82);ctx.beginPath();ctx.moveTo(306,158);ctx.lineTo(306,202);ctx.lineTo(343,180);ctx.closePath();ctx.fillStyle='#666';ctx.fill();return c.toDataURL('image/jpeg',.72);}
async function makeThumbnail(file){
 const temp=URL.createObjectURL(file);const v=document.createElement('video');v.preload='metadata';v.muted=true;v.playsInline=true;
 const fallback=fallbackThumb();try{
  v.src=temp;await Promise.race([new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=()=>reject(Error('No video metadata'));}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Video metadata timed out')),9000))]);
  const dur=Number.isFinite(v.duration)?v.duration:0;
  if(dur>0) { v.currentTime=Math.min(5,Math.max(.1,dur*.08)); await Promise.race([new Promise(resolve=>{v.onseeked=resolve;}),new Promise(resolve=>setTimeout(resolve,6000))]); }
  else {await new Promise(resolve=>setTimeout(resolve,300));}
  const c=document.createElement('canvas');c.width=640;c.height=Math.max(180,Math.round(640*(v.videoHeight||360)/(v.videoWidth||640)));c.height=Math.min(c.height,600);const x=c.getContext('2d');x.fillStyle='#111';x.fillRect(0,0,c.width,c.height);x.drawImage(v,0,0,c.width,c.height);
  const data=c.toDataURL('image/jpeg',.74);return {url:data,data,duration:dur};
 }catch{return{url:fallback,data:fallback,duration:0};}finally{v.removeAttribute('src');v.load();URL.revokeObjectURL(temp);}
}
function toVtt(raw){let text=raw.replace(/^\uFEFF/,'').trim();if(/^WEBVTT(?:\s|$)/.test(text))return text;const blocks=text.replace(/\r\n/g,'\n').split(/\n\s*\n/).map(block=>block.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2').replace(/(\d{2}:\d{2}),(\d{3})/g,'$1.$2')).join('\n\n');if(!/\d{2}:\d{2}[:.]\d{2,3}\s*-->/.test(blocks))throw Error('Invalid .srt or .vtt file');return `WEBVTT\n\n${blocks}\n`;}
async function readSubtitle(file){if(!file)return null;if(file.size>1024*1024)throw Error('Subtitle must be under 1 MB');if(!/\.(vtt|srt)$/i.test(file.name))throw Error('Choose an .srt or .vtt file');return toVtt(await file.text());}
async function startUpload(){
  if(!state.selected)return;const file=state.selected;
  if(!adminKey()){showAccess();return;}
  $('startUpload').disabled=true;$('uploadProgressPanel').hidden=false;$('uploadStatus').textContent='Preparing upload';$('cancelUpload').hidden=false;
  try{
    const created=await api('create',{title:$('videoTitle').value.trim()||safeTitle(file.name),filename:file.name,size:file.size,mime:file.type||'video/mp4'});
    const upload=new tus.Upload(file,{
      endpoint:`https://${PROJECT}.storage.supabase.co/storage/v1/upload/resumable`,
      retryDelays:[0,3000,5000,10000,20000],uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,
      headers:{apikey:PUBLIC_KEY,'x-signature':created.token},chunkSize:6*1024*1024,
      metadata:{bucketName:VIDEO_BUCKET,objectName:created.object_path,contentType:file.type||'video/mp4',cacheControl:'3600'},
      onError:err=>{state.uploading=null;$('uploadStatus').textContent='Upload failed';$('startUpload').disabled=false;toast(formatUploadError(err));},
      onProgress:(bytes,total)=>{const n=Math.max(0,Math.min(100,bytes/total*100));$('uploadProgress').style.width=n+'%';$('uploadPercent').textContent=`${n.toFixed(1)}%`;$('uploadAmount').textContent=`${fmtBytes(bytes)} / ${fmtBytes(total)}`;$('uploadStatus').textContent='Uploading';},
      onSuccess:async()=>{state.uploading=null;$('uploadStatus').textContent='Finishing';$('cancelUpload').hidden=true;
        try{const response=await api('finish',{id:created.id,thumbnail:state.thumbnail||fallbackThumb(),duration:state.duration||0,caption:state.subtitle});
          $('uploadDetails').hidden=true;$('dropZone').hidden=true;$('uploadComplete').hidden=false;
          $('completeThumb').src=state.thumbnail||'./fallback.svg';$('completeTitle').textContent=$('videoTitle').value.trim()||safeTitle(file.name);
          $('publicUrl').value=shareLink(response.id);$('viewComplete').onclick=()=>openVideo(response.id);resetSelection();
          await loadVideos();
        }catch(error){$('uploadStatus').textContent='Finishing failed';$('startUpload').disabled=false;toast(error.message+' — retry finishing from this page');
          $('startUpload').textContent='Finish upload';$('startUpload').onclick=async()=>{try{await api('finish',{id:created.id,thumbnail:state.thumbnail||fallbackThumb(),duration:state.duration||0,caption:state.subtitle});$('uploadComplete').hidden=false;$('uploadDetails').hidden=true;$('publicUrl').value=shareLink(created.id);$('viewComplete').onclick=()=>openVideo(created.id);}catch(e){toast(e.message)}};
        }
      }
    });
    state.uploading=upload;upload.start();
  }catch(error){$('uploadStatus').textContent='Upload unavailable';$('startUpload').disabled=false;toast(error.message);}
}
function formatUploadError(error){const message=String(error?.originalResponse?.getBody?.()||error?.message||'Upload failed');if(/file.?size|limit|too large|413/i.test(message))return 'Storage rejected the file size. A 2.5 GB upload requires a storage plan allowing files that large.';return message.slice(0,200);}

function closeMenus(){['settingsMenu','speedMenu','qualityMenu','subtitlesMenu'].forEach(id=>$(id).hidden=true);state.menu='';}
function openMenu(name){if(state.menu===name){closeMenus();return;}closeMenus();if(!name)return;state.menu=name;$(name+'Menu').hidden=false;showControls();}
function showControls(){if($('watchPage').hidden)return;$('player').classList.add('show-controls');clearTimeout(state.hideTimer);state.hideTimer=setTimeout(()=>{if(!video.paused && !state.menu && !state.current?.seeking)$('player').classList.remove('show-controls');},2800);}
function setPlaying(){const paused=video.paused;$('player').classList.toggle('paused',paused);$('playBtn').setAttribute('aria-label',paused?'Play':'Pause');$('playBtn').querySelector('svg').innerHTML=paused?'<path d="m7 4 14 8-14 8z"/>':'<path d="M7 4h4v16H7zm7 0h4v16h-4z" fill="currentColor" stroke="none"/>';showControls();}
function togglePlay(){if(!video.src)return;if(video.paused){video.play().catch(()=>toast('Playback could not start'));}else video.pause();}
function updateTime(){const pct=Number.isFinite(video.duration)&&video.duration>0?video.currentTime/video.duration:0;$('seek').value=Math.floor(pct*1000);$('seek').style.setProperty('--played',`${(pct*100).toFixed(2)}%`);$('timeDisplay').textContent=`${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;}
function seekSeconds(change){if(Number.isFinite(video.duration))video.currentTime=Math.min(Math.max(0,video.currentTime+change),video.duration);showControls();}
async function openVideo(id){let item=state.videos.find(x=>x.id===id);if(!item){await loadVideos();item=state.videos.find(x=>x.id===id);}if(!item){toast('Video not found');showLibrary();return;}
  state.current=item;state.captionUrl&&URL.revokeObjectURL(state.captionUrl);state.captionUrl='';state.activeTrack=null;
  closeMenus();$('playerError').hidden=true;$('watchTitle').textContent=item.title||item.filename;document.title=item.title||'Watch video';
  history.pushState(null,'',shareLink(id));page('watchPage');$('player').classList.add('show-controls','paused');
  video.pause();video.replaceChildren();video.src=pathURL(VIDEO_BUCKET,item.object_path);video.load();
  $('qualityValue').textContent='Original ›';$('captionValue').textContent='Off ›';$('captionOn').hidden=true;$('captionOff').classList.add('menu-selected');$('captionOn').classList.remove('menu-selected');
  if(item.caption_path){const tr=document.createElement('track');tr.kind='subtitles';tr.label='Uploaded';tr.srclang='en';tr.src=pathURL(CAPTION_BUCKET,item.caption_path);video.append(tr);tr.addEventListener('load',()=>{if(tr.track)tr.track.mode='disabled';});$('captionOn').hidden=false;}
  $('downloadBtn').onclick=()=>window.open(video.src,'_blank','noopener');$('castBtn').disabled=false;setPlaying();updateTime();showControls();
  video.play().catch(()=>{video.pause();setPlaying();});
}
function captionsEnabled(){const t=video.textTracks;for(let i=0;i<t.length;i++)if(t[i].mode==='showing')return true;return false;}
function setCaption(on){for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode=on?'showing':'disabled';$('captionValue').textContent=(on&&video.textTracks.length?'On':'Off')+' ›';$('captionOff').classList.toggle('menu-selected',!on);$('captionOn').classList.toggle('menu-selected',on);closeMenus();}
async function addCaptionFromFile(file){if(!file)return;try{
 const text=await readSubtitle(file);const blob=new Blob([text],{type:'text/vtt'});if(state.captionUrl)URL.revokeObjectURL(state.captionUrl);state.captionUrl=URL.createObjectURL(blob);
 for(const track of [...video.querySelectorAll('track')])track.remove();const track=document.createElement('track');track.kind='subtitles';track.srclang='en';track.label=file.name.replace(/\.[^.]+$/,'');track.src=state.captionUrl;video.append(track);
 track.addEventListener('load',()=>{setCaption(true);});$('captionOn').hidden=false;setCaption(true);toast('Subtitles loaded');
 if(adminKey()&&state.current){try{await api('caption',{id:state.current.id,caption:text});state.current.caption_path=`${state.current.id}.vtt`;toast('Subtitles saved for everyone');}catch(e){toast('Subtitles loaded locally; could not save for everyone');}}
 }catch(e){toast(e.message);}}
function keyboard(e){if($('watchPage').hidden||e.target.matches('input,textarea,button'))return;switch(e.key.toLowerCase()){case ' ':case 'k':e.preventDefault();togglePlay();break;case 'f':e.preventDefault();toggleFullscreen();break;case 'j':case 'arrowleft':e.preventDefault();seekSeconds(-10);break;case 'l':case 'arrowright':e.preventDefault();seekSeconds(10);break;case 'm':video.muted=!video.muted;updateVolume();break;case 'c':if(video.textTracks.length)setCaption(!captionsEnabled());break;case 'escape':closeMenus();break;}showControls();}
async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await $('player').requestFullscreen();}catch{toast('Fullscreen unavailable');}}
function updateVolume(){$('volume').value=video.muted?0:video.volume;$('muteBtn').setAttribute('aria-label',video.muted?'Unmute':'Mute');}

function bind(){
 $('homeBtn').onclick=()=>showLibrary();$('uploadNav').onclick=showUpload;$('emptyUpload').onclick=showUpload;
 $('adminNav').onclick=showAccess;$('closeAccess').onclick=closeAccess;$('accessOverlay').onclick=e=>{if(e.target===$('accessOverlay'))closeAccess();};
 $('accessForm').onsubmit=async e=>{e.preventDefault();const key=$('accessKeyInput').value.trim();const button=$('accessForm').querySelector('button[type="submit"]');button.disabled=true;try{await api('ping',{},key);sessionStorage.removeItem(KEY_STORAGE);localStorage.removeItem(KEY_STORAGE);($('rememberAccess').checked?localStorage:sessionStorage).setItem(KEY_STORAGE,key);closeAccess();showUpload();toast('Upload access enabled');}catch(error){toast(error.message);}finally{button.disabled=false;}};
 $('searchButton').onclick=()=>{$('searchInput').classList.toggle('open');$('searchInput').focus();};$('searchInput').oninput=renderGrid;
 $('dropZone').onclick=()=>$('videoInput').click();$('dropZone').onkeydown=e=>{if(e.key===' '||e.key==='Enter'){$('videoInput').click();e.preventDefault();}};
 $('dropZone').ondragover=e=>{e.preventDefault();$('dropZone').classList.add('dragover');};$('dropZone').ondragleave=()=>$('dropZone').classList.remove('dragover');$('dropZone').ondrop=e=>{e.preventDefault();$('dropZone').classList.remove('dragover');selectFile(e.dataTransfer.files[0]);};
 $('videoInput').onchange=e=>selectFile(e.target.files[0]);$('removeSelection').onclick=resetSelection;
 $('uploadSubtitleInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{state.subtitle=await readSubtitle(f);$('selectedSubLabel').textContent=f.name;}catch(err){toast(err.message);}};
 $('startUpload').onclick=startUpload;$('cancelUpload').onclick=async()=>{if(state.uploading){await state.uploading.abort();state.uploading=null;$('uploadStatus').textContent='Paused';$('startUpload').disabled=false;toast('Upload paused');}};
 $('copyComplete').onclick=()=>copy($('publicUrl').value);$('againComplete').onclick=()=>{$('uploadComplete').hidden=true;$('dropZone').hidden=false;$('startUpload').textContent='Upload video';$('startUpload').onclick=startUpload;resetSelection();};
 $('backBtn').onclick=()=>showLibrary();$('playBtn').onclick=togglePlay;$('centerPlay').onclick=togglePlay;$('back10').onclick=()=>seekSeconds(-10);$('forward10').onclick=()=>seekSeconds(10);
 $('seek').oninput=e=>{if(!Number.isFinite(video.duration))return;video.currentTime=Number(e.target.value)/1000*video.duration;state.current.seeking=true;updateTime();showControls();};$('seek').onchange=()=>{if(state.current)state.current.seeking=false;};
 $('seek').onpointermove=e=>{if(!Number.isFinite(video.duration))return;const r=e.target.getBoundingClientRect();const f=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));$('seekTip').textContent=fmtTime(f*video.duration);$('seekTip').style.left=`${f*100}%`;$('seekTip').hidden=false;};$('seek').onpointerleave=()=>$('seekTip').hidden=true;
 $('volume').oninput=e=>{video.volume=Number(e.target.value);video.muted=video.volume===0;updateVolume();};$('muteBtn').onclick=()=>{video.muted=!video.muted;updateVolume();};
 $('fullBtn').onclick=toggleFullscreen;$('pipBtn').onclick=async()=>{try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await video.requestPictureInPicture();}catch{toast('Picture-in-picture unavailable');}};
 $('castBtn').onclick=()=>{if(video.remote&&typeof video.remote.prompt==='function')video.remote.prompt().catch(()=>toast('Cast not available'));else toast('Casting is not supported by this browser');};
 $('settingsBtn').onclick=()=>openMenu('settings');$('subtitleBtn').onclick=()=>openMenu('subtitles');$('captionOff').onclick=()=>setCaption(false);$('captionOn').onclick=()=>setCaption(true);
 $('addCaption').onclick=()=>$('captionFile').click();$('captionFile').onchange=e=>addCaptionFromFile(e.target.files[0]);
 document.querySelectorAll('[data-menu]').forEach(btn=>btn.onclick=()=>openMenu(btn.dataset.menu));
 const choices=$('speedChoices');for(const speed of [.25,.5,.75,1,1.25,1.5,1.75,2]){const btn=document.createElement('button');btn.textContent=speed===1?'Normal':`${speed}×`;btn.onclick=()=>{video.playbackRate=speed;$('speedValue').textContent=(speed===1?'Normal':speed+'×')+' ›';closeMenus();};choices.append(btn);}
 video.addEventListener('play',setPlaying);video.addEventListener('pause',setPlaying);video.addEventListener('ended',setPlaying);video.addEventListener('timeupdate',updateTime);video.addEventListener('durationchange',updateTime);video.addEventListener('loadedmetadata',updateTime);
 video.addEventListener('error',()=>{if(!$('watchPage').hidden){$('playerError').hidden=false;$('playerErrorText').textContent='This video codec may not be supported. For Chrome, MP4 with H.264 video and AAC audio works best.';}});
 $('player').addEventListener('pointermove',showControls);$('player').addEventListener('click',e=>{if(e.target===video){closeMenus();togglePlay();}});
 document.addEventListener('keydown',keyboard);window.addEventListener('popstate',()=>{const id=new URLSearchParams(location.search).get('v');if(id)openVideo(id);else showLibrary(false);});
 document.addEventListener('pointerdown',e=>{if(state.menu&&!e.target.closest('.player-menu')&&!e.target.closest('#settingsBtn')&&!e.target.closest('#subtitleBtn'))closeMenus();});
 if(!document.pictureInPictureEnabled)$('pipBtn').hidden=true;
}
async function boot(){bind();await loadVideos();const id=new URLSearchParams(location.search).get('v');if(id)openVideo(id);else page('library');}
boot();
