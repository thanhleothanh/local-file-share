FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM nginx:alpine AS runtime

RUN apk add --no-cache openssl \
    && rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 443
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
