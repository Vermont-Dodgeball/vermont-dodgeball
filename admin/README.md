# Content editing setup (Sveltia CMS)

The site's editable content lives in [`data/about.json`](../data/about.json)
and [`data/photos.json`](../data/photos.json). Rather than editing those by
hand, editors use the CMS at **https://vtdodgeball.com/admin/**, which saves
changes by committing to this repository.

Everything here is free — no paid services.

## Why the extra setup step

Logging in with GitHub requires exchanging an OAuth code for a token, and that
exchange needs a server holding a client secret. GitHub Pages only serves
static files, so it can't do it. The fix is a tiny (free) Cloudflare Worker
that performs only that exchange. It never sees or stores site content.

**Until the steps below are completed, the login button at `/admin/` will not
work.** The rest of the site is unaffected.

## One-time setup

### 1. Deploy the auth worker

Deploy [`sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth) to
Cloudflare Workers — the repo has a one-click deploy button, or clone it and
run `wrangler deploy`. A free Cloudflare account is enough.

Copy the resulting Worker URL, which looks like:

```
https://sveltia-cms-auth.<your-subdomain>.workers.dev
```

### 2. Register a GitHub OAuth app

Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
(or https://github.com/settings/developers) and fill in:

| Field | Value |
| --- | --- |
| Application name | `Vermont Dodgeball CMS` (any name) |
| Homepage URL | `https://vtdodgeball.com` |
| Authorization callback URL | `<YOUR_WORKER_URL>/callback` |

The callback URL **must** end in `/callback`. Save, then generate a client
secret. Keep the Client ID and Client Secret handy — the secret is shown only
once.

### 3. Give the worker its credentials

In the Cloudflare dashboard, open the Worker → **Settings → Variables**, and
add:

| Name | Value | Notes |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | from step 2 | |
| `GITHUB_CLIENT_SECRET` | from step 2 | mark as **encrypted** |
| `ALLOWED_DOMAINS` | `vtdodgeball.com` | optional; stops other sites using your worker |

Redeploy the Worker so the variables take effect.

### 4. Point the CMS at the worker

In [`config.yml`](config.yml), uncomment `base_url` and set it to the Worker
URL (no trailing slash, no `/callback`):

```yaml
backend:
  name: github
  repo: Vermont-Dodgeball/vermont-dodgeball
  branch: main
  base_url: https://sveltia-cms-auth.<your-subdomain>.workers.dev
```

Commit and push. Visit https://vtdodgeball.com/admin/ and "Sign in with
GitHub" should now work.

### 5. Give editors access

Anyone editing content needs **write access to this repository** — the CMS
commits as them. Add them under
**Repo → Settings → Collaborators** with the *Write* role. They do not need to
know Git; they only ever see the CMS.

## Using the CMS

At https://vtdodgeball.com/admin/ there are two sections:

- **About Page** — the hero tagline and the main body text. The body is a
  rich-text editor (bold, links, etc.); no Markdown syntax required.
- **Photo Gallery** — add, remove, reorder, and caption gallery photos.
  Uploaded images go to `assets/images/uploads/`.

Saving publishes immediately: it commits to `main`, and GitHub Pages
republishes the site within a minute or so. There is no separate deploy step.

Because every change is a Git commit, anything can be undone from the repo's
history.

## Maintenance

The CMS version is pinned in [`index.html`](index.html)
(`@sveltia/cms@0.185.0`). Sveltia is pre-1.0 and still changing, so the pin is
deliberate — it prevents an upstream release from breaking the editor without
warning. To upgrade, bump the version in that URL and confirm `/admin/` still
loads.
