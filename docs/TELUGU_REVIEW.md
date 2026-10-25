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

## Phase 8: the three roles (all AI-written, not reviewed by a native speaker)

| Idea | English in the app | Telugu in the app | Concern |
|---|---|---|---|
| Sender (document keeper) | Sender | పంపేవారు | Describes the act of sending; the person is really the document holder. |
| Receiver | Receiver | స్వీకర్త | Formal; is "అందుకునేవారు" more natural? |
| Document holder (in sentences) | the holder | యజమాని | "యజమాని" can sound like "boss/owner". Maybe "పత్రం ఉన్నవారు". |
| Issue a document | Issue a document / Sign and issue | పత్రం జారీ చేయండి / సంతకం చేసి జారీ చేయండి | "జారీ" is the official word; check it is understood. |
| Stop this document | Stop this document | ఈ పత్రాన్ని ఆపండి | Does "ఆపండి" (stop) read as "cancel the document" or "pause"? "రద్దు చేయండి" means cancel. |
| Corrected copy | Issue corrected copy | సరిచేసిన కాపీ జారీ చేయండి | Fine? |
| Replaced | Replaced | మార్చాము / మార్చినవి | Past-tense forms mixed; check consistency. |
| Request / ask | Ask for a document, Your requests | పత్రం అడగండి, మీ అభ్యర్థనలు | "అభ్యర్థన" is formal. |
| Inbox | Inbox | ఇన్‌బాక్స్ | Loanword. |
| Paper preview | Paper preview | కాగితం ముందుచూపు | Literal. |
| Report a problem | Report a problem | సమస్యను తెలియజేయండి | Fine? |
| Demo chip | DEMO | డెమో | Loanword. |
| This area is for ... | This area is for senders | ఈ భాగం పంపేవారి కోసం | Genitive forms of the three role words are used (`area.plural.*`). |

Grammar to check: endings glued to serial numbers or names written in English letters, for example `{serial}ను`
(serial + object marker), `{name}కు`, `{by}తో`, `{time}కు జారీదారుతో సరిచూశారు` (`recv.view.banner`).

## Phase 9 additions (AI-written, not reviewed by a native speaker)

| Idea | English in the app | Telugu in the app | Concern |
|---|---|---|---|
| Eligibility check | Eligibility check | అర్హత తనిఖీ | Fine? |
| Met / not met / unknown | Met / Not met / Unknown | తీరింది / తీరలేదు / తెలియదు | "తీరింది" (fulfilled) for a criterion: natural? |
| Ready under these criteria | Ready under these criteria | ఈ ప్రమాణాల ప్రకారం సిద్ధంగా ఉన్నారు | Must never read as "you are eligible/approved". |
| Not proof | ... It is not proof ... | ఇది రుజువు కాదు | Must be clear and not softened. |
| UV-ID note | A UV-ID names an account. It does not prove who is at the keyboard. | UV-ID ఒక ఖాతాను సూచిస్తుంది. కీబోర్డ్ దగ్గర ఎవరున్నారో అది నిరూపించదు. | Check the sentence reads naturally. |
| Account types | Individual / Government / Institution / Business | వ్యక్తి / ప్రభుత్వం / సంస్థ / వ్యాపారం | |
| Kill user | Stop all sharing with {name} | {name}తో అన్ని షేరింగ్ ఆపండి | |
| Neutral receiver notice | Access to this document was ended by the owner. | ఈ పత్రానికి యాక్సెస్‌ను యజమాని ముగించారు. | "యజమాని" (owner) used for the document owner; see the Phase 8 concern. |
| Synthetic strip | Synthetic data · simulated issuers, identity check and one-time codes | కల్పిత డేటా · అనుకరణ జారీదారులు, గుర్తింపు తనిఖీ, వన్-టైమ్ కోడ్‌లు | |

## Phase 10 additions (AI-written, not reviewed by a native speaker)

About 250 new keys, all in `src/locales/te.json` beside English (parity test green). The ones a reviewer should read first:

| Idea | English in the app | Telugu in the app | Concern |
|---|---|---|---|
| Stepper header | Step 2 of 4: | దశ 2 / 4: | Is "/" natural, or "4లో 2వ దశ"? |
| What happens here / next | What happens here / What happens next | ఇక్కడ ఏమి జరుగుతుంది / తరువాత ఏమి జరుగుతుంది | Fine? |
| Trail title | What the system just did, step by step | సిస్టమ్ ఇప్పుడే చేసినది, దశలవారీగా | "సిస్టమ్" is a loanword. |
| Why we do this | Why we do this | మేము ఇది ఎందుకు చేస్తాం | Fine? |
| Step status | Done / Skipped / Did not pass / Waiting | పూర్తయింది / వదిలివేయబడింది / సరిపోలలేదు / వేచి ఉంది | "Did not pass" must stay neutral, never accusing. |
| Fingerprint | SHA-256 fingerprint | SHA-256 వేలిముద్ర | "వేలిముద్ర" (fingerprint) as a metaphor: clear? |
| Salt | Salted field hash | సాల్ట్ కలిపిన ఫీల్డ్ హాష్ | Loanwords; plain meaning given beside it. |
| Ledger line | ledger line 214 | లెడ్జర్ లైన్ 214 | Loanwords. |
| ID or code wrong | The recipient ID or the one-time code was not right (we do not say which, to protect the link) | స్వీకర్త ID లేదా ఒక్కసారి కోడ్ సరైనది కాదు (లింక్‌ను కాపాడటానికి ఏది అని చెప్పము) | Must not hint which one was wrong. |
| Cannot recall | Copies already downloaded cannot be recalled | ఇప్పటికే డౌన్‌లోడ్ చేసిన కాపీలను వెనక్కి తీసుకోలేము | Must not be softened. |
| Nothing merged | Nothing was merged. The documents stay separate | ఏదీ కలపలేదు. పత్రాలు వేరుగానే ఉంటాయి | Fine? |
| Text size | Normal / Larger / Largest text (16 / 18 / 20) | సాధారణ / పెద్ద / ఇంకా పెద్ద అక్షరాలు | Fine? |
| Menu, Activity | Menu, Activity | మెనూ, కార్యకలాపం | Fine? |

Grammar to check as before: endings glued to English-letter values (`{name} తో షేర్ చేయండి`, `{code} చేసిన ప్రవేశంతో`).
