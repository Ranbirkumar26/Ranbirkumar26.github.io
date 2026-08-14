# ranbirkumar26.github.io

Personal portfolio of Ranbir Kumar: AI systems, RAG pipelines, computer vision
and robotics.

Plain HTML, CSS and JavaScript on the frontend. The contact form and portfolio
RAG assistant use a small zero-dependency Node backend in `server/`.

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

If the static site is served separately, set the `portfolio-api-base` meta tag
in `index.html` to the deployed backend origin.
