# Studio Issue 7: Storyboard 镜头图片候选闭环实现 Brief

本文是 Issue 7 的正式实施说明。Issue 6 的 Cast 参考资产与 variants 闭环已经完成后，下一阶段应迁移 LumenX Storyboard 的镜头图片候选能力。

目标不是原创一个新的 Storyboard 生图系统，而是仿照 LumenX 后端已经验证过的行为模型，在当前项目边界内做本地适配：

```text
Script 解析
        ↓
Style 定调
        ↓
Cast 生成角色 / 场景 / 道具参考图，并保留 variants
        ↓
Storyboard 基于 Cast selected 参考资产生成镜头图片候选
        ↓
Assembly 选镜头、组装、混音、导出
```

Issue 7 只覆盖 Storyboard 的图片候选闭环。单镜头视频、视频任务队列、TTS、混音和 Assembly 导出属于后续 Issue，不进入本次范围。

## 1. 迁移目标

Issue 7 完成后，当前项目的 Studio Storyboard 必须具备以下行为：

- 每个 `StudioShot` 都有可编辑的镜头生产 prompt。
- AI 解析生成的 shot prompt 只是初稿；用户编辑后的 prompt 是后续 Storyboard 生成的权威输入。
- 每个 shot 可以基于自身 prompt、Style 和 Cast selected reference images 生成镜头图片候选。
- Storyboard 生成时优先使用 Cast selected 的角色、场景、道具参考图。
- Storyboard Workbench 必须提供最小 shot 引用编辑入口，允许用户手工维护角色、场景、道具引用。
- 缺少关键 Cast selected 参考图时，UI 必须提示一致性风险。
- 用户明确选择无参考模式时，允许裸 prompt 生成，但不得作为默认静默路径。
- 每个 shot 可以保留多个 image candidate variants。
- 每个 shot 同一媒体类型最多只有一个 selected image。
- 空镜头首次单张生成可以自动成为 selected image。
- 后续重生成默认追加 candidate，不自动替换 selected。
- 用户可以把 candidate 设为 selected，旧 selected 降级为 candidate。
- 生成出来的图片必须先进入当前项目统一素材库 asset，再把 `assetId` 写入 `StudioShot.assetRefs`。
- 每张生成图必须保存 prompt、Style、effective prompt、model、reference asset ids、count、aspect ratio 和 batch id 等快照。

不做：

- 不做视频候选生成。
- 不做 R2V / I2V 任务队列。
- 不做 Assembly 时间线、混音或导出。
- 不迁移 LumenX Python 后端。
- 不迁移 LumenX OSS、本地 output 目录、model catalog 或 provider task 结构。
- 不做完整候选管理增强，例如收藏、标签、批次筛选、上传镜头图、从素材库加入镜头候选；这些放到 Issue 8，除非为了 selected/candidate 闭环必须补最小操作。

## 2. LumenX 后端对照结论

实施前必须参考这些 LumenX 源码：

- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/models.py`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/storyboard.py`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/pipeline.py`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/api.py`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/prompt_assembly.py`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/src/apps/comic_gen/llm.py`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/StoryboardR2V.tsx`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/storyboard-r2v/ShotCard.tsx`
- `/Users/a1/Desktop/无限画布项目汇总/lumenx/frontend/src/components/modules/storyboard-r2v/buildAssembledPrompt.ts`

### 2.1 LumenX 的核心数据模型

LumenX 后端的 `StoryboardFrame` 同时承载结构化分镜、prompt、图片 variants、视频任务和 workbench 状态。Issue 7 只迁移图片候选相关行为。

LumenX 关键字段：

```py
class StoryboardFrame(BaseModel):
    id: str
    scene_id: str
    character_ids: List[str]
    prop_ids: List[str]
    action_description: str
    dialogue: Optional[str]
    speaker: Optional[str]
    visual_description: Optional[str]
    duration: Optional[int]
    shot_size: Optional[str]
    camera_angle: str
    camera_movement: Optional[str]
    camera_movement_structured: Optional[CameraMovementData]
    transition_hint: Optional[str]
    assembled_prompt: Optional[str]
    image_prompt: Optional[str]
    image_prompt_cn: Optional[str]
    image_prompt_en: Optional[str]
    image_url: Optional[str]
    rendered_image_url: Optional[str]
    rendered_image_asset: Optional[ImageAsset]
    status: GenerationStatus
```

