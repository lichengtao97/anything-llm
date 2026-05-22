import { analyzeResume, isBlankResume } from "./resumeProgress";

const RESUME_PROTOCOL_MARKER = "RESUME_UPDATE_JSON";
const RESUME_CONTEXT_MARKER = "RESUME_CONTEXT";
const RESUME_INSTRUCTIONS_MARKER = "RESUME_ASSISTANT_INSTRUCTIONS";

const RESUME_ASSISTANT_PROMPT = `# 角色
你是 AnyGen 简历顾问，一位经验丰富的职业顾问和简历撰写专家。你的目标是通过自然对话，帮助用户从零创建一份高质量的专业简历。

# 工作方式
1. 你像一个耐心的职业导师，用自然对话引导用户提供信息。
2. 每次对话后，提取结构化数据并通过 render 指令更新简历。
3. 不要一次性问太多问题，每次聚焦 1-2 个主题。
4. 根据用户回答追问细节，特别是可量化的成果。

# 对话阶段
按以下顺序收集信息，但可以根据用户回答灵活调整：
阶段 1 - 基本信息：姓名、求职意向/职称、手机号、邮箱、所在城市
阶段 2 - 教育背景：学校名称、专业、学位、时间段、突出成绩(可选)
阶段 3 - 工作经历：公司名称、职位、时间段、核心成果(用数字量化)
阶段 4 - 项目经历：项目名称、你的角色、技术栈、核心贡献
阶段 5 - 技能与证书：专业技能列表、持有证书
阶段 6 - 个人总结：由你根据所有信息撰写一段 50-80 字的职业摘要

# 追问策略
- 模糊成果：追问具体数字或结果。
- 缺少时间：追问大致时间范围。
- 缺少角色：追问用户主导、负责或参与了什么。
- 技能泛泛：追问最常用的 3-5 个工具或技术。

# 输出规范
每次回复必须先给用户可见的自然语言回复，然后在回复末尾追加一个 json:render 代码块。只有在没有任何可更新数据时，才可以省略 render 块。

render 块格式：
\`\`\`json:render
{
  "type": "resume",
  "action": "merge",
  "stage": "basics",
  "data": {
    "basics": {
      "name": "用户姓名",
      "title": "求职意向",
      "phone": "手机号",
      "email": "邮箱",
      "location": "城市"
    }
  }
}
\`\`\`

action 只能是 "merge" 或 "replace"。stage 只能是 basics、education、experience、projects、skills、summary、complete。

# 重要规则
- 不要虚构用户没说过的信息。
- 只以当前对话和 RESUME_CONTEXT 中的当前简历数据为准，不要引用历史会话、账户名、示例简历或记忆中的个人信息。
- 如果历史回复中出现未经用户确认的人名、公司、项目或经历，必须忽略，并以用户最新回答为准。
- 手机号、邮箱保持用户提供的原始格式。
- 工作成果尽量用 STAR 法则改写，并包含量化结果。
- 技能列表保持简洁，不要自行扩展。
- 如果用户提供一大段文字，提炼为 3-5 条 bullet points。
- 不要解释 render 指令，不要告诉用户你在输出 JSON。`;

function shouldBypassResumeProtocol(message = "") {
  const trimmed = message.trim();
  return (
    !trimmed ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("@agent") ||
    trimmed.includes(RESUME_PROTOCOL_MARKER) ||
    trimmed.includes(RESUME_CONTEXT_MARKER) ||
    trimmed.includes("```json:render")
  );
}

export function buildResumeChatPrompt(message, resume) {
  if (shouldBypassResumeProtocol(message)) return message;

  const progress = analyzeResume(resume);
  const currentResume = isBlankResume(resume) ? null : resume;
  const context = [
    `<!--${RESUME_CONTEXT_MARKER}`,
    `当前阶段: ${progress.stage}`,
    `完成度: ${progress.percentage}%`,
    `已有信息: ${progress.filled.join(", ") || "无"}`,
    `缺失信息: ${progress.missing.join(", ") || "无"}`,
    `缺失字段: ${progress.missingFields.join(", ") || "无"}`,
    `当前简历数据: ${JSON.stringify(currentResume || {}, null, 0)}`,
    `${RESUME_CONTEXT_MARKER}-->`,
  ].join("\n");

  return [
    message,
    "",
    context,
    "",
    "---",
    RESUME_INSTRUCTIONS_MARKER,
    RESUME_ASSISTANT_PROMPT,
    "",
    "只允许写入这些 data 字段：basics、summary、experience、projects、education、skills、certificates。",
    "experience 条目字段：company、role、period、location、highlights。",
    "projects 条目字段：name、role、period、description、highlights、techStack。",
    "education 条目字段：school、degree、major、period、highlights。",
    "请根据 RESUME_CONTEXT 中的缺失字段决定下一步追问。",
    "---",
  ].join("\n");
}

export function stripResumeChatPrompt(message = "") {
  if (typeof message !== "string") {
    return message;
  }

  let cleaned = message.replace(
    new RegExp(
      `<!\\s*(?:--|[–—−])\\s*${RESUME_CONTEXT_MARKER}[\\s\\S]*?${RESUME_CONTEXT_MARKER}\\s*(?:--|[–—−])\\s*>`,
      "gi"
    ),
    ""
  );

  const instructionStart = cleaned.indexOf(
    `\n---\n${RESUME_INSTRUCTIONS_MARKER}`
  );
  if (instructionStart !== -1) {
    return cleaned.slice(0, instructionStart).trimEnd();
  }

  if (
    !cleaned.includes("Resume workspace protocol:") &&
    !cleaned.includes(RESUME_PROTOCOL_MARKER)
  ) {
    return cleaned.trimEnd();
  }

  const exactProtocolStart = cleaned.indexOf(
    "\n---\nResume workspace protocol:"
  );
  if (exactProtocolStart !== -1) {
    return cleaned.slice(0, exactProtocolStart).trimEnd();
  }

  const looseProtocolStart = cleaned.indexOf("Resume workspace protocol:");
  if (looseProtocolStart === -1) return cleaned;

  return cleaned
    .slice(0, looseProtocolStart)
    .replace(/\n?---\s*$/, "")
    .trimEnd();
}

export { RESUME_CONTEXT_MARKER, RESUME_PROTOCOL_MARKER };
