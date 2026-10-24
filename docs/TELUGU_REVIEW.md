# Telugu review list (for a native speaker)

**Status: NOT reviewed by a native speaker.** All Telugu in the app was written by an AI model and checked
only mechanically (every English key has a Telugu twin, the placeholders match, the first screens contain
Telugu letters: `tests/i18n-parity.test.ts`). Nothing here has been judged for naturalness, register or
cultural fit. The phrases below are the ones the writer is least sure about. Please read the whole screen
text in `src/locales/te.json`, not only this list.

How to fix a phrase: change the Telugu value in `src/locales/te.json` (keep the `{placeholders}` exactly as
they are). `npm test` will fail if a key or a placeholder goes missing.

## Words used for the main ideas

| Idea | English in the app | Telugu in the app | Concern |
|---|---|---|---|
| Issuer | the issuer | జారీదారు | Formal. Maybe "జారీ చేసిన సంస్థ" reads more naturally for older users. |
| Check with the issuer | Check with the issuer | జారీదారుతో సరిచూడండి | Is "సరిచూడండి" (check) the right everyday verb? |
| Tamper-proof seal | Tamper-proof seal | మార్పు చేయలేని ముద్ర | Literal ("seal that cannot be changed"). |
| Proof you can share | Proof you can share | పంచుకోగల రుజువు | Awkward; also mixes "పంచు" with the loanword "షేర్". |
| Share (verb) | Share / Stop sharing | షేర్ చేయండి / షేర్ చేయడం ఆపండి | Loanword used on purpose (people say it). Is "పంచుకోవడం" better? |
| Alerts | Alerts | సూచనలు | Means "notices/suggestions". "హెచ్చరికలు" means "warnings". Which fits? |
| History of changes | History of changes | మార్పుల చరిత్ర | Probably fine; check it sounds like a list of actions. |
| Read from photo | Scan and fix | స్కాన్ చేసి సరిచేయండి | Loanword "స్కాన్". |
| High contrast | High contrast | అధిక కాంట్రాస్ట్ | Loanword; maybe "స్పష్టమైన రంగులు". |
| Demo | demo | డెమో | Loanword. |

## Status words (shown on every document)

| English | Telugu | Concern |
|---|---|---|
| Verified | ధృవీకరించబడింది | Passive and long. Maybe "ధృవీకరించారు". |
| Needs your attention | మీ దృష్టి అవసరం | Is it clear it asks the person to act? |
| Not accepted | అంగీకరించలేదు | Maybe "ఆమోదించబడలేదు". |
| Not checked yet | ఇంకా తనిఖీ చేయలేదు | Probably fine. |
| Done / Needs you / Cannot tell | పూర్తయింది / మీరు చేయాలి / చెప్పలేము | "చెప్పలేము" may sound like a refusal. |

## Menus and buttons

| Key | English | Telugu | Concern |
|---|---|---|---|
| `nav.tab.ready` | Ready? | సిద్ధమా? | Very short on purpose (tab bar). |
| `nav.side.ready` | Am I ready? | నేను సిద్ధమేనా? | |
| `nav.tab.home` | Home | హోమ్ | Loanword. |
| `ui.help` | Need help? | సహాయం కావాలా? | |
| `ui.textSize` | Text size | అక్షరాల పరిమాణం | |
| `review.letMeFix` | Let me fix it | నేను సరిచేస్తాను | |
| `names.confirm` | Yes, same person | అవును, ఒకే వ్యక్తి | |
| `shares.confirm.body` | This link will stop working for everyone. You can create a new one. | ఈ లింక్ అందరికీ పనిచేయడం ఆగిపోతుంది. మీరు కొత్తది తయారు చేయవచ్చు. | Is the warning strong enough and clear? |

## Grammar to check

* Telugu endings glued to English names and numbers, for example `{name}తో` ("with {name}"), `{time}కు`
  ("at {time}"), `{id}తో`. When the name is in English letters the ending may need a hyphen or a space.
* `{total}లో {n}వ దశ` ("step {n} of {total}") and `{total}లో {done} పూర్తయ్యాయి` ("{done} of {total} done"):
  the number endings.
* `{n} నిమిషాల క్రితం`, `{n} గంటల క్రితం`, `{n} రోజుల క్రితం` ("{n} minutes/hours/days ago"), and the
  singular forms ("1 నిమిషం క్రితం").
* Alert sentences (`alert.*`), for example "Someone entered a wrong code for the link to {name} at {time}."

## Sign-in screen

* "ఈ ప్రోటోటైప్ 0000తో మొదలయ్యే డెమో నంబర్లనే అంగీకరిస్తుంది" (this prototype only accepts demo numbers
  that start with 0000): "ప్రోటోటైప్" is a loanword; is there a simpler word for "prototype"?
* The sign-in banner and the code-lock message (`signin.err.locked`).

## Older screens (before Phase 7)

The threat model page, the policy page and the recipient page text (`threat.*`, `policy.*`, `gate.*`, `view.*`)
were written earlier by the same model and have not been reviewed either. The long paragraphs on the threat
model and policy pages are in English on purpose (marked `lang="en"`); only their headings are Telugu.