图片候选容器：

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
```

本项目不照搬 `ImageAsset` 容器，而是继续使用统一的 `assetRefs`：

| LumenX | 当前项目 |
|---|---|
| `StoryboardFrame.rendered_image_asset.variants[]` | `StudioShot.assetRefs` 中 image `candidate` / `selected` refs |
| `StoryboardFrame.rendered_image_asset.selected_id` | `StudioShot.assetRefs` 中唯一 image `role: "selected"` |
| `ImageVariant.url` | 素材库 `Asset.data.dataUrl` / `storageKey` |
| `ImageVariant.prompt_used` | `StudioAssetRef.metadata.promptSnapshot` |
| `StoryboardFrame.image_prompt` | `StudioShot.prompt` |
| `StoryboardFrame.status` | `StudioShot.generation.image.status` |

### 2.2 LumenX 的生成链路

LumenX API 入口：

```py
@app.post("/projects/{script_id}/storyboard/render")
def render_frame(script_id: str, request: RenderFrameRequest):
    updated_script = pipeline.generate_storyboard_render(
        script_id,
        request.frame_id,
        request.composition_data,
        request.prompt,
        request.batch_size
    )
```

LumenX pipeline：

```py
def generate_storyboard_render(self, script_id, frame_id, composition_data, prompt, batch_size=1):
    frame.status = GenerationStatus.PROCESSING
    frame.image_prompt = prompt
    ref_image_urls = composition_data.get("reference_image_urls", [])
    ref_image_paths = resolve_ref_paths(ref_image_urls)
    final_prompt = prompt
    resolved = self.resolve_episode_assets(script)
    scene = find_scene(resolved["scenes"], frame.scene_id)
    i2i_model = script.model_settings.i2i_model

    self.storyboard_generator.generate_frame(
        frame,
        resolved["characters"],
        scene,
        ref_image_paths=ref_image_paths,
        prompt=final_prompt,
        batch_size=batch_size,
        size=effective_size,
        model_name=i2i_model,
    )
```

LumenX generator：

```py
def generate_frame(self, frame, characters, scene, ref_image_paths=None, prompt=None, batch_size=1, size=None, model_name=None):
    if frontend_refs:
        asset_ref_paths = frontend_refs
    else:
        asset_ref_paths = auto_collect_selected_character_and_scene_refs(frame, characters, scene)

    if not prompt:
        prompt = build_prompt_from_frame_character_scene_camera()

    frame.image_prompt = prompt

    for _ in range(batch_size):
        variant_id = uuid.uuid4()
        self.model.generate(prompt, output_path, ref_image_paths=asset_ref_paths, size=size, model_name=model_name)
        frame.rendered_image_asset.variants.append(ImageVariant(...))
        frame.rendered_image_asset.selected_id = variant_id

    frame.rendered_image_url = selected_variant.url
    frame.image_url = selected_variant.url
    frame.status = GenerationStatus.COMPLETED
