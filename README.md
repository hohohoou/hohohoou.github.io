# hoho — 经历收藏瓶

I'm hoho—a creator here for winding roads, good games, and turning “what if?” into something real.

一个以针织花园和收藏瓶为入口的个人网站。打开瓶子，通过六枚徽章探索教育、实习、项目、支教、日常和音乐；正文以纸张和彩铅插画呈现。

## 体验

- 完整三维花园、人物、瓶子与章节徽章。
- 点击章节或直接滚动阅读；实习与项目的小徽章随对应经历出现。
- 桌面与手机布局、键盘入口及减少动态偏好支持。
- 明亮的骑车加载页，完整三维就绪后进入。

## 本地运行

使用 Node.js **24.19.0** 和 pnpm **11.19.0**。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`dev` 和 `build` 都会先还原模型分片并检查哈希，无需下载额外私有素材。默认构建使用仓库中的优化贴图。只有重新生成图片时，才需要 Python、Pillow 和 NumPy。

```sh
pnpm check
pnpm build
pnpm test
pnpm pages:package
pnpm preview
```

部分测试读取生产产物，所以先构建再运行测试。`dist/client` 是本地预览与验证产物；`dist/pages` 是剔除构建证据后的 Pages 发布目录。两者都不提交到 Git。

## 部署

仓库使用 GitHub Pages 的标准分支发布：`main` 保存精简源码，`gh-pages` 仅保存经过构建和测试的 `dist/pages` 内容。Pages 的 Source 设为 **Deploy from a branch → gh-pages → / (root)**。

更新源码后，先运行上面的检查、构建、测试和打包命令，再将 `dist/pages` 的内容提交到 `gh-pages`；该分支更新后 Pages 自动发布。只推送 `main` 不会改变线上网站。

正式域名配置为 `https://hohoportfolio.com/`，本次切换仍待 DNS 生效和 HTTPS 验收；默认地址 `https://hohohoou.github.io/` 会随 Pages 的自定义域名配置跳转。资源路径按根目录站点设计；若复制到 `/<repository>/` 项目站点，需要同时适配应用资源地址和构建预加载路径。

`public/CNAME` 保存正式域名，并随构建进入发布目录；更新 `gh-pages` 时保留该文件。域名在 Pages 设置中绑定，DNS 由域名服务商配置。仓库不包含原托管平台配置、验证记录或账号资料。网站可访问性和完整三维加载速度需要在目标网络分别验证。

## 技术与目录

React、TypeScript、Vite、Three.js、React Three Fiber。网站为静态应用，音乐试听依赖外部音频链接。

| 目录 | 用途 |
| --- | --- |
| `src/` | 页面、文案、三维交互；内容集中在 `src/content.ts` |
| `public/assets/` | 当前素材、模型、字体与字体许可 |
| `assets/` | 优化模型贴图和素材清单 |
| `release-assets/` | 构建所需模型分片，脚本会还原并核对哈希 |
| `scripts/` | 模型、图片与静态发布构建 |
| `tests/` | 资源完整性与关键构建行为验证 |

项目关键节点见 [MILESTONES.md](MILESTONES.md)。仓库从确认版本开始，不收录逐轮草稿、私人参考素材和完整原始设计工程。

## 使用许可

本项目尚未授予开源许可，公开展示不代表授权复制使用个人素材。第三方字体遵循随附的许可证。
