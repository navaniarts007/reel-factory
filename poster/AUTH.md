# YouTube auth for the factory's own channel (one-time)

The poster uploads Shorts with a refresh token for **your personal channel**
(fbpost's tokens belong to its channels — never reuse those).

1. Google Cloud Console -> APIs & Services -> enable **YouTube Data API v3**.
2. OAuth consent screen: External, app name "Reels Factory", your email. Add scope
   `https://www.googleapis.com/auth/youtube.upload` (+ `youtube.readonly` for the channel guard).
3. Credentials -> Create OAuth client ID (**Desktop app**). Note client ID + secret.
4. Get a refresh token (browser consent as the channel owner), e.g. with fbpost's
   helper pattern (`src/youtube_setup.py` there shows the flow) or any OAuth
   playground with `access_type=offline&prompt=consent`. The token must carry
   the upload scope and never expire unless revoked.
5. Add GitHub secrets on **navaniarts007/reel-factory** (Settings -> Secrets -> Actions):
   `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`, `YT_CHANNEL_ID`
   (your channel ID: youtube.com -> your profile -> Share channel, or YouTube Studio -> Settings -> Channel -> Advanced).
6. Tell the agent "youtube secrets set" — it will run a private-upload test
   (privacy private) before any public Short.

Also still needed for the cloud queue: `SUPABASE_KEY` (service-role key:
Supabase Dashboard -> Project Settings -> API) as a GitHub secret and as
`SUPABASE_KEY=` in the laptop `.env`.
