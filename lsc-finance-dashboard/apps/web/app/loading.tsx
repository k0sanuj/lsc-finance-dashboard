export default function GlobalLoading() {
  return (
    <div className="page-grid">
      <section className="hero" style={{ minHeight: 200 }}>
        <div className="loading-block">
          <div className="loading-spinner lg" />
          <span>Loading workspace...</span>
        </div>
      </section>
      <div className="stats-grid">
        <div className="skeleton skeleton-metric" />
        <div className="skeleton skeleton-metric" />
        <div className="skeleton skeleton-metric" />
        <div className="skeleton skeleton-metric" />
      </div>
      <div className="skeleton skeleton-card" />
    </div>
  );
}
