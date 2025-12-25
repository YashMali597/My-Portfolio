import { motion } from "framer-motion";
import { useTypewriter, Cursor } from "react-simple-typewriter";

export default function Hero() {
  const [text] = useTypewriter({
    words: [
      "Software Engineer",
      "Data Scientist",
      "Data Engineer",
      "Product Manager",
    ],
    loop: true,
    delaySpeed: 2000,
  });

  return (
    <section className="hero-section">
      {/* LEFT: Name + Typewriter + Tagline */}
      <motion.div
        className="hero-content"
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1 }}
      >
        <h1 className="display-4 fw-bold">Yash Mali</h1>
        <h3 className="typing-text">
          {text} <Cursor />
        </h3>
        <p className="hero-tagline">
          Transforming data and software into intelligent, AI-driven product solutions
        </p>
      </motion.div>

      {/* RIGHT: Photo */}
      <motion.div
        className="hero-image-wrapper"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1 }}
      >
        <motion.img
          src="./yash.jpg"
          alt="Yash"
          className="hero-img"
          whileHover={{ scale: 1.05 }}
        />
      </motion.div>
    </section>
  );
}
