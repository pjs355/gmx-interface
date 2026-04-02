FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare yarn@3.1.0 --activate
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare yarn@3.1.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN NODE_OPTIONS=--max-old-space-size=8192 yarn build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
