export function Masthead() {
  return (
    <header className="masthead">
      <div className="brand">
        <svg className="brand__mark" viewBox="0 0 32 32" role="img" aria-label="Logotipo de Faro">
          <path className="brand__beam" d="M3 9l8 1.6M29 9l-8 1.6M5 3.5l6 3.6M27 3.5l-6 3.6" />
          <path className="brand__tower" d="M12.5 28 14.8 13h2.4l2.3 15z" />
          <circle className="brand__lamp" cx="16" cy="9.5" r="3.6" />
        </svg>
        <span>Faro</span>
      </div>
      <p className="brand__tagline">Observatorio del despliegue</p>
    </header>
  );
}
