<!-- source: https://github.com/znyupup/ai-video-editing-skill path: SKILL.md license: MIT -->
# vlog-auto-edit

AI Agent自动剪辑旅行Vlog的完整工作流。从原始素材到成品视频，系统级只需ffmpeg，其余在Python venv内完成。by nyx研究所 (GitHub @znyupup · B站/小红书 @nyx研究所)

# AI Agent 自动剪辑旅行 Vlog

**Author:** nyx研究所 · [GitHub](https://github.com/znyupup) · [B站 @nyx研究所](https://space.bilibili.com/4330525) · 小红书 @nyx研究所 · [X @znyupup_music](https://x.com/znyupup_music)

> 把一堆手机拍的旅行素材，用AI自动剪成一个完整vlog。
> 最小依赖：ffmpeg + Python(whisper或FunASR+Pillow) + 视觉API。系统级只装ffmpeg，其余pip装。

## 触发条件

- 用户有一批旅行/日常视频素材，想自动剪成vlog
- 用户说"帮我剪个视频"、"自动剪辑"、"vlog剪辑"

## 前置要求

### 1. 系统工具

| 工具 | 用途 | 安装 |
|------|------|------|
| ffmpeg | 视频裁剪/编码/拼接/抽帧/音量检测 | `brew install ffmpeg` (macOS) / `apt install ffmpeg` (Linux) |
| Python 3.9+ | 脚本胶水 | macOS/Linux 系统自带 |

### 2. Python依赖（先检测，已有则跳过）

**先检测系统是否已安装所需包，不要无脑创建 venv：**

```bash
# 检测 whisper
python3 -c "import whisper; print('✅ whisper已安装:', whisper.__file__)"

# 检测 Pillow
python3 -c "from PIL import Image; print('✅ Pillow已安装')"
```

**⚠ 重要：不要用 `2>/dev/null` 吃掉错误！要看到实际报错才能判断是真没装还是PATH问题。**

**⚠ macOS 注意：** 检查系统已安装的包再决定是否需要 venv。如果系统 python3 已经能 `import whisper` 和 `from PIL import Image`，直接用就行，不要盲目创建 venv 导致找不到已有的包。

**仅在检测不通过时才安装：**

```bash
# 方案A: 直接装到用户环境（推荐）
pip install openai-whisper Pillow

# 方案B: 如果用户环境有冲突，再用 venv
python3 -m venv .venv && source .venv/bin/activate
pip install openai-whisper Pillow
```

**⚠ 不要每个项目都新建 venv 重装一遍！whisper模型文件1.4GB，pip install也要几分钟。**

**⚠ ASR引擎二选一：Whisper 或 FunASR**

本工作流支持两个ASR引擎，优先用 whisper，whisper 装不上就用 FunASR：

| | Whisper (OpenAI) | FunASR (阿里达摩院) |
|---|---|---|
| 安装 | `pip install openai-whisper` | `pip install funasr modelscope torchaudio` |
| 模型 | medium (1.4GB, 从GitHub下载) | paraformer-zh (1.05GB, 从ModelScope下载) |
| 附加模型 | 无 | VAD模型 + 标点模型 (首次运行自动下载, 共~50MB) |
| 中文效果 | 好 | 好（与whisper medium相当，细节略多） |
| 速度 | 14s音频 ≈ 5-10s (CPU) | 14s音频 ≈ 1.9s (CPU, RTF=0.132) ⚡ |
| 时间戳粒度 | 句级别 (每句话一个start/end) | 字级别 (每个字一个时间戳) |
| 模型下载源 | GitHub (国内不稳定，容易失败) | ModelScope (国内极快，~15MB/s) |
| 隐性依赖 | torch | torch + torchaudio (⚠ 必须额外装) |

**检测已安装的ASR引擎：**
```bash
python3 -c "import whisper; print('✅ whisper可用')" 2>/dev/null \
  || python3 -c "from funasr import AutoModel; print('✅ funasr可用')" 2>/dev/null \
  || echo "❌ 没有可用的ASR引擎，需要安装一个"
```

**⚠ FunASR 安装注意事项：**
- 必须装 torchaudio！`pip install funasr modelscope` 不会自动装 torchaudio，import 时会报 `No module named 'torchaudio'`
- 正确安装命令：`pip install funasr modelscope torchaudio`
- 首次运行会自动从 ModelScope 下载3个模型（ASR + VAD + 标点），总共约1.1GB，国内速度快
- 模型缓存在 `~/.cache/modelscope/hub/models/iic/` 目录下
- import 时会有 urllib3 的 SSL 警告（NotOpenSSLWarning），可忽略，不影响功能

**标题卡方案自动选择：**
```bash
ffmpeg -filters 2>&1 | grep drawtext
# 有drawtext → 直接用ffmpeg，不需要Pillow
# 没有 → 用Pillow生成透明PNG再overlay（macOS brew ffmpeg通常没编freetype）
```

**可选（参考分析阶段用）：**
```bash
which yt-dlp && echo "✅ yt-dlp已安装" || pip install yt-dlp
python3 -c "import scenedetect" 2>/dev/null && echo "✅ scenedetect已安装" || pip install scenedetect
```

### 3. 视觉理解模型（API）

需要一个能理解图像内容的视觉模型API，用于分析素材画面。

**要求：**
- 支持 OpenAI Chat Completions 格式（messages + image_url）
- 支持 base64 图片输入（本地素材抽帧后编码上传）
- 中文理解能力（需要描述画面内容、标注镜头类型等）

**推荐模型：**

| 模型 | 费用 | 说明 |
|------|------|------|
| 智谱 GLM-4.6V-Flash | 免费 | 注册 https://open.bigmodel.cn 即用，中文理解好 |
| GPT-4o | 付费 | 效果最好 |
| Qwen-VL | 付费 | 阿里云，中文好 |

**调用示例：**

```python
import base64, json, urllib.request

API_URL = 'YOUR_VISION_API_ENDPOINT'   # 替换为你的视觉模型端点
API_KEY='***'               # 替换为你的API Key
MODEL = 'YOUR_MODEL_NAME'             # 替换为你的模型名

with open('frame.jpg', 'rb') as f:
    img_b64 = base64.b64encode(f.read()).decode()

payload = {
    'model': MODEL,
    'messages': [{'role': 'user', 'content': [
        {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{img_b64}'}},
        {'type': 'text', 'text': '简洁描述画面内容，标注：镜头类型(远/全/中/近/特写)、拍摄手法(固定/手持/移动)、画面氛围。格式：内容|类型|手法|氛围'}
    ]}],
    'max_tokens': 200
}

req = urllib.request.Request(API_URL, json.dumps(payload).encode(),
    {'Content-Type': 'application/json', 'Authorization': f'Bearer {API_KEY}'})
with urllib.request.urlopen(req, timeout=30) as resp:
    result = json.loads(resp.read())
    print(result['choices'][0]['message']['content'])
```

**⚠ 视觉API调用注意事项：**
- 输入格式：ffmpeg抽帧为JPEG → base64编码 → `data:image/jpeg;base64,{b64}` 放入 image_url
- 抽帧尺寸：不需要原始分辨率，缩到 720p 即可（节省上传带宽和token）
- 端点区分：有些平台视觉模型和文本模型端点不同，确认用对
- 限流：高峰时段容易被限流，加 retry + sleep

### 不需要的（踩过的坑）

- ❌ 剪映/CapCut — v10.4+ 项目文件加密，无法程序化操作
- ❌ moviepy — ffmpeg命令行已够用，多一层抽象反而不灵活
- ❌ capcut-cli (GitHub) — 基于明文JSON，对加密后的新版无效
- ❌ ImageMagick — Pillow已够用，不需要再装一个图像工具

## 工作流（7个阶段）

### 阶段1: 素材盘点

目标：了解你有什么素材。

```bash
# 批量获取素材信息
for f in footage/*.{MOV,mp4,MP4}; do
  echo "=== $f ==="
  ffprobe -v quiet -print_format json -show_format -show_streams "$f" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); \
      s=d['streams'][0]; f=d['format']; \
      print(f\"  时长: {float(f['duration']):.1f}s\"); \
      print(f\"  分辨率: {s['width']}x{s['height']}\"); \
      print(f\"  编码: {s['codec_name']}\")"
done
```

输出一份素材清单：数量、总时长、分辨率分布、拍摄时间范围。

### 阶段2: 参考研究（可选但强烈建议）

目标：建立"好vlog长什么样"的认知。不做这步直接剪，效果会很差。

**步骤：**
1. 找2-3个同类型优质vlog（B站/YouTube）
2. `yt-dlp` 下载720p视频 + 音频
3. `whisper` 转录旁白（提取叙事结构）
4. `scenedetect` 检测镜头切换（统计节奏）
5. `ffmpeg` 抽关键帧 + 视觉API分析（理解画面构成）

**已验证的规律：**

- 镜头节奏: 平均3-4秒/镜头是黄金节奏
- 内容配比: 美食40-45% + 风景30% + 人物15% + 日常15%
- 镜头类型: 近景/中景为主(60-65%)，全景/远景穿插(35-40%)
- 叙事结构: 精彩片头 → 出发/到达 → 按地点串联 → 情感升华收尾
- 长短交替: 短镜头(<2s)做蒙太奇，长镜头(>8s)做叙事

**剪辑教程要点：**
1. 找侧重点，不要流水账
2. 三幕式结构: 25%悬念 + 50%发展 + 25%收尾
3. 精彩放片头
4. 情感占51%（Walter Murch六法则）

### 阶段3: 素材三维分析

目标：让AI理解每条素材的内容。每条素材做三维分析：

**a) 音频分析 — ASR转录（Whisper 或 FunASR）**
```bash
# 提取音频（16kHz单声道WAV，两个引擎通用的最佳输入格式）
ffmpeg -i footage/INPUT.MOV -vn -acodec pcm_s16le -ar 16000 -ac 1 /tmp/audio.wav
```

