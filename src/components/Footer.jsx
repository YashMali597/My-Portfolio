import { profile } from "../data/site-content";

export default function Footer() {
  return (
    <footer className="cli-footer">
      <div className="cli-footer__inner">
        <span className="cli-footer__prompt">$</span>
        <span className="cli-footer__text">{profile.footer}</span>
      </div>
    </footer>
  );
}
