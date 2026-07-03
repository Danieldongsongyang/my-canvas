# Studio Issue 6: Cast 参考资产与 variants 迁移实施计划

本文是 Issue 6 的可实施细则。目标不是做一个“批量生图按钮”，而是把 LumenX Studio 第 3 步 Cast 的核心行为迁移到当前项目：

```text
Script 解析
        ↓
Style 定调
        ↓
Cast 生成角色 / 场景 / 道具参考图，并保留 variants
        ↓
Storyboard 基于 Cast 资产生成镜头候选
        ↓
Assembly 选镜头、组装、混音、导出
```

Issue 6 只覆盖 Cast。Storyboard 基于 Cast selected reference image 生成镜头候选属于 Issue 7，不能在 Issue 6 里绕过 Cast 直接做镜头图生成。

## 1. 迁移目标

Issue 6 完成后，当前项目的 Studio Cast 必须具备以下行为：

- 每个 `StudioCharacter` / `StudioScene` / `StudioProp` 都有可编辑的图像生成 prompt 初稿。
- 每个角色、场景、道具都可以生成参考图。
- 同一个实体可以多次生成，每次生成的新图都进入 variants 池。
- 每个实体最多只有一个 selected reference image。
- 未选中的生成图保留为 candidate variants，不自动丢弃。
- 首次生成成功时自动选第一张为 selected，其余为 candidate。
- 后续生成不会覆盖 selected，只追加 candidate，除非用户明确选择某个 candidate 为主参考图。
- 生成出来的图片必须先进入当前项目统一素材库 asset，再把 `assetId` 写入 Studio 的 `assetRefs`。
- Style 必须参与 Cast 生成，并且 effective prompt 必须可见或写入生成快照。

不做：

- 不做 Storyboard 镜头图生成。
- 不做视频、运动参考、TTS、混音或导出。
- 不迁移 LumenX Python 后端。
- 不迁移 LumenX OSS、任务队列、model catalog、series 后端存储。
- 不迁移 LumenX legacy 的 full body / three view / headshot 三套角色资产结构。

## 2. LumenX 对照结论

实施前参考这些 LumenX 源码和设计文件：

- `/Users/a1/Desktop/无限画布项目汇总/lumenx/docs/design/r2v-workflow-v2.md`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/Cast.tsx`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/cast/CastWorkbenchModal.tsx`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/lib/api.ts`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/models.py`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/api.py`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/pipeline.py`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/storyboard.py`

### 2.1 LumenX 已确认的 Cast 行为

LumenX `r2v-workflow-v2.md` 明确将流程改为：

```text
Script · Style · Cast · Storyboard · Assembly
```

其中 Cast 是“本集素材”视图，负责角色、场景、道具参考资产。角色参考图在 v2 中收敛为一个 master reference sheet：

```py
class Character(BaseModel):
    reference_sheet: Optional[AssetUnit]
```

旧的 `full_body` / `three_views` / `head_shot` 仍保留兼容，但新 Cast Workbench 主流程写 `reference_sheet`。

### 2.2 LumenX variants 数据模型

LumenX 的核心模型：

```py
class ImageVariant(BaseModel):
    id: str
    url: str
    created_at: float
    prompt_used: Optional[str]
    is_favorited: bool
    is_uploaded_source: bool
    upload_type: Optional[str]

class ImageAsset(BaseModel):
    selected_id: Optional[str]
    variants: List[ImageVariant]

class AssetUnit(BaseModel):
    selected_image_id: Optional[str]
    image_variants: List[ImageVariant]
    selected_video_id: Optional[str]
    video_variants: List[VideoVariant]
    image_prompt: Optional[str]
    video_prompt: Optional[str]
