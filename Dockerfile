FROM node:20-alpine

WORKDIR /app

# 安裝生產依賴
COPY package.json package-lock.json ./
RUN npm install --production

# 複製應用程式原始碼
COPY server.js ./
COPY public/ ./public/

# 建立資料目錄（供 db.json 使用）
RUN mkdir -p /app/data

# 環境變數
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
