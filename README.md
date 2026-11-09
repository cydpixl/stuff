# Watch — public video links

A no-brand, OLED-black browser video library and fullscreen viewer hosted on GitHub Pages. Videos are stored in Supabase Storage, not GitHub.

## Included

- Public shareable video pages (`?v=<video-id>`), no viewer sign-in
- TUS chunked and retried uploads using 6 MiB chunks, with upload progress
- Automatic browser-generated JPEG thumbnails (fallback artwork for unsupported codecs)
- Video library, search, rename, delete, and download
- Fullscreen player, picture-in-picture, 10-second skip, volume, seek, keyboard shortcuts, original quality, adjustable playback speed, and Chromecast prompt where supported
- `.srt` and `.vtt` subtitle import; admin import is persisted for all viewers
- Key-protected upload management and public read-only metadata, with Row Level Security enabled

## Requirements / real limits

GitHub Pages hosts only static files. `supabase/functions/video-admin/index.ts` handles upload authorization. Video data is stored in the `watch-videos` public Supabase bucket. The global Storage file-size and quota limits **still apply**. Supabase Free projects have a 50 MB per-file maximum and limited total storage. To upload a 2.5 GB file, the Supabase project must have a paid storage plan and the **global file size limit** must be raised above 2.5 GB in Supabase Storage Settings. The browser also needs to support the codec: MP4 encoded in H.264 video and AAC audio is recommended. There is no server-side transcoder or adaptive bitrate ladder; the Quality menu deliberately shows **Original** only.

## Deployment

1. Run `supabase-setup.sql` against an existing Supabase project (isolated `watch_*` tables and buckets).
2. Deploy `supabase/functions/video-admin/index.ts` as public Edge Function `video-admin` with JWT verification off; the function checks `x-upload-key` against a SHA-256 hash in an RLS-protected table.
3. Update the project ref and publishable key in `app.js` if using a different Supabase project. **Never put a service-role key in public JS.**
4. Enable GitHub Pages with the included Actions workflow or choose the repository root as the publishing source.
5. Open the frontend site, click the upload icon, enter the owner upload key once, then select a video. Uploads become publicly viewable only after completion.

This app is intentionally a single-page client. Public watch links use query parameters so refreshing a watch page works on GitHub Pages without server-side routing.
