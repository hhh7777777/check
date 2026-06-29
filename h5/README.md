# H5 参会服务网页版

独立的 H5 网页版本，可通过链接直接访问，无需安装微信小程序。

## 适用场景

- 外国用户无法使用微信
- 通过短信/邮件发送链接直接访问
- 临时参会人员快速查看信息

## 功能

- 手机号验证登录
- 会议介绍查看
- 会议日程查看
- 电子参会证（含二维码）
- 参会路线查看
- 座位信息查看
- 图文直播查看

## 部署步骤

### 1. 获取云开发环境 ID

1. 登录 [微信云开发控制台](https://console.cloud.tencent.com/tcb)
2. 复制环境 ID

### 2. 配置环境 ID

编辑 `app.js` 文件，修改 `CONFIG.envId`：

```javascript
const CONFIG = {
  envId: 'your-env-id',  // 替换为你的环境 ID
  functionName: 'eventApi'
}
```

### 3. 部署到静态托管

#### 方案一：腾讯云 CloudBase 静态托管

1. 在云开发控制台开启「静态网站托管」
2. 将 `h5` 文件夹内容上传到托管目录
3. 获取访问链接

#### 方案二：其他静态托管

支持任何静态文件托管服务：
- Vercel
- Netlify
- GitHub Pages
- 阿里云 OSS + CDN
- 腾讯云 COS + CDN

### 4. 配置云函数权限

确保云函数 `eventApi` 允许 Web 端调用：

1. 进入云函数 `eventApi` 设置
2. 开启「登录授权」
3. 添加 Web 安全域名（你的 H5 访问域名）

## 本地测试

```bash
cd h5
npx serve .
# 或
python -m http.server 8080
```

访问 `http://localhost:8080`

## 文件结构

```
h5/
├── index.html    # 主页面
├── style.css     # 样式文件
├── app.js        # 应用逻辑
└── README.md     # 说明文档
```

## 注意事项

1. 首次使用需要配置云开发环境 ID
2. 确保云函数已部署且正常运行
3. Web 域名需要在云开发控制台配置安全域名
4. 建议使用 HTTPS 协议
