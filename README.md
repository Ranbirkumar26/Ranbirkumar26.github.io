# ranbirkumar26.github.io

Personal portfolio of Ranbir Kumar: AI systems, RAG pipelines, computer vision
and robotics.

[Watch Video Resume](https://ranbirkumar26.github.io/#video-resume)

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

GitHub Pages uses `https://ranbir-portfolio-backend.onrender.com` as the
portfolio backend origin through the `portfolio-api-base` meta tag.