```

本项目要仿照的行为：

- `render` 是单个 frame / shot 的生成入口。
- 生成入口接收 prompt、batch size 和 reference images。
- reference images 可以由前端显式传入，也可以由后端根据 frame 的 `character_ids` / `scene_id` 自动收集。
- 生成成功后把结果追加为 variants。
- frame 上保留 selected 指针。
- frame 上保存生成 prompt 和状态。
- 失败时设置 failed 状态，不清空已有 variants。

本项目必须适配的差异：

- 不写 Python output 文件。
- 不上传 LumenX OSS。
- 不使用 LumenX `WanxImageModel`。
- 不使用 LumenX `model_settings.i2i_model` / model catalog。
- 不使用 LumenX 后端持久化。
- 生成结果先进入当前项目统一素材库 asset，再写 `StudioShot.assetRefs`。
- Style 参与生成必须可见，并写入生成快照。
- 后续重生成默认 candidate，不像 LumenX 那样每批自动把最后一张设为 selected。

### 2.3 LumenX 的 reference 选择规则

`StoryboardGenerator.generate_frame` 自动收集参考图时：

- 角色按 `frame.character_ids` 找角色。
- 角色参考图优先级是 selected variant：
  - `three_view_asset.selected_id`
  - `full_body_asset.selected_id`
  - `headshot_asset.selected_id`
  - legacy url fallback
- 场景按 `frame.scene_id` 找 scene。
- 场景参考图优先 `scene.image_asset.selected_id`，再 fallback `scene.image_url`。
- 收集完成后去重。

本项目适配：

- 角色、场景、道具都从 `assetRefs` 里找 `kind: "image"` 且 `role: "selected"` 的 ref。
- Issue 7 第一版直接在 `StudioShot.metadata.references` 中持久化显式引用，不使用名称匹配作为默认机制。

```ts
metadata: {
    references: {
        characterIds: string[];
        sceneIds: string[];
        propIds: string[];
    }
}
```

Script 解析、手工结构草稿保存和后续补充解析都必须维护这些引用。Storyboard 生成只根据显式引用读取 Cast selected reference images；没有显式引用时按“引用缺失”处理，而不是静默从文本猜测。

### 2.4 LumenX 的 prompt 拼装

LumenX `prompt_assembly.py` 有纯函数：

- `assemble_prompt(frame, characters)`
- `inject_reference_tags(text, frame, characters, scenes)`
- `enrich_prompt_with_dialogue(prompt, frame)`

关键思路：

- prompt 不只是 action description。
- prompt 会合并 visual description、lighting、camera movement、shot size、camera angle、角色外观关键词。
- 对白会转成“角色张嘴说话”的视觉提示，供视频生成使用。
- reference tag 是给 R2V 模型用的可见标记。

本项目 Issue 7 暂不需要完整迁移 LumenX rich frame schema，但必须建立一个最小的 shot prompt 拼装规则：

```text
StudioShot.prompt
        +
dialogue visual cue
        +
shot-level camera / composition metadata if present
        +
Style positive prompt
        +
reference summary
        ↓
