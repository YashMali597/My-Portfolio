export default function About() {
  return (
    <section className="section bg-black about-section">
      <div className="container about-grid">
        <div className="about-left">
          <h2 className="section-title">About Me</h2>
          <p>
  I’m an AI engineer passionate about building intelligent systems that transform enterprise data into actionable insights and decision-support tools.
</p>
<p>
  My work focuses on integrating machine learning models, LLM-powered assistants, and scalable data pipelines into enterprise platforms to automate knowledge access, improve reporting workflows, and enable data-driven decision-making. I’ve developed ETL pipelines across legacy systems, built AI-driven internal analytics assistants to streamline information retrieval, and implemented predictive models to support experimentation and business optimization.
</p>
<p>
  I’m particularly interested in applying machine learning, generative AI, and behavioral analytics to solve real-world problems in areas such as experimentation, forecasting, product performance, and operational efficiency. Through my academic and professional experience, I’ve worked on customer segmentation, churn prediction, and uplift-based targeting systems using large-scale behavioral datasets.
</p>
<p>
  I enjoy working at the intersection of data science, engineering, and product teams to translate complex business challenges into scalable, AI-enabled solutions that drive measurable impact.
</p>
        </div>

        {/* Right side background effect */}
        <div className="about-right-bg"></div>
      </div>
    </section>
  );
}