```

本地迁移不需要照搬这些 Python 类名，但必须复原这几个不变量：

- variants 是历史候选池。
- selected 只是指针，不代表其他候选被删除。
- 角色使用单一 master reference sheet 行为。
- 场景 / 道具使用单一 image asset 行为。
- 生成参数和 prompt 要能回溯。

### 2.3 LumenX Workbench 行为

`CastWorkbenchModal.tsx` 的关键行为：

- 单项打开 Workbench。
- 左侧展示实体上下文和 Style baseline。
- 中间是 prompt template、prompt 编辑器、Style 应用开关、final prompt preview、生成配置。
- 生成数量限制为 1 / 2 / 4。
- 角色默认生成 character reference sheet。
- 场景默认生成 establishing shot。
- 道具默认生成 product / object reference。
- 生成结果进入右侧 variants gallery。
- 点击 variant 调 `selectAssetVariant`，只更新 selected，不清空其他 variants。
- 多次 reroll 会累计 variants，便于比较。

本地迁移应复原这些行为，但界面视觉必须遵守当前项目的 LumenX dark glass Studio 规范：`docs/studio-lumenx-visual-standards.md`。

### 2.4 LumenX 生成请求映射

LumenX 前端 `api.generateAsset` 发送：

```ts
{
  asset_id,
  asset_type,
  style_preset,
  style_prompt,
  generation_type,
  prompt,
  apply_style,
  negative_prompt,
  batch_size,
  model_name,
  aspect_ratio,
}
```

LumenX 后端 `GenerateAssetRequest` 接收同一组字段，并通过异步 task 追加 variants。

本地迁移不做异步 task。第一阶段使用当前项目同步 relay：

- 文生图请求走 `web/src/services/api/image.ts` 的 `requestGeneration`。
- 成功图片先通过 `web/src/services/image-storage.ts` 的 `uploadImage` 进入本地图片存储。
- 再通过 `useAssetStore.getState().addAsset` 写入统一素材库。
- 最后将 `assetId` 写入 Studio entity 的 `assetRefs`。

## 3. 当前项目状态

当前相关文件：

- `web/src/services/studio-local.ts`
- `web/src/services/api/studio-generation.ts`
- `web/src/app/(user)/studio/[seriesId]/studio-workspace-model.tsx`
- `web/src/app/(user)/studio/[seriesId]/page.tsx`
- `web/src/services/asset-references.ts`
- `web/src/stores/use-asset-store.ts`
- `web/src/services/api/image.ts`
- `web/src/services/image-storage.ts`

当前缺口：

- `StudioCharacter` / `StudioScene` / `StudioProp` 只有 `name`、`description`、`assetRefs`，没有 `prompt` 和 `generation`。
- `normalizeScriptStructure` 只生成 `name` / `description`，没有为 Cast 生成 prompt 初稿。
- `formatEpisodeStructure` 的可编辑 JSON 没有包含 entity prompt。
- `buildCastSections` 只通过 `assetRefs.length` 判断 ready，不区分 selected / candidate / failed / generating。
- `CastAssetCard` 现在只显示占位图，不展示 selected asset 图。
- Cast 页没有“生成缺失参考图”。
- Cast 没有单项 Workbench。
- 现在没有 selected / candidate 的写入和切换规则。

## 4. 本地数据模型

### 4.1 修改 `StudioCharacter` / `StudioScene` / `StudioProp`

文件：

```text
web/src/services/studio-local.ts
```

新增共享类型：

```ts
export type StudioCastGenerationStatus = "idle" | "processing" | "completed" | "failed";

export type StudioCastImageGeneration = {
    status: StudioCastGenerationStatus;
    lastPrompt?: string;
    lastNegativePrompt?: string;
    lastEffectivePrompt?: string;
    lastModel?: string;
    lastCount?: number;
    lastAspectRatio?: string;
    lastGeneratedAt?: string;
    lastImageError?: string;
};

export type StudioCastGeneration = {
    image?: StudioCastImageGeneration;
};

