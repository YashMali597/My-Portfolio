import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const projects = [
  {
    id: 1,
    title: "SupplySightAI – Agentic Supply Chain Intelligence",
    desc: "Built an agentic AI platform that autonomously analyzes supply chain data, detects risks, explains root causes, forecasts disruptions, and recommends prioritized actions.",
    tech: "Python, Pandas, Scikit-learn, Streamlit, Multi-Agent AI",
    categories: ["AI", "Software"]
  },
  {
    id: 2,
    title: "ParcelPal – Route Optimization",
    desc: "Built a delivery route optimizer with Dijkstra’s Algorithm, improving efficiency and reducing operational costs.",
    tech: "JavaScript, React, Node.js, Express, MongoDB, REST APIs",
    categories: ["Software", "Data"]
  },
  {
    id: 3,
    title: "AI-Enabled Customer Segmentation & Churn Prediction System",
    desc: "Developed predictive models using EDA and behavioral analytics on 100K+ customer records to identify churn risk and enable next-best-action recommendations, improving targeted retention by 12%.",
    tech: "Python, Pandas, NumPy, scikit-learn, Predictive Modeling, EDA, Classification, Clustering",
    categories: ["AI", "Data"]
  },
  {
    id: 4,
    title: "AI Causal Intelligence System",
    desc: "Built an uplift-based targeting system using causal inference on 100K+ user A/B simulation data to identify high-impact segments and optimize budget allocation, simulating $684K+ incremental revenue.",
    tech: "Python, scikit-learn, Causal Inference, A/B Testing, Predictive Modeling, Data Analytics",
    categories: ["AI", "Data"]
  }
];

export default function Projects() {
  const [filter, setFilter] = useState("All");

  const categories = ["All", "Software", "Data", "AI"];

  const filteredProjects =
    filter === "All"
      ? projects
      : projects.filter(project =>
          project.categories.includes(filter)
        );

  return (
    <section className="section bg-dark text-light">
      <div className="container">
        <h2 className="section-title">Projects</h2>

        {/* Filter Buttons */}
        <div className="project-filters mb-4">
          {categories.map(cat => (
            <button
              key={cat}
              className={`filter-btn ${filter === cat ? "active" : ""}`}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Projects Grid */}
        <div className="row g-4">
          <AnimatePresence>
            {filteredProjects.map(project => (
              <motion.div
                key={project.id}
                className="col-md-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3 }}
                layout
              >
                <motion.div
                  className="project-card p-3"
                  whileHover={{ y: -8 }}
                >
                  <h5 className="project-title">{project.title}</h5>
                  <p className="project-desc">{project.desc}</p>

                  {/* Category Tags */}
                  <div className="mb-2">
                    {project.categories.map(cat => (
                      <span key={cat} className="badge bg-primary me-2">
                        {cat}
                      </span>
                    ))}
                  </div>

                  <span className="project-tech">{project.tech}</span>
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}