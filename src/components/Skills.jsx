import { motion } from "framer-motion";

export default function Skills() {
  const skills = [
    {
      title: "Software Engineering         ⯆",
      items: [
        "Python, C#, JavaScript, TypeScript",
        "Node JS, .NET, MVC Architecture",
        "REST APIs, Microservices",
        "Git, CI/CD, Azure DevOps",
        "Microsoft Azure, Snowflake"
        ,
      ],
    },
    {
      title: "Data & Analytics        ⯆",
      items: [
        "SQL, Advanced Excel",
        "Databricks, Airflow, dBt, Spark",
        "ETL Pipelines & Data Modeling",
        "Power BI, Tableau",
        "Pandas, Data Cleaning",
        "Metrics, KPIs, Dashboards",
      ],
    },
    {
      title: "AI & Product Management        ⯆",
      items: [
        "Large Language Models, Machine Learning, Agentic AI",
        "Agile Scrum Methodologies",
        "A/B Testing & Experimentation",
        "User-Centric & Data-Driven Decisions",
      ],
    },
  ];

  return (
    <section className="section bg-dark text-light">
      <div className="container">
        <h2 className="section-title">Core Skill Stack</h2>
        <div className="row g-4">
          {skills.map((skill, idx) => (
            <motion.div
              key={idx}
              className="col-md-4 expandable-skill"
              whileHover={{ y: -6 }}
            >
              <h5 className="skill-title">{skill.title}</h5>
              <div className="skill-details">
                <ul>
                  {skill.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