effectivePrompt
```

其中 `StudioShot.prompt` 是用户可编辑的生产输入，Style 和 reference summary 参与生成但不得静默不可见，必须在 UI 或生成快照里体现。

## 3. 当前项目状态

当前相关文件：

- `web/src/services/studio-local.ts`
- `web/src/services/api/studio-generation.ts`
- `web/src/app/(user)/studio/[seriesId]/studio-workspace-model.tsx`
- `web/src/app/(user)/studio/[seriesId]/page.tsx`
- `web/src/app/(user)/studio/[seriesId]/components/cast-workbench-modal.tsx`
- `web/src/services/asset-references.ts`
- `web/src/stores/use-asset-store.ts`
- `web/src/services/api/image.ts`
- `web/src/services/image-storage.ts`

当前已具备：

- Cast 参考图生成。
- Cast selected / candidate variants。
- Cast 单项 Workbench。
- Cast prompt 编辑。
- 素材库 asset-first 写入。
- 素材删除引用保护。
- `requestGeneration(config, prompt)` 文生图。
- `requestEdit(config, prompt, references)` 图生图，可带多张参考图。

当前缺口：

- `StudioShot` 没有独立 `prompt` 字段。
- 剧本解析生成的 shot 只有 `title`、`description`、`dialogue`，没有镜头生产 prompt 初稿。
- Storyboard UI 只展示分镜文本和候选数，没有 selected 镜头图。
- Storyboard 没有 shot-level workbench。
- Storyboard 还没有基于 Cast selected refs 生成镜头图片候选。
- Storyboard 还没有 shot selected / candidate 切换规则。
- Storyboard 还没有 reference preflight。

## 4. 本地数据模型

### 4.1 修改 `StudioShot`

文件：

```text
web/src/services/studio-local.ts
```

将 `StudioShot` 改为：

```ts
export type StudioShot = {
    id: string;
    title: string;
    order: number;
    description: string;
    prompt: string;
    dialogue?: string;
    assetRefs: StudioAssetRef[];
    generation?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
};
```

兼容规则：

- 旧数据缺 `prompt` 时，派生层用 `description + dialogue` 构建 fallback。
- `normalizeScriptStructure` 生成新 shot 时必须写入 `prompt`，并写入 `metadata.references`。
- 手工编辑结构草稿时，如果用户没有提供 `prompt`，保存时用 fallback 补齐；如果用户没有提供引用，保存时保留已有引用或显式标记为空引用。
- 用户编辑后的 `StudioShot.prompt` 是权威生产输入；生成镜头图片时读取该字段，不重新从 `description` / `dialogue` 派生覆盖。
- `StudioShot.prompt` 和 `StudioShot.metadata.references` 是相邻但独立的控制面；编辑 prompt 不自动重算角色、场景、道具引用。
- 重新解析剧本会替换结构草稿；如果未来做“补充解析”，不得静默覆盖用户已编辑 prompt。
- 旧数据缺 `metadata.references` 时，不能用名称匹配自动补引用；UI 应提示该 shot 缺少结构化引用，需要重新解析或手工补齐。

### 4.2 `StudioShot.assetRefs` 规则

沿用 `StudioAssetRef`：

```ts
export type StudioAssetRef = {
    assetId: string;
    kind: "text" | "image" | "video" | "audio";
    role?: "candidate" | "selected" | "reference";
    note?: string;
    metadata?: Record<string, unknown>;
};
```

Shot 图片候选约定：

- `kind: "image" + role: "selected"`：当前镜头主图。
- `kind: "image" + role: "candidate"`：镜头图片候选。
- `kind: "image" + role: "reference"`：明确作为生成参考图挂接到 shot 的图。Issue 7 第一版不主动创建 shot-level reference refs，优先从 Cast selected refs 动态读取。
- 同一个 shot 同一媒体类型最多一个 selected。
- 切换 selected 时旧 selected 降级为 candidate。
- 删除 candidate 只解除 Studio 关系，不删除底层 asset。

### 4.3 生成快照 metadata

生成出的每个 `StudioAssetRef.metadata` 至少包含：

```ts
{
    source: "studio-storyboard";
    shotId: string;
    promptSnapshot: string;
    styleSnapshot: {
        name: string;
        positivePrompt: string;
        negativePrompt: string;
    };
    effectivePromptSnapshot: string;
    model: string;
    count: 1 | 2 | 4;
    aspectRatio: string;
    batchId: string;
    referenceAssetIds: string[];
    referenceSummary: Array<{
        kind: "character" | "scene" | "prop";
        id: string;
        name: string;
        assetId?: string;
        status: "ready" | "missing";
    }>;
    generatedAt: string;
}
```

素材库 asset metadata 同步写入相同核心字段，便于离开 Studio 后仍能在素材库中追踪来源。

## 5. Module Interface

核心实现放在：

```text
web/src/services/api/studio-generation.ts
```

新增 Storyboard 相关 Interface。页面只触发这些函数，不直接拼 relay payload，不直接写 selected/candidate 规则。

### 5.1 `generateShotCandidates`

建议类型：

```ts
export type StudioShotGenerationTarget =
    | { mode: "ids"; ids: string[] }
    | { mode: "missingSelected" }
    | { mode: "failedOnly" };

export type StudioShotImageRequester = (
    config: AiConfig,
    prompt: string,
    references: ReferenceImage[],
) => Promise<Array<{ id: string; dataUrl: string }>>;