export type StudioCastEntityBase = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    assetRefs: StudioAssetRef[];
    generation?: StudioCastGeneration;
    metadata?: Record<string, unknown>;
};
```

然后让三个实体使用同一结构：

```ts
export type StudioCharacter = StudioCastEntityBase;
export type StudioScene = StudioCastEntityBase;
export type StudioProp = StudioCastEntityBase;
```

如果不想引入 `StudioCastEntityBase`，也可以在三个 type 上重复字段。考虑当前项目“简单直接”的原则，重复字段也可以接受；但三类实体会共用 variants 规则，引入一个基础类型能减少后续遗漏。

### 4.2 `StudioAssetRef` role 规则

沿用现有类型：

```ts
export type StudioAssetRef = {
    assetId: string;
    kind: "text" | "image" | "video" | "audio";
    role?: "candidate" | "selected" | "reference";
    note?: string;
    metadata?: Record<string, unknown>;
};
```

Issue 6 对 Cast 的约定：

- `role: "selected"`：当前主参考图。每个实体最多一个 image selected。
- `role: "candidate"`：候选 variant。可以有多个。
- `role: "reference"`：外部参考或从素材库临时挂载的参考图。Issue 6 第一阶段不作为主 variants 使用，除非用户明确“设为主参考图”。

对 LumenX 的映射：

| LumenX | 本地 |
|---|---|
| `Character.reference_sheet.image_variants[]` | `StudioCharacter.assetRefs` 中 image candidate/selected refs |
| `Character.reference_sheet.selected_image_id` | 唯一 `role: "selected"` 的 image ref |
| `Scene.image_asset.variants[]` | `StudioScene.assetRefs` 中 image candidate/selected refs |
| `Scene.image_asset.selected_id` | 唯一 `role: "selected"` 的 image ref |
| `Prop.image_asset.variants[]` | `StudioProp.assetRefs` 中 image candidate/selected refs |
| `Prop.image_asset.selected_id` | 唯一 `role: "selected"` 的 image ref |
| `ImageVariant.url` | 当前素材库 `Asset.data.dataUrl` / `storageKey` |
| `ImageVariant.prompt_used` | `StudioAssetRef.metadata.prompt` 和 asset metadata |

### 4.3 不变量

必须实现并测试：

- 一个 Cast entity 最多一个 image selected ref。
- `candidate` 和 `selected` 都是 variants 池成员。
- selected ref 可以从 `candidate` 晋升。
- 晋升新 selected 时，旧 selected 降级为 `candidate`。
- 生成新图时，不删除旧 candidate。
- 已有 selected 时，后续生成的新图默认都是 `candidate`。
- 没有 selected 时，生成结果第一张自动 selected，其余 candidate。
- 写入 `assetRefs` 前要去重，避免同一个 `assetId` 重复出现。
- 移除某个 candidate 只移除 Studio 关系，不删除素材库 asset。
- 删除素材库 asset 仍由现有 `asset-references.ts` 保护。

## 5. Studio Workflow Module 设计

这里使用 `codebase-design` 语言：Issue 6 应把复杂行为藏在一个深 Module 后面。页面只负责触发、展示、局部弹窗状态，不应该直接串联 relay、upload、asset store、selected/candidate 写回。

### 5.1 Seam

优先落在：

```text
web/src/services/api/studio-generation.ts
```

如果实现后文件过大，再把 Cast 相关 implementation 移到同目录：

```text
web/src/services/api/studio-cast-generation.ts
```

但对页面暴露的 Interface 应保持少量函数，避免变成一堆浅 helper。

### 5.2 外部 Interface

建议新增：

```ts
export type StudioCastTargetKind = "character" | "scene" | "prop";

export type GenerateCastTarget =
    | { mode: "allMissing" }
    | { mode: "failedOnly" }
    | { mode: "ids"; kind: StudioCastTargetKind; ids: string[] };

export type StudioImageRequester = (config: AiConfig, prompt: string) => Promise<Array<{ id: string; dataUrl: string }>>;

export type StudioImageStorage = (dataUrl: string) => Promise<{
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
}>;

export type StudioAssetCreator = (asset: Parameters<typeof useAssetStore.getState()["addAsset"]>[0]) => string;

export type GenerateCastReferencesInput = {
    repository: ReturnType<typeof createStudioRepository>;
    seriesId: string;
    episodeId: string;
    config: AiConfig;
    target: GenerateCastTarget;
    count: 1 | 2 | 4;
    addAsset: StudioAssetCreator;
    requestImages?: StudioImageRequester;
    storeImage?: StudioImageStorage;
    now?: () => string;
};

export type GenerateCastTargetResult = {
    kind: StudioCastTargetKind;
    id: string;
    name: string;
    status: "completed" | "failed" | "skipped";
    createdAssetIds: string[];
    selectedAssetId?: string;
    error?: string;
};

export type GenerateCastReferencesResult = {
    series: StudioSeries;
    episode: StudioEpisode;
    results: GenerateCastTargetResult[];
};

export async function generateCastReferences(input: GenerateCastReferencesInput): Promise<GenerateCastReferencesResult>;
```

说明：

- `requestImages` 默认使用 `requestGeneration`，测试中传 fake。
- `storeImage` 默认使用 `uploadImage`，测试中传 fake。
- `addAsset` 由页面传 `useAssetStore.getState().addAsset`，避免 service 直接调用 React hook。
- `now` 用于测试固定时间。
- 页面不需要知道 selected/candidate 规则。
- 页面不需要知道图片如何上传、素材如何创建。
- 页面不需要知道每个 target 失败后如何保留其他 target 的成功结果。

### 5.3 Variant 操作 Interface

新增纯函数或导出函数：

```ts
export type SelectCastAssetReferenceInput = {
    repository: ReturnType<typeof createStudioRepository>;
    seriesId: string;
    episodeId: string;
    kind: StudioCastTargetKind;
    entityId: string;
    assetId: string;
    now?: () => string;
};

