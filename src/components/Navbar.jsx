export default function Navbar() {
  return (
    <nav className="navbar navbar-dark bg-dark fixed-top">
      <div className="container d-flex justify-content-between">
        <span className="navbar-brand fw-bold">
          Yash Mali | Data → Solutions
        </span>

        <a
          href="./resume.pdf"
          download
          className="btn btn-sm btn-outline-info"
        >
          Resume
        </a>
      </div>
    </nav>
  );
}