export type GenerateShotCandidatesInput = {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
    config: AiConfig;
    target: StudioShotGenerationTarget;
    count: 1 | 2 | 4;
    allowNoReferences?: boolean;
    addAsset: StudioAssetCreator;
    requestImages?: StudioShotImageRequester;
    storeImage?: StudioImageStorage;
    now?: () => string;
};

export type GenerateShotCandidateResult = {
    id: string;
    title: string;
    status: "completed" | "failed" | "skipped";
    createdAssetIds: string[];
    selectedAssetId?: string;
    referenceAssetIds: string[];
    missingReferences: Array<{ kind: "character" | "scene" | "prop"; id: string; name: string }>;
    error?: string;
};

export type GenerateShotCandidatesResult = {
    series: StudioSeries;
    episode: StudioEpisode;
    results: GenerateShotCandidateResult[];
};
```

Interface 必须隐藏：

- Style 读取和校验。
- model fallback。
- shot prompt fallback。
- Cast selected reference 收集。
- reference asset 转 `ReferenceImage`。
- 有参考图时走 `requestEdit`。
- 无参考且允许时走 `requestGeneration`。
- 图片存储。
- 素材库 asset 创建。
- `StudioShot.assetRefs` 回填。
- selected / candidate 规则。
- 失败状态写入。

默认 requester：

```ts
async function defaultRequestShotImages(config: AiConfig, prompt: string, references: ReferenceImage[]) {
    const { requestEdit, requestGeneration } = await import("@/services/api/image");
    return references.length ? requestEdit(config, prompt, references) : requestGeneration(config, prompt);
}
```

### 5.2 `selectShotAssetReference`

建议类型：

```ts
export type SelectShotAssetReferenceInput = {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
    shotId: string;
    assetId: string;
};
```

行为：

- 找到 shot。
- 若 assetId 已存在于 image refs，则设为 selected。
- 若 assetId 不存在，可先加入 candidate 再 selected，便于 Issue 8 从素材库加入候选复用。
- 旧 selected 降级为 candidate。
- 去重。
- 保证唯一 selected image。

### 5.3 `removeShotCandidateReference`

建议类型：

```ts
export type RemoveShotCandidateReferenceInput = SelectShotAssetReferenceInput;
```

行为：

- 只能移除 `role: "candidate"` 的 image ref。
- 不能通过该操作移除 selected。
- 不删除底层素材库 asset。
- 不清空生成快照。

### 5.4 `updateShotPrompt`

建议类型：

```ts
export type UpdateShotPromptInput = {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
    shotId: string;
    prompt: string;
};
```

行为：

- prompt trim 后不能为空。
- 只更新该 shot 的 `prompt`。
- 不重写 `description` / `dialogue`。
- 不清空已有候选。
- 不改变 `metadata.references`；用户可以改写镜头提示词，但引用关系仍由结构化引用维护。

### 5.5 `updateShotReferences`

建议类型：

```ts
export type StudioShotReferences = {
    characterIds: string[];
    sceneIds: string[];
    propIds: string[];
};

