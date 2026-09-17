# TV Console setup

The TV client is intentionally separated from player-private data.

## Supabase

Project: `chronicles-world`
Project ref: `hkgcftaghmxnxhrjfyil`

Required frontend variables:

```text
VITE_SUPABASE_URL=https://hkgcftaghmxnxhrjfyil.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>
```

Never put a Supabase service-role key in the browser or in Git.

## TV account

1. In Supabase open Authentication → Users.
2. Create a dedicated email/password user for the TV, for example `tv@your-domain`.
3. After the user exists, set that user's profile role to `tv` in SQL Editor:

```sql
update public.profiles p
set role = 'tv', display_name = 'TV'
from auth.users u
where p.id = u.id
  and u.email = 'tv@your-domain';
```

The profile is created automatically when a new Auth user is registered.

## Security boundary

TV may read shared world information and events. Player-private state such as gold, hidden goals and intelligence is protected by RLS and is not exposed to the TV role.

The browser receives only the publishable key. Server-side/service-role credentials must never be shipped to the client.

## Render

The repository contains `render.yaml` for a static TV deployment. In Render, create a Blueprint/Web Service from this repository and provide the two `VITE_SUPABASE_*` environment variables.
