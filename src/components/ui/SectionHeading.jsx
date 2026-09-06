export default function SectionHeading({ eyebrow, title, className = "" }) {
  return (
    <div className={`section-heading ${className}`.trim()}>
      {eyebrow && <p className="section-heading__eyebrow">{`// ${eyebrow}`}</p>}
      <h2 className="section-heading__title">{title}</h2>
    </div>
  );
}
