# Loomic 落地页迁移方案

## 迁移目标

将 Loomic 项目中的营销落地页迁移到 `/Users/a1/Desktop/my-canvas/web`，作为目标项目的首页或独立落地页使用。迁移时优先保留 Loomic 当前落地页的视觉结构、动效节奏、内容编排和转化路径，同时适配目标项目已有的 Next.js 16、React 19、Tailwind CSS 4、Ant Design、zustand 主题系统和路由分组结构。

源项目落地页入口：

```txt
/Users/a1/Desktop/无限画布项目汇总/Loomic/apps/web/src/app/page.tsx
```

目标项目：

```txt
/Users/a1/Desktop/my-canvas/web
```

建议迁移后的文档化目标是：先完整复刻页面体验，再逐步把 Loomic 品牌文案替换为目标项目的“无限画布”品牌表达。

## 当前页面结构

Loomic 的落地页入口是 `apps/web/src/app/page.tsx`，它本身只是一个拼装层。首屏直接加载导航、Hero 和信任数据条，首屏以下区块通过 `next/dynamic` 懒加载。

渲染顺序如下：

```tsx
<FloatingNav />
<main>
  <HeroSection />
  <TrustBar />
  <FeatureShowcase />
  <ShowcaseGallery />
  <HowItWorks />
  <PricingPreview />
  <FinalCTA />
</main>
<LandingFooter />
```

懒加载区块包括：

```tsx
const FeatureShowcase = dynamic(
  () => import("@/components/landing/feature-showcase").then((m) => m.FeatureShowcase),
  { ssr: false },
);

const ShowcaseGallery = dynamic(
  () => import("@/components/landing/showcase-gallery").then((m) => m.ShowcaseGallery),
  { ssr: false },
);

const HowItWorks = dynamic(
  () => import("@/components/landing/how-it-works").then((m) => m.HowItWorks),
  { ssr: false },
);

const PricingPreview = dynamic(
  () => import("@/components/landing/pricing-preview").then((m) => m.PricingPreview),
  { ssr: false },
);

const FinalCTA = dynamic(
  () => import("@/components/landing/final-cta").then((m) => m.FinalCTA),
  { ssr: false },
);

const LandingFooter = dynamic(
  () => import("@/components/landing/landing-footer").then((m) => m.LandingFooter),
  { ssr: false },
);
```

## 目标项目现状

目标项目是一个独立的 Next.js 应用，首页目前在：

```txt
src/app/(user)/page.tsx
```

目标项目当前使用路由分组：

```txt
src/app/(user)
src/app/(admin)
```

`src/app/(user)/layout.tsx` 会为用户侧页面加上 `AppTopNav`，并使用如下外层布局：

```tsx
<div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
  <AppTopNav />
  <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
</div>
```

`src/app/globals.css` 里也有一组全局布局限制：

```css
html,
body {
  height: 100%;
  overflow: hidden;
}
```

这两个点对画布应用很合适，但对营销落地页有明显影响：Loomic 落地页需要整个页面纵向滚动，顶部导航也由 `FloatingNav` 自己负责。如果直接把 Loomic 落地页放进当前 `(user)` layout，页面会出现滚动受限、双导航、首屏高度异常等问题。

因此迁移时建议新增一个单独的落地页路由分组，避免受用户工作台布局影响。

推荐结构：

```txt
src/app/(landing)/page.tsx
src/app/(landing)/layout.tsx
src/components/landing/*
public/images/showcase/*
```

如果希望落地页就是根路径 `/`，`src/app/(landing)/page.tsx` 可以直接提供根首页。Next.js 的路由分组不会进入 URL，所以 `(landing)/page.tsx` 对应的仍然是 `/`。

同时需要处理当前已有的 `src/app/(user)/page.tsx`。Next 不允许两个路由分组同时提供同一个 `/` 页面，因此需要二选一：

1. 将当前 `src/app/(user)/page.tsx` 移到一个具体路径，例如 `src/app/(user)/home/page.tsx`。
2. 直接用 Loomic 落地页替换当前 `src/app/(user)/page.tsx`，但必须同步调整 `(user)/layout.tsx` 的导航和滚动限制。

推荐选择第 1 种：保留应用首页为营销落地页，把原来的用户首页迁到 `/home` 或 `/dashboard`。

## 需要迁移的文件

### 入口文件

源文件：

```txt
apps/web/src/app/page.tsx
```

