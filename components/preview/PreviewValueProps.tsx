const props = [
  {
    icon: "🕐",
    title: "Daily Updates",
    body: "New LinkedIn Pinpoint answer becomes available after midnight Pacific Time each day.",
  },
  {
    icon: "🧩",
    title: "Detailed Explanations",
    body: "Complete breakdowns showing how each clue connects to the Pinpoint solution.",
  },
  {
    icon: "🏆",
    title: "Continuous Challenge",
    body: "Build your solving streak and become a true LinkedIn Pinpoint master.",
  },
];

export function PreviewValueProps() {
  return (
    <section className="surface" style={{ padding: 32 }}>
      <div className="grid grid-3">
        {props.map(({ icon, title, body }) => (
          <div className="card" key={title} style={{ textAlign: "center" }}>
            <p style={{ fontSize: 32, margin: "0 0 8px" }}>{icon}</p>
            <p className="eyebrow">{title}</p>
            <p className="copy" style={{ marginTop: 8 }}>
              {body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
