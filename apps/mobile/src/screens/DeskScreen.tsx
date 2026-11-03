import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, errText } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/data";
import { C, useColors } from "../lib/site";
import { Button, Card, Chip, Empty, ErrorBox, Field, Input, Screen, Skeleton, T } from "../ui";
import { Conversation } from "./ChatScreen";

interface Row {
  id: string;
  kind: string;
  title: string | null;
  holder: string;
  lastMessageAt: string;
  customer: { name: string; online: boolean } | null;
  peer: { id: string; name: string; online: boolean } | null;
  memberCount: number;
  last: string | null;
  lastKind: string | null;
  unread: number;
}
interface Colleague {
  id: string;
  name: string;
  title: string | null;
  role: string | null;
  online: boolean;
}

const nameOf = (c: Row) => c.customer?.name ?? c.peer?.name ?? c.title ?? "Conversation";
const lineOf = (c: Row) => (c.lastKind === "image" ? "Picture" : c.lastKind === "voice" ? "Voice note" : c.lastKind === "call" ? `Call: ${c.last ?? ""}` : (c.last ?? ""));

function Rows({ rows, onOpen }: { rows: Row[]; onOpen: (c: Row) => void }) {
  const col = useColors();
  return (
    <View style={{ gap: 8 }}>
      {rows.map((c) => (
        <Card key={c.id} onPress={() => onOpen(c)} label={`Open ${nameOf(c)}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[st.dot, { backgroundColor: c.customer?.online || c.peer?.online ? C.green : C.line }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T lines={1} style={{ fontWeight: "700", color: C.ink }}>
                {nameOf(c)}
                {c.kind === "group" ? ` (${c.memberCount})` : ""}
              </T>
              <T lines={1} style={{ color: C.muted, fontSize: 13 }}>{lineOf(c)}</T>
            </View>
            {c.unread > 0 ? (
              <View style={[st.badge, { backgroundColor: col.brand }]}>
                <T style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{c.unread}</T>
              </View>
            ) : null}
          </View>
        </Card>
      ))}
    </View>
  );
}

/** Staff on the phone: the same desk as the website. Buyers, then colleagues and groups. Whoever sees everything drills down by agent. */
export function DeskHome() {
  const nav = useNavigation<any>();
  const { me } = useAuth();
  const seesAll = !!me?.perms?.includes("chat.view_all");
  const [tab, setTab] = useState<"buyers" | "team">("buyers");
  const [agent, setAgent] = useState<{ id: string; name: string } | null>(null);
  const url = tab === "team" ? "/api/chat/conversations?scope=team" : seesAll && agent ? `/api/chat/conversations?scope=all&agent=${agent.id}` : seesAll ? "" : "/api/chat/conversations?scope=mine";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const agents = useFetch<{ id: string; name: string; kind?: string; conversations?: number }[]>(seesAll ? "/api/chat/desk-agents" : "");
  const team = useFetch<Colleague[]>("/api/chat/team");
  const load = useCallback(async () => {
    if (!url) {
      setRows(null);
      return;
    }
    try {
      setRows(await api.get<Row[]>(url));
      setErr(null);
    } catch (e) {
      setErr(errText(e));
    }
  }, [url]);
  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), 5000);
      return () => clearInterval(t);
    }, [load]),
  );
  const open = (c: Row) => nav.navigate("DeskThread", { id: c.id, name: nameOf(c), kind: c.kind });
  const dm = async (p: Colleague) => {
    setErr(null);
    try {
      const c = await api.post<{ id: string }>("/api/chat/dm", { userId: p.id });
      nav.navigate("DeskThread", { id: c.id, name: p.name, kind: "dm" });
    } catch (e) {
      setErr(errText(e));
    }
  };
  return (
    <Screen>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <Chip label="Buyers" active={tab === "buyers"} onPress={() => setTab("buyers")} />
        <Chip label="Team" active={tab === "team"} onPress={() => setTab("team")} />
      </View>
      {err ? <ErrorBox text={err} /> : null}
      {tab === "buyers" && seesAll && !agent ? (
        <View style={{ gap: 8 }}>
          <T style={{ color: C.muted, fontSize: 13 }}>Pick an agent to see that agent's buyers.</T>
          {agents.loading ? <Skeleton h={120} /> : null}
          {agents.data?.map((a) => (
            <Card key={a.id} onPress={() => setAgent({ id: a.id, name: a.name })} label={`Buyers of ${a.name}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="person-outline" size={18} color={C.muted} />
                <T style={{ flex: 1, fontWeight: "700", color: C.ink }}>{a.name}</T>
                {a.conversations != null ? <T style={{ color: C.muted, fontSize: 13 }}>{a.conversations}</T> : null}
                <Ionicons name="chevron-forward" size={18} color={C.faint} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}
      {tab === "buyers" && seesAll && agent ? (
        <Pressable accessibilityRole="button" onPress={() => setAgent(null)} style={st.back}>
          <Ionicons name="chevron-back" size={18} color={C.muted} />
          <T style={{ color: C.muted, fontWeight: "600" }}>All agents · {agent.name}</T>
        </Pressable>
      ) : null}
      {rows && (tab === "team" || !seesAll || agent) ? rows.length ? <Rows rows={rows} onOpen={open} /> : <Empty icon="chatbubbles-outline" title={tab === "team" ? "No team chats yet" : "No buyers here yet"} /> : null}
      {tab === "team" ? (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Button title="New group" icon="people-outline" variant="secondary" onPress={() => nav.navigate("NewGroup")} />
          <T style={{ fontWeight: "700", color: C.ink, marginTop: 8 }}>Colleagues</T>
          {team.data?.map((p) => (
            <Card key={p.id} onPress={() => void dm(p)} label={`Chat with ${p.name}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[st.dot, { backgroundColor: p.online ? C.green : C.line }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T lines={1} style={{ fontWeight: "600", color: C.ink }}>{p.name}</T>
                  <T lines={1} style={{ color: C.muted, fontSize: 12 }}>{p.title ?? p.role ?? ""}</T>
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

export function DeskThreadScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { id, name, kind } = route.params as { id: string; name: string; kind: string };
  useEffect(() => {
    nav.setOptions({
      title: name,
      headerRight:
        kind === "group"
          ? () => (
              <Pressable accessibilityRole="button" accessibilityLabel="Group info" hitSlop={10} onPress={() => nav.navigate("GroupInfo", { id })}>
                <Ionicons name="information-circle-outline" size={24} color={C.muted} />
              </Pressable>
            )
          : undefined,
    });
  }, [nav, name, kind, id]);
  return <Conversation desk={{ id, name, kind }} />;
}

export function NewGroupScreen() {
  const nav = useNavigation<any>();
  const team = useFetch<Colleague[]>("/api/chat/team");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Screen>
      <Card>
        <Field label="Group name"><Input value={title} onChangeText={setTitle} placeholder="Kenya sales team" /></Field>
        <T style={{ fontWeight: "700", color: C.ink, marginBottom: 6 }}>Who is in it</T>
        {team.loading ? <Skeleton h={120} /> : null}
        {team.data && !team.data.length ? <T style={{ color: C.muted }}>There is nobody else on the desk yet.</T> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {team.data?.map((p) => (
            <Chip key={p.id} label={p.name} active={picked.includes(p.id)} onPress={() => setPicked(picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id])} />
          ))}
        </View>
        {err ? <View style={{ marginTop: 10 }}><ErrorBox text={err} /></View> : null}
        <Button
          title="Create group"
          icon="people"
          loading={busy}
          disabled={title.trim().length < 2 || !picked.length}
          style={{ marginTop: 14 }}
          onPress={async () => {
            setBusy(true);
            setErr(null);
            try {
              const g = await api.post<{ id: string }>("/api/chat/groups", { title: title.trim(), memberIds: picked });
              nav.replace("DeskThread", { id: g.id, name: title.trim(), kind: "group" });
            } catch (e) {
              setErr(errText(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Card>
    </Screen>
  );
}

interface GroupDetail {
  conversation: { id: string; title: string | null };
  members: { id: string; name: string; role: string; online: boolean }[];
}

export function GroupInfoScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const { me } = useAuth();
  const id = route.params?.id as string;
  const q = useFetch<GroupDetail>(`/api/chat/conversations/${id}`);
  const team = useFetch<Colleague[]>("/api/chat/team");
  const [title, setTitle] = useState<string | null>(null);
  const [adding, setAdding] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const owner = q.data?.members.some((m) => m.id === me?.id && m.role === "owner");
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setErr(null);
    try {
      await fn();
      after?.();
      q.reload();
    } catch (e) {
      setErr(errText(e));
    }
  };
  if (q.loading) return <Screen><Skeleton h={240} /></Screen>;
  const inGroup = new Set(q.data?.members.map((m) => m.id));
  const others = team.data?.filter((p) => !inGroup.has(p.id)) ?? [];
  return (
    <Screen>
      {err ? <ErrorBox text={err} /> : null}
      <Card>
        <Field label="Group name"><Input editable={!!owner} value={title ?? q.data?.conversation.title ?? ""} onChangeText={setTitle} /></Field>
        {owner ? <Button title="Save" small variant="secondary" disabled={!title || title.trim().length < 2} onPress={() => void run(() => api.patch(`/api/chat/groups/${id}`, { title: title!.trim() }), () => setTitle(null))} /> : null}
      </Card>
      <Card style={{ marginTop: 12 }}>
        <T style={{ fontWeight: "700", color: C.ink, marginBottom: 6 }}>Members ({q.data?.members.length ?? 0})</T>
        {q.data?.members.map((m) => (
          <View key={m.id} style={st.member}>
            <View style={[st.dot, { backgroundColor: m.online ? C.green : C.line }]} />
            <T lines={1} style={{ flex: 1, color: C.ink }}>{m.name}{m.role === "owner" ? " · made the group" : ""}</T>
            {owner && m.id !== me?.id ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${m.name}`} hitSlop={8} onPress={() => void run(() => api.del(`/api/chat/groups/${id}/members/${m.id}`))}>
                <Ionicons name="close-circle-outline" size={22} color={C.muted} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </Card>
      {owner ? (
        <Card style={{ marginTop: 12 }}>
          <T style={{ fontWeight: "700", color: C.ink, marginBottom: 6 }}>Add people</T>
          {others.length ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {others.map((p) => <Chip key={p.id} label={p.name} active={adding.includes(p.id)} onPress={() => setAdding(adding.includes(p.id) ? adding.filter((x) => x !== p.id) : [...adding, p.id])} />)}
              </View>
              <Button title="Add to group" small variant="secondary" disabled={!adding.length} style={{ marginTop: 10 }} onPress={() => void run(() => api.post(`/api/chat/groups/${id}/members`, { userIds: adding }), () => setAdding([]))} />
            </>
          ) : (
            <T style={{ color: C.muted }}>Everybody on the desk is already in this group.</T>
          )}
        </Card>
      ) : null}
      <Button title="Leave group" icon="exit-outline" variant="secondary" style={{ marginTop: 14 }} onPress={() => void run(() => api.post(`/api/chat/groups/${id}/leave`), () => nav.pop(2))} />
    </Screen>
  );
}

const st = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  back: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, marginBottom: 8 },
  member: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 },
});
