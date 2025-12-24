export default function About() {
  return (
    <section className="section bg-black about-section">
      <div className="container about-grid">
        <div className="about-left">
          <h2 className="section-title">About Me</h2>
          <p>
            I am a data-driven software engineer and AI-focused product manager
            passionate about building scalable systems and intelligent products
            that transform raw data into real-world impact.
          </p>
          <p>
            My background spans full-stack engineering, analytics, and AI-powered
            decision systems, bridging technical execution with product strategy.
          </p>
        </div>

        {/* Right side background effect */}
        <div className="about-right-bg"></div>
      </div>
    </section>
  );
}
