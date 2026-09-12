# euclid-web: the Angular bundle, served by nginx, with the gateway reverse-proxied behind /euclid.
#
# Build from the repository root:
#   docker build -f docker/Dockerfile -t euclid-web .
#   docker run -p 8080:80 -e EUCLID_GATEWAY=https://euclid:5566 euclid-web
#
# EUCLID_GATEWAY is where the gateway is reachable from inside the container; 5566 is the default in
# euclid.json, and https because euclid.json enables TLS on it by default. It is substituted into
# nginx.conf at start rather than baked in, so one image serves every environment.

FROM node:24-alpine AS build

WORKDIR /app

# The manifests first, so a change to the sources does not reinstall the dependencies.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build -- --configuration docker

FROM nginx:alpine

COPY --from=build /app/dist/euclid-web/browser /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/templates/default.conf.template

# nginx:alpine expands /etc/nginx/templates/*.template with envsubst on start, which is what fills in
# EUCLID_GATEWAY. Only that one variable, so nginx's own $host and $uri survive the substitution.
ENV EUCLID_GATEWAY=https://localhost:5566
ENV NGINX_ENVSUBST_FILTER=EUCLID_GATEWAY

EXPOSE 80
