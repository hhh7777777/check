# 内部活动参会服务系统

本项目重构为四端架构：

- `miniapp`：微信小程序
- `h5-web`：H5 备用入口
- `admin-web`：管理后台
- `cloudrun`：微信云托管 Express 后端

当前建议统一使用云环境：

- `cloud1-d3grv9iycce5a2003`

当前云托管服务名：

- `cloud`

## 目录结构

```text
sign/
├─ miniapp/
├─ h5-web/
├─ admin-web/
└─ cloudrun/
```

## 功能范围

系统固定为“多次活动 + 前台永远只显示当前活动”模式。

保留功能：

- 活动信息展示
- 当前活动日程
- 电子参会证查询
- 座位 / 餐序 / 酒店查询
- 联系方式
- 路线说明
- 图文直播
- 后台活动管理
- 后台日程管理
- 后台参会人员导入 / 导出 / 编辑 / 删除

明确不做：

- 报名
- 签到
- 签到统计
- 支付
- 会员系统
- 自建服务器
- MySQL

## 云数据库集合

最终使用下面 5 类集合名的兼容模型：

- `activity`
- `schedule`
- `attendee`
- `live_image`
- `admin`

后端兼容读取旧命名：

- `activities`
- `schedules`
- `attendees`
- `live_images`
- `admins`

## 公共接口

```http
GET  /api/activity
GET  /api/schedules
POST /api/attendee/query
GET  /api/attendee/code/:attendeeCode
GET  /api/live-images
```

说明：

- 前台默认只读取“当前活动”
- 查询接口当前已支持“只输入手机号”
- 手机号支持中国大陆手机号和国际手机号
- 返回结果不暴露完整手机号
- 二维码内容统一为 `PASS:{attendeeCode}`

## 管理接口

```http
POST   /api/admin/login
GET    /api/admin/dashboard
GET    /api/admin/activities
POST   /api/admin/activities
GET    /api/admin/activities/:id
PUT    /api/admin/activities/:id
POST   /api/admin/activities/:id/activate
DELETE /api/admin/activities/:id
GET    /api/admin/activity
PUT    /api/admin/activity
GET    /api/admin/schedules
POST   /api/admin/schedules
PUT    /api/admin/schedules/:id
DELETE /api/admin/schedules/:id
GET    /api/admin/attendees
POST   /api/admin/attendees/import
PUT    /api/admin/attendees/:id
DELETE /api/admin/attendees/:id
GET    /api/admin/attendees/export
POST   /api/admin/live-images
GET    /api/admin/live-images
PUT    /api/admin/live-images/:id
DELETE /api/admin/live-images/:id
POST   /api/admin/upload
GET    /health
```

## 本地关键配置

### 小程序

文件：[miniapp/config.js](/D:/sign/miniapp/config.js)

```js
module.exports = {
  envId: 'cloud1-d3grv9iycce5a2003',
  serviceName: 'cloud'
}
```

要求：

- `envId` 必须和微信开发者工具里能选到的云环境一致
- `serviceName` 必须和云托管真实服务名一致

### 后端环境变量

`cloudrun` 至少需要：

```env
WX_ENV_ID=cloud1-d3grv9iycce5a2003
WX_APPID=你的小程序 appid
WX_APPSECRET=你的小程序 secret
JWT_SECRET=上线必须自定义
CORS_ORIGINS=*
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=admin@123
NODE_ENV=production
PORT=80
```

上线前务必修改：

- `JWT_SECRET`
- `ADMIN_DEFAULT_PASSWORD`

## 启动与构建

### cloudrun

```bash
cd cloudrun
npm install
npm run dev
```

如果本地 PowerShell 禁止执行脚本，请用：

```bash
npm.cmd run dev
```

### admin-web

```bash
cd admin-web
npm install
npm.cmd run build
```

### h5-web

```bash
cd h5-web
npm install
npm.cmd run build
```

## 部署顺序

### 1. 部署 cloudrun 到 cloud1

确认：

- 云环境：`cloud1-d3grv9iycce5a2003`
- 服务名：`cloud`
- 环境变量：`WX_ENV_ID / WX_APPID / WX_APPSECRET / JWT_SECRET`

部署后先验证：

