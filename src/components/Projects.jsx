import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const projects = [
  {
    title: "AI Workflow Automation Platform ",
    desc: "Built a full-stack ML workflow tool with Python, TypeScript, and React, automating data processing, annotation, and real-time model monitoring.",
    tech: "Python, React, TypeScript, FastAPI, Neural Networks",
    category: "AI",
  },
  {
  title: "ParcelPal – Route Optimization",
  desc: "Built a delivery route optimizer with Dijkstra’s Algorithm, improving efficiency and reducing operational costs.",
  tech: "JavaScript, React, Node.js, Express, MongoDB, REST APIs",
  category: "Software",
  },
  {
  title: "IEEE Student Branch Chatbot",
  desc: "Built and deployed an NLP chatbot using Python and ML, automating student queries and boosting engagement by 40%.",
  tech: "Python, NLP, Machine Learning, Pandas, NumPy, Scikit-learn, Flask, REST APIs",
  category: "AI",
  },
  {
  title: "Customer Segmentation & Purchase Behavior Analysis",
  desc: "Performed data preprocessing and EDA on customer transactions, then applied K-Means clustering to segment customers by purchase patterns and preferences.",
  tech: "Python, Pandas, NumPy, Scikit-learn, Matplotlib, Seaborn, Data Analysis, K-Means Clustering",
  category: "Data",
 }

];

export default function Projects() {
  const [filter, setFilter] = useState("All");

  const filteredProjects =
    filter === "All" ? projects : projects.filter(p => p.category === filter);

  return (
    <section className="section bg-dark text-light">
      <div className="container">
        <h2 className="section-title">Projects</h2>

        {/* Filter buttons */}
        <div className="project-filters mb-4">
          {["All", "Software", "Data", "AI"].map(cat => (
            <button
              key={cat}
              className={`filter-btn ${filter === cat ? "active" : ""}`}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="row g-4">
          <AnimatePresence>
            {filteredProjects.map((proj, idx) => (
              <motion.div
                key={proj.title}
                className="col-md-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="project-card"
                  whileHover={{ y: -8 }}
                >
                  <h5 className="project-title">{proj.title}</h5>
                  <p className="project-desc">{proj.desc}</p>
                  <span className="project-tech">{proj.tech}</span>
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
