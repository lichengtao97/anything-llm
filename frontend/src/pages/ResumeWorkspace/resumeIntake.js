import { sampleResume } from "./sampleResume";
import { stripResumeChatPrompt } from "./resumeDialogue";

const CITY_PATTERN =
  /(北京|上海|深圳|广州|杭州|成都|武汉|南京|苏州|西安|重庆|天津|厦门|长沙|郑州|青岛|大连|宁波|无锡|合肥|福州|济南|佛山|东莞|珠海|海外|远程)/;
const DEGREE_PATTERN = /(博士|硕士|研究生|本科|学士|大专|专科|MBA|EMBA)/i;
const PERIOD_PATTERN =
  /(\d{4}(?:[./-]\d{1,2}|年\d{1,2}月?)?\s*(?:-|–|—|~|至|到)\s*(?:至今|现在|当前|\d{4}(?:[./-]\d{1,2}|年\d{1,2}月?)?))/i;

const SKILL_ALIASES = [
  ["LLM", /\bLLM\b|大模型|语言模型/i],
  ["Prompt Engineering", /Prompt\s*Engineering|提示词|prompt/i],
  ["Java", /\bJava\b/i],
  ["Python", /\bPython\b/i],
  ["SQL", /\bSQL\b/i],
  ["Vue", /\bVue(?:\.js)?\b/i],
  ["React", /\bReact\b/i],
  ["TypeScript", /\bTypeScript\b|\bTS\b/],
  ["JavaScript", /\bJavaScript\b|\bJS\b/],
  ["TensorFlow", /\bTensorFlow\b/i],
  ["Spark", /\bSpark\b/i],
  ["数据分析", /数据分析|A\/B测试|AB测试|指标分析/],
  ["多模态交互", /多模态|语音交互|智能座舱|车载智能/],
  ["推荐算法", /推荐算法|强化学习|深度强化学习|匹配算法/],
  ["产品规划", /产品规划|产品设计|需求分析|商业化/],
  ["项目管理", /项目管理|跨团队|跨部门|敏捷/],
];

function cleanText(message = "") {
  return stripResumeChatPrompt(message)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function compact(value = "") {
  return value
    .replace(/^[：:，,\s]+/, "")
    .replace(/[，,。；;\s]+$/, "")
    .trim();
}

function unique(values = []) {
  return Array.from(
    new Set(values.filter(Boolean).map((value) => value.trim()))
  );
}

function currentLooksLikeSample(resume) {
  return (
    resume?.basics?.name === sampleResume.basics.name &&
    resume?.basics?.email === sampleResume.basics.email
  );
}

function hasPatch(patch = {}) {
  return (
    Object.keys(patch.basics || {}).length > 0 ||
    typeof patch.summary === "string" ||
    patch.experience?.length > 0 ||
    patch.projects?.length > 0 ||
    patch.education?.length > 0 ||
    patch.skills?.length > 0 ||
    patch.certificates?.length > 0
  );
}

function normalizePeriod(period = "") {
  return compact(period)
    .replace(/年/g, ".")
    .replace(/月/g, "")
    .replace(/\s*(?:–|—|~|到|-|至(?!今))\s*/g, " - ")
    .replace(/\s+/g, " ");
}

function firstMatch(text, patterns = []) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return compact(match[1]);
  }
  return "";
}

function extractBasics(text) {
  const basics = {};
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(
    /(?:\+?86[-\s]?)?(1[3-9]\d[\s-]?\d{4}[\s-]?\d{4})/
  )?.[1];
  const name = firstMatch(text, [
    /(?:姓名|名字)\s*(?:是|为|叫|:|：)?\s*([\u4e00-\u9fa5·]{2,8})/,
    /(?:我叫|我是)\s*([\u4e00-\u9fa5·]{2,5})(?=[，,。；;\s]|$)/,
  ]);
  const title = firstMatch(text, [
    /(?:期望(?:的)?职业头衔|职业头衔|目标岗位|目标职位|求职岗位|应聘岗位)\s*(?:是|为|:|：)?\s*([^\n，。；;,.]+?)(?=\s*(?:工作|所在|手机|电话|邮箱|$)|[，。；;,.])/,
    /(?:想做|想应聘|想申请|准备应聘|希望做|希望申请)\s*([^\n，。；;,.]+?)(?=\s*(?:岗位|职位)?(?:，|,|。|；|;|手机|电话|邮箱|在|$))/,
  ]);
  const location = firstMatch(text, [
    /(?:所在(?:的)?城市|所在城市|所在地|城市|Base|base)\s*(?:是|为|在|:|：)?\s*([^\n，。；;,.]{2,12})/,
  ]);

  if (name && !["一个", "一名", "产品", "工程"].includes(name))
    basics.name = name;
  if (title) basics.title = title;
  if (phone) basics.phone = phone.replace(/[\s-]/g, "");
  if (email) basics.email = email;
  if (location) basics.location = location.match(CITY_PATTERN)?.[1] || location;

  return basics;
}