**方案1: Whisper转录（优先使用）**
```python
import whisper, json
model = whisper.load_model('medium')
result = model.transcribe('/tmp/audio.wav', language='zh')
segments = [{"start": s['start'], "end": s['end'], "text": s['text']} for s in result['segments']]
# 输出: [{"start": 0.5, "end": 2.3, "text": "我们现在在中央大街"}, ...]
```

**方案2: FunASR转录（Whisper装不上时的替代）**
```python
import warnings
warnings.filterwarnings("ignore")
from funasr import AutoModel

model = AutoModel(
    model="paraformer-zh",      # Paraformer-large，中文ASR主模型(1.05GB)
    vad_model="fsmn-vad",       # 语音活动检测，自动切分静音段
    punc_model="ct-punc",       # 自动加标点
    log_level="ERROR",
    disable_update=True         # 跳过版本检查，加快启动
)

result = model.generate(input="/tmp/audio.wav")
text = result[0]["text"]        # 完整识别文本（已加标点）
timestamps = result[0].get("timestamp", [])  # 字级别时间戳 [[start_ms, end_ms], ...]

# ⚠ FunASR时间戳是字级别(毫秒)，需要聚合成句级别才能和whisper格式统一
# 聚合策略：按标点符号（。！？，）切分成句子
segments = []
if timestamps and text:
    puncs = set("。！？，,.!?")
    current_start = timestamps[0][0] / 1000.0
    current_text = ""
    chars = list(text)
    for i, (char, ts) in enumerate(zip(chars, timestamps)):
        current_text += char
        if char in puncs or i == len(chars) - 1:
            segments.append({
                "start": round(current_start, 1),
                "end": round(ts[1] / 1000.0, 1),
                "text": current_text.strip()
            })
            if i < len(chars) - 1:
                current_start = timestamps[i + 1][0] / 1000.0
            current_text = ""
# 输出格式与whisper一致: [{"start": 0.6, "end": 2.9, "text": "我们现在在中央大街的入口，"}, ...]
```

