/**
 * Words must match actions: a reply that tells the buyer a person is joining is a promise, and the server
 * keeps it even when the model forgot to call handover_to_human. Questions and offers ("Shall I connect you
 * with a colleague?", "I can connect you…") are not promises.
 */
const PERSON_WORDS = /\b(team member|teammate|colleague|staff member|real person|human (?:agent|colleague)|someone (?:from|on) (?:our|the) team|one of our (?:team|staff|agents|colleagues))s?\b/i;
const JOIN_WORDS = /\b(join(?:s|ing)?|tak(?:e|es|ing) over|be with you|connect(?:ing)? you|hand(?:ed|ing)? (?:you|this|it|your \w+) (?:over )?to|pass(?:ed|ing)? (?:you|this|it|your \w+) (?:on )?to|transfer(?:red|ring)?|get in touch|contact you|reach out)\b/i;
const PROMISE_OTHER = /(ٹیم کا (?:ایک )?(?:رکن|ممبر)|ہمارا (?:ایک )?(?:ساتھی|نمائندہ)|mwenzangu|mfanyakazi (?:wetu|mwenzetu)|mtu wa timu)/i;
// an offer is an offer phrase right before the connecting verb ("I can connect you", "if you prefer, I can hand you…")
const OFFER_WORDS = /\b(if you (?:like|prefer|want|wish)|would you like|shall i|should i|do you want|want me to|i can|we can|i could|happy to)\b[^.!?]{0,30}\b(connect|hand|pass|transfer|get|arrange|ask)/i;
const sentences = (text: string) => text.split(/(?<=[.!?۔])\s+|\n+/);
export function promisesPerson(text: string): boolean {
  return sentences(text).some((s) => !/[?؟]\s*$/.test(s) && !OFFER_WORDS.test(s) && ((PERSON_WORDS.test(s) && JOIN_WORDS.test(s)) || PROMISE_OTHER.test(s)));
}

/**
 * The same for work: "Let me check that for you" with no tool call ends the turn, nothing happens, and the buyer waits for
 * nothing. Questions and things that depend on the buyer or on later events ("once you confirm, I'll bid") are not promises.
 */
const WORK = "(?:check|pull|look|search|find|fetch|get|review|see|place|read|quote|prepare|calculate|work out|confirm|send|run)";
const WORK_NOW = new RegExp(`\\b(?:let me|i'?ll|i will|i'?m going to|i am going to)\\s+(?:just |quickly |now |first )?${WORK}\\b`, "i");
const WORK_DOING = /\b(one moment|just a moment|give me a (?:moment|second|minute)|hold on|i(?:'m| am) (?:now )?(?:checking|looking|searching|pulling|fetching|placing))\b/i;
const WORK_OTHER = /(check kar(?:ta|ti|te|unga|ungi)|dekh(?:ta|ti) h(?:oo|u)n|abhi (?:check|dekh)|چیک کر(?:تا|تی|وں)|دیکھ(?:تا|تی) ہوں|ابھی (?:چیک|دیکھ)|ngoja nik|naangalia|nitaangalia|سأتحقق|دعني أتحقق|سأبحث)/i;
const LATER = /\b(?:once|as soon as|when|after|if you)\b/i;
export function promisesWork(text: string): boolean {
  return sentences(text).some((s) => !/[?؟]\s*$/.test(s) && !LATER.test(s) && (WORK_NOW.test(s) || WORK_DOING.test(s) || WORK_OTHER.test(s)));
}