目标建议：

```txt
src/app/(landing)/page.tsx
```

迁移要点：

- 保留 `"use client"`。
- 保留 `next/dynamic` 懒加载策略。
- 路径从 `@/components/landing/...` 继续可用，因为目标项目 `tsconfig.json` 已配置 `@/* -> ./src/*`。
- 如果根路径 `/` 已被 `(user)/page.tsx` 占用，需要先移动或删除该页面。

### 落地页组件

源目录：

```txt
apps/web/src/components/landing
```

目标目录：

```txt
src/components/landing
```

需要迁移的文件：

```txt
floating-nav.tsx
hero-section.tsx
trust-bar.tsx
feature-showcase.tsx
showcase-gallery.tsx
how-it-works.tsx
pricing-preview.tsx
final-cta.tsx
landing-footer.tsx
section-header.tsx
motion.tsx
typewriter.tsx
animated-counter.tsx
```

组件职责如下：

| 组件 | 作用 | 迁移注意 |
| --- | --- | --- |
| `FloatingNav` | 顶部悬浮导航、品牌 Logo、锚点导航、主题切换、移动菜单 | 需要替换 `next-themes` 为目标项目的 `useThemeStore`，并处理 `/login` 路径 |
| `HeroSection` | 首屏主视觉、打字机标题、英文副标题、CTA、画布 mockup | 需要迁移 showcase 图片和 landing keyframes |
| `TrustBar` | 4 个统计数据 | 依赖 `AnimatedCounter` 和滚动入场动画 |
| `FeatureShowcase` | 功能展示区，锚点 `#features` | 依赖 showcase 图片和多个视觉子组件 |
| `ShowcaseGallery` | 案例画廊，锚点 `#showcase` | 需要迁移 8 张案例图 |
| `HowItWorks` | 三步流程区 | 依赖 `landing-icon-pulse` keyframe |
| `PricingPreview` | 价格预览区，锚点 `#pricing` | 源代码依赖 `@/components/ui/button`，目标项目没有该文件 |
| `FinalCTA` | 底部转化 CTA | CTA 原路径是 `/register`，目标项目需要确认是否有注册页 |
| `LandingFooter` | 页脚 | 可以保留结构，品牌文案后续替换 |
| `SectionHeader` | 区块标题通用组件 | 直接迁移 |
| `motion.tsx` | 动效 variants 和滚动 reveal 包装 | 需要决定用 `framer-motion` 还是目标项目已有的 `motion/react` |
| `typewriter.tsx` | 打字机 hook 和文字组件 | 依赖 reduced motion hook |
| `animated-counter.tsx` | 数字递增动画 | 依赖 IntersectionObserver 和 motion value |

## 静态资源迁移

Loomic 落地页使用了 `public/images/showcase` 下的图片资源。目标项目当前没有该目录，需要新增：

```txt
public/images/showcase/showcase-1.jpg
public/images/showcase/showcase-2.jpg
public/images/showcase/showcase-3.jpg
public/images/showcase/showcase-4.jpg
public/images/showcase/showcase-5.jpg
public/images/showcase/showcase-6.jpg
public/images/showcase/showcase-7.jpg
public/images/showcase/showcase-8.jpg
public/images/showcase/showcase-9.jpg
public/images/showcase/showcase-10.jpg
public/images/showcase/showcase-11.jpg
public/images/showcase/showcase-12.jpg
```

源目录：

```txt
/Users/a1/Desktop/无限画布项目汇总/Loomic/apps/web/public/images/showcase
```

目标目录：

```txt
/Users/a1/Desktop/my-canvas/web/public/images/showcase
```

已知引用关系：

| 图片 | 使用位置 |
| --- | --- |
| `/images/showcase/showcase-12.jpg` | Hero mockup 主图 |
| `/images/showcase/showcase-5.jpg` | FeatureShowcase / AI Canvas |
| `/images/showcase/showcase-10.jpg` | FeatureShowcase / 智能对话 |
| `/images/showcase/showcase-11.jpg` | FeatureShowcase / 风格一致 |
| `/images/showcase/showcase-3.jpg` | FeatureShowcase / 精准编辑 |
| `/images/showcase/showcase-1.jpg` 到 `/showcase-8.jpg` | ShowcaseGallery 案例卡 |

## CSS 和动效迁移

源项目把落地页相关 keyframes 集中放在：

```txt
apps/web/src/app/globals.css
```

