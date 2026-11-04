#!/usr/bin/env python3
"""Uses the real APK on an Android emulator against the live demo, the way a buyer does: home, shop, a car and its photos, the demo customer,
a question to Sora, an order and its invoice, a bank slip read by the accounts FTE, the menu pages, a call to Sora, and a push notification with
the app closed. The screen is recorded, and pictures go to the folder given as the first argument. Step times are printed for the film."""
import json
import re
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
SERVER = sys.argv[2] if len(sys.argv) > 2 else "https://100.53.110.244"
PKG = "com.autofte.hikarimotors"
failed = 0
T0 = time.time()
step_no = 0
recorders = []


def check(name, ok, detail=""):
    global failed
    failed += not ok
    print(f"{'PASS' if ok else 'FAIL'}  [{time.time() - T0:5.0f}s] {name}" + (f"   [{str(detail)[:260]}]" if detail else ""), flush=True)
    return ok


def api(method, path, cookie=None, body=None):
    """The server, as a second device of the same buyer. Returns (json, session cookie)."""
    data = json.dumps(body).encode() if body is not None else (b"{}" if method == "POST" else None)
    headers = {"content-type": "application/json"}
    if cookie:
        headers["cookie"] = cookie
    with urllib.request.urlopen(urllib.request.Request(SERVER + path, data=data, method=method, headers=headers), timeout=60) as r:
        cookies = [c.split(";")[0] for c in (r.headers.get_all("set-cookie") or []) if c.startswith("afte_sid=")]
        return json.loads(r.read() or b"null"), (cookies[0] if cookies else None)


def adb(*args, timeout=90):
    return subprocess.run(["adb", *args], capture_output=True, text=True, timeout=timeout)


def shot(name):
    with open(f"{OUT}/app-{name}.png", "wb") as f:
        subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=f, timeout=60)


def record():
    """screenrecord stops at 3 minutes: one file after another for the whole run."""
    n = len(recorders)
    recorders.append(subprocess.Popen(["adb", "shell", "screenrecord", "--bit-rate", "3000000", "--time-limit", "170", f"/sdcard/rec{n}.mp4"]))
    print(f"rec{n} starts at {time.time() - T0:.1f}s", flush=True)


