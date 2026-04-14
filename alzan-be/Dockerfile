FROM node:22-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY . .

RUN CI=true pnpm install --frozen-lockfile
 
RUN pnpm run build

FROM node:22-alpine AS deploy

RUN addgroup -S alzan && adduser -G alzan -S alzan
WORKDIR /usr/src/app

COPY --from=build --chown=alzan:alzan /usr/src/app/package.json /usr/src/app/
COPY --from=build --chown=alzan:alzan /usr/src/app/dist /usr/src/app/dist/
COPY --from=build --chown=alzan:alzan /usr/src/app/node_modules/ /usr/src/app/node_modules/

USER alzan

EXPOSE 8080

CMD ["node", "dist/main"]
