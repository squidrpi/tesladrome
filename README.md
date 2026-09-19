# Tesladrome

Tesladrome is a touch-optimized web UI for [Navidrome](https://www.navidrome.org/) and compatible OpenSubsonic servers. It is designed for the Tesla in-car browser, where the usable viewport is limited.

The app is a Vite/React single-page app. It can be run in its own docker continaer or run on the same origin as Navidrome, for example:

```text
https://navidrome.example.com/tesla/
```

Tesladrome is based on github.com/KarlZeilhofer/tesla-navidrome

## Features

- Designed to be a simple music player for navidrome server with simple album and artist selection.
- Controls and text are large for easier usage when driving and using the Telsa browser.

## Limitations

- Due to the Tesla browser not allowing processing when in the background next tracks will not play when the browser is not in the foreground. 
- Media Miniplayer does not show playback controls except for stop. This is a Tesla browser limitation. The controls are coded into this app and may work in future if Tesla allows it.
- When stopping a track or it plays the final track in an album Tesla will start playing the last selected media source automatically. This cannot be stopped and is a Tesla design. A workaround is to select bluetooth before starting this app.
- The Prev/Next navigation for Artists and Albums is used as the Tesla browser has limited memory available.

# Installation

Recommend using docker compose, simply set your Navidrome URL in the environment of the docker file.

### Standalone Docker container

Tesladrome runs separately from Navidrome. The container serves the UI at its own root URL and proxies its same-origin `/auth/` and `/rest/` requests to Navidrome. This avoids browser CORS configuration and keeps the app's login state separate.

```bash
mkdir tesladrome && cd tesladrome
curl -O https://raw.githubusercontent.com/squidrpi/tesladrome/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/squidrpi/tesladrome/main/.env.example
# Edit .env and set NAVIDROME_URL, for example http://navidrome:4533
docker compose pull
docker compose up -d
```

Then visit `http://your-server:8080/` (or the value of `TESLADROME_PORT`). `NAVIDROME_URL` must not end with `/`. If Navidrome is in another Compose project or runs on the Docker host, use a URL reachable from this container—for example `http://host.docker.internal:4533` with the appropriate Docker host-gateway configuration.

The Docker image deliberately builds with `/` as its Vite base. The normal `npm run build` path remains `/tesla/`, so the existing in-Navidrome deployment remains unchanged.

If you need to use HTTPS then Caddy can be used as a wrapper.

## Local Development

Install dependencies:

Build the production bundle:

```bash
npm run build
```

## Deployment

### Navidrome subdirectory

The default build is configured for serving under `/tesla/`:

```js
// vite.config.js
base: "/tesla/"
```

The included deployment script builds the app and copies `dist/` to `/var/www/tesla-navidrome`:

```bash
scripts/deploy.sh
```

On the current server this is also exposed through the helper command:

```bash
tesla-navidrome-deploy
```

The production web server must route `/tesla/` to the built static files and proxy the existing Navidrome API paths on the same origin.


## Project Structure

```text
.
|-- Dockerfile
|-- docker-compose.yml
|-- docker/
|   `-- nginx/default.conf.template
|-- index.html
|-- package.json
|-- scripts/
|   `-- deploy.sh
|-- src/
|   |-- main.jsx
|   `-- styles.css
`-- vite.config.js
```