export async function selectCastAssetReference(input: SelectCastAssetReferenceInput): Promise<{
    series: StudioSeries;
    episode: StudioEpisode;
}>;
```

规则：

- 如果 `assetId` 已在 `assetRefs` 中，更新它为 selected。
- 如果不在 `assetRefs` 中，先新增一个 image candidate ref，再晋升为 selected。
- 原 selected 降级为 candidate。
- 不删除任何其他 candidate。

可选新增：

```ts
export async function removeCastCandidateReference(input): Promise<{ series; episode }>;
```

第一阶段只允许移除 `candidate`，不允许直接移除 selected。selected 的移除可以后置到用户真的需要“取消主参考图”时再做。

### 5.4 Implementation 隐藏的复杂度

`generateCastReferences` 内部负责：

- 读取 series / episode。
- 解析 Art Direction。
- 根据目标筛选需要生成的角色、场景、道具。
- 根据实体 kind 构造 base prompt。
- 合成 effective prompt。
- 选择 image model。
- 设置 count 和 aspect ratio。
- 调用图片生成 relay。
- 上传图片到本地图片存储。
- 写入统一素材库。
- 写入 Studio entity `assetRefs`。
- 更新 `generation.image` 快照。
- 对单个 target 失败做隔离，继续处理其他 target。
- 最后一次性通过 repository 写回 episode。

页面只负责：

- 检查当前页面是否有 series / episode。
- 检查全局 AI config 是否大体可用。
- 调用 `generateCastReferences`。
- 用返回的 `series` 更新页面状态。
- 展示成功 / 失败消息。

## 6. Prompt 迁移规则

### 6.1 Script 解析阶段生成 prompt 初稿

文件：

```text
web/src/services/api/studio-generation.ts
```

把 `parsedItemSchema` 从：

```ts
const parsedItemSchema = z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().default(""),
});
```

扩展为：

```ts
const parsedItemSchema = z.object({
    name: z.string().trim().min(1),
    description: z.string().trim().default(""),
    prompt: z.string().trim().optional(),
});
```

更新 Script parser system prompt：

```text
characters/scenes/props 每项包含 name、description、prompt。
prompt 是用于生成该角色/场景/道具参考图的图像提示词初稿。
角色 prompt 应描述外貌、服装、气质和可作为 reference sheet 的视觉信息。
场景 prompt 应描述空间、时间、光线、气氛和环境结构。
道具 prompt 应描述形态、材质、尺寸感、细节和用途。
```

转换函数：

```ts
function toStudioCharacter(item): StudioCharacter {
    return {
        id: nanoid(),
        name: item.name,
        description: item.description,
        prompt: normalizeCastPrompt("character", item),
        assetRefs: [],
    };
}
```

`normalizeCastPrompt` 规则：

- 如果 AI 返回 `prompt`，用返回值。
- 如果没有，使用 `name + description` 生成 fallback。
- 不要把 Style 写进 entity prompt。Style 在生成时合成 effective prompt。

### 6.2 手动 JSON 草稿保留 prompt

文件：

```text
web/src/app/(user)/studio/[seriesId]/studio-workspace-model.tsx
```

`formatEpisodeStructure` 要输出：

```json
{
  "characters": [
    {
      "name": "阿岚",
      "description": "夜班店员，外冷内热",
      "prompt": "..."
    }
  ],
  "scenes": [],
  "props": [],
  "shotDrafts": []
}
```

`normalizeScriptStructure` 保存手动 JSON 时也要接受 prompt。

验收线：

- 用户手动改过 prompt，再保存结构草稿，prompt 不丢。
- 用户重新解析剧本时，新的解析结果会覆盖结构草稿。这与当前“重新解析覆盖结构”行为一致。

### 6.3 Cast 生成模板

本地默认模板参考 LumenX `CastWorkbenchModal.tsx`，但可以简化。

角色：

```text
{entity.prompt}

Composition: character reference sheet, single unified image, seamless layout without borders or frames, neutral gray background. Include a large head-and-shoulders portrait and full-body front / side / back views. Keep one consistent character identity, clothing, face, body proportions, and material details across all views. Soft studio lighting, clean readable silhouette.
```

角色 negative append：

```text
text, labels, watermark, UI overlay, panel borders, multiple separate images, inconsistent face, inconsistent outfit, distorted anatomy
```

场景：

```text
{entity.prompt}

Composition: wide establishing shot of the environment, single unified image, no foreground character blocking the view. Emphasize atmosphere, architecture, terrain structure, lighting, color palette, and usable spatial layout for future storyboard shots.
```

场景 negative append：

```text
text, labels, watermark, UI overlay, random characters, cluttered composition, low detail
```

道具：

```text
{entity.prompt}