需要迁移到目标项目的：

```txt
src/app/globals.css
```

建议只迁移落地页相关代码块，不复制源项目全量全局样式。

必须迁移的 class/keyframes：

```txt
landing-gradient-drift-1
landing-gradient-drift-2
landing-hero-float
landing-shimmer
landing-cta-shimmer
landing-nav-cta-glow
landing-icon-pulse
landing-border-shift
landing-orb-drift-1
landing-orb-drift-2
landing-orb-drift-3
landing-float-up
landing-cta-pulse-ring
.dark .landing-hero-glow-1
.dark .landing-hero-glow-2
```

目标项目当前 `html/body` 是不可滚动的。推荐在新增 `src/app/(landing)/layout.tsx` 时，用客户端组件在挂载期间给 `body` 加一个 landing class，例如：

```tsx
"use client";

import { useEffect, type ReactNode } from "react";

export default function LandingLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add("landing-scroll-page");
    return () => document.body.classList.remove("landing-scroll-page");
  }, []);

  return children;
}
```

然后在 `globals.css` 增加：

```css
body.landing-scroll-page {
  overflow: auto;
}

body.landing-scroll-page #__next,
body.landing-scroll-page main {
  min-height: 100%;
}
```

如果 Next App Router 不存在 `#__next`，保留 `body.landing-scroll-page { overflow: auto; }` 即可。关键是解除全局 `overflow: hidden` 对落地页的影响。

更干净的方案是把全局 `html, body { overflow: hidden; }` 移出 `globals.css`，改为只放在应用工作台 layout 的外层容器中。考虑当前画布页已经依赖固定视口，这个改动需要回归测试画布交互。

## 依赖适配

源项目 `apps/web/package.json` 依赖：

```txt
framer-motion
next-themes
lucide-react
class-variance-authority
clsx
tailwind-merge
tw-animate-css
```

目标项目已有：

```txt
lucide-react
motion
class-variance-authority
clsx
tailwind-merge
tw-animate-css
zustand
antd
```

差异：

| 能力 | 源项目 | 目标项目 | 建议 |
| --- | --- | --- | --- |
| 动画 | `framer-motion` | `motion`，已有 `motion/react` 用法 | 优先把落地页 import 从 `framer-motion` 改为 `motion/react`，减少新依赖 |
| 主题 | `next-themes` | `useThemeStore` + `document.documentElement.classList` | 改造 `FloatingNav` 的 `ThemeToggle`，使用目标项目主题 store |
| Button | `@/components/ui/button` | 目标项目没有 `src/components/ui/button.tsx` | 推荐落地页内部改用 Tailwind `<button>`/`<Link>`，或迁移一个兼容 Button |
| 图标 | `lucide-react` | 已存在 | 直接复用 |
| 工具函数 | `@/lib/utils` | 已存在 `cn` | 直接复用 |

### 动画依赖推荐方案

优先使用目标项目已有的 `motion/react`。迁移时把下面的 import：

```tsx
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { type Variants } from "framer-motion";
```

替换为：

```tsx
import { motion, AnimatePresence, useReducedMotion, type Variants } from "motion/react";
```

涉及文件：

```txt
floating-nav.tsx
hero-section.tsx
showcase-gallery.tsx
motion.tsx
typewriter.tsx
final-cta.tsx
animated-counter.tsx
section-header.tsx
feature-showcase.tsx
pricing-preview.tsx
```

如果 `motion/react` 的 API 和源代码中个别 API 不完全一致，再局部调整。目标项目已经有 `motion/react` 实际使用案例：

```txt
src/components/ui/dia-text-reveal.tsx
src/app/(user)/canvas/components/canvas-assistant-panel.tsx
```

### 主题切换推荐方案

源 `FloatingNav` 使用：

```tsx
import { useTheme } from "next-themes";
```

目标项目主题 store：

```txt
src/stores/use-theme-store.ts
```

推荐改成：

```tsx
import { useThemeStore } from "@/stores/use-theme-store";

function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label="切换主题"
      className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
```

也可以复用目标项目已有的：

```txt
src/components/ui/animated-theme-toggler.tsx
```

这样主题切换视觉会更贴合目标项目。

### Button 适配方案

源落地页中 `Button` 主要出现在：

```txt
floating-nav.tsx
pricing-preview.tsx
```

目标项目没有 `src/components/ui/button.tsx`。可选方案：

