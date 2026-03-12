type StructuredDataValue = Record<string, unknown>;

export function StructuredData({ items }: { items: StructuredDataValue[] }) {
  return (
    <>
      {items.map((item, index) => (
        <script
          key={`structured-data-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(item).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}