Composition: product photography style object reference, single unified image on neutral background. Main view centered at slight angle, with clear material, silhouette, scale cues, and detail close-ups. Clean studio lighting, subtle shadow beneath object.
```

道具 negative append：

```text
text, labels, watermark, UI overlay, messy background, duplicated objects, distorted shape
```

### 6.4 Style 参与规则

Style 来源：

- 当前第一阶段读取 `episode.generation.artDirection`。
- 后续多集阶段再提升到 `series.stylePrompt` 或 series art direction。

effective prompt：

```text
{cast template prompt}

Style baseline:
{artDirection.positivePrompt}
```

effective negative prompt：

```text
{artDirection.negativePrompt}, {kind negative append}
```

规则：

- Batch “生成缺失参考图”默认必须应用 Style。
- 如果 Style 未保存，按钮 disabled，并提示先完成 Style。
- Workbench 后续可以有“应用 Style”开关，但默认开启。
- 每次生成都要把 `lastEffectivePrompt` 和 `lastNegativePrompt` 写入 `generation.image`，并写入每个 ref 的 metadata。

## 7. 生成与写入算法

### 7.1 target 筛选

`target.mode === "allMissing"`：

- 遍历 episode.characters / scenes / props。
- 只选择没有 image selected ref 的实体。
- 默认跳过正在 `generation.image.status === "processing"` 的实体。

`target.mode === "failedOnly"`：

- 选择 `generation.image.status === "failed"` 的实体。

`target.mode === "ids"`：

- 只处理指定 kind 和 ids。
- Workbench 使用这个模式。

selected 判断：

```ts
function getSelectedImageRef(entity) {
    return entity.assetRefs.find((ref) => ref.kind === "image" && ref.role === "selected");
}
```

candidate count：

```ts
function getCastVariantRefs(entity) {
    return entity.assetRefs.filter((ref) => ref.kind === "image" && (ref.role === "selected" || ref.role === "candidate"));
}
```

### 7.2 生成顺序

第一阶段使用顺序执行：

```text
for each target:
    mark target generation.image.status = "processing"
    request image generation
    upload each returned image
    create asset for each uploaded image
    append refs
    mark completed or failed