**⚠ FunASR 输出差异注意：**
- FunASR 返回的是完整文本 + 字级别时间戳，不像 whisper 直接给句级别 segments
- 上面的聚合代码把字级别时间戳按标点切分成句子，输出格式与 whisper 对齐
- 如果素材没有语音，FunASR 返回空文本 `""`，timestamps 为空 `[]`
- FunASR 速度比 whisper 快 3-5x（14s音频只需1.9s），批量处理时优势明显

**b) 音量检测 — ffmpeg**
```bash
ffmpeg -i footage/INPUT.MOV -af volumedetect -f null /dev/null 2>&1 | grep volume
# mean_volume: 平均音量(dB)  max_volume: 峰值音量(dB)
# mean < -40dB 基本无声  mean > -20dB 有明显声音/语音
```

**c) 视觉分析 — ffmpeg抽帧 + 视觉理解模型**
```bash
# 抽帧策略（按时长分段）
# ≤20s → 3帧(首/中/尾)
# 20-60s → 5帧
# >60s → 每15s一帧

# 抽首/中/尾三帧示例（缩到720p节省带宽）
ffmpeg -i footage/INPUT.MOV -vf "select=eq(n\,0),scale=1280:-1" -frames:v 1 -q:v 2 frame_start.jpg
ffmpeg -i footage/INPUT.MOV -vf "select=eq(n\,MIDDLE),scale=1280:-1" -frames:v 1 -q:v 2 frame_mid.jpg
ffmpeg -i footage/INPUT.MOV -vf "reverse,scale=1280:-1" -frames:v 1 -q:v 2 frame_end.jpg
```

