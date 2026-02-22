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
            <li>Built high-throughput ML pipelines using PyTorch and TensorFlow, reducing model training time by 15%</li>
            <li>Optimized model workflows through hyperparameter tuning and cross-validation, improving prediction accuracy by 15%</li>
            <li>Integrated ML-driven personalization features , boosting user engagement by 18%</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