write repository after each target or after small batch
```

建议每个 target 完成后写一次 repository，而不是全部结束才写。理由：

- 浏览器刷新时已成功的结果不会丢。
- 某个 target 失败不影响已生成结果。
- 用户能逐步看到状态变化。

不建议第一阶段做并发。图片生成 relay 容易限流，顺序执行更可控。

### 7.3 资产创建

每张生成图：

1. `requestGeneration` 返回 dataUrl。
2. `uploadImage(dataUrl)` 返回 object URL、storageKey、尺寸、bytes、mimeType。
3. `addAsset` 写入统一素材库：

```ts
const assetId = addAsset({
    kind: "image",
    title: `${entity.name} 参考图 ${variantIndex + 1}`,
    coverUrl: stored.url,
    tags: ["Studio", "Cast", kindLabel],
    source: "Studio Cast",
    data: {
        dataUrl: stored.url,
        storageKey: stored.storageKey,
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        mimeType: stored.mimeType,
    },
    metadata: {
        source: "studio-cast",
        seriesId,
        episodeId,
        entityKind: kind,
        entityId: entity.id,
        entityName: entity.name,
        prompt: entity.prompt,
        effectivePrompt,
        negativePrompt,
        model,
        aspectRatio,
    },
});
```

然后写 Studio ref：

```ts
{
    assetId,
    kind: "image",
    role: shouldAutoSelect ? "selected" : "candidate",
    note: "Studio Cast 参考图",
    metadata: {
        source: "studio-cast",
        entityKind: kind,
        entityId: entity.id,
        prompt: entity.prompt,
        effectivePrompt,
        negativePrompt,
        model,
        aspectRatio,
        generatedAt,
    },
}
```

### 7.4 selected / candidate 写入伪代码

```ts
function appendGeneratedRefs(entity, refs) {
    const hasSelected = entity.assetRefs.some((ref) => ref.kind === "image" && ref.role === "selected");
    const nextRefs = [...entity.assetRefs];

    refs.forEach((ref, index) => {
        const role = !hasSelected && index === 0 ? "selected" : "candidate";
        nextRefs.push({ ...ref, role });
    });

    return {
        ...entity,
        assetRefs: normalizeSingleSelectedImageRef(nextRefs),
    };
}
```

`normalizeSingleSelectedImageRef`：

```ts
function normalizeSingleSelectedImageRef(refs) {
    let selectedSeen = false;
    return refs.map((ref) => {
        if (ref.kind !== "image" || ref.role !== "selected") return ref;
        if (!selectedSeen) {
            selectedSeen = true;
            return ref;
        }
        return { ...ref, role: "candidate" };
    });
}
```

选择 candidate 为主图：

```ts
function selectImageRef(refs, assetId) {
    const hasRef = refs.some((ref) => ref.assetId === assetId && ref.kind === "image");
    const nextRefs = hasRef ? refs : [...refs, { assetId, kind: "image", role: "candidate" }];

    return nextRefs.map((ref) => {
        if (ref.kind !== "image") return ref;
        if (ref.assetId === assetId) return { ...ref, role: "selected" };
        if (ref.role === "selected") return { ...ref, role: "candidate" };
        return ref;
    });
}
```

## 8. 文件级实施切片

不要一次性整包实施。建议按 4 个小切片做，每个切片都能单独跑测试和检查 UI。

### 8.1 Slice 6.1: Cast 数据补正

目标：

- 让 Script 解析结果和手动 JSON 草稿都能产出 entity prompt。
- Cast 卡片能展示 prompt 摘要、selected/candidate 数量和更准确状态。
- 不接生图 relay。

改动文件：

```text
web/src/services/studio-local.ts
web/src/services/api/studio-generation.ts
web/src/services/api/studio-generation.test.ts
web/src/app/(user)/studio/[seriesId]/studio-workspace-model.tsx
web/src/app/(user)/studio/[seriesId]/studio-workspace-model.test.ts
web/src/app/(user)/studio/[seriesId]/page.tsx
```

具体改动：

- `StudioCharacter` / `StudioScene` / `StudioProp` 增加 `prompt` 和 `generation`。
- `parsedItemSchema` 接受 optional `prompt`。
- `buildScriptParseMessages` 要求返回 prompt。
- `toStudioCharacter` / `toStudioScene` / `toStudioProp` 写入 prompt fallback。
- `formatEpisodeStructure` 输出 prompt。
- `buildCastSections` 返回：

```ts
export type StudioCastItem = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    kind: "character" | "scene" | "prop";
    appearances: number;
    status: "ready" | "pending" | "generating" | "failed";
    selectedAssetId?: string;
    candidateCount: number;
    lastError?: string;
};
```

- `CastAssetCard` 显示 prompt 摘要和 candidate 数量。
- 如果没有 selected asset，仍显示占位图。

验收：

- 解析 mocked relay JSON 后，characters/scenes/props 都有 prompt。
- 手动 JSON 草稿保存 prompt 后不丢。
- Cast 卡片不再把“有任意 assetRef”误判为 ready，必须有 image selected 才 ready。

### 8.2 Slice 6.2: 生成缺失 Cast 参考图

目标：

- 增加 `generateCastReferences()`。
- Cast 顶部出现“生成缺失参考图”。
- 对所有没有 selected image 的实体生成一张参考图。
- 成功结果进入素材库并写回 selected/candidate refs。

改动文件：

```text
web/src/services/api/studio-generation.ts
web/src/services/api/studio-generation.test.ts
web/src/app/(user)/studio/[seriesId]/page.tsx
web/src/app/(user)/studio/[seriesId]/studio-workspace-model.tsx
web/src/app/(user)/studio/[seriesId]/studio-workspace-model.test.ts
```

UI 行为：

- Cast header trailing 从 disabled “新增素材”换成：

```text
[生成缺失参考图]
```

- 如果 Style 未保存，按钮 disabled，tooltip 或提示为“先完成 Style 定调”。
- 点击后顺序生成所有 missing targets。
- 默认每个 target `count = 1`。
- 单项失败不终止全批次。
- 完成后 message 显示：

```text
已生成 5 个参考图，2 个失败
```

生成配置：

- image model = `series.modelPreferences.imageModel || config.imageModel`
- character aspect ratio = `9:16`
- scene aspect ratio = `16:9`
- prop aspect ratio = `1:1`
- count = `1`

验收：

- 对一个无 selected 的角色生成 1 张图，写入素材库并写回 `role: "selected"`。
- 对已有 selected 的实体不会被 allMissing 重新生成。
- 如果请求失败，实体写入 `generation.image.status = "failed"` 和 `lastImageError`。
- 已成功实体不会因为后续失败被回滚。
- 刷新页面后 selected 图仍能从素材库显示。

### 8.3 Slice 6.3: 单项 Cast Workbench

目标：

- 点击 Cast 卡片打开单项 Workbench。
- 用户可以编辑 prompt，看到 Style baseline 和 effective prompt preview。
- 用户可以生成 1 / 2 / 4 张候选。
- 新候选 append 到 variants 池。

新增文件建议：

```text
web/src/app/(user)/studio/[seriesId]/components/cast-workbench-modal.tsx
```

也可以先放在 `page.tsx` 内，但 Workbench 会比较大，建议拆成页面私有组件。拆分只限 Cast 相关组件，不顺手重构 Script / Style / Storyboard。

Workbench UI：

```text
┌──────────────────────────────────────────────────────────┐
│ Cast Workbench · 阿岚 · variants 4                       │
├──────────────┬───────────────────────────────┬───────────┤
│ 实体上下文    │ Prompt / Style / Generate      │ Variants  │
│ name/desc     │ textarea                       │ gallery   │
│ style baseline│ effective prompt preview       │ selected  │
│ selected ref  │ count 1/2/4, aspect, model     │ candidates│
└──────────────┴───────────────────────────────┴───────────┘
```

最低可实施 UI：

- 左侧可以先合并到顶部摘要，不必完全复刻三栏。
- 必须有 prompt textarea。
- 必须有 Style positive/negative 展示。
- 必须有 effective prompt preview。
- 必须有 count 1 / 2 / 4。
- 必须有生成按钮。
- 必须显示 selected 和 candidates gallery。

生成行为：

- Workbench 调 `generateCastReferences({ target: { mode: "ids", kind, ids: [entityId] }, count })`。
- 如果该 entity 已有 selected，新图全部作为 candidate。
- 如果该 entity 没有 selected，新图第一张 selected，其余 candidate。
- 生成完成后保持 Workbench 打开并刷新 variants。

验收：

- 对已有 selected 的角色生成 2 张，新图都是 candidate，旧 selected 不变。
- 对没有 selected 的道具生成 4 张，第一张 selected，另外 3 张 candidate。
- effective prompt preview 与写入 metadata 的 `effectivePrompt` 一致。
- Workbench 关闭再打开，variants 仍在。

### 8.4 Slice 6.4: variants 选择和管理

目标：

- 用户可以从 candidate 中选择主参考图。
- 用户可以从素材库选择一张图加入候选并设为 selected。
- 用户可以移除 candidate 与当前 Studio entity 的关系。

改动文件：

```text
web/src/services/api/studio-generation.ts
web/src/services/api/studio-generation.test.ts
web/src/app/(user)/studio/[seriesId]/components/cast-workbench-modal.tsx
web/src/app/(user)/studio/[seriesId]/page.tsx
web/src/services/asset-references.test.ts
```

操作：

- `selectCastAssetReference`：candidate 设为 selected，旧 selected 降级 candidate。
- `removeCastCandidateReference`：只移除 candidate 关系，不删除素材库 asset。
- “从素材库选择”使用现有 asset picker 能力时，只允许 image asset。

验收：

- 选择 candidate 后，实体仍只有一个 selected。
- 旧 selected 仍保留为 candidate。
- 移除 candidate 后，素材库 asset 仍存在。
- 被 Studio 引用的 asset 仍不能从素材库直接删除，`asset-references.ts` 能报告位置。

## 9. UI 状态表

Cast 卡片状态：

| 状态 | 条件 | 卡片表现 |
|---|---|---|
| `pending` | 没有 selected image，且没有失败 | 占位图，黄色 pending tag |
| `generating` | `generation.image.status === "processing"` | 占位或旧 selected 图，按钮 loading |
| `ready` | 有 selected image | 显示 selected 图，绿色 ready tag，显示 candidate 数 |
| `failed` | 无 selected，且 `generation.image.status === "failed"` | 占位图，红色 failed tag，显示错误摘要 |

如果有 selected 但最近一次生成失败：

- 卡片仍是 `ready`。
- 可以在卡片底部显示较轻的“最近生成失败”提示。
- 不要把已有主参考图因为一次失败降级。

Workbench 生成按钮：

| 条件 | 状态 |
|---|---|
| prompt 为空 | disabled |
| image model 未配置 | disabled，并提示配置图像模型 |
| Style 未保存 | disabled 或需要用户显式取消应用 Style。第一阶段建议 disabled |
| 当前 target generating | loading |

## 10. 测试计划

### 10.1 `web/src/services/api/studio-generation.test.ts`

新增测试：

- `parseScript` 能把 relay 返回的 prompt 写入角色、场景、道具。
- relay 没返回 prompt 时，fallback prompt 不为空并包含实体 name / description。
- `normalizeScriptStructure` 接受手动 JSON 的 prompt。
- `generateCastReferences` 对 missing character 创建 selected ref。
- `generateCastReferences` 对已有 selected 的 entity 追加 candidate，不覆盖 selected。
- `generateCastReferences` 支持 `count = 2 / 4`。
- `generateCastReferences` 单个 target 失败时，其他 target 成功结果仍写入 repository。
- `generateCastReferences` 写入 generation snapshot，包括 model、effectivePrompt、negativePrompt、lastGeneratedAt。
- `selectCastAssetReference` 晋升 candidate 并降级旧 selected。
- `selectCastAssetReference` 对外部素材库 assetId 可以先新增 ref 再设为 selected。

测试用 fake：

```ts
const requestImages = vi.fn(async () => [
    { id: "img-1", dataUrl: "data:image/png;base64,AAA" },
]);