def nodes():
    """What is on the screen now: [(text, content-desc, class, centre x, centre y)]."""
    for _ in range(4):
        try:
            adb("shell", "uiautomator", "dump", "/sdcard/ui.xml", timeout=60)
            raw = adb("exec-out", "cat", "/sdcard/ui.xml", timeout=30).stdout
            root = ET.fromstring(raw[raw.index("<?xml"):])
        except (ValueError, ET.ParseError, subprocess.TimeoutExpired):
            time.sleep(3)
            continue
        out = []
        for n in root.iter("node"):
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", n.get("bounds", ""))
            if m:
                a, b, c, d = map(int, m.groups())
                out.append((n.get("text", ""), n.get("content-desc", ""), n.get("class", ""), (a + c) // 2, (b + d) // 2))
        return out
    return []


def texts():
    return [t for t, _, _, _, _ in nodes() if t]


def wait_for(pattern, timeout=120):
    end = time.time() + timeout
    while time.time() < end:
        for t, desc, _, x, y in nodes():
            if re.search(pattern, t) or re.search(pattern, desc):
                return x, y
        if recorders and recorders[-1].poll() is not None:
            record()
        time.sleep(2)
    return None


def tap(pattern, timeout=45):
    at = wait_for(pattern, timeout)
    if at:
        adb("shell", "input", "tap", str(at[0]), str(at[1]))
        time.sleep(1.5)
    return bool(at)


def swipe_up(times=1):
    for _ in range(times):
        adb("shell", "input", "swipe", "500", "1500", "500", "500", "350")
        time.sleep(0.8)


def scroll_to(pattern, tries=10):
    for _ in range(tries):
        at = wait_for(pattern, 3)
        if at:
            return at
        swipe_up()
    return None


def back():
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(1.5)


def allow_dialog():
    for t, _, _, x, y in nodes():
        if re.search(r"(?i)^(while using the app|allow|only this time)$", t):
            adb("shell", "input", "tap", str(x), str(y))
            time.sleep(1)
            return True
    return False


adb("logcat", "-c")
record()
adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1")

# ---------- it opens, and the home screen has what the server sent ----------
opened = wait_for(r"^Home$", 240) is not None
check("the app opens", opened)
if not opened:
    log = adb("logcat", "-d", "-t", "8000", timeout=60).stdout.splitlines()
    print("--- why", flush=True)
    for line in [l for l in log if re.search(r"AndroidRuntime|ReactNativeJS|F libc|F DEBUG|UnsatisfiedLink|SoLoader|dlopen", l)][:90]:
        print(line[-240:], flush=True)
    shot("1-home")
    sys.exit(1)
time.sleep(6)
shot("1-home")
home = texts()
print("home:", [x[:50] for x in home[:25]], flush=True)
check("the home screen came from the live server", any(re.search(r"Hikari|Japan|FOB|\$\d", x) for x in home))
swipe_up(2)
time.sleep(1)

# ---------- the shop: real cars over https, so the phone trusts the certificate ----------
check("the shop opens", tap(r"^Shop$"))
found = wait_for(r"HK-\d+|\$\d{1,3},\d{3}", 60)
time.sleep(2)
shot("2-shop")
check("cars are listed (the phone trusts the server's certificate)", found is not None, [x[:40] for x in texts()[:10]])

# ---------- a car, and its photos full screen ----------
car = wait_for(r"^HK-\d+", 20)
if check("a car in the list can be opened", car is not None):
    adb("shell", "input", "tap", str(car[0]), str(car[1]))
    time.sleep(3)
    ok = wait_for(r"^Buy now$", 40) is not None
    check("the car page has Buy now", ok)
    shot("3-car")
    if tap(r"^Open the picture$", 15):
        time.sleep(2)
        shot("3-gallery")
        check("its photo opens full screen", wait_for(r"^Close picture$", 10) is not None)
        tap(r"^Close picture$", 5)
    else:
        check("its photo opens full screen", False)
    back()
    time.sleep(1)

# ---------- sign in as the demo customer and ask Sora ----------
check("the chat opens", tap(r"^Chat$"))
tap(r"Try the demo customer", 30)
box = None
end = time.time() + 90
while time.time() < end and box is None:
    box = next(((x, y) for t, _, c, x, y in nodes() if c.endswith("EditText")), None)
    time.sleep(2)
check("the demo customer is in the chat", box is not None, [x[:40] for x in texts()[:10]])
if box:
    before = set(texts())
    adb("shell", "input", "tap", str(box[0]), str(box[1]))
    time.sleep(1)
    adb("shell", "input", "text", "I%sneed%sa%sdiesel%sToyota%sHilux%sshipped%sto%sMombasa")
    time.sleep(2)
    check("the message can be sent", tap(r"^Send$", 20))
    answer = None
    end = time.time() + 180
    while time.time() < end and not answer:
        answer = next((x for x in texts() if x not in before and re.search(r"HK-\d+|\$\d", x)), None)
        time.sleep(3)
    time.sleep(2)
    shot("4-sora")
    check("Sora answered on the phone, with real cars", bool(answer), (answer or "")[:160])
    adb("shell", "input", "keyevent", "KEYCODE_BACK")  # the keyboard
    time.sleep(1)

    # ---------- the buyer's invoices, and a bank slip read by the accounts FTE ----------
    check("the menu opens", tap(r"^Menu$"))
    if check("My invoices is there", tap(r"^My invoices$", 20)):
        time.sleep(2)
        shot("5-invoices")
        ck = api("POST", "/api/auth/demo/customer")[1]
        invs = api("GET", "/api/account/invoices", ck)[0]
        open_inv = next((i for i in invs if i["status"] in ("approved", "sent") and i["totals"]["balance"] > 0), None)
        check("the demo customer has an invoice with a balance", bool(open_inv))
        if open_inv and tap(re.escape(open_inv["number"]), 30):
            time.sleep(2)
            paid_before = open_inv["totals"]["paid"]
            if check("the invoice asks for the slip", scroll_to(r"Sample slip") is not None):
                tap(r"Sample slip", 10)
                got = None
                end = time.time() + 150
                while time.time() < end and not got:
                    now = api("GET", f"/api/account/invoices/{open_inv['id']}", ck)[0]
                    got = now["totals"]["paid"] > paid_before and now
                    time.sleep(5)
                check("Ren read the slip and recorded the money", bool(got), got and got["totals"])
                shot("6-paid")
            back()
        back()

    # ---------- the company pages ----------
    tap(r"^Menu$", 15)
    for page, must in [("Bank details", r"account"), ("Guides", r"(?i)guide|auction sheet"), ("FAQ", r"\?")]:
        at = scroll_to(rf"^{page}$")
        if at:
            adb("shell", "input", "tap", str(at[0]), str(at[1]))
            time.sleep(2.5)
            check(f"{page} opens", wait_for(must, 20) is not None)
            back()
        else:
            check(f"{page} opens", False, "not found in the menu")

    # ---------- a call to Sora ----------
    if tap(r"^Chat$", 15) and tap(r"^Call Sora$", 25):
        time.sleep(2)
        allow_dialog()
        time.sleep(2)
        allow_dialog()
        check("the call to Sora picks up", wait_for(r"(?i)Hikari Motors|speaking|listening|Sora:", 40) is not None, [x[:50] for x in texts()[:8]])
        time.sleep(6)
        shot("7-call")
        hang = wait_for(r"(?i)^(Hang up|End call)$", 10)
        if hang:
            adb("shell", "input", "tap", str(hang[0]), str(hang[1]))
        time.sleep(2)

    # ---------- away from the app: Sora's next answer arrives as a notification ----------
    gms = re.search(r"versionName=(\S+)", adb("shell", "dumpsys", "package", "com.google.android.gms").stdout)
    print("google play services:", gms.group(1) if gms else "none", flush=True)
    # Play services on a fresh emulator need a few minutes before they give a token: open the app again, it asks again
    time.sleep(30)
    adb("shell", "am", "force-stop", PKG)
    adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1")
    wait_for(r"^Home$", 120)
    time.sleep(25)
    adb("shell", "input", "keyevent", "KEYCODE_HOME")
    time.sleep(40)  # the server sees the phone go away
    ck = api("POST", "/api/auth/demo/customer")[1]
    mine = api("GET", "/api/chat/mine", ck)[0]
    api("POST", f"/api/chat/conversations/{mine['conversation']['id']}/messages", ck, {"body": "What is the price of the first one to Mombasa?"})
    note = []
    end = time.time() + 150
    while time.time() < end and not note:
        time.sleep(4)
        note = re.findall(r"NotificationRecord\(.*pkg=" + re.escape(PKG) + r".*", adb("shell", "dumpsys", "notification", "--noredact").stdout)
    if recorders[-1].poll() is not None:
        record()
    adb("shell", "cmd", "statusbar", "expand-notifications")
    time.sleep(4)
    shot("8-push")
    check("a push notification arrived with the app closed", bool(note), note[:1])
    time.sleep(3)
    adb("shell", "cmd", "statusbar", "collapse")

# ---------- nothing crashed ----------
log = adb("logcat", "-d", "-t", "8000", timeout=60).stdout
for line in [l for l in log.splitlines() if re.search(r"\[push\]|SERVICE_NOT_AVAILABLE|FIS_", l)][:12]:
    print("push:", line[-200:], flush=True)
crash = [l for l in log.splitlines() if "FATAL EXCEPTION" in l or (PKG in l and "has died" in l and "force-stop" not in l)]
check("no crash in the log", not crash, crash[:3])
for line in [l for l in log.splitlines() if "ReactNativeJS" in l and re.search(r"error|fail", l, re.I)][:15]:
    print("js:", line[-220:], flush=True)

# ---------- the recordings ----------
for r in recorders:
    if r.poll() is None:
        adb("shell", "pkill", "-INT", "screenrecord")
        time.sleep(2)
        break
time.sleep(2)
for n in range(len(recorders)):
    print(adb("pull", f"/sdcard/rec{n}.mp4", f"{OUT}/rec{n}.mp4", timeout=120).stdout.strip()[-100:], flush=True)

print(f"{failed} failed", flush=True)
sys.exit(1 if failed else 0)