1. 迁移源项目 `apps/web/src/components/ui/button.tsx`，但它依赖 `@base-ui/react/button`，目标项目没有 `@base-ui/react`。
2. 在目标项目安装 `@base-ui/react` 并迁移 Button。
3. 推荐：只在落地页里把 `Button` 替换为原生 `<button>` / `next/link` + Tailwind class，降低依赖面。

推荐第 3 种。

## 路由和 CTA 适配

源页面 CTA 路径：

| 位置 | 源路径 | 目标建议 |
| --- | --- | --- |
| FloatingNav “开始创作” | `/login` | 目标项目已有 `src/app/(user)/login/page.tsx`，可以保留 `/login` |
| Hero “开始创作” | `/login` | 可保留 `/login`，或改为 `/canvas` |
| Hero “查看案例” | `#showcase` | 保留 |
| Pricing CTA | 多为按钮文案，按当前实现确认 href | 免费版可指向 `/login` 或 `/canvas` |
| FinalCTA “免费开始创作” | `/register` | 目标项目未发现 `/register`，建议改为 `/login` 或 `/canvas` |
| Footer 链接 | 多为占位链接 | 迁移后再统一替换为目标项目实际路径 |

目标项目当前可用用户路径包括：

```txt
/login
/canvas
/image
/video
/assets
/asset-library
/prompts
```

若目标项目没有注册流程，最终 CTA 不应保留 `/register`，否则会跳 404。

## 内容数据迁移

落地页内容主要散落在几个数组中，迁移后可以先保留 Loomic 文案，再统一替换品牌。

需要重点检查的数据数组：

| 文件 | 数据 |
| --- | --- |
| `feature-showcase.tsx` | `FEATURES` |
| `showcase-gallery.tsx` | `GALLERY_ITEMS` |
| `how-it-works.tsx` | `STEPS` |
| `pricing-preview.tsx` | `PLANS` |
| `landing-footer.tsx` | `FOOTER_COLUMNS` |
| `trust-bar.tsx` | `STATS` |

建议替换方向：

| Loomic 表达 | 目标项目表达建议 |
| --- | --- |
| Loomic | 无限画布 |
| AI 设计伙伴 | AI 多模态创作工作台 |
| 设计作品 | 创作项目 / 生成作品 |
| AI Canvas | 无限画布 |
| 品牌设计系统 | 风格资产 / 提示词资产 / 素材库 |
| 像素级控制 | 节点级编辑 / 局部重绘 / 裁剪 / 放大 |

## 推荐迁移步骤

### 第 1 步：准备路由

新增：

```txt
src/app/(landing)/layout.tsx
src/app/(landing)/page.tsx
```

然后处理现有首页冲突：

```txt
src/app/(user)/page.tsx
```

推荐移动为：

```txt
src/app/(user)/home/page.tsx
```

如果目标项目希望登录后进入旧首页，可以后续在登录成功逻辑里跳 `/home`，或者把顶部导航中的首页入口改成 `/home`。

### 第 2 步：复制落地页组件

把源目录：

```txt
apps/web/src/components/landing
```

复制到目标：

```txt
src/components/landing
```

复制后先统一做这些改造：

- `framer-motion` import 改为 `motion/react`。
- 删除 `next-themes` 依赖，改为 `useThemeStore`。
- 删除 `@/components/ui/button` 依赖，改为原生元素或本地轻量按钮。
- 检查所有 `href="/register"`，改为目标项目已有路径。

### 第 3 步：复制图片资源

新增目录：

```txt
public/images/showcase
```

复制源项目中的 `showcase-1.jpg` 到 `showcase-12.jpg`。

### 第 4 步：迁移动效 CSS

从源项目 `apps/web/src/app/globals.css` 中复制落地页 keyframes 到目标项目 `src/app/globals.css`。

不要复制源项目里的 Excalidraw、loading screen、chat markdown 等无关全局样式。

### 第 5 步：处理滚动和布局

确保落地页不受 `(user)/layout.tsx` 的 `AppTopNav` 和 `overflow-hidden` 影响。

推荐新增独立 `(landing)` route group，而不是把落地页塞进 `(user)`。

落地页需要满足：

```txt
页面可纵向滚动
顶部只显示 FloatingNav
锚点 #features / #showcase / #pricing 能平滑滚动
移动端菜单不被父级 overflow 裁切
```

### 第 6 步：品牌和路径替换

第一轮可保持 Loomic 原貌验证迁移成功。第二轮再替换：

