export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true"><span>D</span></span>
      <span className="brand-wording"><b>DOMINIO</b><em>GLOBALE</em></span>
    </div>
  );
}

