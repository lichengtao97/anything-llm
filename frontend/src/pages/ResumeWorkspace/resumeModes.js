export const RESUME_MODE_FALLBACK = "resume-create";

export const RESUME_MODES = {
  "resume-create": {
    label: "创建个人简历",
    tab: "resume",
    emptyTitle: "AI 简历创作助手",
    promptHint: "当前任务是从零创建个人求职简历。",
  },
  "resume-optimize": {
    label: "简历优化",
    tab: "resume",
    emptyTitle: "AI 简历优化助手",
    promptHint: "当前任务是根据已有简历和目标岗位优化简历。",
  },
  "job-research": {
    label: "岗位调研",
    tab: "job",
    emptyTitle: "岗位调研工作台",
    promptHint: "当前任务是根据目标岗位或 JD 生成岗位调研要点。",
  },
  analysis: {
    label: "行业竞争力分析",
    tab: "analysis",
    emptyTitle: "竞争力分析工作台",
    promptHint: "当前任务是分析候选人与目标岗位的匹配度和改进方向。",
  },
  interview: {
    label: "面试助手",
    tab: "interview",
    emptyTitle: "面试准备工作台",
    promptHint: "当前任务是基于简历和目标岗位准备面试问题与回答提纲。",
  },
};

export const RESUME_PREVIEW_TABS = [
  {
    id: "resume",
    label: "简历",
    title: "简历预览",
    description: "结构化简历会在这里实时渲染。",
  },
  {
    id: "job",
    label: "岗位",
    title: "岗位调研",
    description:
      "粘贴目标岗位或 JD 后，将沉淀岗位职责、能力关键词和简历改写方向。",
  },
  {
    id: "analysis",
    label: "竞争力",
    title: "竞争力分析",
    description: "补齐简历和目标岗位后，将展示优势、差距和需要补充的证据。",
  },
  {
    id: "interview",
    label: "面试",
    title: "面试准备",
    description: "基于简历和目标岗位生成问题、STAR 提纲和项目深挖方向。",
  },
];

export function getResumeMode(mode) {
  return RESUME_MODES[mode] || RESUME_MODES[RESUME_MODE_FALLBACK];
}