**d) 输出格式**（每条素材一个JSON）
```json
{
  "filename": "clip_001.MOV",
  "duration": 15.3,
  "resolution": "1920x1080",
  "visual": [
    {"time": "0:00", "description": "...", "shot_type": "近景", "camera": "手持", "mood": "温馨"}
  ],
  "audio": {
    "has_speech": true,
    "mean_volume_db": -20.5,
    "max_volume_db": -3.2,
    "transcript": [{"start": 0.5, "end": 2.3, "text": "..."}]
  }
}
```

### 阶段3.5: 素材精修预处理

目标：在给LLM之前，自动标注每条素材的"推荐有效区间"，让LLM专注叙事编排。

**为什么需要这步：**
原始手机素材普遍存在：开头录制口令、同一句话重复多遍、前1-2s举手机晃动、说完话后拖很长的无意义画面。如果把这些原始数据直接给LLM，LLM输出的plan还需要逐条修补。

**预处理做四件事：**

#### a) 录制口令检测

```python
RECORDING_CUES = [
    "开始了", "好了开始", "开始录了", "好了 开始",
    "走了", "好了", "来了",  # 仅在前3s内出现时算口令
]

def detect_cues(transcript_segments, duration):
    """检测录制口令，返回skip zones"""
    skip_zones = []
    for seg in transcript_segments:
        text = seg['text'].strip()
        if seg['start'] < 3.0 and any(text.startswith(c) or text == c for c in RECORDING_CUES):
            skip_zones.append({
                'type': 'recording_cue',
                'range': [seg['start'], seg['end']],
                'text': text,
                'action': 'skip'
            })
        if seg['end'] > duration - 3.0 and text in ["好了", "走了", "好了 走"]:
            skip_zones.append({
                'type': 'recording_cue',
                'range': [seg['start'], seg['end']],
                'text': text,
                'action': 'skip'
            })
    return skip_zones
```

#### b) 重复语音检测

