export default function Loading() {
  return (
    <div className="page-grid">
      <div className="skeleton skeleton-card" style={{ height: 140 }} />
      <div className="stats-grid">
        <div className="skeleton skeleton-metric" />
        <div className="skeleton skeleton-metric" />
        <div className="skeleton skeleton-metric" />
        <div className="skeleton skeleton-metric" />
      </div>
      <div className="skeleton skeleton-card" style={{ height: 240 }} />
    </div>
  );
}
