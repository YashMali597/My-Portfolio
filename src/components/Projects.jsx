import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const projects = [
  {
  title: "SupplySightAI – Agentic Supply Chain Intelligence",
  desc: "Built an agentic AI platform that autonomously analyzes supply chain data, detects risks, explains root causes, forecasts disruptions, and recommends prioritized actions.",
  tech: "Python, Pandas, Scikit-learn, Streamlit, Multi-Agent AI",
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
  title: "AI-Driven Customer Segmentation & Churn Intelligence",
  desc: "Built an AI-powered customer intelligence system that analyzes purchase behavior, segments customers, predicts churn and lifetime value, and recommends next-best actions to drive retention and revenue growth.",
  tech: "Python, Pandas, NumPy, Scikit-learn, Machine Learning, Predictive Analytics",
  category: "AI",
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