```python
from difflib import SequenceMatcher

def detect_repeats(segments, threshold=0.6):
    """检测重复语音，标记建议跳过的重复段"""
    repeats = []
    for i, a in enumerate(segments):
        for j, b in enumerate(segments):
            if j <= i: continue
            ratio = SequenceMatcher(None, a['text'], b['text']).ratio()
            if ratio >= threshold and len(a['text']) > 4:
                skip = a if len(a['text']) <= len(b['text']) else b
                repeats.append({
                    'type': 'repeat',
                    'range': [skip['start'], skip['end']],
                    'text': skip['text'],
                    'kept': b['text'] if skip == a else a['text'],
                    'action': 'suggest_skip'
                })
    return repeats
```

#### c) 起手晃动 / 结尾拖拽检测

```python
def detect_trim_points(segments, duration, mean_volume_db):
    """基于语音+音量推荐起止点"""
    suggested_start = 0.0
    suggested_end = duration

    if segments:
        first_speech = segments[0]['start']
        last_speech_end = segments[-1]['end']
        if first_speech > 2.0:
            suggested_start = max(0, first_speech - 0.5)
        if duration - last_speech_end > 3.0:
            suggested_end = last_speech_end + 1.5
    else:
        if duration > 5.0:
            suggested_start = 1.0

    return suggested_start, suggested_end
```

#### d) 纯画面时长限制

| 模式     | 纯画面上限 | 口令处理 | 重复处理       | 起手晃动 |
|----------|-----------|---------|---------------|---------| 
| strict   | 8-10s     | 全部去除 | 只留1遍        | 去1.5s  |
| normal   | 12-15s    | 去除明确口令 | 去明显重复   | 去1.0s  |
| loose    | 20-25s    | 仅去"开始了" | 保留大部分    | 去0.5s  |

#### e) 输出格式

预处理结果追加到素材分析数据里：

```
━━━ clip_012.mp4 | 时长25.8s | 1920x1080 ━━━
  【画面】...
  【语音】...
  【精修建议】模式: normal
    原始区间: [0.0 - 25.8]
    推荐区间: [2.4 - 25.8]
    ⊘ [0.0-2.4] 跳过: 录制口令 "开始了"
    有效语音: [2.62-25.8]
```

**⚠ 重要原则：预处理只做标注和建议，不做硬裁剪。LLM保留最终决定权。**

### 阶段4: LLM叙事编排

目标：把预处理后的素材数据交给LLM，生成剪辑方案。

输入：素材分析 + 精修建议(推荐区间) + 参考研究结论
输出：剪辑方案JSON（结构见下方schema）

#### edit_plan JSON Schema

```json
{
  "title": "视频标题",
  "structure": [
    {
      "section": "段落名 — 副标题",
      "description": "本段落内容概述",
      "clips": [
        {
          "file": "素材文件名.mp4",
          "start": 0.0,
          "end": 12.0,
          "note": "画面内容简述",
          "subtitle": "保留的语音文字"
        }
      ]
    }
  ],
  "bgm_suggestion": "BGM风格建议（含genre/mood/instruments/tempo/bpm）",
  "editing_notes": "整体剪辑说明"
}
```

**约束：**
- 同一素材可出现在多个clip中（不同时间区间）
- start/end 不能截断语音中间（阶段4.5会校验）
- 第一个section建议是"开篇"类引入段落
- 最后一个section建议是"收尾"类段落

详细prompt模板见 `templates/edit_plan_prompt.md`。

### 阶段4+ : 分镜可视化 + Dashboard（浏览器预览）

目标：把LLM输出的剪辑方案做成图文并茂的网页，方便用户直观Review。

**Dashboard 包含两个面板：**

1. **📋 素材总览** — 素材缩略图网格 + 时长/语音/音量标注 + 筛选(全部/已用/未用/含语音) + 点击查看详情
2. **✅ 成品质量检查** — 成品视频定时抽帧(每30秒) + 段落定位 + 点击放大

**使用 `gen_dashboard.py` 脚本：**