function extractEducation(text, currentResume, baseIsSample) {
  if (!/(毕业|院校|学校|大学|学院|学历|专业)/.test(text)) return null;

  const period = text.match(PERIOD_PATTERN)?.[1];
  const degree = text.match(DEGREE_PATTERN)?.[1] || "";
  const school =
    firstMatch(text, [
      /(?:毕业院校|学校|院校)\s*(?:是|为|:|：)?\s*([^\n，。；;,.]+?)(?=\s*(?:博士|硕士|研究生|本科|学士|大专|专科|MBA|EMBA|\d{4})|[，。；;,.]|$)/i,
      /([\u4e00-\u9fa5A-Za-z0-9·（）()]{2,30}(?:大学|学院|学校))/,
    ]) || "";

  let major = firstMatch(text, [
    /(?:专业)\s*(?:是|为|:|：)?\s*([^\n，。；;,.]+?)(?=\s*(?:\d{4}|博士|硕士|本科|大专|$)|[，。；;,.])/,
  ]);

  if (!major && degree) {
    const afterDegree = text.split(new RegExp(degree, "i"))[1] || "";
    const beforePeriod = period
      ? afterDegree.split(period)[0]
      : afterDegree.split(/[，。；;,\n]/)[0];
    major = compact(beforePeriod);
  }

  if (!school && !degree && !major) return null;

  const item = {
    school,
    degree,
    major,
    period: period ? normalizePeriod(period) : "",
  };

  const existing = baseIsSample ? [] : currentResume?.education || [];
  return upsertListItem(existing, item, (left, right) => {
    return (
      (left.school && right.school && left.school === right.school) ||
      (left.period && right.period && left.period === right.period)
    );
  });
}

function detectSkills(text, currentResume, baseIsSample) {
  if (
    !/(技能|熟悉|擅长|了解|技术栈|工具|会|使用|掌握|产品|算法|数据)/i.test(text)
  ) {
    return null;
  }

  const detected = SKILL_ALIASES.filter(([, pattern]) =>
    pattern.test(text)
  ).map(([label]) => label);
  if (detected.length === 0) return null;

  const existing = baseIsSample ? [] : currentResume?.skills || [];
  return unique([...existing, ...detected]);
}

function splitHighlights(lines = []) {
  const text = lines.join("\n");
  return unique(
    text
      .split(/\n|[。；;]/)
      .map((line) => compact(line.replace(/^[-*•\d.、\s]+/, "")))
      .filter((line) => line.length >= 8)
  ).slice(0, 6);
}

function extractExperience(text, currentResume, baseIsSample) {
  if (/(毕业院校|学历|专业)/.test(text)) return null;

  const periodMatch = text.match(PERIOD_PATTERN);
  if (!periodMatch) return null;

  const lines = text
    .split("\n")
    .map((line) => compact(line))
    .filter(Boolean);
  const periodLineIndex = lines.findIndex((line) => PERIOD_PATTERN.test(line));
  const period = normalizePeriod(periodMatch[1]);
  const previousLine = periodLineIndex > 0 ? lines[periodLineIndex - 1] : "";
  const companyFromText = firstMatch(text, [
    /(?:任职于|就职于|在)\s*([^\n，。；;,.]{2,30}?)(?=\s*(?:担任|做|工作|期间|，|,|。|$))/,
  ]);
  const company =
    companyFromText ||
    (previousLine && !PERIOD_PATTERN.test(previousLine) ? previousLine : "");
  const afterPeriod = lines.slice(periodLineIndex + 1);
  const role =
    afterPeriod[0] && !CITY_PATTERN.test(afterPeriod[0]) ? afterPeriod[0] : "";
  const locationLine = afterPeriod.find((line, index) => {
    if (index > 2) return false;
    const city = line.match(CITY_PATTERN)?.[1];
    return city && line.length <= city.length + 4;
  });
  const highlightStart = role ? 1 : 0;
  const highlights = splitHighlights(
    afterPeriod.slice(highlightStart).filter((line) => line !== locationLine)
  );

  if (!company && !role && highlights.length === 0) return null;

  const item = {
    company: company || (text.includes("创业") ? "创业经历" : "待补充公司"),
    role: role || (text.includes("创业") ? "创始人/产品负责人" : ""),
    period,
    location: locationLine?.match(CITY_PATTERN)?.[1] || "",
    highlights,
  };

  const existing = baseIsSample ? [] : currentResume?.experience || [];
  return upsertExperience(existing, item);
}

