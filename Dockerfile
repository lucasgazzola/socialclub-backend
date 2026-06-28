# syntax=docker/dockerfile:1

#####################################################################
# Etapa base: Node 22 LTS sobre Alpine + dependencias del sistema
# que Prisma necesita (openssl) en Alpine.
#####################################################################
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /usr/src/app

#####################################################################
# Etapa deps: instala TODAS las dependencias (incluye devDependencies).
# Se reutiliza para desarrollo y para compilar.
#####################################################################
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

#####################################################################
# Etapa dev: usada por docker-compose para desarrollo con hot-reload.
# El código se monta como volumen, por eso acá no se copia src/.
#####################################################################
FROM deps AS dev
COPY prisma ./prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && npx prisma generate
ENV NODE_ENV=development
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]

#####################################################################
# Etapa build: compila la aplicación a JavaScript (dist/).
#####################################################################
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

#####################################################################
# Etapa prod: imagen final liviana, sin herramientas de build.
#####################################################################
FROM base AS prod
ENV NODE_ENV=production
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/prisma ./prisma
COPY --from=build /usr/src/app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && addgroup -S nodejs && adduser -S nestjs -G nodejs
USER nestjs
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main"]
