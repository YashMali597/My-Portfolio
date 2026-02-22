import { motion } from "framer-motion";

export default function Skills() {
  const skills = [
  {
    title: "Programming & Development        ⯆",
    items: [
      "Python, SQL, C#, JavaScript, TypeScript",
      "REST APIs, FastAPI",
      ".NET, MVC Architecture",
      "Git, Azure DevOps CI/CD",
      "Docker",
    ],
  },
  {
    title: "AI & Machine Learning        ⯆",
    items: [
      "Machine Learning, NLP",
      "LLMs (GPT, Claude-style models)",
      "Prompt Engineering, Agentic Workflows",
      "GenAI POC Development",
      "AI API Integration, Workflow Automation",
    ],
  },
  {
    title: "Frameworks & Tools        ⯆",
    items: [
      "PyTorch, TensorFlow",
      "scikit-learn, OpenCV",
      "LangChain",

    ],
  },
  {
    title: "Data & Analytics        ⯆",
    items: [
      "EDA, Predictive Modeling",
      "A/B Testing, Behavioral Analysis",
      "Power BI, Tableau",
      "KPI Tracking, Product Analytics",
    ],
  },
  {
    title: "Product Skills        ⯆",
    items: [
      "Product Strategy",
      "Requirements Gathering",
      "User Stories",
      "Feature Prioritization",
      "Experimentation",
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
