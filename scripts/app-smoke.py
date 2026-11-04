#!/usr/bin/env python3
"""Tries the real APK on an Android emulator against the live demo: it opens, shows live cars (so the phone trusts the server),
signs in as the demo customer, and Sora answers. Pictures of each screen go to the folder given as the first argument."""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
PKG = "com.autofte.hikarimotors"
failed = 0


def check(name, ok, detail=""):
    global failed
    failed += not ok
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"   [{str(detail)[:300]}]" if detail else ""), flush=True)


def adb(*args, timeout=90):
    return subprocess.run(["adb", *args], capture_output=True, text=True, timeout=timeout)


def shot(name):
    with open(f"{OUT}/app-{name}.png", "wb") as f:
        subprocess.run(["adb", "exec-out", "screencap", "-p"], stdout=f, timeout=60)


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
        time.sleep(3)
    return None


def tap(pattern, timeout=60):
    at = wait_for(pattern, timeout)
    if at:
        adb("shell", "input", "tap", str(at[0]), str(at[1]))
        time.sleep(2)
    return bool(at)


adb("logcat", "-c")
adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1")

# ---------- it opens, and the home screen has what the server sent ----------
check("the app opens", wait_for(r"^Home$", 240) is not None)
time.sleep(10)
shot("1-home")
home = texts()
print("home:", [x[:50] for x in home[:25]], flush=True)
check("the home screen came from the live server", any(re.search(r"Hikari|Japan|FOB|\$\d", x) for x in home))

# ---------- the shop: real cars, over https, so the phone trusts the certificate ----------
check("the shop opens", tap(r"^Shop$"))
found = wait_for(r"HK-\d+|\$\d{1,3},\d{3}", 60)
time.sleep(3)
shot("2-shop")
check("cars are listed (the phone trusts the server's certificate)", found is not None, [x[:40] for x in texts()[:12]])

# ---------- sign in as the demo customer and ask Sora ----------
check("the chat opens", tap(r"^Chat$"))
tap(r"Try the demo customer", 30)
box = None
end = time.time() + 90
while time.time() < end and box is None:
    box = next(((x, y) for t, _, c, x, y in nodes() if c.endswith("EditText")), None)
    time.sleep(3)
check("the demo customer is in the chat", box is not None, [x[:40] for x in texts()[:12]])
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
        time.sleep(4)
    time.sleep(2)
    shot("3-sora")
    check("Sora answered on the phone, with real cars", bool(answer), (answer or "")[:200])

# ---------- nothing crashed ----------
log = adb("logcat", "-d", "-t", "6000", timeout=60).stdout
crash = [l for l in log.splitlines() if "FATAL EXCEPTION" in l or (PKG in l and "has died" in l)]
check("no crash in the log", not crash, crash[:3])
for line in [l for l in log.splitlines() if "ReactNativeJS" in l and re.search(r"error|fail", l, re.I)][:15]:
    print("js:", line[-220:], flush=True)

print(f"{failed} failed", flush=True)
sys.exit(1 if failed else 0)
