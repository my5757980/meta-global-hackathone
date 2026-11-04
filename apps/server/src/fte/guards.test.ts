import { describe, expect, it } from "vitest";
import { asksPermissionAgain, promisesPerson, promisesWork, sameCompanyName, saidYes } from "./guards";

describe("sameCompanyName: the beneficiary on a slip", () => {
  const ours = "Hikari Motors Co., Ltd. (demo)";
  it.each(["Hikari Motors Co., Ltd. (demo)", "HIKARI MOTORS CO LTD", "Hikiri Motors Co., Ltd. (demo)", "Hikari Motor Co., Ltd.", "Beneficiary: Hikari Motors"])("ours: %s", (x) => expect(sameCompanyName(x, ours)).toBe(true));
  it.each(["Quick Cash Traders", "Hikawa Trading Co., Ltd.", "Motors Co., Ltd.", "", null])("not ours: %s", (x) => expect(sameCompanyName(x, ours)).toBe(false));
});

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

describe("saidYes: a plain yes to an offer", () => {
  it.each(["yes", "Yes please", "YES!", "ok", "okay.", "go ahead", "Yes 👍", "haan", "haan ji", "theek hai", "ndiyo", "ہاں", "ٹھیک ہے", "confirm", "please do"])("%s", (x) => {
    expect(saidYes(x)).toBe(true);
  });
  it.each(["yes but what about the price?", "ok, and what about Dar es Salaam?", "no", "not yet", "yesterday I paid", "How much?", "ok but the colour must be white and it must be 2018", ""])("not: %s", (x) => {
    expect(saidYes(x)).toBe(false);
  });
});

describe("asksPermissionAgain: a reply that wants a second yes", () => {
  it.each(["Great! Shall I prepare the invoice?", "Would you like me to go ahead with the invoice?", "Thank you. Should I reserve it for you?", "Do you want me to send the request?", "Please confirm you want this car?", "کیا میں انوائس بنا دوں؟"])("%s", (x) => {
    expect(asksPermissionAgain(x)).toBe(true);
  });
  it.each(["Your invoice request is with our Supervisor. You will hear back soon.", "Please share the consignee's full name and phone number.", "What is your port?", "Done. I have sent the request."])("not: %s", (x) => {
    expect(asksPermissionAgain(x)).toBe(false);
  });
});
