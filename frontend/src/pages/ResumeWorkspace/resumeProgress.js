export const RESUME_STAGE_ORDER = [
  "basics",
  "education",
  "experience",
  "projects",
  "skills",
  "summary",
];

export const RESUME_STAGE_LABELS = {
  basics: "基本信息",
  education: "教育背景",
  experience: "工作经历",
  projects: "项目经历",
  skills: "技能证书",
  summary: "个人总结",
  complete: "已完成",
};

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

export function isBlankResume(resume = null) {
  if (!resume || typeof resume !== "object") return true;

  return (
    !hasText(resume.summary) &&
    !hasItems(resume.experience) &&
    !hasItems(resume.projects) &&
    !hasItems(resume.education) &&
    !hasItems(resume.skills) &&
    !hasItems(resume.certificates) &&
    !Object.values(resume.basics || {}).some((value) => {
      if (Array.isArray(value)) return value.length > 0;
      return hasText(value);
    })
  );
}

export function analyzeResume(resume = null) {
  const basics = resume?.basics || {};
  const checks = {
    basics: {
      weight: 20,
      label: RESUME_STAGE_LABELS.basics,
      done: Boolean(
        hasText(basics.name) &&
          hasText(basics.title) &&
          (hasText(basics.phone) || hasText(basics.email))
      ),
      missingFields: [
        !hasText(basics.name) ? "姓名" : null,
        !hasText(basics.title) ? "目标岗位/职业头衔" : null,
        !hasText(basics.phone) && !hasText(basics.email)
          ? "手机号或邮箱"
          : null,
        !hasText(basics.location) ? "所在城市" : null,
      ].filter(Boolean),
    },
    education: {
      weight: 15,
      label: RESUME_STAGE_LABELS.education,
      done: hasItems(resume?.education),
      missingFields: ["学校、专业、学位和时间段"],
    },
    experience: {
      weight: 25,
      label: RESUME_STAGE_LABELS.experience,
      done:
        hasItems(resume?.experience) &&
        resume.experience.some((item) => hasItems(item.highlights)),
      missingFields: ["公司、职位、时间段和量化成果"],
    },
    projects: {
      weight: 15,
      label: RESUME_STAGE_LABELS.projects,
      done: hasItems(resume?.projects),
      missingFields: ["项目名称、角色、技术栈和核心贡献"],
    },
    skills: {
      weight: 10,
      label: RESUME_STAGE_LABELS.skills,
      done: hasItems(resume?.skills),
      missingFields: ["专业技能、工具或证书"],
    },
    summary: {
      weight: 15,
      label: RESUME_STAGE_LABELS.summary,
      done: hasText(resume?.summary) && resume.summary.trim().length > 10,
      missingFields: ["50-80 字个人总结"],
    },
  };

  let percentage = 0;
  const missing = [];
  const filled = [];
  const missingFields = [];

  for (const stage of RESUME_STAGE_ORDER) {
    const check = checks[stage];
    if (check.done) {
      percentage += check.weight;
      filled.push(check.label);
    } else {
      missing.push(check.label);
      missingFields.push(...check.missingFields);
    }
  }

  const stage =
    RESUME_STAGE_ORDER.find((stageName) => !checks[stageName].done) ||
    "complete";

  return {
    stage,
    stageLabel: RESUME_STAGE_LABELS[stage],
    percentage,
    missing,
    filled,
    missingFields,
    sections: RESUME_STAGE_ORDER.map((stageName) => ({
      id: stageName,
      label: checks[stageName].label,
      done: checks[stageName].done,
    })),
  };
}