export type UpdateShotReferencesInput = {
    repository: StudioRepository;
    seriesId: string;
    episodeId: string;
    shotId: string;
    references: StudioShotReferences;
};
```

行为：

- 只更新该 shot 的 `metadata.references`。
- 不重写 `prompt` / `description` / `dialogue`。
- 不清空已有候选。
- 校验引用 id 必须存在于当前 episode 的 characters / scenes / props 中。
- 去重，并按当前 episode 中角色、场景、道具的顺序稳定排序。
- 允许用户显式保存空引用；空引用表示该 shot 暂不携带 Cast selected reference images。

## 6. Reference 解析策略

### 6.1 第一版：显式引用

Issue 7 第一版不采用名称匹配。每个 `StudioShot` 都应保存结构化引用：

```ts
metadata: {
    references: {
        characterIds: string[];
        sceneIds: string[];
        propIds: string[];
    }
}
```

来源规则：

- Script 解析结果必须为每个 shot 产出角色、场景、道具引用。
- 结构草稿 normalize 时校验引用 id 是否仍存在于当前 episode。
- 手工编辑结构草稿时保留已有引用；用户明确清空时保存为空数组。
- 引用顺序：角色、场景、道具；每类按 episode 中的顺序稳定排序。

这与 LumenX 后端的 `frame.character_ids` / `scene_id` / `prop_ids` 方向一致，也避免文本改写、别名和省略称呼导致 Storyboard 参考图选择不可解释。

### 6.2 最小引用编辑

Issue 7 第一版必须提供最小引用编辑入口，但不做复杂 reference chip 系统。

Shot Workbench 至少包含：

- 角色：多选当前 episode characters。
- 场景：选择当前 episode scenes。
- 道具：多选当前 episode props。
- 保存后写入 `StudioShot.metadata.references`。

重要边界：

- 修改 shot prompt 不会触发名称匹配或自动引用重算。
- 修改引用只能通过结构化引用入口完成。
- prompt 决定画面如何生成；references 决定携带哪些 Cast selected reference images。
- 不做根据 prompt 自动推荐引用。
- 不做别名系统。
- 不做跨集共享引用。
- 不做引用图权重或参考图排序调参。
- 不做从素材库直接给 shot 加参考图；这属于 Issue 8 候选管理增强。

### 6.3 Missing reference 规则

对每个显式引用：

- 有 selected image ref：`ready`。
- 没有 selected image ref：`missing`。

生成入口规则：

- 有至少一个 ready reference：默认允许生成，走图生图。
- 全部引用 missing：默认不允许直接生成，提示先去 Cast 补参考图。
- 用户明确选择 `allowNoReferences`：允许裸 prompt 文生图。
- 没有任何显式引用：默认不允许批量生成；单 shot Workbench 可以让用户明确选择无参考生成，并提示一致性风险。

## 7. Prompt 组装

### 7.1 Shot prompt 初稿

剧本解析时，`toStudioShot` 必须生成 `prompt`：

```ts
function normalizeShotPrompt(item: ParsedShot) {
    return [
        item.description,
        item.dialogue ? `画面中包含对白情境：${item.dialogue}` : "",
        "镜头画面，电影分镜，清晰主体动作，明确景别、构图、光线和环境氛围。",
    ].filter(Boolean).join("\n");
}
```

如果后续把 LumenX 的 rich frame schema 部分迁入，可以把 `shot_size`、`camera_angle`、`camera_movement` 放进 `metadata`，再进入 prompt 拼装。

### 7.2 Effective prompt

生成前构建：

```text
shot.prompt

Dialogue visual cue:
{dialogue cue, if any}

Style baseline:
{artDirection.positivePrompt}

