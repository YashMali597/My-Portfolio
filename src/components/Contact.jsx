import { Mail, Phone, Linkedin, Github } from "lucide-react";
import { profile } from "../data/site-content";

export default function Contact() {
  const { email, phone, linkedin, github } = profile.contact;

  return (
    <section id="contact" className="section bg-dark text-light">
      <div className="container text-center">
        <h2 className="section-title">Contact Me</h2>
        <div className="contact-icons">
          <a href={`mailto:${email}`} aria-label="Email">
            <Mail size={32} aria-hidden="true" />
          </a>
          <a href={`tel:${phone}`} aria-label="Phone">
            <Phone size={32} aria-hidden="true" />
          </a>
          <a href={linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn">
            <Linkedin size={32} aria-hidden="true" />
          </a>
          <a href={github} target="_blank" rel="noreferrer" aria-label="GitHub">
            <Github size={32} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
