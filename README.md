# 内部活动参会服务

面向约 200 人内部活动的轻量方案，不依赖自建服务器、MySQL、Nginx 或自有域名。

## 架构

```text
微信小程序 miniapp
  └─ wx.cloud.callContainer()
       └─ 微信云托管 cloudrun（Node.js + Express）
            ├─ 微信云数据库
            └─ 微信云存储

CloudBase 静态网站托管 admin-web/dist
  └─ HTTPS + JWT
       └─ 微信云托管 cloudrun
```

| 目录 | 用途 | 部署位置 |
| --- | --- | --- |
| `miniapp/` | 原生微信小程序 | 微信小程序 |
| `cloudrun/` | Node.js + Express API | 微信云托管 |
| `admin-web/` | Vue 3 + Element Plus 管理后台 | CloudBase 静态网站托管 |

系统不包含在线报名、扫码签到、签到统计和支付。

## 数据

请在同一云开发环境中创建以下集合：

- `activity`：活动介绍、路线、地图、联系方式
- `schedules`：会议日程
- `attendees`：参会人员
- `live_images`：图文直播图片
- `admins`：管理员

地图图片保存在云存储的 `event/maps/`，直播图片保存在 `event/live/`。数据库安全规则应禁止客户端直接读写敏感集合；所有数据访问统一经过云托管后端。

管理员记录示例：

```json
{
  "username": "admin",
  "password_hash": "密码的 SHA-256 值",
  "role": "admin"
}
```

不要在代码中保存 AppSecret、JWT 密钥或管理员明文密码。

## 本地运行

要求 Node.js 18 或更高版本。

### 后端

```bash
cd cloudrun
npm install
```

配置环境变量后启动：

```bash
WX_ENV_ID=你的云环境ID
WX_APPID=你的小程序AppID
WX_APPSECRET=仅本地通过微信开放 API 访问数据库时需要
JWT_SECRET=至少32位随机字符串
CORS_ORIGINS=http://localhost:5173
PORT=3000
npm run dev
```

`CORS_ORIGINS` 支持英文逗号分隔的多个完整 Origin。留空适合本地联调，生产环境必须配置成实际后台静态托管域名。

健康检查：`GET http://localhost:3000/health`。

### 管理后台

`admin-web/.env.development` 默认使用 `/api`，Vite 会代理到 `http://localhost:3000`。如需修改后端地址，可设置 `VITE_CLOUDRUN_URL`。

```bash
cd admin-web
npm install
npm run dev
```

后台登录成功后将 JWT 保存到 `localStorage`；Axios 拦截器会自动发送：

```http
Authorization: Bearer <token>
```

### 小程序

编辑 `miniapp/config.js`：

```js
module.exports = {
  envId: '你的云环境ID',
  serviceName: '你的云托管服务名',
  apiPrefix: '/api/miniapp'
}
```

然后用微信开发者工具直接导入 `miniapp/` 目录。该目录内的 `project.config.json` 将 `miniprogramRoot` 设为空字符串，`app.json` 就位于项目根目录。小程序通过 `wx.cloud.callContainer()` 调用云托管，不使用公网 Axios 地址。

参会人查询必须同时提交姓名和手机号后四位；后端不会提供全量公开查询。

## 部署 cloudrun 到微信云托管

1. 在微信云开发控制台创建云托管服务。
2. 构建目录选择 `cloudrun/`；容器监听 `PORT` 环境变量。
3. 配置 `WX_ENV_ID`、`WX_APPID`、`WX_APPSECRET`、`JWT_SECRET` 和 `CORS_ORIGINS`。
4. 部署后确认 `/health` 返回 `status: ok`。
5. 记录服务的 HTTPS 公网访问地址，供管理后台使用。
6. 在云开发环境中将该服务与小程序关联，并将服务名写入 `miniapp/config.js`。

生产环境务必使用随机的 `JWT_SECRET`，并将 `CORS_ORIGINS` 限制为后台真实域名，例如：

```text
https://你的环境静态网站域名
```

## 构建并部署管理后台

生产构建前编辑 `admin-web/.env.production`：

```env
VITE_API_BASE_URL=https://你的云托管公网域名/api
```

注意管理后台是普通网页，不能使用 `wx.cloud.callContainer()`。

构建：

```bash
cd admin-web
npm install
npm run build
```

产物位于 `admin-web/dist/`。

安装 CloudBase CLI 并登录：

```bash
npm install -g @cloudbase/cli
tcb login
```

部署静态站点：

```bash
cd admin-web
tcb hosting deploy dist -e 你的云环境ID
```

可在 CloudBase 控制台的“静态网站托管”页面查看默认访问域名和部署文件。首次得到访问域名后，把完整 Origin 写入云托管的 `CORS_ORIGINS`，重新部署或重启服务。

也可以用 CLI 查看状态和默认访问域名：

```bash
tcb hosting detail -e 你的云环境ID
```

Vue Router 使用 history 模式。若静态托管环境没有配置 SPA 回退，请将所有未知路径回退到 `/index.html`，否则直接刷新后台子页面会出现 404。

## API 与功能

公开小程序接口：

- 活动介绍、日程和图文直播读取
- 姓名 + 手机号后四位查询参会信息

JWT 管理接口：

- 管理员登录
- 活动信息、路线地图与联系方式维护
- 日程增删改查
- 参会人员 Excel 导入、查询、编辑、删除和导出
- 图文直播图片上传、排序、显示控制和删除

Excel 建议包含：姓名、手机号、单位、身份类型、座位号、餐桌号、酒店、房间号、用餐地点、备注。

## 上线检查

- `admin-web`: `npm run build`
- `cloudrun`: `node --check index.js`
- 小程序的环境 ID、服务名正确
- 后台 `VITE_API_BASE_URL` 使用 HTTPS 且末尾为 `/api`
- 云托管 `CORS_ORIGINS` 包含静态托管 Origin
- 五个集合已创建并限制客户端权限
- 地图和直播图片能写入云存储
- JWT 未提交到仓库，默认管理员密码已更换
- 姓名 + 手机号后四位查询、Excel 导入导出已实测