function upsertListItem(items = [], incoming, matcher) {
  const list = [...items];
  const index = list.findIndex((item) => matcher(item, incoming));
  if (index === -1) return [...list, incoming];

  list[index] = {
    ...list[index],
    ...Object.fromEntries(
      Object.entries(incoming).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        return Boolean(value);
      })
    ),
  };
  return list;
}

function upsertExperience(items = [], incoming) {
  const list = [...items];
  const index = list.findIndex((item) => {
    const samePeriod =
      item.period && incoming.period && item.period === incoming.period;
    const sameCompany =
      item.company && incoming.company && item.company === incoming.company;
    return samePeriod || sameCompany;
  });

  if (index !== -1) {
    list[index] = {
      ...list[index],
      ...Object.fromEntries(
        Object.entries(incoming).filter(([, value]) => {
          if (Array.isArray(value)) return value.length > 0;
          return Boolean(value);
        })
      ),
      highlights: unique([
        ...(list[index].highlights || []),
        ...(incoming.highlights || []),
      ]).slice(0, 6),
    };
    return list;
  }

  return /至今|现在|当前/.test(incoming.period)
    ? [incoming, ...list]
    : [...list, incoming];
}

export function extractResumeDraftFromMessage(
  message = "",
  currentResume = {}
) {
  const text = cleanText(message);
  if (!text || text.startsWith("/") || text.startsWith("@agent")) return null;

  const baseIsSample = currentLooksLikeSample(currentResume);
  const patch = {};
  const basics = extractBasics(text);
  const education = extractEducation(text, currentResume, baseIsSample);
  const skills = detectSkills(text, currentResume, baseIsSample);
  const experience = extractExperience(text, currentResume, baseIsSample);

  if (Object.keys(basics).length > 0) patch.basics = basics;
  if (education) patch.education = education;
  if (skills) patch.skills = skills;
  if (experience) patch.experience = experience;

  if (!hasPatch(patch)) return null;
  if (baseIsSample) patch.__replace = true;
  return patch;
}

export function getResumeCompleteness(resume = {}) {
  const basics = resume.basics || {};
  const allHighlights = [
    ...(resume.experience || []).flatMap((item) => item.highlights || []),
    ...(resume.projects || []).flatMap((item) => item.highlights || []),
  ];
  const hasMetrics = allHighlights.some((line) =>
    /(\d+(\.\d+)?%|\d+\s*(?:万|亿|人|次|ms|毫秒|天|周|月)|提升|降低|增长|缩短)/.test(
      line
    )
  );

  const sections = [
    {
      id: "basics",
      label: "基本信息",
      done: Boolean(basics.name && (basics.phone || basics.email)),
    },
    { id: "target", label: "求职定位", done: Boolean(basics.title) },
    { id: "summary", label: "个人总结", done: Boolean(resume.summary) },
    {
      id: "experience",
      label: "工作经历",
      done: (resume.experience || []).length > 0,
    },
    {
      id: "projects",
      label: "项目经历",
      done: (resume.projects || []).length > 0,
    },
    {
      id: "education",
      label: "教育背景",
      done: (resume.education || []).length > 0,
    },
    {
      id: "skills",
      label: "专业技能",
      done: (resume.skills || []).length >= 3,
    },
    { id: "metrics", label: "量化成果", done: hasMetrics },
  ];
  const completed = sections.filter((section) => section.done).length;

  return {
    sections,
    completed,
    total: sections.length,
    score: Math.round((completed / sections.length) * 100),
  };
}

export function getResumeSuggestions(resume = {}) {
  const completeness = getResumeCompleteness(resume);
  const pending = new Set(
    completeness.sections
      .filter((section) => !section.done)
      .map((section) => section.id)
  );
  const suggestions = [];

  if (pending.has("basics")) {
    suggestions.push("补齐姓名、手机号或邮箱，确保招聘方能直接联系。");
  }
  if (pending.has("target")) {
    suggestions.push("明确目标岗位或职业头衔，让简历定位更集中。");
  }
  if (pending.has("experience")) {
    suggestions.push("至少补充最近一段工作经历，包含公司、职位、时间和职责。");
  }
  if (pending.has("metrics")) {
    suggestions.push(
      "每段经历增加1-2个数字化结果，例如转化率、响应耗时或业务增长。"
    );
  }
  if (pending.has("skills")) {
    suggestions.push("把技能拆成模型能力、产品方法、数据分析和技术工具。");
  }
  if (pending.has("summary")) {
    suggestions.push(
      "补一段3-4行个人总结，突出年限、行业、核心能力和业务成果。"
    );
  }
  if (pending.has("education")) {
    suggestions.push("补充学校、学历、专业和在校时间，形成完整背景。");
  }

  if (suggestions.length === 0) {
    suggestions.push("当前结构已经完整，可以继续压缩措辞并强化岗位匹配度。");
  }

  return suggestions.slice(0, 4);
}