```bash
# 最小用法（只生成素材面板）
python3 scripts/gen_dashboard.py \
  --analysis clip_analysis.json \
  --plan edit_plan.json \
  --footage footage/ \
  --out output/

# 完整两面板（含成品QC帧）
python3 scripts/gen_dashboard.py \
  --analysis clip_analysis.json \
  --plan edit_plan.json \
  --footage footage/ \
  --video output/final.mp4 \
  --out output/
```

**支持两种分析数据格式（自动检测）：**
- 标准格式 `clip_analysis.json`: `{filename, duration, visual: [...], audio: {...}}`
- 紧凑格式 `clips_compact.json`: `{file, dur, visual: "string", speech: [...]}`

用户确认分镜方案后，再进入渲染阶段。

### 阶段4.5: 语音截断校验

目标：自动校验LLM输出的plan，确保没有把任何语音从中间截断。

```python
def validate_speech(plan_clips, speech_data):
    """检查每个clip的start/end是否截断了语音"""
    issues = []
    for clip in plan_clips:
        f = clip['file']
        cs, ce = clip['start'], clip['end']
        if f not in speech_data: continue
        for ss, se, txt in speech_data[f]:
            if ss < ce and se > cs:  # 语音与clip有交集
                if ss < cs - 0.3:    # 语音开始在clip之前
                    issues.append(f"截断开头: {f} clip从{cs}开始，但语音\"{txt}\"从{ss}开始")
                if se > ce + 0.5:    # 语音结束在clip之后
                    issues.append(f"截断结尾: {f} clip在{ce}结束，但语音\"{txt}\"到{se}结束")
    return issues
```

**校验不通过时：自动修复start/end，不需要回LLM重新编排。**

#### 自动修复逻辑

```python
def fix_speech_cuts(plan, speech_data, margin=0.3):
    """
    自动修复语音截断问题。直接修改plan中的start/end。
    
    参数:
        plan: edit_plan dict (会被原地修改)
        speech_data: dict, {filename: [(start, end, text), ...]}
        margin: float, 语音边界容差(秒)
    
    返回:
        fixes: list of str, 修复日志
    """
    fixes = []
    
    for sec in plan["structure"]:
        for clip in sec["clips"]:
            f = clip["file"]
            cs = float(clip["start"])
            ce = float(clip["end"])
            
            if f not in speech_data:
                continue
            
            for ss, se, txt in speech_data[f]:
                if ss >= ce or se <= cs:
                    continue
                
                # 开头截断：clip.start > speech.start + margin
                if ss < cs - margin and se > cs:
                    old_start = cs
                    new_start = max(0, ss - 0.1)
                    clip["start"] = round(new_start, 1)
                    fixes.append(
                        f"  修复开头: {f} [{old_start}→{new_start}] "
                        f"语音\"{txt[:20]}\"从{ss}s开始"
                    )
                    cs = new_start
                
                # 结尾截断：clip.end < speech.end - margin
                if se > ce + margin and ss < ce:
                    old_end = ce
                    new_end = se + 0.2
                    clip["end"] = round(new_end, 1)
                    fixes.append(
                        f"  修复结尾: {f} [{old_end}→{new_end}] "
                        f"语音\"{txt[:20]}\"到{se}s结束"
                    )
                    ce = new_end
    
    return fixes


def validate_and_fix(plan, speech_data):
    """
    端到端校验+修复入口。
    
    用法:
        import json
        # 加载plan
        plan = json.load(open('edit_plan.json'))
        # 加载语音数据 (格式: {filename: [{start, end, text}, ...]})
        raw = json.load(open('clip_analysis.json'))
        speech_data = {}
        for clip_info in raw:
            fname = clip_info['filename']
            if clip_info['audio']['has_speech']:
                speech_data[fname] = [
                    (s['start'], s['end'], s['text'])
                    for s in clip_info['audio']['transcript']
                ]
        
        # 校验
        all_clips = [c for sec in plan['structure'] for c in sec['clips']]
        issues = validate_spe

[...shortened]
