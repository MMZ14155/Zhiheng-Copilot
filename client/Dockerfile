# 构建阶段：安装依赖并产出 dist
FROM docker.1ms.run/library/node:20-alpine AS build
WORKDIR /app

# 优先利用镜像层缓存：仅当依赖清单变化时才重新安装
COPY package.json package-lock.json* ./
# 仓库默认不提交 package-lock.json（见根 .gitignore）：存在时走 npm ci 保证可复现，否则退回 npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# 运行阶段：nginx 托管静态文件并反代 /api
FROM docker.1ms.run/library/nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
