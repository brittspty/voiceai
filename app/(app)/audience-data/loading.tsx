export default function AudienceDataLoading() {
  return (
    <main>
      <nav className="crumb" aria-label="Breadcrumb"><b>Audience Data</b></nav>
      <h1>Every data source behind your audiences</h1>
      <div className="ad-state" role="status">
        <h3>Loading</h3>
        Loading data sources… (skeleton rows, table header stays visible)
      </div>
    </main>
  );
}
