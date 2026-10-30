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
export function promisesPerson(text: string): boolean {
  return text
    .split(/(?<=[.!?۔])\s+|\n+/)
    .some((s) => !/[?؟]\s*$/.test(s) && !OFFER_WORDS.test(s) && ((PERSON_WORDS.test(s) && JOIN_WORDS.test(s)) || PROMISE_OTHER.test(s)));
}
