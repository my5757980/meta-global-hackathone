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

/**
 * A plain yes to an offer, answered with "Shall I prepare the invoice?": the buyer has to say yes twice and the sale cools.
 * Only when the turn produced no real work: after a quote, "shall I reserve it?" is the next honest question.
 */
const PLAIN_YES = /^(?:yes|yes please|yep|yeah|ok|okay|sure|please do|go ahead|proceed|do it|confirm|confirmed|deal|agreed|haan?|haan ji|han ji|ji|ji haan|jee|theek hai|thik hai|bilkul|kar do|kardo|ndiyo|sawa|ہاں|ہاں جی|جی|جی ہاں|ٹھیک ہے|بالکل)(?=$|[\s.!,👍🙏])[\s.!,👍🙏]*(?:please|ji)?[\s.!👍🙏]*$/i;
export const saidYes = (text: string) => text.trim().length <= 40 && PLAIN_YES.test(text.trim());

/** The buyer accepts what was just quoted, in words of their own. Anything with a condition or a question stays with the model. */
const ACCEPTS = /(i accept|i'?ll take|i will take|take it|go ahead|send (?:me )?the invoice|invoice me|proceed|confirmed|i agree)/i;
const NOT_YET = /(no|not|don'?t|but|if|discount|cheaper|lower|later|compare|think)|[?؟]/i;
export const acceptsQuote = (text: string) => saidYes(text) || (text.trim().length <= 200 && ACCEPTS.test(text) && !NOT_YET.test(text));
/** After the quote the last message offered something else, so a yes may be to that. */
export const offeredSomethingElse = (reply: string) => /(other|another|similar|more options|alternatives?|cheaper|watch for)[^?؟]*[?؟]\s*(\[cards shown|$)/i.test(reply);
const ASKS_AGAIN = /\b(?:shall i|should i|would you like me to|do you want me to|want me to|may i|can i go ahead|do you confirm|please confirm|are you sure)\b[^?؟]*[?؟]/i;
const ASKS_AGAIN_OTHER = /(کیا میں|کروں\s*[?؟]|kar doon\s*\?|kar dun\s*\?|karun\s*\?)/i;
export const asksPermissionAgain = (reply: string) => ASKS_AGAIN.test(reply) || ASKS_AGAIN_OTHER.test(reply);
