export default function Experience() {
  return (
    <section className="section bg-dark text-light">
      <div className="container">
        <h2 className="section-title">Work Experience</h2>

        <div className="experience-card">
          <h5>Graduate Engineer Trainee</h5>
          <p className="text-info">Emerson</p>
          <ul>
            <li>Built scalable backend tools improving data accuracy by 60%</li>
            <li>Implemented validation & monitoring, enhancing system reliability</li>
            <li>Optimized data pipelines to reduce latency and improve throughput</li>
            <li>Developed AI/NLP assistant cutting information retrieval time by 45%</li>
            <li>Automated workflows with CI/CD, increasing engineering efficiency</li>

          </ul>
        </div>
        <div className="experience-card">
          <h5>Deep Learning Intern</h5>
          <p className="text-info">Wizphys AI</p>
          <ul>
            <li>Built high-throughput ML pipelines, speeding training jobs by 15%</li>
            <li>Optimized workflows, improving prediction accuracy by 15%</li>
            <li>Integrated ML-powered personalization, boosting engagement by 18%</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
