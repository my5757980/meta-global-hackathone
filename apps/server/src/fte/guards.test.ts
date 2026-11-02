import { describe, expect, it } from "vitest";
import { promisesPerson, promisesWork } from "./guards";

describe("promisesPerson — a reply that says a person is joining", () => {
  it.each([
    "I'm truly sorry about this, Grace. I've flagged this as urgent and a team member is joining this chat now to help you directly.",
    "A colleague will join this chat in a moment.",
    "I'm handing you over to a colleague now.",
    "Someone from our team will contact you shortly.",
    "One of our staff will take over from here.",
    "ٹیم کا ایک رکن ابھی اس چیٹ میں شامل ہو رہا ہے۔",
    "Mwenzangu atajiunga nawe sasa hivi.",
    // seen live (escalate-legal): a promise followed by a question, with no handover call
    "I understand this is urgent, Grace. To handle a legal matter properly, I need to connect you with a human team member right away — please let me know briefly how we can help so I can route you correctly.",
  ])("promise: %s", (text) => expect(promisesPerson(text)).toBe(true));

  it.each([
    "Would you like me to connect you with a team member?",
    "Shall I connect you with a colleague?",
    "If you prefer, I can connect you with a colleague.",
    "A supervisor will reply about your discount request shortly.",
    "Your invoice is waiting for the Supervisor's approval and will arrive here.",
    "Here are 3 Hilux trucks in stock: HK-10021, HK-10044 and HK-10102.",
    "Let me check this with a colleague and come back to you shortly.",
  ])("not a promise: %s", (text) => expect(promisesPerson(text)).toBe(false));
});

describe("promisesWork — a reply that says work is happening now", () => {
  it.each([
    // both seen live in the evals: the turn ended here, with no tool call
    "Let me pull what we have in stock right now for those models.",
    "Thanks for confirming the amount, Carlos. I'll check lot 76 for you right away and place your bid of ¥489,000 for the auction on 2026-11-03.",
    "One moment while I look that up.",
    "I am checking the auction list now.",
    "Give me a moment to find the best options.",
    "I'll get you the exact price to Mombasa now.",
    "Main abhi check karta hoon.",
    "میں ابھی چیک کرتا ہوں۔",
    "Ngoja nikuangalie bei.",
  ])("promise: %s", (text) => expect(promisesWork(text)).toBe(true));

  it.each([
    "Let me know your budget and port.",
    "I can check the Hiace too if you like.",
    "Shall I check the auction for you?",
    "Would you like me to place the bid?",
    "Once you confirm the port, I'll prepare the quote.",
    "If you confirm, I'll place the bid.",
    "I'll place the bid as soon as you confirm the amount.",
    "I'll need your delivery port to quote you.",
    "A supervisor will reply about your discount request shortly.",
    "Here are 3 Hilux trucks in stock: HK-10021, HK-10044 and HK-10102.",
  ])("not a promise: %s", (text) => expect(promisesWork(text)).toBe(false));
});
