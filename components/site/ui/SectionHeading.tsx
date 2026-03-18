export function SectionHeading({
  eyebrow,
  title,
  description,
  level = 2,
  titleClassName = "section-title",
  center = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  level?: 2 | 3 | 4;
  titleClassName?: string;
  center?: boolean;
}) {
  const HeadingTag = `h${level}` as "h2" | "h3" | "h4";

  return (
    <div style={center ? { textAlign: "center" } : undefined}>
      <p className="eyebrow">{eyebrow}</p>
      <HeadingTag className={titleClassName}>{title}</HeadingTag>
      {description ? <p className="copy">{description}</p> : null}
    </div>
  );
}
