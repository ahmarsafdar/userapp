# Ahmar Safdar — Portfolio

The portfolio website of Ahmar Safdar, a freelance video editor from Faisalabad, Pakistan.

It is a static site: plain HTML, CSS and JavaScript with no build step.

| Page | What's on it |
| --- | --- |
| `index.html` | Home page: full-screen film player, 12-film selector, featured films, vertical reels, about, services and contact |
| `vanta.html` | VANTA case study |

## Preview locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly also works.

## Publish

**GitHub Pages:**

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Pick this branch and the `/ (root)` folder.

The site appears at `https://<username>.github.io/<repo>/` within a minute or two.

**Netlify:** drag this folder onto https://app.netlify.com/drop. Netlify also lets you connect a custom domain.

## Editing

- **Films in the selector:** the `film-card` buttons in `index.html`. Each one sets its video, poster, title and meta through `data-*` attributes, and `assets/main.js` reads them.
- **Videos and posters:** `media/films/` (H.264 MP4, 720p) and `media/posters/` (JPG).
- **Instagram / YouTube buttons:** uncomment them in the contact section of `index.html` and paste in your links.
- **Contact form:** opens the visitor's email app with the enquiry addressed to the email in the form's `action`. No server is needed.
- **Colours and fonts:** the variables at the top of `assets/style.css`.