Reference guidance:
Use the attached Cast reference images to keep character identity, scene layout, prop shape, costume, material, and color continuity consistent.
```

如果没有 references 且用户允许无参考生成：

```text
No Cast reference image is attached for this generation. Prioritize the written shot prompt and current Style baseline.
```

### 7.3 Negative prompt

沿用 Style negative prompt，并追加 Storyboard 通用负面词：

```text
text, watermark, UI overlay, broken anatomy, inconsistent character identity, duplicated face, distorted hands, unreadable scene layout
```

注意：当前 `requestEdit` / `requestGeneration` 的公共接口只接收 prompt。若暂不扩展图像接口，不要为了 negative prompt 重构通用接口；先把 negative prompt 写入 effective prompt 或 metadata。后续如图像接口支持 negative prompt，再接入。

## 8. UI 实施范围

文件：

```text
web/src/app/(user)/studio/[seriesId]/page.tsx
web/src/app/(user)/studio/[seriesId]/studio-workspace-model.tsx
```

如单文件过大，可新增：

```text
web/src/app/(user)/studio/[seriesId]/components/storyboard-shot-workbench-modal.tsx
```

### 8.1 Storyboard 卡片

Storyboard 卡片展示：

- 镜头序号。
- 标题。
- selected 镜头图缩略图。
- 没有 selected 时的占位。
- prompt 摘要。
- 对白标记。
- 候选数。
- 状态：pending / ready / generating / failed。
- 引用到的 Cast chips：角色 / 场景 / 道具。
- missing reference chip。
- 点击打开 shot workbench。

### 8.2 顶部入口

顶部按钮第一版可以保守：

- 有缺 selected 的 shot：`生成缺失镜头图`。
- 有 failed shot：`重试失败镜头`。
- 全部 ready：`镜头图已生成`，弱化或禁用。

为了降低风险，第一版可以先只做单 shot workbench 生成，不做批量按钮。若做批量按钮，必须复用 `generateShotCandidates({ target: { mode: "missingSelected" } })`，不能在页面里写循环和回填逻辑。

### 8.3 Shot Workbench

单 shot workbench 包含：

- 当前 selected 镜头图预览。
- prompt 编辑器。
- 角色 / 场景 / 道具引用选择器。
- Style baseline 摘要。
- effective prompt preview。
- Cast reference strip。
- missing reference 警告。
- `1 / 2 / 4` 生成数量选择。
- 生成按钮。
- candidate gallery。
- candidate 设为主图。
- candidate 移除。
- 生成参数摘要展示。

视觉遵守 `docs/studio-lumenx-visual-standards.md`。不要使用普通 Ant Design / SaaS 风格卡片堆叠，不要破坏 Studio dark glass 工作台风格。

## 9. 实施步骤

### 9.1 数据补正

- 给 `StudioShot` 增加 `prompt`。
- `parsedShotSchema` 支持可选 `prompt`。
- `toStudioShot` 写入 prompt。
- `formatEpisodeStructure` 输出 `shotDrafts[].prompt`。
- 手工结构草稿 normalize 时保留 prompt。
- 旧 shot 缺 prompt 时 fallback 到 `description + dialogue`。

验收：

- 新解析剧本后，每个 shot 都有可见 prompt。
- 旧项目打开不报错。
- 保存结构草稿不丢 prompt。

### 9.2 Storyboard 派生模型

扩展 `buildStoryboardCards`：

- selected image asset id。
- candidate count。
- generation status。
- last error。
- prompt。
- referenced Cast summaries。
- missing reference summaries。

验收：

- 有 selected 镜头图时卡片显示 ready。
- 只有 candidate 没 selected 时仍是 pending。
- Cast selected 缺失时 preflight 能指出具体角色 / 场景 / 道具。

### 9.3 生成 Module

在 `studio-generation.ts` 新增：

- `generateShotCandidates`
- `selectShotAssetReference`
- `removeShotCandidateReference`
- `updateShotPrompt`
- `updateShotReferences`

内部复用或抽取已有 Cast helper：

- `readStudioArtDirection`
- `defaultStoreImage`
- `readGenerationError`
- `normalizeSingleSelectedImageRef`
- `selectImageAssetRef`

不要引入一个只有一层转发的新 Module。若 helper 明显服务 Cast 和 Storyboard 两边，可以在同文件内抽小函数。

验收：

- 有 references 时调用 `requestEdit`。
- 无 references 且 `allowNoReferences` 为 false 时失败并提示。
- 无 references 且 `allowNoReferences` 为 true 时调用 `requestGeneration`。
- 成功图片先创建 asset，再写 shot refs。
- 首次空镜头单张生成 selected。
- 后续生成 candidate。
- 失败不清空已有候选。

### 9.4 UI 接入

- Storyboard 卡片显示 selected 图和 reference 状态。
- 点击卡片打开 workbench。
- Workbench 可编辑 prompt。
- Workbench 可编辑 shot 显式引用。
- Workbench 可生成 1 / 2 / 4 张候选。
- Workbench 可切换 selected。
- Workbench 可移除 candidate。
- 缺 reference 时提示并引导去 Cast。

验收：

- 用户能从 Storyboard 单镜头生成图片候选。
- 用户能比较候选并设为主图。
- Storyboard 不绕过 Cast selected reference 静默裸 prompt 生成。

### 9.5 测试

优先补单元测试：

```text
web/src/services/api/studio-generation.test.ts
web/src/app/(user)/studio/[seriesId]/studio-workspace-model.test.ts
web/src/services/asset-references.test.ts
```

测试场景：

- `normalizeScriptStructure` 为 shot 生成 prompt。
- `buildStoryboardCards` 派生 selected、candidate、missing references。
- `generateShotCandidates` 使用 Cast selected references。
- `generateShotCandidates` 记录 effective prompt 快照。
- `generateShotCandidates` 有 references 时走 requestEdit。
- `generateShotCandidates` 无 references 且允许时走 requestGeneration。
- `generateShotCandidates` 无 references 且不允许时失败。
- 首次空镜头生成 selected。
- 后续生成 candidate。
- selected 切换时旧 selected 降级 candidate。
- 移除 candidate 不影响 selected。
- asset reference scanner 能保护 shot selected / candidate image refs。

## 10. 风险和决策

### 10.1 显式引用需要贯穿解析和编辑

LumenX 的 `StoryboardFrame` 有 `character_ids`、`scene_id`、`prop_ids`。Issue 7 直接采用同方向的 shot-level 显式引用，不用名称匹配作为默认机制。

这会增加 Script 解析 schema、结构草稿 normalize 和旧数据兼容的工作量，但换来更稳定、更可解释的 Storyboard 参考图选择。第一版可以先不做完整引用编辑器，但必须在 UI 中显示缺失引用，并提供重新解析或手工补齐的路径。

### 10.2 当前图像接口没有独立 negative prompt 参数

不要为了 Issue 7 重构通用图像接口。先把 negative prompt 进入快照和 effective prompt；后续如要接入模型级 negative prompt，再统一改 `requestGeneration` / `requestEdit`。

### 10.3 LumenX 自动 selected 规则与本项目迁移基线不同

LumenX 每批生成后会把最后生成的 variant 设为 selected。当前项目迁移基线更保守：

- 空镜头首次单张生成可以自动 selected。
- 后续生成默认 candidate。
- 用户手动决定 selected。

Issue 7 采用当前项目迁移基线，不能照搬 LumenX 的自动替换 selected 行为。

### 10.4 不要提前做视频队列

LumenX StoryboardR2V 前端已经有视频任务、候选视频、队列面板、final take 等能力。但当前项目 Issue 7 只做镜头图片候选。视频相关行为等 Issue 10 以后再做，否则会把 Storyboard 图片闭环拖成大工程。

## 11. 完成定义

Issue 7 完成时，用户应该可以完成以下链路：

```text
Script 解析得到 shots
        ↓