- `GET /health`
- `GET /api/activity`

### 2. 初始化数据

如果后台还没有数据，先执行 seed。

如果你有旧数据，再执行 migrate。

#### seed

目标：

- 创建默认管理员
- 如果还没有任何活动，则补一个默认活动

默认账号：

- 用户名：`admin`
- 密码：取 `ADMIN_DEFAULT_PASSWORD`

#### migrate

目标：

- 把旧字段和旧集合兼容迁移到当前模型
- 保留已存在参会码
- 不迁移签到数据

### 3. 部署 admin-web 到静态托管

构建完成后上传 `admin-web/dist` 到静态托管子目录：

- `admin`

建议实际访问地址直接用：

- `https://<静态托管域名>/admin/index.html#/login`

不要直接访问：

- `/login`
- `/admin`

因为如果静态托管没有配置重写，根路径会 404 或 `NoSuchKey`。

### 4. 部署 h5-web 到静态托管

构建完成后上传 `h5-web/dist` 到静态托管子目录：

- `h5`

建议实际访问地址：

- `https://<静态托管域名>/h5/index.html`

### 5. 配置静态托管到 cloudrun 的 API 路由

如果你希望 `admin-web` 和 `h5-web` 用同域名下的 `/api/...` 调后端，必须额外配置：

- 路径：`/api/*`
- 目标：云托管服务 `cloud`

如果这一步没有配好，前端访问静态托管域名下的 `/api/activity` 时会看到：

- `404 Not Found`
- `NoSuchKey`

这说明请求还在打静态文件，而不是云托管服务。

如果暂时不配 `/api/*` 路由，也可以把前端环境变量 `VITE_API_BASE_URL` 改成云托管公网地址。

## 当前访问建议

### 后台

使用：

- `https://<静态托管域名>/admin/index.html#/login`

### H5

使用：

- `https://<静态托管域名>/h5/index.html`

### 小程序

通过：

- `wx.cloud.callContainer`

## 常见问题

### 1. `Cannot GET /api/activity`

通常表示下面三种情况之一：

- 云托管没启动
- 静态托管 `/api/*` 没有转发到云托管
- `serviceName` 配错

排查顺序：

1. 先看 `/health`
2. 再看 `/api/activity`
3. 如果静态托管域名下返回 `NoSuchKey`，就是没配 API 路由

### 2. `Invalid host`

通常表示：

- 小程序 `envId` 不对
- 小程序 `serviceName` 不对
- 微信开发者工具当前环境和云托管环境不是同一个

### 3. 后台跳到根域名 `/login` 然后 404

原因：

- 后台部署在 `/admin` 子路径
- 但前端用了普通 history 路由

当前仓库已经改成 hash 路由，部署后应访问：

- `https://<静态托管域名>/admin/index.html#/login`

### 4. `Request failed with status code 405`

优先检查：

- 请求方法是否和接口定义一致
- 静态托管是否把 `/api/*` 转发到了 cloudrun
- 是否误把静态托管地址当成了 API 地址

### 5. `routeDone with a webviewId ... is not found`

通常是小程序页面跳转时机问题，优先检查：

- 页面未注册完成就跳转
- `setTimeout + reLaunch`
- 旧页面路由残留

## 验收清单

- `cloudrun` 已启动
- `/health` 返回 200
- `/api/activity` 能返回当前活动
- 后台可从 `/admin/index.html#/login` 打开
- H5 可从 `/h5/index.html` 打开
- 小程序能查询当前活动
- 手机号查询支持国内与国际号码
- 参会二维码内容为 `PASS:{attendeeCode}`

## 当前代码改动说明

已完成的重要调整：

- 小程序云托管环境改为 `cloud1-d3grv9iycce5a2003`
- 小程序服务名改为 `cloud`
- 后台生产环境 API 地址改为 `/api`
- 后台路由改为 hash 模式，避免子路径部署后跳到根域名 `/login`

如果要正式上线，接下来最关键的是：

1. 重新部署 `cloudrun`
2. 重新上传 `admin-web/dist`
3. 重新上传 `h5-web/dist`
4. 配好静态托管 `/api/* -> cloudrun` 路由
5. 再联调 `/health` 和 `/api/activity`
