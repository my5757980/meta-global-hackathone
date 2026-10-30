import { describe, expect, it } from "vitest";
import { promisesPerson } from "./guards";

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
