import Link from "next/link";

export function MoreChannels({ items }: { items: { id: string; href?: string; label: string; detail: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="sub" id="more-channels">
      <div>
        More channels{" "}
        {items[0]?.href ? <Link href={items[0].href}>+{items.length} more</Link> : <span>+{items.length} more</span>}
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
            {" · "}
            {item.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
