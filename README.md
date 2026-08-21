# ranbirkumar26.github.io

Personal portfolio of Ranbir Kumar: AI systems, RAG pipelines, computer vision
and robotics.

[Watch Video Resume](https://ranbirkumar26.github.io/#video-resume)

Plain HTML, CSS and JavaScript on the frontend. The portfolio RAG assistant
uses the `portfolio-chat` Supabase Edge Function as its primary backend, with
the zero-dependency Node backend in `server/` as fallback. The contact form uses
the configured portfolio backend endpoint.

Local preview:

```
python3 -m http.server
```

Full backend preview:

```
cp .env.example .env
npm start
```

Open `http://localhost:8787`. The backend serves the site and exposes:

- `POST /api/contact`
- `POST /api/chat`
- `GET /api/messages` with `ADMIN_TOKEN`
- `GET /api/health`

GitHub Pages keeps `https://ranbir-portfolio-backend.onrender.com` as the
fallback portfolio backend origin through the `portfolio-api-base` meta tag.
The chat widget first tries the deployed `bir_portfolio` Supabase Edge Function.

Supabase target:

```
supabase secrets set --project-ref qhnmoaqdvymgpfscqxcw --env-file .env
supabase functions deploy portfolio-contact --project-ref qhnmoaqdvymgpfscqxcw --no-verify-jwt --use-api
supabase functions deploy portfolio-chat --project-ref qhnmoaqdvymgpfscqxcw --no-verify-jwt --use-api
```
