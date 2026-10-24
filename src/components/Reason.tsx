/**
 * <Reason> — shows an engine's explanation sentence in the chosen language.
 * Sentences that have no Telugu version yet are shown in English and marked lang="en" so screen
 * readers switch pronunciation. Works in both server and browser components (no hooks).
 */
import { localizeReason, type Lang } from "@/lib/i18n";

export function Reason({ text, lang }: { text: string; lang: Lang }) {
  return (
    <>
      {localizeReason(text, lang).map((s, i) => (
        <span key={i} lang={s.lang === lang ? undefined : s.lang}>{i ? " " : ""}{s.text}</span>
      ))}
    </>
  );
}
