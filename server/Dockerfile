# Этап сборки: TS -> один cjs-бандл (все флаги заданы в npm run build,
# tsconfig для esbuild не обязателен)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY src ./src
RUN npm run build

# Рантайм: только бандл, без node_modules
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist/index.cjs ./index.cjs
# /data — том для статистики; создаём заранее с владельцем node, чтобы
# пустой named volume унаследовал права и процесс мог туда писать
RUN mkdir -p /data && chown node:node /data
EXPOSE 3000
USER node
CMD ["node", "index.cjs"]
