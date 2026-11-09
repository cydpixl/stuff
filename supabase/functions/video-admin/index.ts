import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-upload-key, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const json=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
const err=(message:string,status=400)=>json({error:message},status);
const url=Deno.env.get('SUPABASE_URL')!;
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
const encode=new TextEncoder();
async function sha256(text:string){const data=new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(text)));return [...data].map(x=>x.toString(16).padStart(2,'0')).join('');}
function secureEqual(a:string,b:string){if(a.length!==b.length)return false;let equal=0;for(let i=0;i<a.length;i++)equal|=a.charCodeAt(i)^b.charCodeAt(i);return equal===0;}
async function isAdmin(key:string){if(!key||key.length>256)return false;const {data,error}=await db.from('watch_config').select('secret_hash').eq('id',1).maybeSingle();if(error||!data)return false;return secureEqual(await sha256(key),data.secret_hash);}
function cleanTitle(value:unknown){return typeof value==='string'?value.trim().slice(0,140):'';}
function fileExt(name:string){const m=name.match(/\.([a-z0-9]{2,5})$/i);return m?m[1].toLowerCase():'mp4';}
const allowed=new Set(['mp4','m4v','mov','webm','mkv','avi']);
async function saveCaption(id:string,content:string){
  if(!content.startsWith('WEBVTT')||content.length>1024*1024)throw Error('Invalid subtitle file');
  const path=id+'.vtt';const {error}=await db.storage.from('watch-captions').upload(path,encode.encode(content),{contentType:'text/vtt; charset=utf-8',upsert:true,cacheControl:'3600'});
  if(error)throw error;
  const result=await db.from('watch_videos').update({caption_path:path}).eq('id',id);
  if(result.error)throw result.error;
  return path;
}

Deno.serve(async(request:Request)=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return err('Method not allowed',405);
  if(Number(request.headers.get('content-length')||0)>2_500_000)return err('Request too large',413);
  if(!(await isAdmin(request.headers.get('x-upload-key')||'')))return err('Invalid upload key',401);
  try {
    const data=await request.json();const action=String(data.action||'');
    if(action==='ping')return json({ok:true});
    if(action==='create'){
      const filename=String(data.filename||'').trim().slice(0,220);
      const title=cleanTitle(data.title)||filename;
      const size=Number(data.size);
      const ext=fileExt(filename);
      if(!filename||!title||!allowed.has(ext)||!Number.isSafeInteger(size)||size<1||size>50*1024**3)return err('Unsupported video or file size');
      const mime=(typeof data.mime==='string'&&data.mime.startsWith('video/'))?data.mime:'video/mp4';
      const id=crypto.randomUUID();const path=`${id}/video.${ext}`;
      const inserted=await db.from('watch_videos').insert({id,title,filename,bytes:size,mime,object_path:path,status:'uploading'});
      if(inserted.error)return err(inserted.error.message,500);
      const signed=await db.storage.from('watch-videos').createSignedUploadUrl(path);
      if(signed.error||!signed.data?.token){await db.from('watch_videos').delete().eq('id',id);return err(signed.error?.message||'Could not prepare upload',500);}
      return json({id,object_path:path,token:signed.data.token});
    }
    const id=String(data.id||'');if(!/^[0-9a-f-]{36}$/i.test(id))return err('Invalid video ID');
    const found=await db.from('watch_videos').select('*').eq('id',id).maybeSingle();
    if(found.error)return err(found.error.message,500);
    if(!found.data)return err('Video not found',404);
    const row=found.data;
    if(action==='finish'){
      const listed=await db.storage.from('watch-videos').list(`${id}`,{limit:25});
      if(listed.error)return err(listed.error.message,500);
      const filename=row.object_path.split('/').pop();
      if(!listed.data?.some(file=>file.name===filename))return err('Video upload has not completed',409);
      let thumbnailPath=row.thumbnail_path;
      const thumbnail=String(data.thumbnail||'');
      if(thumbnail.startsWith('data:image/jpeg;base64,')&&thumbnail.length<1_500_000){
        const bytes=Uint8Array.from(atob(thumbnail.substring('data:image/jpeg;base64,'.length)),char=>char.charCodeAt(0));
        thumbnailPath=id+'.jpg';
        const uploaded=await db.storage.from('watch-thumbnails').upload(thumbnailPath,bytes,{contentType:'image/jpeg',upsert:true,cacheControl:'3600'});
        if(uploaded.error)throw uploaded.error;
      }
      const duration=Math.min(Math.max(Number(data.duration)||0,0),24*60*60);
      const updated=await db.from('watch_videos').update({duration_seconds:duration,thumbnail_path:thumbnailPath,status:'ready'}).eq('id',id);
      if(updated.error)throw updated.error;
      if(typeof data.caption==='string'&&data.caption.length)await saveCaption(id,data.caption);
      return json({id,ok:true});
    }
    if(action==='caption'){
      if(row.status!=='ready')return err('Video is not published');
      await saveCaption(id,String(data.caption||''));return json({ok:true});
    }
    if(action==='rename'){
      const title=cleanTitle(data.title);if(!title)return err('Title required');
      const result=await db.from('watch_videos').update({title}).eq('id',id);
      if(result.error)throw result.error;return json({ok:true});
    }
    if(action==='delete'){
      await db.storage.from('watch-videos').remove([row.object_path]);
      if(row.thumbnail_path)await db.storage.from('watch-thumbnails').remove([row.thumbnail_path]);
      if(row.caption_path)await db.storage.from('watch-captions').remove([row.caption_path]);
      const deleted=await db.from('watch_videos').delete().eq('id',id);
      if(deleted.error)throw deleted.error;return json({ok:true});
    }
    return err('Unknown action',404);
  }catch(ex){return err(ex instanceof Error?ex.message:'Server error',500);}
});
