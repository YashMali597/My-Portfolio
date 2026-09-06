export default function Panel({ children, className = "", ...rest }) {
  return (
    <div className={`glass-panel ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
