import { saveAs } from "file-saver";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

function cleanText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function fileBaseName(resume = {}) {
  const name = cleanText(resume?.basics?.name) || "resume";
  const title = cleanText(resume?.basics?.title);
  return [name, title, "简历"]
    .filter(Boolean)
    .join("_")
    .replace(/[\\/:*?"<>|]/g, "-");
}

function textRun(text, options = {}) {
  return new TextRun({
    text: cleanText(text),
    font: "Arial",
    size: 22,
    ...options,
  });
}

function paragraph(children, options = {}) {
  return new Paragraph({
    spacing: { after: 90, ...options.spacing },
    children,
    ...options,
  });
}

function sectionTitle(title) {
  return new Paragraph({
    border: {
      bottom: {
        color: "1A1A1A",
        space: 1,
        style: BorderStyle.SINGLE,
        size: 8,
      },
    },
    spacing: { before: 260, after: 120 },
    children: [textRun(title, { bold: true, size: 24 })],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 70 },
    children: [textRun(text, { size: 21 })],
  });
}

function itemHeading(left, right = "") {
  const parts = [cleanText(left), cleanText(right)].filter(Boolean);
  return paragraph([textRun(parts.join(" | "), { bold: true, size: 22 })], {
    spacing: { before: 70, after: 50 },
  });
}

function addExperience(children, items = []) {
  if (!items.length) return;
  children.push(sectionTitle("工作经历"));
  for (const item of items) {
    children.push(itemHeading(item.company, item.period));
    const roleLine = [item.role, item.location].filter(Boolean).join(" · ");
    if (roleLine) {
      children.push(
        paragraph([textRun(roleLine, { italics: true, color: "555555" })])
      );
    }
    for (const highlight of item.highlights || []) {
      children.push(bullet(highlight));
    }
  }
}

function addProjects(children, items = []) {
  if (!items.length) return;
  children.push(sectionTitle("项目经历"));
  for (const item of items) {
    children.push(itemHeading(item.name, item.period));
    if (item.role) children.push(paragraph([textRun(item.role)]));
    if (item.description) children.push(paragraph([textRun(item.description)]));
    for (const highlight of item.highlights || []) {
      children.push(bullet(highlight));
    }
    if (item.techStack?.length > 0) {
      children.push(
        paragraph([
          textRun("主要技术栈：", { bold: true }),
          textRun(item.techStack.join(" / ")),
        ])
      );
    }
  }
}

function addEducation(children, items = []) {
  if (!items.length) return;
  children.push(sectionTitle("教育背景"));
  for (const item of items) {
    children.push(itemHeading(item.school, item.period));
    const detail = [item.degree, item.major].filter(Boolean).join(" · ");
    if (detail) children.push(paragraph([textRun(detail)]));
    for (const highlight of item.highlights || []) {
      children.push(bullet(highlight));
    }
  }
}

function addListSection(children, title, items = []) {
  if (!items.length) return;
  children.push(sectionTitle(title));
  for (const item of items) {
    children.push(bullet(item));
  }
}

function docxChildrenFromResume(resume = {}) {
  const {
    basics = {},
    summary,
    experience = [],
    projects = [],
    education = [],
    skills = [],
    certificates = [],
  } = resume || {};
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        textRun(basics.name || "未命名简历", { bold: true, size: 34 }),
      ],
    }),
  ];
  const title = cleanText(basics.title);
  if (title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [textRun(title, { bold: true, color: "555555" })],
      })
    );
  }

  const contact = [basics.phone, basics.email, basics.location]
    .filter(Boolean)
    .join("  |  ");
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 140 },
        children: [textRun(contact, { size: 20, color: "666666" })],
      })
    );
  }

  if (basics.links?.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          textRun(basics.links.map((link) => cleanText(link)).join("  |  "), {
            size: 20,
            color: "666666",
          }),
        ],
      })
    );
  }

  if (summary) {
    children.push(sectionTitle("个人总结"));
    children.push(paragraph([textRun(summary)]));
  }

  addExperience(children, experience);
  addProjects(children, projects);
  addEducation(children, education);
  addListSection(children, "专业技能", skills);
  addListSection(children, "荣誉证书", certificates);

  return children;
}

export async function buildResumePdfBlob(resumeElement, _resume = {}) {
  if (!resumeElement) throw new Error("Resume preview is not ready.");

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const canvas = await html2canvas(resumeElement, {
    backgroundColor: "#ffffff",
    scale: Math.max(2, window.devicePixelRatio || 1),
    useCORS: true,
    logging: false,
  });
  const imageData = canvas.toDataURL("image/jpeg", 0.94);
  const pdf = new jsPDF("p", "mm", "a4");
  const imageHeight = (canvas.height * A4_WIDTH_MM) / canvas.width;
  let y = 0;
  let remainingHeight = imageHeight;

  pdf.addImage(imageData, "JPEG", 0, y, A4_WIDTH_MM, imageHeight);
  remainingHeight -= A4_HEIGHT_MM;

  while (remainingHeight > 0) {
    y -= A4_HEIGHT_MM;
    pdf.addPage();
    pdf.addImage(imageData, "JPEG", 0, y, A4_WIDTH_MM, imageHeight);
    remainingHeight -= A4_HEIGHT_MM;
  }

  return pdf.output("blob");
}

export async function exportResumeAsPdf(resumeElement, resume = {}) {
  const blob = await buildResumePdfBlob(resumeElement, resume);
  saveAs(blob, `${fileBaseName(resume)}.pdf`);
}

export async function buildResumeDocxBlob(resume = {}) {
  const document = new Document({
    creator: "AnythingLLM Resume Workspace",
    title: fileBaseName(resume),
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: docxChildrenFromResume(resume),
      },
    ],
  });
  return await Packer.toBlob(document);
}

export async function exportResumeAsDocx(resume = {}) {
  const blob = await buildResumeDocxBlob(resume);
  saveAs(blob, `${fileBaseName(resume)}.docx`);
}
