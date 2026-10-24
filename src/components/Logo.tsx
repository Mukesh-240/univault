/**
 * LOGO — the owner's UNIVAULT artwork (a blue folder with papers and a white padlock whose keyhole is a U).
 *
 * Plain-English: this shows the real picture file, made from the owner's JPEG by scripts/brand.ts. It is never
 * redrawn here. The smallest file that is still sharp on a high-density screen is picked for the size asked for.
 * Next to the word UNIVAULT it is decorative (empty alt, so the name is not read twice); standing alone it is
 * announced as "UNIVAULT". `priority` is only for the header, where it is on every page and should load first.
 */
import Image from "next/image";

const FILES = [64, 192, 512] as const;

export function Logo({ size = 36, priority = false, alone = false }: { size?: number; priority?: boolean; alone?: boolean }) {
  const file = FILES.find((px) => px >= size * 2) ?? 512;
  return <Image src={`/brand/logo-${file}.png`} width={size} height={size} alt={alone ? "UNIVAULT" : ""} className="logo" priority={priority} unoptimized />;
}
