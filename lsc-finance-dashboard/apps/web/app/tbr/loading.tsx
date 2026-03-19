export default function TbrLoading() {
  return (
    <div className="page-grid">
      <div className="skeleton skeleton-card" style={{ height: 160 }} />
      <div className="stats-grid">
        <div className="skeleton skeleton-metric" />
        <div className="skeleton skeleton-metric" />
        <div className="skeleton skeleton-metric" />
        <div className="skeleton skeleton-metric" />
      </div>
      <div className="skeleton skeleton-card" style={{ height: 200 }} />
    </div>
  );
}