Style 已保存
        ↓
Cast 中角色 / 场景 / 道具有 selected reference image
        ↓
打开 Storyboard
        ↓
查看每个 shot 的 prompt 和 Cast reference 状态
        ↓
打开单个 shot workbench
        ↓
编辑 shot prompt 或角色 / 场景 / 道具显式引用
        ↓
看到 effective prompt preview 和参考图
        ↓
生成 1 / 2 / 4 张镜头图片候选
        ↓
生成图进入素材库 asset
        ↓
shot.assetRefs 写入 selected / candidate
        ↓
用户可以把 candidate 设为 selected
```

如果 Cast selected reference 缺失：

```text
Storyboard 显示缺失项
        ↓
生成入口提示一致性风险
        ↓
用户可以回 Cast 补参考图
        ↓
或明确选择无参考生成
```

## 12. 不变量清单

- Storyboard 不默认绕过 Cast selected reference。
- Style 参与生成必须可见。
- 每次生成出的媒体先成为素材库 asset。
- shot 同一媒体类型最多一个 selected image。
- candidate 不是缓存，不自动丢弃。
- 切换 selected 不删除旧图。
- 移除 candidate 不删除底层 asset。
- 生成失败不清空已有候选。
- 页面不直接拼 relay payload。
- 页面不直接实现 asset 创建和 refs 回填顺序。
- LumenX 后端行为是蓝本；当前项目的本地存储、asset-first、relay 和模型配置边界是约束。
