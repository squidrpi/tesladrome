# Tesladrome

Tesladrome is a touch-optimized web UI for [Navidrome](https://www.navidrome.org/) and compatible OpenSubsonic servers. It is designed for the Tesla in-car browser, where the usable viewport is limited.

The app is a Vite/React single-page app. It can be run in its own docker container or run on the same origin as Navidrome, for example:

```text
https://navidrome.example.com/tesla/
```

Tesladrome is based on github.com/KarlZeilhofer/tesla-navidrome

## Features

- Designed to be a simple music player for navidrome server with easy album and artist selection.
- Controls and text are large for easier usage when driving and using the Telsa browser.

## Limitations

- Tesla’s browser limits background processing, so automatic track changes may not occur while the browser is not visible.
- Tesla’s Media Miniplayer currently provides only a Stop control for browser audio. Playback controls are included in TeslaDrome and may become available in the Miniplayer if Tesla adds browser support.
- When playback stops, or the final track of an album ends, Tesla may automatically resume the previously selected media source.  This is Tesla behaviour and cannot currently be prevented. Selecting Bluetooth before starting TeslaDrome can work around it.
- Artist and album lists use Previous and Next paging because the Tesla browser has limited available memory.

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