const storeImage = vi.fn(async () => ({
    url: "blob:studio-cast-1",
    storageKey: "image:studio-cast-1",
    width: 1024,
    height: 1024,
    bytes: 1234,
    mimeType: "image/png",
}));

const addAsset = vi.fn(() => "asset-1");
```

### 10.2 `web/src/app/(user)/studio/[seriesId]/studio-workspace-model.test.ts`

新增测试：

- `formatEpisodeStructure` 输出 prompt。
- `buildCastSections` 返回 selectedAssetId。
- `buildCastSections` 对只有 candidate 的实体仍标记 pending。
- `buildCastSections` 对 selected + failed snapshot 标记 ready，并保留 lastError。
- candidateCount 统计 selected + candidate。

### 10.3 `web/src/services/asset-references.test.ts`

补充：

- Studio character 的 selected ref 能阻止素材删除。
- Studio character 的 candidate ref 能阻止素材删除。
- 删除报告 label 包含 series / episode / entity name。

### 10.4 手动浏览器验收

实施 UI 前必须先读：

```text
docs/studio-lumenx-visual-standards.md
```

手动路径：

1. 创建 Studio 项目。
2. 输入剧本并解析。
3. 保存 Style。
4. 进入 Cast。
5. 确认角色、场景、道具都有 prompt 摘要。
6. 点击“生成缺失参考图”。
7. 确认生成结果进入素材库。
8. 刷新页面，确认 selected 图仍显示。
9. 打开单项 Workbench。
10. 修改 prompt，生成 2 张候选。
11. 选择其中一张为主参考图。
12. 确认旧主图仍在 candidate。
13. 尝试删除被引用 asset，确认被阻止并报告 Studio 引用位置。

## 11. 验收线

Issue 6 完成条件：

- `npm test -- studio-generation` 通过。
- `npm test -- studio-workspace-model` 通过。
- `npm test -- asset-references` 通过。
- TypeScript 类型检查通过。
- Cast 卡片展示 selected 图、candidate 数、prompt 摘要、失败状态。
- “生成缺失参考图”可从空 Cast 生成角色 / 场景 / 道具参考图。
- Workbench 可对单个实体生成 1 / 2 / 4 张候选。
- candidate 可以设为 selected，旧 selected 不丢。
- 所有生成图都进入统一素材库，而不是只存在 Studio episode JSON。
- Style 参与生成，并且 effective prompt 可见或可追溯。
- Storyboard 仍不直接裸 prompt 生图。Issue 6 不引入 Storyboard 生成入口。

## 12. 实施顺序建议

建议按以下顺序实施和检查：

```text
6.1 数据补正
    ↓
