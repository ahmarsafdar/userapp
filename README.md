# Ahmar Safdar — Portfolio

The portfolio website of Ahmar Safdar, a freelance video editor from Faisalabad, Pakistan.

It is a static site: plain HTML, CSS and JavaScript with no build step.

| File | What it is |
| --- | --- |
| `index.html` | Home page: hero, scrolling services band, “The good stuff” film cards, “Made for the scroll” reels, about, services and contact. Films play in a pop-up player |
| `vanta.html` | VANTA case study |
| `films.json` | The list of films shown on the home page, in display order |
| `assets/owner.js` | Owner mode for adding and removing films from the live site |

## Adding films from the website (owner only)

1. Open your live site with `#owner` at the end of the address, e.g. `https://ahmarsafdar.github.io/userapp/#owner`.
2. Paste a GitHub key. Make it at [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):
   - Under **Repository access**, choose **Only select repositories → userapp**.
   - Under **Permissions**, give **Contents** "Read and write" access.

   The key stays in that browser only, so do this once on each device you use.
3. Click **+ Add film** and choose an MP4. Wide videos go in "The good stuff" and vertical ones go in "Made for the scroll".
4. Slide to pick the cover frame, then add a title and type.
5. To take a film down, click the **×** on it.

Each change is saved to this repository as one commit. GitHub Pages republishes the site about a minute later.

Visitors never see the owner buttons. Without a key that can write to this repository, nothing can be changed.

**Video tips:**
- Export MP4 (H.264) at 1080p or 720p, around 5–8 Mbit/s.
- The limit is 50 MB per video; smaller files load faster for visitors.

## Preview locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. The film list is loaded from `films.json`, so open the site through a server rather than double-clicking `index.html`.

## Publish

**GitHub Pages:**

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Pick the default branch and the `/ (root)` folder.

Owner mode saves to the default branch, so Pages must publish from that branch for new films to appear.

## Editing by hand

- **Films:** edit `films.json`. Each film has an `id`, `title`, `short` (card label), `type`, `length`, `format` (`wide` or `vertical`), `src` and `poster`.
  - Cards appear in list order and cycle through pink, blue, orange, green and white.
  - `"link"` adds a "Case study" link to that card.
- **Instagram / YouTube buttons:** uncomment them in the contact section of `index.html` and paste in your links.
- **Contact form:** opens the visitor's email app with the enquiry addressed to the email in the form's `action`.
- **Colours and fonts:** the variables at the top of `assets/style.css`.
