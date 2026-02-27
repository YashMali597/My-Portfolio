export default function Experience() {
  return (
    <section className="section bg-dark text-light">
      <div className="container">
        <h2 className="section-title">Work Experience</h2>

        <div className="experience-card">
          <h5>Graduate Software Engineer Trainee</h5>
          <p className="text-info">Emerson</p>
          <ul>
            <li>Engineered ETL data migration pipelines across enterprise platforms using C# and .NET, reducing manual errors by 60% and improving interoperability</li>
            <li>Developed protocol-aware MODBUS and HART data conversion workflows, maintaining 90%+ data integrity</li>
            <li>Built an LLM-powered internal analytics assistant using Python and prompt engineering, reducing enterprise knowledge retrieval time by 45%</li>
            <li>Automated end-to-end data ingestion, model execution, and deployment using REST APIs and Azure DevOps CI/CD pipelines</li>
            <li>Implemented 15+ data validation rules through system log analysis to improve data quality in production ML pipelines</li>
            <li>Collaborated with cross-functional stakeholders to define KPIs and execute 150+ feature-level test scenarios aligned with business requirements</li>

          </ul>
        </div>
        <div className="experience-card">
          <h5>Deep Learning Intern</h5>
          <p className="text-info">Wizphys AI</p>
          <ul>
           <li>Built and shipped real-time exercise detection features for a physiotherapy mobile app using PoseNet keypoint extraction and PyTorch-based classification models</li>
          <li>Engineered skeletal keypoint pipelines and optimized models via hyperparameter tuning and cross-validation, improving prediction accuracy by 15%</li>
          <li>Deployed ML-driven features to production users, increasing session completion and engagement by 18% through iterative performance improvements</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
