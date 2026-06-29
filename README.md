# 内部活动参会服务系统

这是一个面向多场内部活动的参会信息服务系统。

前台永远只展示“当前活动”，后台可以维护多场历史活动。

系统包含：

- 微信小程序主入口 `miniapp`
- H5 备用入口 `h5-web`
- 管理后台 `admin-web`
- 微信云托管后端 `cloudrun`

系统不做报名、不做签到、不做支付，不使用自建服务器、MySQL、Nginx 或自有域名。

## 架构

```text
miniapp  -> wx.cloud.callContainer -> cloudrun
h5-web   -> HTTPS API              -> cloudrun
admin-web -> HTTPS API             -> cloudrun
cloudrun -> 微信云数据库 / 微信云存储
```

## 数据集合

云数据库建议准备这 5 个集合：

- `activities`
- `schedules`
- `attendees`
- `live_images`
- `admins`

## 后端启动

前置要求：

- Node.js 18+
- 已配置微信云环境
- 已配置 `WX_ENV_ID`、`WX_APPID`、`WX_APPSECRET`、`JWT_SECRET`

启动命令：

```bash
cd cloudrun
npm install
npm run dev
```

健康检查：

```bash
GET /health
```

后端核心接口：

- `GET /api/activity`
- `GET /api/schedules`
- `POST /api/attendee/query`
- `GET /api/attendee/code/:attendeeCode`
- `GET /api/live-images`

后台接口统一走 `GET /api/admin/*`、`POST /api/admin/*`、`PUT /api/admin/*`、`DELETE /api/admin/*`。

## 初始化与迁移

首次部署建议先初始化管理员和默认活动：

```bash
cd cloudrun
npm run seed
```

如果仓库里还有旧集合或旧字段，执行迁移脚本：

```bash
cd cloudrun
npm run migrate
```

迁移脚本会尽量把旧 `activity / schedule / attendee / live_image / admin` 数据搬到新模型，并保留当前活动体系。

## 管理后台

本地开发：

```bash
cd admin-web
npm install
npm run dev
```

生产构建：

```bash
cd admin-web
npm run build
```

默认后端地址通过 `VITE_API_BASE_URL` 控制。

示例：

```env
VITE_API_BASE_URL=https://你的云托管域名/api
```

后台页面职责：

- 活动列表与当前活动切换
- 当前活动信息维护
- 会议日程管理
- 参会人员 Excel 导入、搜索、编辑、删除、导出
- 图文直播图片管理

## H5 备用入口

这是给外国人员和无微信用户使用的 Vue 3 页面。

本地开发：

```bash
cd h5-web
npm install
npm run dev
```

生产构建：

```bash
cd h5-web
npm run build
```

H5 也使用同一套 API：

```env
VITE_API_BASE_URL=https://你的云托管域名/api
```

H5 默认英文，支持中文切换，页面包含：

- 首页
- 会议介绍
- 会议日程
- 电子参会证查询
- 座位 / 餐序 / 酒店查询
- 参会路线
- 联系方式

## 小程序

`miniapp/config.js` 里保留真实云环境 ID，不要随便改。

当前需要重点确认的是云托管服务名：

```js
module.exports = {
  envId: '你的云环境ID',
  serviceName: 'cloud'
}
```

小程序通过 `wx.cloud.callContainer()` 调后端，不直接访问公网 Axios 地址。

小程序侧入口：

- `pages/index`
- `pages/intro`
- `pages/schedule`
- `pages/badge`
- `pages/seating`
- `pages/route`
- `pages/live`
- `pages/privacy`

## 云托管部署

部署后端时建议把云托管服务名设为 `cloud`，并配置以下环境变量：

- `WX_ENV_ID`
- `WX_APPID`
- `WX_APPSECRET`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `ADMIN_DEFAULT_USERNAME`
- `ADMIN_DEFAULT_PASSWORD`

推荐做法：

1. 先部署 `cloudrun`
2. 再部署 `admin-web`
3. 再部署 `h5-web`
4. 最后在小程序里确认 `serviceName` 已对齐云托管服务名

静态站点部署示例：

```bash
cd admin-web
npm run build
tcb hosting deploy dist admin -e 你的云环境ID

cd ../h5-web
npm run build
tcb hosting deploy dist h5 -e 你的云环境ID
```

如果你的 CloudBase 托管希望用子路径访问，建议：

- 管理后台：`/admin`
- H5 入口：`/h5`

## 常见问题

如果小程序报：

```text
Cannot GET /api/activity
```

通常优先检查这三项：

1. `cloudrun` 是否已部署并正在运行
2. `miniapp/config.js` 里的 `serviceName` 是否和云托管服务名一致
3. 后端是否真的提供了 `GET /api/activity`

如果出现：

```text
routeDone with a webviewId ... is not found
```

通常是页面栈和跳转时机冲突。先检查是否存在 `setTimeout + reLaunch` 之类的跳转，再确认目标页面都已在 `app.json` 中注册。

## 验收重点

- `cloudrun` 能启动
- `GET /health` 正常
- 小程序能查当前活动
- 后台能切换和维护多场活动
- H5 能打开并查询当前活动信息
- 参会证二维码内容为 `PASS:{attendeeCode}`
## 本地启动补充说明

如果你只是想先把 `cloudrun` 在本机跑起来看健康检查，`JWT_SECRET` 现在会自动使用开发默认值，不会再在启动阶段直接退出。

如果本机还没有配置 `WX_ENV_ID`、`WX_APPID`、`WX_APPSECRET`，后端会跳过启动时的种子初始化，但服务本身仍然可以起来。等你把微信云环境参数补齐后，数据库读写、导入导出、图片上传这些接口就会恢复正常。

生产环境仍然必须配置：

- `WX_ENV_ID`
- `WX_APPID`
- `WX_APPSECRET`
- `JWT_SECRET`