6.2 批量生成缺失参考图
    ↓
6.3 单项 Workbench 生成更多 variants
    ↓
6.4 variants 选择 / 移除 / 从素材库选择
```

不要先做漂亮 Workbench 再补数据模型。Cast 的核心是 variants 数据闭环，UI 应围绕这个闭环服务。

## 13. 需要避免的跑偏行为

- 不要把 Cast 做成只展示清单的 tab。
- 不要让 Storyboard 在 Issue 6 里直接生镜头图。
- 不要让页面直接拼 relay payload、上传图片、创建 asset、写 refs。
- 不要把未选 candidate 当缓存清理。
- 不要用 `assetRefs.length > 0` 判断 Cast ready。
- 不要把 Style 悄悄拼进 prompt 但不保存 effective prompt。
- 不要生成图片后只保存 blob URL 或 dataUrl 到 Studio JSON。
- 不要一次重构整个 Studio page。只改 Issue 6 必要范围。

## 14. Issue 7 入口条件

只有 Issue 6 满足以下条件后，才进入 Storyboard 镜头候选闭环：

- 至少角色、场景、道具都能有 selected reference image。
- Workbench 能追加 candidate variants。
- selected/candidate 切换规则稳定。
- `assetRefs` 能被统一素材库删除保护识别。
- Cast 生成快照能提供 prompt / model / style 追溯。

Issue 7 的正确起点应是：

```text
StudioShot.prompt
+ Style positive / negative
+ Shot 中出现的角色 / 场景 / 道具 selected image refs
→ 生成 shot image candidates
→ 写入 StudioShot.assetRefs selected/candidate
```

如果 Storyboard 在 Cast selected reference image 稳定前开工，就会回到裸 prompt 生图，偏离 LumenX Studio 的核心行为。
