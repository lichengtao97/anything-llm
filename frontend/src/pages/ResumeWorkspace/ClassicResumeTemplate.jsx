import React, { forwardRef } from "react";

const ClassicResumeTemplate = forwardRef(function ClassicResumeTemplate(
  { resume },
  ref
) {
  const {
    basics = {},
    summary,
    experience = [],
    projects = [],
    education = [],
    skills = [],
    certificates = [],
  } = resume || {};

  return (
    <div ref={ref} className="classic-resume-paper">
      <header className="resume-header">
        <h1 className="resume-name">{basics.name}</h1>
        <p className="resume-title">{basics.title}</p>
        <div className="resume-contact">
          {basics.phone && <span>{basics.phone}</span>}
          {basics.email && <span>{basics.email}</span>}
          {basics.location && <span>{basics.location}</span>}
        </div>
        {basics.links?.length > 0 && (
          <div className="resume-links">
            {basics.links.map((link, index) => (
              <span key={`${link}-${index}`} className="resume-link-item">
                {link}
              </span>
            ))}
          </div>
        )}
      </header>

      {summary && (
        <section className="resume-section">
          <h2 className="resume-section-title">个人总结</h2>
          <p className="resume-summary-text">{summary}</p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="resume-section">
          <h2 className="resume-section-title">工作经历</h2>
          <div className="resume-list">
            {experience.map((item, index) => (
              <div key={`${item.company}-${index}`} className="resume-item">
                <div className="resume-item-header">
                  <span className="resume-item-org">{item.company}</span>
                  <span className="resume-item-time">{item.period}</span>
                </div>
                <div className="resume-item-sub">
                  <span className="resume-item-role">{item.role}</span>
                  {item.location && (
                    <span className="resume-item-loc">{item.location}</span>
                  )}
                </div>
                {item.highlights?.length > 0 && (
                  <ul className="resume-bullets">
                    {item.highlights.map((highlight, highlightIndex) => (
                      <li key={`${highlight}-${highlightIndex}`}>
                        {highlight}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section className="resume-section">
          <h2 className="resume-section-title">项目经历</h2>
          <div className="resume-list">
            {projects.map((item, index) => (
              <div key={`${item.name}-${index}`} className="resume-item">
                <div className="resume-item-header">
                  <span className="resume-item-org">{item.name}</span>
                  <span className="resume-item-time">{item.period}</span>
                </div>
                {item.role && (
                  <div className="resume-item-sub">
                    <span className="resume-item-role">{item.role}</span>
                  </div>
                )}
                {item.description && (
                  <p className="resume-project-desc">{item.description}</p>
                )}
                {item.highlights?.length > 0 && (
                  <ul className="resume-bullets">
                    {item.highlights.map((highlight, highlightIndex) => (
                      <li key={`${highlight}-${highlightIndex}`}>
                        {highlight}
                      </li>
                    ))}
                  </ul>
                )}
                {item.techStack?.length > 0 && (
                  <div className="resume-tech-stack">
                    <strong>主要技术栈：</strong>
                    <span>{item.techStack.join(" / ")}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {education.length > 0 && (
        <section className="resume-section">
          <h2 className="resume-section-title">教育背景</h2>
          <div className="resume-list">
            {education.map((item, index) => (
              <div key={`${item.school}-${index}`} className="resume-item">
                <div className="resume-item-header">
                  <span className="resume-item-org">{item.school}</span>
                  <span className="resume-item-time">{item.period}</span>
                </div>
                <div className="resume-item-sub">
                  <span className="resume-item-role">
                    {[item.degree, item.major].filter(Boolean).join(" · ")}
                  </span>
                </div>
                {item.highlights?.length > 0 && (
                  <ul className="resume-bullets">
                    {item.highlights.map((highlight, highlightIndex) => (
                      <li key={`${highlight}-${highlightIndex}`}>
                        {highlight}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section className="resume-section">
          <h2 className="resume-section-title">专业技能</h2>
          <ul className="resume-bullets">
            {skills.map((skill, index) => (
              <li key={`${skill}-${index}`}>{skill}</li>
            ))}
          </ul>
        </section>
      )}

      {certificates.length > 0 && (
        <section className="resume-section">
          <h2 className="resume-section-title">荣誉证书</h2>
          <ul className="resume-bullets">
            {certificates.map((certificate, index) => (
              <li key={`${certificate}-${index}`}>{certificate}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
});

export default ClassicResumeTemplate;
