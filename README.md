# kg-miniapp-server

基于 Express + MySQL 的后端服务，容器端口 8080，适配微信云托管（callContainer 或公网域名）。

## 本地运行
```bash
npm install
npm start
# http://localhost:8080/api/health
```

## Docker 构建（生产）
项目根已有 `Dockerfile`（Node 20，PORT=8080），可直接构建：
```bash
docker build -t kg-server .
docker run -p 8080:8080 kg-server
```

## 环境变量（云托管）
- `MYSQL_ADDRESS`：host:port（如 10.x.x.x:3306）
- `MYSQL_USERNAME`：数据库用户名
- `MYSQL_PASSWORD`：数据库密码
- `MYSQL_DATABASE`：数据库名

> 同时兼容 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` 命名。

## 路由概览
- `GET /api/health`
- `GET /api/search`
- `GET /api/patent/:pub_no`
- `GET /api/graph/neighbor`
- `GET /api/graph/path`
- `GET /api/stats/domain/applications`
- `GET /api/stats/domain/grant_rate`
- `GET /api/stats/org/count`
