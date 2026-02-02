# 使用官方 Node.js 映像
FROM node:18-alpine

# 設定工作目錄
WORKDIR /app

# 複製 package.json
COPY package*.json ./

# 安裝依賴
RUN npm install --production

# 複製源碼
COPY . .

# 創建數據目錄
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 3377 6677

# 啟動命令
CMD ["node", "src/server.js"]
