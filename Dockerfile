FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY src ./src

# The standalone container is served from /. Normal local and Navidrome builds
# retain Vite's /tesla/ default.
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