```txt
Loomic -> 无限画布
/register -> /login 或 /canvas
价格方案 -> 目标项目实际套餐
Footer 链接 -> 目标项目实际路径
```

### 第 7 步：验证

运行：

```bash
bun install
bun run build
bun run dev
```

目标项目 `package.json` 当前 dev 端口是：

```txt
3002
```

本地访问：

```txt
http://localhost:3002
```

## 验收清单

迁移完成后至少检查：

- 首页 `/` 能正常打开，没有和 `(user)/page.tsx` 发生路由冲突。
- 页面可以纵向滚动，`FloatingNav` 滚动后有背景模糊和边框。
- Hero 首屏图片 `/images/showcase/showcase-12.jpg` 正常显示。
- 打字机标题正常播放，减少动态效果设置下不出现明显闪烁。
- `#features`、`#showcase`、`#pricing` 锚点滚动正常。
- 移动端导航可打开、关闭，链接点击后会收起。
- 明暗主题切换能同步目标项目的 zustand 主题状态。
- FeatureShowcase 的 4 张图片都加载成功。
- ShowcaseGallery 的 8 个案例卡都加载成功。
- FinalCTA 的按钮不会跳到不存在的 `/register`。
- `next build` 通过，没有缺失依赖。
- 浏览器控制台没有 hydration error、图片 404、路由 404。

## 风险点

### 路由冲突

`src/app/(landing)/page.tsx` 和 `src/app/(user)/page.tsx` 都会映射到 `/`。迁移前必须决定哪个页面作为根首页。

### 全局滚动冲突

目标项目当前全局禁用了 `html/body` 滚动。落地页必须解除这个限制，否则页面只能显示首屏或在内部容器中出现不自然滚动。

### 动画库差异

源项目用 `framer-motion`，目标项目用 `motion/react`。大部分 API 相近，但迁移后仍要跑一次 TypeScript 和浏览器验证。

### Button 组件缺失

目标项目没有 `@/components/ui/button`。直接复制落地页会编译失败。需要先替换按钮实现或迁移兼容组件。

### 注册页不存在

源 FinalCTA 链接到 `/register`。目标项目目前只有 `/login`，需要改路径。

### 图片资源缺失

目标项目没有 `public/images/showcase`。不复制图片会导致 Hero 和画廊大量 404。

## 建议落地后的目录快照

最终建议结构：

```txt
src/app/(landing)/layout.tsx
src/app/(landing)/page.tsx
src/app/(user)/home/page.tsx
src/components/landing/animated-counter.tsx
src/components/landing/feature-showcase.tsx
src/components/landing/final-cta.tsx
src/components/landing/floating-nav.tsx
src/components/landing/hero-section.tsx
src/components/landing/how-it-works.tsx
src/components/landing/landing-footer.tsx
src/components/landing/motion.tsx
src/components/landing/pricing-preview.tsx
src/components/landing/section-header.tsx
src/components/landing/showcase-gallery.tsx
src/components/landing/trust-bar.tsx
src/components/landing/typewriter.tsx
public/images/showcase/showcase-1.jpg
public/images/showcase/showcase-2.jpg
public/images/showcase/showcase-3.jpg
public/images/showcase/showcase-4.jpg
public/images/showcase/showcase-5.jpg
public/images/showcase/showcase-6.jpg
public/images/showcase/showcase-7.jpg
public/images/showcase/showcase-8.jpg
public/images/showcase/showcase-9.jpg
public/images/showcase/showcase-10.jpg
public/images/showcase/showcase-11.jpg
public/images/showcase/showcase-12.jpg
```

## 推荐执行策略

推荐按“两阶段迁移”执行：

第一阶段只做结构复刻：

- 建立 `(landing)` route group。
- 迁移组件和图片。
- 修依赖、修主题、修按钮、修滚动。
- 保留 Loomic 文案，先保证视觉和行为完整。

第二阶段做产品化改写：

- 把品牌改成“无限画布”。
- 把功能区和案例区改成目标项目真实能力：图片生成、视频生成、提示词库、素材库、无限画布节点编辑。
- 把价格区改成目标项目真实套餐或暂时隐藏价格。
- 把 CTA 路径统一到 `/login`、`/canvas` 或登录后的工作台路径。

这样做可以把“迁移是否成功”和“文案产品化是否合理”拆开验证，风险最低，也方便后续逐块替换。
