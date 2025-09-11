FROM node:20

WORKDIR /app

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8080

COPY package.json ./
COPY package-lock.json* ./

RUN npm install --production && npm cache clean --force

RUN ln -fs /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo ${TZ} > /etc/timezone \
    && apt-get update && apt-get install -y ca-certificates \
    && mkdir -p /app/cert \
    && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 8080

CMD ["node", "src/app.js"]


