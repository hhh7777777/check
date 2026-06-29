# 内部活动参会服务系统

这是一个单活动模式的内部活动参会信息系统，包含四个部分：

- 微信小程序 `miniapp`
- H5 备用入口 `h5-web`
- 管理后台 `admin-web`
- 微信云托管后端 `cloudrun`

## 架构

```text
miniapp   -> wx.cloud.callContainer -> cloudrun
h5-web    -> HTTPS API              -> cloudrun
admin-web -> HTTPS API              -> cloudrun
cloudrun  -> 微信云数据库 / 微信云存储
```

## 数据集合

云数据库使用这 5 个集合：

- `activities`
- `schedules`
- `attendees`
- `live_images`
- `admins`

前台永远只显示当前活动，后台可以维护多场历史活动。

## 本地启动

### 1) 启动后端

```bash
cd cloudrun
npm install
npm run dev
```

本地开发时：

- `JWT_SECRET` 没配也能启动，会使用开发默认值
- 如果没配 `WX_ENV_ID / WX_APPID / WX_APPSECRET`，启动阶段会跳过云端种子初始化

建议本地放一个 `.env`，或直接按 `.env.example` 配：

```env
NODE_ENV=development
PORT=3000
WX_ENV_ID=your-cloud-env-id
WX_APPID=your-wechat-appid
WX_APPSECRET=your-wechat-appsecret
JWT_SECRET=change-this-in-production
CORS_ORIGINS=http://localhost:5173,http://localhost:4173
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=admin123
```

健康检查：

```http
GET /health
```

### 2) 启动管理后台

```bash
cd admin-web
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

后台生产构建：

```bash
cd admin-web
npm run build
```

### 3) 启动 H5 备用入口

```bash
cd h5-web
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

H5 生产构建：

```bash
cd h5-web
npm run build
```

H5 默认英文，支持中文切换，支持普通浏览器直接访问。

## 小程序配置

`miniapp/config.js` 中保留真实云环境 ID，`serviceName` 必须和云托管服务名一致。

当前建议值：

```js
module.exports = {
  envId: '你的云环境ID',
  serviceName: 'cloud'
}
```

小程序通过 `wx.cloud.callContainer()` 调后端，不直接访问公网 Axios 地址。

## 后端接口

### 公共接口

```http
GET /api/activity
GET /api/schedules
POST /api/attendee/query
GET /api/attendee/code/:attendeeCode
GET /api/live-images
```

查询参会人请求示例：

```json
{
  "name": "张三",
  "phoneLast4": "8888"
}
```

参会码格式：

```text
PASS:{attendeeCode}
```

例如：

```text
PASS:A202606240001
```

### 管理接口

所有 `/api/admin/*` 接口都需要 JWT 鉴权，只有 `/api/admin/login` 例外。

## 迁移与初始化

### 初始化默认管理员和默认活动

```bash
cd cloudrun
npm run seed
```

### 迁移旧数据

```bash
cd cloudrun
npm run migrate
```

迁移脚本会尽量把旧集合、旧字段、历史记录转换到新的 camelCase 模型，并跳过已经迁移过的数据。

## 部署

### 1) 部署云托管后端

先在微信云开发控制台创建云环境，例如 `event-prod`，并创建云托管服务。

建议云托管服务名：

```text
cloud
```

生产环境必须配置：

- `WX_ENV_ID`
- `WX_APPID`
- `WX_APPSECRET`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `ADMIN_DEFAULT_USERNAME`
- `ADMIN_DEFAULT_PASSWORD`

### 2) 部署管理后台到 CloudBase 静态托管

```bash
cd admin-web
npm run build
tcb hosting deploy dist admin -e 你的云环境ID
```

### 3) 部署 H5 到 CloudBase 静态托管

```bash
cd h5-web
npm run build
tcb hosting deploy dist h5 -e 你的云环境ID
```

建议子路径：

- 管理后台：`/admin`
- H5 入口：`/h5`

### 4) 小程序发布

1. 在微信开发者工具中打开 `miniapp`
2. 检查 `miniapp/config.js`
3. 预览、真机测试
4. 上传代码
5. 提交审核
6. 审核通过后发布

## 常见问题

### 1. 小程序报 `Cannot GET /api/activity`

通常是以下原因之一：

- `cloudrun` 没启动
- `miniapp/config.js` 里的 `serviceName` 没和云托管服务名对齐
- 后端没有提供 `/api/activity`

### 2. 小程序报 `Invalid host`

一般是云托管调用配置不对，优先检查：

- `miniapp/config.js` 的 `envId`
- `miniapp/config.js` 的 `serviceName`
- 云环境是否真的是当前项目所在环境

### 3. 小程序报 `routeDone with a webviewId ... is not found`

这类错误通常和页面跳转时机有关，优先检查是否存在：

- `setTimeout + reLaunch`
- 页面还没注册就跳转

## 验收标准

- `cloudrun` 能启动并通过 `GET /health`
- 后台能登录、编辑活动、维护日程、导入/导出参会人员
- H5 能打开并完成查询
- 小程序能查询当前活动、参会证、座位和路线
- 参会二维码内容统一为 `PASS:{attendeeCode}`

